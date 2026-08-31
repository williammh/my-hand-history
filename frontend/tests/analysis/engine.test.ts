import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { ChartLookup, MAX_STACK_DELTA_BB } from '@/analysis/charts/lookup';
import type { PreflopChart, ChartManifest } from '@/analysis/charts/loader';
import { createClientHeuristicEngine, VerdictCode } from '@/analysis/engines/client-heuristic';
import { extractHeroDecisions } from '@/analysis/decision-points';
import type { Hand } from '@/domain/hand';
import type { AnalysisEngine } from '@/analysis/engine';

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const chartsDir = url('../../public/charts');

let engine: AnalysisEngine;
let hands: readonly Hand[];

beforeAll(() => {
  const manifest = JSON.parse(readFileSync(`${chartsDir}/index.json`, 'utf8')) as ChartManifest;
  const charts = manifest.charts.map(
    (e) => JSON.parse(readFileSync(`${chartsDir}/${e.path}`, 'utf8')) as PreflopChart,
  );
  engine = createClientHeuristicEngine(new ChartLookup(charts));
  hands = registry.parseFile(readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8'), 'betclic-fr').hands;
});

describe('client heuristic engine', () => {
  it('advertises offline capabilities', () => {
    expect(engine.capabilities.requiresNetwork).toBe(false);
    expect(engine.capabilities.preflop).toBe(true);
    expect(engine.capabilities.quantifiesEV).toBe(false);
  });

  it('flags the SB limp with JTo at ~11bb as a chart deviation', async () => {
    const analysis = await engine.analyze(hands[2]!);
    const limp = analysis.verdicts.find((v) => v.code === VerdictCode.PREFLOP_LIMP);
    expect(limp).toBeDefined();
    expect(limp!.severity).not.toBe('ok');
    expect(limp!.confidence).toBe('high');
    expect(limp!.recommended[0]!.kind).toBe('raise');
    expect(limp!.recommended[0]!.isAllIn).toBe(true);
    expect(analysis.totalEvLossBB).toBeGreaterThan(0);
  });

  it('clears correct trash folds instead of inventing mistakes', async () => {
    for (const h of [hands[0]!, hands[1]!]) {
      const analysis = await engine.analyze(h);
      expect(analysis.verdicts.every((v) => v.severity === 'ok')).toBe(true);
      expect(analysis.totalEvLossBB).toBe(0);
    }
  });

  it('labels postflop verdicts low confidence and chart preflop high', async () => {
    const analysis = await engine.analyze(hands[2]!);
    for (const v of analysis.verdicts) {
      const street = hands[2]!.actions[v.actionIndex]!.street;
      // Range-based preflop verdicts are 'medium'; only chart lookups are 'high'.
      if (street === 'preflop') expect(v.confidence).not.toBe('low');
      else expect(v.confidence).toBe('low');
    }
  });

  it('judges every voluntary hero action in a fully-dealt hand', async () => {
    // The engine used to skip postflop bets, checks and raises outright. With a
    // balanced-villain range model those are judged, so a hand with hole cards
    // should leave nothing unexplained.
    const analysis = await engine.analyze(hands[2]!);
    const decisions = extractHeroDecisions(hands[2]!);
    const heroActionIndices = new Set(decisions.map((d) => d.actionIndex));
    const heroVerdicts = analysis.verdicts.filter((v) => heroActionIndices.has(v.actionIndex));
    const heroSkipped = analysis.skipped.filter((s) => heroActionIndices.has(s.actionIndex));
    expect(heroVerdicts.length + heroSkipped.length).toBe(decisions.length);
    expect(heroSkipped).toHaveLength(0);
  });

  it('also judges villain actions, skipping those without known hole cards', async () => {
    // Villain (YouReOkKris) never shows down in this hand, so their voluntary
    // actions should be extracted and skipped for missing hole cards rather
    // than silently ignored.
    const analysis = await engine.analyze(hands[2]!);
    const villainSeat = hands[2]!.seats.find((s) => !s.isHero && s.name === 'YouReOkKris')!.seat;
    const villainSkipped = analysis.skipped.filter(
      (s) => hands[2]!.actions[s.actionIndex]!.seat === villainSeat,
    );
    expect(villainSkipped.length).toBeGreaterThan(0);
    for (const s of villainSkipped) expect(s.reason).toMatch(/hole cards/i);
  });

  it('states a reason for anything it does still skip', async () => {
    for (const h of hands) {
      const analysis = await engine.analyze(h);
      for (const s of analysis.skipped) expect(s.reason).toBeTruthy();
    }
  });

  it('skips rather than guesses when hero hole cards are missing', async () => {
    const blind = {
      ...hands[2]!,
      seats: hands[2]!.seats.map((s) => (s.isHero ? { ...s, holeCards: null } : s)),
    };
    const analysis = await engine.analyze(blind);
    expect(analysis.verdicts).toHaveLength(0);
    expect(analysis.skipped.length).toBeGreaterThan(0);
    for (const s of analysis.skipped) expect(s.reason).toMatch(/hole cards/i);
  });

  it('never reports a flagged mistake as an ok severity', async () => {
    // A verdict whose code names a mistake but whose severity is 'ok' renders
    // as a green row with a critical explanation.
    for (const h of hands) {
      const analysis = await engine.analyze(h);
      for (const v of analysis.verdicts) {
        if (v.code.endsWith('_OK')) continue;
        expect(v.severity, `${v.code} should not be ok`).not.toBe('ok');
      }
    }
  });

  it('is deterministic across runs', async () => {
    const a = await engine.analyze(hands[2]!);
    const b = await engine.analyze(hands[2]!);
    expect(a.verdicts.map((v) => v.code)).toEqual(b.verdicts.map((v) => v.code));
    expect(a.totalEvLossBB).toBeCloseTo(b.totalEvLossBB ?? 0, 10);
  });

  it('stamps the engine identity so a later solver is distinguishable', async () => {
    const analysis = await engine.analyze(hands[0]!);
    expect(analysis.engineId).toBe('client-heuristic');
    expect(analysis.handId).toBe(hands[0]!.id);
  });

  it('honours an abort signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(engine.analyze(hands[2]!, ctrl.signal)).rejects.toThrow();
  });
});

describe('ChartLookup bucketing guard', () => {
  const chart = (position: string, stackBB: number): PreflopChart => ({
    id: `t-${position}-${stackBB}`, tableSize: 6, position: position as never,
    stackBB, scenario: 'rfi', source: 'test', ranges: { AA: { shove: 1 } },
  });

  it('picks the nearest chart within the threshold', () => {
    const lookup = new ChartLookup([chart('BTN', 10), chart('BTN', 15)]);
    const m = lookup.find({ tableSize: 6, position: 'BTN', stackBB: 11, scenario: 'rfi' });
    expect(m!.chart.stackBB).toBe(10);
  });

  it('refuses to bucket a shallow spot onto a deep chart', () => {
    // The failure mode that would produce confidently wrong advice.
    const lookup = new ChartLookup([chart('BTN', 25)]);
    expect(lookup.find({ tableSize: 6, position: 'BTN', stackBB: 11, scenario: 'rfi' })).toBeNull();
    expect(MAX_STACK_DELTA_BB).toBeLessThan(5);
  });

  it('never crosses position or scenario', () => {
    const lookup = new ChartLookup([chart('BTN', 10)]);
    expect(lookup.find({ tableSize: 6, position: 'UTG', stackBB: 10, scenario: 'rfi' })).toBeNull();
    expect(lookup.find({ tableSize: 6, position: 'BTN', stackBB: 10, scenario: 'vs-raise' })).toBeNull();
  });
});

describe('decision point extraction', () => {
  it('finds only voluntary hero decisions', () => {
    const points = extractHeroDecisions(hands[2]!);
    expect(points).toHaveLength(6);
    for (const p of points) {
      expect(hands[2]!.actions[p.actionIndex]!.seat).toBe(hands[2]!.heroSeat);
      expect(hands[2]!.actions[p.actionIndex]!.kind).not.toMatch(/^post-/);
    }
  });

  it('computes pot and toCall at the river decision', () => {
    const points = extractHeroDecisions(hands[2]!);
    const river = points.find((p) => p.street === 'river' && p.toCall > 0)!;
    expect(river.potBefore).toBe(108800);
    expect(river.toCall).toBe(40000);
  });

  it('classifies the blind-versus-blind spot', () => {
    const points = extractHeroDecisions(hands[2]!);
    expect(points[0]!.scenario).toBe('blind-vs-blind');
    expect(points[0]!.potIsUnopened).toBe(true);
  });

  it('returns nothing when there is no hero', () => {
    expect(extractHeroDecisions({ ...hands[0]!, heroSeat: null })).toEqual([]);
  });
});
