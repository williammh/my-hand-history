import { type Amount, asAmount, toBB } from './money';
import { CHIP_MOVING } from './action';
import type { Hand } from './hand';
import type { Board } from './cards';
import type { Street } from './position';

export interface StackSnapshot {
  /** Remaining stack per seat, after the given action resolves. */
  readonly stacks: ReadonlyMap<number, Amount>;
  /** Chips committed this hand per seat. */
  readonly committed: ReadonlyMap<number, Amount>;
  /** Seats that have folded by this point. */
  readonly folded: ReadonlySet<number>;
}

/**
 * Rebuilds stacks at any point in the hand. Powers both replay scrubbing and the
 * analysis engine's "effective stack at this decision" question.
 *
 * `actionIndex` is inclusive; pass -1 for the state before any action (i.e. at
 * starting stacks, before antes).
 */
export function stacksAtAction(hand: Hand, actionIndex: number): StackSnapshot {
  const stacks = new Map<number, Amount>();
  const committed = new Map<number, Amount>();
  const folded = new Set<number>();

  for (const s of hand.seats) {
    stacks.set(s.seat, s.startingStack);
    committed.set(s.seat, asAmount(0));
  }

  for (let i = 0; i <= actionIndex && i < hand.actions.length; i++) {
    const a = hand.actions[i]!;
    if (CHIP_MOVING.has(a.kind) && a.amount > 0) {
      stacks.set(a.seat, asAmount((stacks.get(a.seat) ?? 0) - a.amount));
      committed.set(a.seat, asAmount((committed.get(a.seat) ?? 0) + a.amount));
    } else if (a.kind === 'uncalled-return' && a.amount > 0) {
      stacks.set(a.seat, asAmount((stacks.get(a.seat) ?? 0) + a.amount));
      committed.set(a.seat, asAmount((committed.get(a.seat) ?? 0) - a.amount));
    }
    if (a.kind === 'fold') folded.add(a.seat);
  }

  return { stacks, committed, folded };
}

/**
 * Effective stack between two seats — the smaller of their remaining stacks.
 *
 * Deliberately a function rather than a stored field: effective stack is pairwise
 * and moves as chips go in, so any single stored number is wrong the moment the
 * analysis engine asks "versus the aggressor, at this decision".
 */
export function effectiveStack(
  hand: Hand,
  seatA: number,
  seatB: number,
  atActionIndex = -1,
): Amount {
  const snap = stacksAtAction(hand, atActionIndex);
  const a = snap.stacks.get(seatA) ?? asAmount(0);
  const b = snap.stacks.get(seatB) ?? asAmount(0);
  return a < b ? a : b;
}

export function effectiveStackBB(
  hand: Hand,
  seatA: number,
  seatB: number,
  atActionIndex = -1,
): number {
  return toBB(effectiveStack(hand, seatA, seatB, atActionIndex), hand.money);
}

/**
 * Hero's starting stack in BB, before antes and blinds. This is the number
 * preflop charts are indexed by, so it must NOT deduct the ante.
 */
export function heroStartingStackBB(hand: Hand): number | null {
  if (hand.heroSeat === null) return null;
  const seat = hand.seats.find((s) => s.seat === hand.heroSeat);
  if (!seat) return null;
  return toBB(seat.startingStack, hand.money);
}

/** Smallest effective stack hero faces among still-live opponents. */
export function heroEffectiveStackBB(hand: Hand, atActionIndex = -1): number | null {
  if (hand.heroSeat === null) return null;
  const snap = stacksAtAction(hand, atActionIndex);
  const heroStack = snap.stacks.get(hand.heroSeat);
  if (heroStack === undefined) return null;

  let smallest: number | null = null;
  for (const s of hand.seats) {
    if (s.seat === hand.heroSeat || snap.folded.has(s.seat)) continue;
    const opp = snap.stacks.get(s.seat) ?? 0;
    const eff = Math.min(heroStack, opp);
    if (smallest === null || eff < smallest) smallest = eff;
  }
  if (smallest === null) return null;
  return toBB(asAmount(smallest), hand.money);
}

/**
 * A seat's net chip result for the hand: everything awarded to it, minus
 * everything it put in.
 *
 * Not the same as the pot size. The seat's own chips fund part of any pot it
 * wins, so a won pot of 100k after committing 40k is +60k, not +100k.
 * `committed` is already net of uncalled returns, which is what makes an
 * uncalled river shove come out at zero rather than a phantom loss.
 */
export function seatNetResult(hand: Hand, seat: number): Amount {
  const { committed } = stacksAtAction(hand, hand.actions.length - 1);
  const paid = committed.get(seat) ?? 0;
  const won = hand.awards
    .filter((a) => a.seat === seat)
    .reduce((sum, a) => sum + a.amount, 0);
  return asAmount(won - paid);
}

/**
 * Hero's net chip result for the hand. Returns null when the file has no
 * hero seat — see `seatNetResult` for the underlying computation.
 */
export function heroNetResult(hand: Hand): Amount | null {
  if (hand.heroSeat === null) return null;
  return seatNetResult(hand, hand.heroSeat);
}

/**
 * One stop on the replay timeline.
 *
 * The timeline is NOT just `hand.actions`. When players are all-in, the dealer
 * still runs out the remaining streets, and those streets carry no actions —
 * stepping only through actions would jump straight from the last call to the
 * end of the hand with the whole board appearing at once (or, before
 * boardAtAction, never appearing at all).
 *
 * So a step is either an action, or a card-only "deal" step for a street whose
 * cards arrive with no decision attached. `actionIndex` stays the index into
 * `hand.actions` for everything the rest of the app reads — a deal step simply
 * repeats the preceding action's index, since no chips have moved since.
 */
export interface ReplayStep {
  /** Index into Hand.actions; inclusive, as stacksAtAction expects. */
  readonly actionIndex: number;
  /** Board on the felt at this step. */
  readonly board: Board;
  /** Set on a card-only step: the street whose cards were just dealt. */
  readonly dealt: Street | null;
}

/**
 * Every stop the replay can scrub to, in order, starting with the pre-action
 * state at index -1.
 *
 * Streets are walked in order, emitting a deal step for a street whose cards
 * arrive without any action of its own, then a step per action. That makes an
 * all-in run-out scrub flop → turn → river one card group at a time, exactly as
 * a hand with live postflop betting already does.
 */
export function replayTimeline(hand: Hand): ReplayStep[] {
  const steps: ReplayStep[] = [{ actionIndex: -1, board: [], dealt: null }];

  for (const street of hand.streets) {
    // The cards land before anyone acts on them. A street with actions gets its
    // board from those action steps, so only an ACTIONLESS street needs a step
    // of its own — otherwise the board would sit on screen for an extra beat
    // with nothing happening.
    if (street.newCards.length > 0 && street.actions.length === 0) {
      steps.push({
        actionIndex: steps[steps.length - 1]!.actionIndex,
        board: street.board,
        dealt: street.street,
      });
    }
    for (const action of street.actions) {
      steps.push({ actionIndex: action.index, board: street.board, dealt: null });
    }
  }

  return steps;
}
