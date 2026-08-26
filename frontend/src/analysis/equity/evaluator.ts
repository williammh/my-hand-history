import { type Card, RANKS, cardRank, cardSuit } from '@/domain/cards.js';

export const HandCategory = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
} as const;

export const CATEGORY_NAMES = [
  'high card', 'pair', 'two pair', 'three of a kind', 'straight',
  'flush', 'full house', 'four of a kind', 'straight flush',
];

/**
 * Scores the best 5-card hand from 5-7 cards as a single comparable integer:
 * category in the high bits, then up to five kickers. Larger is better.
 *
 * Written as counting logic rather than a lookup table because it runs a few
 * hundred thousand times per Monte Carlo run — fast enough — and stays readable.
 */
export function evaluate(cards: readonly Card[]): number {
  const rankCounts = new Array<number>(13).fill(0);
  const suitCounts = new Array<number>(4).fill(0);
  const suitIdx: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };
  const bySuit: number[][] = [[], [], [], []];

  for (const c of cards) {
    const r = RANKS.indexOf(cardRank(c));
    const s = suitIdx[cardSuit(c)]!;
    rankCounts[r]!++;
    suitCounts[s]!++;
    bySuit[s]!.push(r);
  }

  const flushSuit = suitCounts.findIndex((n) => n >= 5);

  // Straight flush.
  if (flushSuit >= 0) {
    const sfHigh = straightHigh(bySuit[flushSuit]!);
    if (sfHigh >= 0) return score(HandCategory.STRAIGHT_FLUSH, [sfHigh]);
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    const n = rankCounts[r]!;
    if (n === 4) quads.push(r);
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
  }

  if (quads.length) {
    const kicker = highestExcluding(rankCounts, [quads[0]!], 1);
    return score(HandCategory.QUADS, [quads[0]!, ...kicker]);
  }
  if (trips.length >= 2) return score(HandCategory.FULL_HOUSE, [trips[0]!, trips[1]!]);
  if (trips.length && pairs.length) return score(HandCategory.FULL_HOUSE, [trips[0]!, pairs[0]!]);

  if (flushSuit >= 0) {
    const top5 = bySuit[flushSuit]!.slice().sort((a, b) => b - a).slice(0, 5);
    return score(HandCategory.FLUSH, top5);
  }

  const allRanks: number[] = [];
  for (let r = 0; r < 13; r++) if (rankCounts[r]! > 0) allRanks.push(r);
  const sHigh = straightHigh(allRanks);
  if (sHigh >= 0) return score(HandCategory.STRAIGHT, [sHigh]);

  if (trips.length) {
    return score(HandCategory.TRIPS, [trips[0]!, ...highestExcluding(rankCounts, [trips[0]!], 2)]);
  }
  if (pairs.length >= 2) {
    return score(HandCategory.TWO_PAIR, [
      pairs[0]!, pairs[1]!, ...highestExcluding(rankCounts, [pairs[0]!, pairs[1]!], 1),
    ]);
  }
  if (pairs.length === 1) {
    return score(HandCategory.PAIR, [pairs[0]!, ...highestExcluding(rankCounts, [pairs[0]!], 3)]);
  }
  return score(HandCategory.HIGH_CARD, highestExcluding(rankCounts, [], 5));
}

/** Highest card of a 5-straight in the given ranks, or -1. Handles the wheel. */
function straightHigh(ranks: readonly number[]): number {
  const present = new Array<boolean>(13).fill(false);
  for (const r of ranks) present[r] = true;
  for (let high = 12; high >= 4; high--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!present[high - k]) { ok = false; break; }
    if (ok) return high;
  }
  // A-2-3-4-5: ace plays low.
  if (present[12] && present[0] && present[1] && present[2] && present[3]) return 3;
  return -1;
}

function highestExcluding(counts: readonly number[], exclude: readonly number[], n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (counts[r]! === 0 || exclude.includes(r)) continue;
    for (let k = 0; k < counts[r]! && out.length < n; k++) out.push(r);
  }
  return out;
}

function score(category: number, kickers: readonly number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) v = v * 16 + (kickers[i] ?? 0);
  return v;
}

export function categoryOf(scoreValue: number): number {
  return Math.floor(scoreValue / 16 ** 5);
}

export function describe(cards: readonly Card[]): string {
  return CATEGORY_NAMES[categoryOf(evaluate(cards))] ?? 'unknown';
}
