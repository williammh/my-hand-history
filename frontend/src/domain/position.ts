/**
 * Positions in preflop action order. SB/BB come last because they act last
 * preflop — postflop order is the reverse rotation starting from SB.
 */
export type Position =
  | 'UTG' | 'UTG1' | 'UTG2' | 'UTG3' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREET_ORDER: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

export function streetIndex(s: Street): number {
  return STREET_ORDER.indexOf(s);
}

/** Board cards visible on each street. */
export const STREET_BOARD_LENGTH: Record<Street, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
};

/**
 * Position names by table size, ordered clockwise starting AT THE BUTTON.
 * An explicit table beats clever arithmetic here: the naming is conventional,
 * not computed, and heads-up collapses BTN into the SB seat.
 */
const RING_FROM_BUTTON: Record<number, readonly Position[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO'],
  10: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'UTG3', 'LJ', 'HJ', 'CO'],
};

export interface SeatRing {
  /** Occupied seat numbers. Need not be contiguous — seats 1,3,4,7,9 is normal. */
  readonly seats: readonly number[];
  readonly buttonSeat: number;
}

/**
 * Assigns a Position to every occupied seat by walking clockwise from the button.
 *
 * This is site-agnostic and lives in core because every room shares the rule, and
 * because rooms label only some seats: Betclic tags SB/BB/BTN and leaves middle
 * positions blank, so they must be derived rather than read.
 *
 * In heads-up the button IS the small blind, so it is labeled 'SB' for action-order
 * purposes; `PlayerSeat.isButton` remains the authority on who holds the button.
 */
export function derivePositions(ring: SeatRing): ReadonlyMap<number, Position> {
  const seats = [...ring.seats].sort((a, b) => a - b);
  const n = seats.length;
  const out = new Map<number, Position>();
  if (n === 0) return out;

  const btnIdx = seats.indexOf(ring.buttonSeat);
  if (btnIdx < 0) return out;

  const names = RING_FROM_BUTTON[n];
  if (!names) return out;

  for (let i = 0; i < n; i++) {
    const seat = seats[(btnIdx + i) % n]!;
    out.set(seat, names[i]!);
  }

  // Heads-up: the button posts the small blind.
  if (n === 2) out.set(ring.buttonSeat, 'SB');
  return out;
}

/** Postflop action order: SB first, button last. */
export function postflopOrder(ring: SeatRing): readonly number[] {
  const seats = [...ring.seats].sort((a, b) => a - b);
  const btnIdx = seats.indexOf(ring.buttonSeat);
  if (btnIdx < 0) return seats;
  const out: number[] = [];
  for (let i = 1; i <= seats.length; i++) out.push(seats[(btnIdx + i) % seats.length]!);
  return out;
}
