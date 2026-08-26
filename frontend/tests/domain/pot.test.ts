import { describe, it, expect } from 'vitest';
import { computePots, potAtAction } from '@/domain/pot.js';
import { asAmount } from '@/domain/money.js';
import type { Action, ActionKind } from '@/domain/action.js';
import type { Street } from '@/domain/position.js';

let idx = 0;
function act(seat: number, kind: ActionKind, amount: number, street: Street = 'preflop'): Action {
  return {
    index: idx++, street, seat, playerId: `p${seat}`, kind,
    amount: asAmount(amount), totalCommitted: asAmount(amount),
    isAllIn: false, timestamp: null, raw: `seat${seat} ${kind} ${amount}`,
  };
}

describe('computePots', () => {
  it('builds a single main pot when everyone matches', () => {
    idx = 0;
    const { pots, total } = computePots([
      act(1, 'bet', 100), act(2, 'call', 100), act(3, 'call', 100),
    ]);
    expect(pots).toHaveLength(1);
    expect(total).toBe(300);
    expect(pots[0]!.eligibleSeats).toEqual([1, 2, 3]);
  });

  it('creates a side pot when a short stack is all-in', () => {
    idx = 0;
    // Seat 1 all-in 50; seats 2 and 3 put in 200 each.
    const { pots, total } = computePots([
      act(1, 'bet', 50), act(2, 'call', 200), act(3, 'call', 200),
    ]);
    expect(total).toBe(450);
    expect(pots).toHaveLength(2);
    // Main pot: 50 x 3 = 150, all three eligible.
    expect(pots[0]!.amount).toBe(150);
    expect(pots[0]!.eligibleSeats).toEqual([1, 2, 3]);
    // Side pot: 150 x 2 = 300, only seats 2 and 3.
    expect(pots[1]!.amount).toBe(300);
    expect(pots[1]!.eligibleSeats).toEqual([2, 3]);
  });

  it('builds three layers for three distinct all-in levels', () => {
    idx = 0;
    const { pots, total } = computePots([
      act(1, 'bet', 100), act(2, 'call', 300), act(3, 'call', 600),
    ]);
    expect(total).toBe(1000);
    expect(pots.map((p) => p.amount)).toEqual([300, 400, 300]);
    expect(pots.map((p) => p.eligibleSeats)).toEqual([[1, 2, 3], [2, 3], [3]]);
  });

  it('keeps folded players chips in the pot but strips their eligibility', () => {
    idx = 0;
    // The walk case: SB posts 4000 then folds; BB still wins those chips.
    const { pots, total } = computePots([
      act(1, 'post-sb', 4000), act(2, 'post-bb', 8000), act(1, 'fold', 0),
    ]);
    expect(total).toBe(12000);
    // Seat 1's 4000 funds the main pot but seat 1 cannot win it.
    expect(pots[0]!.eligibleSeats).not.toContain(1);
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(12000);
  });

  it('excludes returned uncalled chips from the pot', () => {
    idx = 0;
    const { total } = computePots([
      act(1, 'bet', 500), act(2, 'fold', 0), act(1, 'uncalled-return', 500),
    ]);
    expect(total).toBe(0);
  });

  it('tracks a running pot for the replay display', () => {
    idx = 0;
    const actions = [act(1, 'post-sb', 50), act(2, 'post-bb', 100), act(1, 'call', 50)];
    expect(potAtAction(actions, 0)).toBe(50);
    expect(potAtAction(actions, 1)).toBe(150);
    expect(potAtAction(actions, 2)).toBe(200);
  });
});
