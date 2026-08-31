import { type Amount, ZERO, asAmount } from './money';
import type { Action } from './action';
import { CHIP_MOVING } from './action';

export interface Pot {
  /** 0 = main pot; 1..n = side pots in creation order. */
  readonly level: number;
  readonly amount: Amount;
  /** Seats eligible to win this pot. */
  readonly eligibleSeats: readonly number[];
}

export interface PotAward {
  readonly potLevel: number;
  readonly seat: number;
  readonly amount: Amount;
  readonly handDescription: string | null;
}

export interface PotState {
  readonly pots: readonly Pot[];
  readonly total: Amount;
}

/**
 * Builds main and side pots from the action list by the standard layer-cake
 * method: sort distinct contribution levels ascending, and at each level every
 * player who reached it adds the slice between this level and the previous one.
 *
 * Two rules that are easy to get wrong and are covered by tests:
 *  - Chips from folded players stay in the pot. A walk (hand 2 of the Betclic
 *    sample) has the SB fold and forfeit 4000, which the BB still wins.
 *  - Only unfolded players are ELIGIBLE for a pot, but folded players' chips
 *    still fund it — eligibility and contribution are separate questions.
 */
export function computePots(actions: readonly Action[]): PotState {
  const contributed = new Map<number, number>();
  const folded = new Set<number>();

  for (const a of actions) {
    if (CHIP_MOVING.has(a.kind) && a.amount > 0) {
      contributed.set(a.seat, (contributed.get(a.seat) ?? 0) + a.amount);
    } else if (a.kind === 'uncalled-return' && a.amount > 0) {
      // Returned chips were never really in the pot.
      contributed.set(a.seat, (contributed.get(a.seat) ?? 0) - a.amount);
    }
    if (a.kind === 'fold') folded.add(a.seat);
  }

  const entries = [...contributed.entries()].filter(([, v]) => v > 0);
  if (entries.length === 0) return { pots: [], total: ZERO };

  const levels = [...new Set(entries.map(([, v]) => v))].sort((a, b) => a - b);

  const pots: Pot[] = [];
  let prev = 0;
  let level = 0;
  for (const lv of levels) {
    const slice = lv - prev;
    if (slice <= 0) { prev = lv; continue; }

    const contributors = entries.filter(([, v]) => v >= lv);
    const amount = slice * contributors.length;
    if (amount <= 0) { prev = lv; continue; }

    const eligible = contributors.map(([s]) => s).filter((s) => !folded.has(s)).sort((a, b) => a - b);

    pots.push({ level: level++, amount: asAmount(amount), eligibleSeats: eligible });
    prev = lv;
  }

  // Collapse pots that nobody can win (everyone at that level folded) into the
  // previous pot rather than leaving an unwinnable orphan layer.
  const merged: Pot[] = [];
  for (const p of pots) {
    const last = merged[merged.length - 1];
    if (p.eligibleSeats.length === 0 && last) {
      merged[merged.length - 1] = { ...last, amount: asAmount(last.amount + p.amount) };
      continue;
    }
    merged.push({ ...p, level: merged.length });
  }

  const total = asAmount(merged.reduce((acc, p) => acc + p.amount, 0));
  return { pots: merged, total };
}

/** Running pot total after each action — drives the replay's pot display. */
export function potAfterEachAction(actions: readonly Action[]): Amount[] {
  const out: Amount[] = [];
  let running = 0;
  for (const a of actions) {
    if (CHIP_MOVING.has(a.kind)) running += a.amount;
    else if (a.kind === 'uncalled-return') running -= a.amount;
    out.push(asAmount(running));
  }
  return out;
}

/** Total chips in the middle after the given action index (inclusive). */
export function potAtAction(actions: readonly Action[], index: number): Amount {
  let running = 0;
  for (let i = 0; i <= index && i < actions.length; i++) {
    const a = actions[i]!;
    if (CHIP_MOVING.has(a.kind)) running += a.amount;
    else if (a.kind === 'uncalled-return') running -= a.amount;
  }
  return asAmount(running);
}
