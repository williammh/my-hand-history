import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index.js';
import { ChartLookup } from '@/analysis/charts/lookup.js';
import type { PreflopChart, ChartManifest } from '@/analysis/charts/loader.js';
import { createClientHeuristicEngine, VerdictCode } from '@/analysis/engines/client-heuristic.js';
import { extractHeroDecisions } from '@/analysis/decision-points.js';
import type { Hand } from '@/domain/hand.js';
import type { AnalysisEngine } from '@/analysis/engine.js';

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const chartsDir = url('../../public/charts');

let engine: AnalysisEngine;
let hand: Hand;

beforeAll(() => {
  const manifest = JSON.parse(readFileSync(`${chartsDir}/index.json`, 'utf8')) as ChartManifest;
  const charts = manifest.charts.map(
    (e) => JSON.parse(readFileSync(`${chartsDir}/${e.path}`, 'utf8')) as PreflopChart,
  );
  engine = createClientHeuristicEngine(new ChartLookup(charts));
  hand = registry.parseFile(
    readFileSync(url('../fixtures/betclic/deep-3bet.txt'), 'utf8'), 'betclic-fr',
  ).hands[0]!;
});

/**
 * A 100bb pot where hero 3-bets QQ, flops top set, and checks back two streets.
 *
 * Every one of these spots was previously skipped: the stack is far beyond the
 * push/fold charts, hero faces a raise preflop, and the postflop actions are a
 * bet and two checks rather than calls.
 */
describe('deep-stacked 3-bet pot', () => {
  const heroVerdicts = (analysis: Awaited<ReturnType<AnalysisEngine['analyze']>>) => {
    const heroIndices = new Set(extractHeroDecisions(hand).map((d) => d.actionIndex));
    return analysis.verdicts.filter((v) => heroIndices.has(v.actionIndex));
  };

  it('judges all four hero decisions', async () => {
    const analysis = await engine.analyze(hand);
    expect(extractHeroDecisions(hand)).toHaveLength(4);
    expect(heroVerdicts(analysis)).toHaveLength(4);
  });

  it('also judges villain (zalixa) decisions, skipping those without shown cards', async () => {
    // zalixa never shows down in this hand, so their voluntary actions should
    // be extracted and skipped for missing hole cards.
    const analysis = await engine.analyze(hand);
    const villainSeat = hand.seats.find((s) => !s.isHero && s.name === 'zalixa')!.seat;
    const villainSkipped = analysis.skipped.filter(
      (s) => hand.actions[s.actionIndex]!.seat === villainSeat,
    );
    expect(villainSkipped.length).toBeGreaterThan(0);
    for (const s of villainSkipped) expect(s.reason).toMatch(/hole cards/i);
  });

  it('approves the QQ 3-bet rather than skipping it as "facing a raise"', async () => {
    const analysis = await engine.analyze(hand);
    const preflop = heroVerdicts(analysis).find(
      (v) => hand.actions[v.actionIndex]!.street === 'preflop',
    )!;
    expect(preflop.severity).toBe('ok');
    expect(preflop.code).toBe(VerdictCode.PREFLOP_OK);
    expect(preflop.explanation).toMatch(/UTG/);
  });

  it('approves the flop value bet with top set', async () => {
    const analysis = await engine.analyze(hand);
    const flop = heroVerdicts(analysis).find((v) => hand.actions[v.actionIndex]!.street === 'flop')!;
    expect(flop.severity).toBe('ok');
  });

  it('flags checking back top set on the turn and river as missed value', async () => {
    const analysis = await engine.analyze(hand);
    const missed = heroVerdicts(analysis).filter((v) => v.code === VerdictCode.POSTFLOP_MISSED_VALUE);
    expect(missed).toHaveLength(2);
    for (const v of missed) {
      expect(v.severity).not.toBe('ok');
      expect(v.recommended[0]!.kind).toBe('bet');
    }
    expect(analysis.totalEvLossBB).toBeGreaterThan(0);
  });

  it('carries the preflop aggressor onto streets that open with a check', () => {
    // The turn and river both start with villain checking, which erases the
    // street-local aggressor; without the preflop fallback the range would
    // silently widen to a generic default.
    const points = extractHeroDecisions(hand);
    const river = points.find((p) => p.street === 'river')!;
    expect(river.aggressorPosition).toBeNull();
    expect(river.preflopAggressorPosition).toBe('UTG');
    expect(river.preflopRaiseCount).toBeGreaterThanOrEqual(2);
  });
});
