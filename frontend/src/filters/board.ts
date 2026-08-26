import type { Board, Rank } from '@/domain/cards.js';
import { cardRank, cardSuit, rankValue, RANKS } from '@/domain/cards.js';

/**
 * How tightly the flop's three ranks run together.
 *
 * Measured over the FLOP only, and over distinct ranks. A paired flop has no
 * meaningful connectedness — the two matching cards would read as a zero gap
 * and make 992 look like a run — so pairs are reported separately and never
 * counted as connected.
 */
export type Connectedness =
  | 'connected'      // three in a row: AKQ, JT9, 543
  | 'one-gap'        // one rank missing across the span: AKJ, JT8
  | 'two-gap'        // two missing: AKT, J97
  | 'disconnected'   // wider than that
  | 'paired';        // two or three of a kind on the flop

export type SuitTexture = 'rainbow' | 'two-tone' | 'monotone';

/** Flop texture facts, derived once per hand. Null when hero saw no flop. */
export interface BoardTexture {
  readonly connectedness: Connectedness;
  readonly suits: SuitTexture;
  /** Highest and lowest flop rank, as 0..12 values. */
  readonly highest: number;
  readonly lowest: number;
  readonly paired: boolean;
  /** Three of a kind on the flop — a subset of `paired`. */
  readonly trips: boolean;
}

/**
 * Classifies the first three board cards.
 *
 * Straight-relevant connectedness treats the ace as high only. A wheel flop
 * (A23) is a real straight draw, but calling it "connected" would put it in the
 * same bucket as AKQ, which plays nothing alike — so it is scored on its
 * literal A-to-2 span and lands in `disconnected`.
 */
export function boardTexture(board: Board): BoardTexture | null {
  if (board.length < 3) return null;
  const flop = board.slice(0, 3);

  const values = flop.map((c) => rankValue(cardRank(c))).sort((a, b) => b - a);
  const distinct = [...new Set(values)];
  const highest = values[0]!;
  const lowest = values[values.length - 1]!;

  const suits = new Set(flop.map((c) => cardSuit(c)));
  const suitTexture: SuitTexture =
    suits.size === 1 ? 'monotone' : suits.size === 2 ? 'two-tone' : 'rainbow';

  const paired = distinct.length < 3;
  const trips = distinct.length === 1;

  let connectedness: Connectedness;
  if (paired) {
    connectedness = 'paired';
  } else {
    // Span of 2 over three distinct ranks means no gaps at all.
    const span = highest - lowest;
    connectedness =
      span === 2 ? 'connected'
        : span === 3 ? 'one-gap'
        : span === 4 ? 'two-gap'
        : 'disconnected';
  }

  return { connectedness, suits: suitTexture, highest, lowest, paired, trips };
}

/** Rank options for the high/low bounds, ace first. */
export const RANK_OPTIONS: readonly { value: Rank; label: string }[] = [...RANKS]
  .reverse()
  .map((r) => ({ value: r, label: r }));

export function rankOf(r: Rank): number {
  return rankValue(r);
}
