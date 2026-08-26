import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registry } from '@/parsers/index.js';
import { heroNetResult } from '@/domain/stacks.js';
import { asAmount } from '@/domain/money.js';
import type { Hand } from '@/domain/hand.js';

const samplePath = fileURLToPath(new URL('../fixtures/betclic/sample.txt', import.meta.url));
const parsed = registry.parseFile(readFileSync(samplePath, 'utf8'), 'betclic-fr', 'sample.txt');
const hands = parsed.hands;

/** Awarded minus committed, recomputed independently of the implementation. */
function expectedNet(hand: Hand): number {
  const won = hand.awards
    .filter((a) => a.seat === hand.heroSeat)
    .reduce((s, a) => s + a.amount, 0);
  let paid = 0;
  for (const a of hand.actions) {
    if (a.seat !== hand.heroSeat) continue;
    if (a.kind === 'uncalled-return') paid -= a.amount;
    else if (a.kind !== 'fold' && a.kind !== 'check' && a.kind !== 'muck' && a.kind !== 'show') {
      paid += a.amount;
    }
  }
  return won - paid;
}

describe('heroNetResult', () => {
  it('parses the sample file', () => {
    expect(hands.length).toBeGreaterThan(0);
  });

  it('nets awards against chips committed on every sample hand', () => {
    for (const hand of hands) {
      expect(heroNetResult(hand)).toBe(expectedNet(hand));
    }
  });

  it('never reports the whole pot as hero profit on a won hand', () => {
    // The bug this replaces: showing pots.total as "+", which counts villains'
    // chips AND hero's own as winnings.
    for (const hand of hands) {
      const net = heroNetResult(hand);
      if (net !== null && net > 0) expect(net).toBeLessThan(hand.pots.total);
    }
  });

  it('is a loss when hero commits chips and wins nothing', () => {
    const losers = hands.filter(
      (h) => !h.awards.some((a) => a.seat === h.heroSeat)
        && h.actions.some((a) => a.seat === h.heroSeat && a.amount > 0),
    );
    for (const hand of losers) {
      expect(heroNetResult(hand)!).toBeLessThan(0);
    }
  });

  it('returns null when the hand has no hero', () => {
    const hand = hands[0]!;
    expect(heroNetResult({ ...hand, heroSeat: null })).toBeNull();
  });

  it('excludes an uncalled bet that was returned', () => {
    const hand = hands.find((h) =>
      h.actions.some((a) => a.kind === 'uncalled-return' && a.seat === h.heroSeat));
    if (!hand) return;
    const returned = hand.actions
      .filter((a) => a.kind === 'uncalled-return' && a.seat === hand.heroSeat)
      .reduce((s, a) => s + a.amount, 0);
    expect(returned).toBeGreaterThan(0);
    // The returned chips must not appear as a cost.
    expect(heroNetResult(hand)).toBe(asAmount(expectedNet(hand)));
  });
});
