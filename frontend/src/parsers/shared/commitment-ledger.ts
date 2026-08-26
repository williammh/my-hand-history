import { type Amount, asAmount } from '@/domain/money.js';

/**
 * Tracks per-street and whole-hand chip commitment so parsers can reconcile the
 * inconsistent amount semantics rooms use.
 *
 * Betclic (and most rooms) mix two conventions within a single street:
 *   "Bets 8000"      -> a DELTA: chips added now
 *   "Calls 8000"     -> a DELTA: chips added now
 *   "Raises to 16000"-> an ABSOLUTE street total
 *
 * Verified on hand 3's turn in the sample:
 *   hero Bets 8000            -> delta 8000, total  8000
 *   villain Raises to 16000   -> delta 16000, total 16000
 *   hero Calls 8000           -> delta 8000, total 16000   (NOT total 8000)
 * Street pot 32000. Reading that final call as a total would show hero calling
 * 8000 into a 16000 bet and make every pot-odds verdict wrong.
 */
export class CommitmentLedger {
  private readonly stacks = new Map<number, number>();
  private readonly street = new Map<number, number>();
  private readonly total = new Map<number, number>();

  constructor(startingStacks: ReadonlyMap<number, Amount>) {
    for (const [seat, stack] of startingStacks) this.stacks.set(seat, stack);
  }

  committedThisStreet(seat: number): Amount {
    return asAmount(this.street.get(seat) ?? 0);
  }

  committedTotal(seat: number): Amount {
    return asAmount(this.total.get(seat) ?? 0);
  }

  /** Highest single-seat commitment on the current street. */
  currentBet(): Amount {
    let max = 0;
    for (const v of this.street.values()) if (v > max) max = v;
    return asAmount(max);
  }

  stack(seat: number): Amount {
    return asAmount(this.stacks.get(seat) ?? 0);
  }

  /** Chips a seat must add to match the current bet. */
  toCall(seat: number): Amount {
    const owed = this.currentBet() - this.committedThisStreet(seat);
    return asAmount(Math.max(0, Math.min(owed, this.stack(seat))));
  }

  /**
   * Applies a raw DELTA. Returns the resulting street total and whether the seat
   * is now all-in, so the parser can fill Action.totalCommitted / isAllIn even
   * when the room omits an explicit "and is all-in" marker.
   */
  applyDelta(seat: number, delta: Amount): { totalCommitted: Amount; isAllIn: boolean } {
    const d = Math.max(0, delta);
    this.stacks.set(seat, (this.stacks.get(seat) ?? 0) - d);
    this.street.set(seat, (this.street.get(seat) ?? 0) + d);
    this.total.set(seat, (this.total.get(seat) ?? 0) + d);
    return {
      totalCommitted: this.committedThisStreet(seat),
      isAllIn: (this.stacks.get(seat) ?? 0) <= 0,
    };
  }

  /**
   * Applies an ABSOLUTE street total ("Raises to N"), deriving the delta.
   * Returns the delta so the Action can store it for pot math.
   */
  applyTotal(seat: number, streetTotal: Amount): {
    delta: Amount;
    totalCommitted: Amount;
    isAllIn: boolean;
  } {
    const prior = this.committedThisStreet(seat);
    const delta = asAmount(Math.max(0, streetTotal - prior));
    const res = this.applyDelta(seat, delta);
    return { delta, ...res };
  }

  /**
   * Antes are posted BEFORE blinds and are not street commitment: they do not
   * count toward what a player owes preflop. Hand 1 proves the ordering -- a
   * 441766 stack posts an 800 ante and then jams "Raises to 440966", which is
   * stack minus ante. Deducting the ante after the blind sends stacks negative.
   */
  applyAnte(seat: number, ante: Amount): { isAllIn: boolean } {
    const a = Math.max(0, ante);
    this.stacks.set(seat, (this.stacks.get(seat) ?? 0) - a);
    this.total.set(seat, (this.total.get(seat) ?? 0) + a);
    return { isAllIn: (this.stacks.get(seat) ?? 0) <= 0 };
  }

  /** Clears per-street commitments. Called at each new board card. */
  nextStreet(): void {
    this.street.clear();
  }
}
