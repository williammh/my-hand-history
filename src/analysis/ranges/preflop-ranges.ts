import { rankValue, type Rank } from '@/domain/cards';
import type { Position } from '@/domain/position';
import { allHandClasses, comboCount } from '../charts/hand-class';

/**
 * A villain's assumed holding distribution: hand class -> weight in 0..1.
 *
 * The whole postflop and deep-preflop extension rests on this. The engine was
 * previously limited to push/fold charts because it had no model of what an
 * opponent holds; assuming villains are BALANCED gives us one, so equity can be
 * measured against a plausible range instead of against a random hand.
 */
export type Range = ReadonlyMap<string, number>;

/**
 * Chen-style strength score for a starting hand, 0..1.
 *
 * Charts stay the authority wherever one exists — this only fills the spots the
 * charts do not cover (deep stacks, facing raises). It is a ranking, not a
 * solver output, which is why every verdict built on it is capped at 'medium'
 * confidence and never claims an exact EV figure.
 */
export function handStrength(cls: string): number {
  const hi = cls[0] as Rank;
  const lo = cls[1] as Rank;
  const hiV = rankValue(hi);
  const loV = rankValue(lo);
  const paired = cls.length === 2;
  const suited = cls.endsWith('s');

  // High card, scaled so an ace dominates the base score.
  let score = Math.max(hiV, loV) / 2;
  if (paired) score = Math.max(5, hiV);          // pairs are worth at least a 5-pair
  if (suited) score += 2;

  // Connectedness: touching cards make straights, big gaps rarely do.
  const gap = Math.abs(hiV - loV);
  if (!paired) {
    if (gap === 1) score += 1;
    else if (gap === 2) score -= 1;
    else if (gap === 3) score -= 2;
    else if (gap >= 4) score -= 4;
    // Both cards below T with a small gap still make straights.
    if (gap <= 2 && Math.max(hiV, loV) < 10) score += 1;
  }

  // Normalize the ~(-4..16) raw span into 0..1.
  return Math.max(0, Math.min(1, (score + 4) / 20));
}

/** Every hand class ordered strongest-first, ties broken deterministically. */
export function rankedClasses(): readonly string[] {
  return [...allHandClasses()].sort((a, b) => {
    const d = handStrength(b) - handStrength(a);
    return d !== 0 ? d : a.localeCompare(b);
  });
}

const RANKED = rankedClasses();
const TOTAL_COMBOS = RANKED.reduce((n, c) => n + comboCount(c), 0);

/**
 * The strongest `percentile` fraction of all hands, by combo count.
 *
 * Weighted by combos rather than by class count because the 169 classes are not
 * equally likely: treating "AA" and "72o" as one unit each would make a top-10%
 * range badly wrong (72o is twelve combos, AA is six).
 */
export function topRange(percentile: number): Range {
  const target = TOTAL_COMBOS * Math.max(0, Math.min(1, percentile));
  const out = new Map<string, number>();
  let used = 0;
  for (const cls of RANKED) {
    if (used >= target) break;
    const combos = comboCount(cls);
    const room = target - used;
    // Partial inclusion at the boundary keeps the range's size exact rather
    // than quantized to whole classes.
    out.set(cls, room >= combos ? 1 : room / combos);
    used += combos;
  }
  return out;
}

/**
 * How wide a balanced player's range is for a given action, as a percentile.
 *
 * These are the standard opening frequencies a balanced regular uses. They are
 * approximations of equilibrium, not solver outputs.
 */
export const RFI_BY_POSITION: Record<Position, number> = {
  UTG: 0.16, UTG1: 0.17, UTG2: 0.18, UTG3: 0.19,
  LJ: 0.20, HJ: 0.24, CO: 0.29, BTN: 0.44, SB: 0.38, BB: 0.40,
};

export function openingRange(position: Position): Range {
  return topRange(RFI_BY_POSITION[position]);
}

/** A balanced player's 3-betting range — tight and value-weighted. */
export function threeBetRange(): Range {
  return topRange(0.07);
}

/** What a balanced player continues with after being 3-bet. */
export function fourBetRange(): Range {
  return topRange(0.03);
}

/** Total combo count of a range, used to weight sampling. */
export function rangeCombos(range: Range): number {
  let n = 0;
  for (const [cls, w] of range) n += comboCount(cls) * w;
  return n;
}
