import { describe, it, expect } from 'vitest';
import {
  handStrength, topRange, openingRange, threeBetRange, rangeCombos, rankedClasses,
} from '@/analysis/ranges/preflop-ranges';
import { classifyMadeHand } from '@/analysis/postflop/made-hand';
import { equityVsRange } from '@/analysis/equity/monte-carlo';
import type { Board, HoleCards } from '@/domain/cards';

const hole = (a: string, b: string) => [a, b] as unknown as HoleCards;
const board = (...c: string[]) => c as unknown as Board;

describe('hand strength ordering', () => {
  it('ranks the premium hands above the trash', () => {
    expect(handStrength('AA')).toBeGreaterThan(handStrength('KK'));
    expect(handStrength('KK')).toBeGreaterThan(handStrength('22'));
    expect(handStrength('AKs')).toBeGreaterThan(handStrength('AKo'));
    expect(handStrength('AKo')).toBeGreaterThan(handStrength('72o'));
  });

  it('puts AA first and 72o near the bottom of the full ordering', () => {
    const ranked = rankedClasses();
    expect(ranked[0]).toBe('AA');
    expect(ranked.indexOf('72o')).toBeGreaterThan(ranked.length * 0.8);
  });
});

describe('range construction', () => {
  it('sizes a range by combos, not by class count', () => {
    // 169 classes but 1326 combos: a 10% range is ~133 combos, and would be
    // badly wrong if every class counted equally.
    const combos = rangeCombos(topRange(0.1));
    expect(combos).toBeGreaterThan(120);
    expect(combos).toBeLessThan(145);
  });

  it('always contains the strongest hands', () => {
    for (const p of [0.03, 0.1, 0.25, 0.5]) {
      expect(topRange(p).has('AA')).toBe(true);
    }
  });

  it('opens wider on the button than under the gun', () => {
    expect(rangeCombos(openingRange('BTN'))).toBeGreaterThan(rangeCombos(openingRange('UTG')));
  });

  it('3-bets tighter than it opens', () => {
    expect(rangeCombos(threeBetRange())).toBeLessThan(rangeCombos(openingRange('UTG')));
  });
});

describe('made hand classification', () => {
  it('recognises a set as strong', () => {
    const m = classifyMadeHand(hole('Qh', 'Qd'), board('Jd', '2c', 'Qs'));
    expect(m.tier).toBe('strong');
  });

  it('separates top pair good kicker from a weak pair', () => {
    expect(classifyMadeHand(hole('Ah', 'Kd'), board('Ks', '7c', '2d')).tier).toBe('medium');
    expect(classifyMadeHand(hole('7h', '3d'), board('Ks', '7c', '2d')).tier).toBe('weak');
  });

  it('calls an unpaired hand air', () => {
    expect(classifyMadeHand(hole('9h', '4d'), board('Ks', '7c', '2d')).tier).toBe('air');
  });

  it('detects flush and straight draws', () => {
    const fd = classifyMadeHand(hole('Ah', '5h'), board('Kh', '7h', '2d'));
    expect(fd.hasFlushDraw).toBe(true);
    expect(fd.hasDraw).toBe(true);

    const oe = classifyMadeHand(hole('9h', '8d'), board('7s', '6c', '2d'));
    expect(oe.hasOpenEnder).toBe(true);
  });

  it('reports no draw once the river is out', () => {
    // There are no cards to come, so a four-flush is a missed hand, not a draw.
    const m = classifyMadeHand(hole('Ah', '5h'), board('Kh', '7h', '2d', '3c', '9s'));
    expect(m.hasFlushDraw).toBe(false);
    expect(m.hasDraw).toBe(false);
  });

  it('knows when the board plays and hero adds nothing', () => {
    const m = classifyMadeHand(hole('3h', '2d'), board('As', 'Ks', 'Qs', 'Js', 'Ts'));
    expect(m.usesHoleCards).toBe(false);
  });
});

describe('equity against a range', () => {
  it('rates a set far ahead of a strong range', () => {
    const { equity } = equityVsRange(
      hole('Qh', 'Qd'), board('Jd', '2c', 'Qs'), threeBetRange(), 1, 1200,
    );
    expect(equity).toBeGreaterThan(0.8);
  });

  it('rates bottom pair behind a strong range', () => {
    const { equity } = equityVsRange(
      hole('7h', '2c'), board('Jd', '2c', 'Qs'), threeBetRange(), 1, 1200,
    );
    expect(equity).toBeLessThan(0.45);
  });

  it('is tougher than assuming a random hand', () => {
    // The point of the range model: a tight range beats hero more often than a
    // random hand does, so equity against it must be lower.
    const tight = equityVsRange(hole('Ah', 'Ts'), board('Kd', '7c', '2s'), threeBetRange(), 1, 1200);
    const wide = equityVsRange(hole('Ah', 'Ts'), board('Kd', '7c', '2s'), topRange(1), 1, 1200);
    expect(tight.equity).toBeLessThan(wide.equity);
  });

  it('is deterministic for the same inputs', () => {
    const a = equityVsRange(hole('Ah', 'Ts'), board('Kd', '7c', '2s'), openingRange('CO'), 1, 800);
    const b = equityVsRange(hole('Ah', 'Ts'), board('Kd', '7c', '2s'), openingRange('CO'), 1, 800);
    expect(a.equity).toBe(b.equity);
  });
});
