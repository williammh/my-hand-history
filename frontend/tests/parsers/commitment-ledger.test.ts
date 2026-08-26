import { describe, it, expect } from 'vitest';
import { CommitmentLedger } from '@/parsers/shared/commitment-ledger.js';
import { asAmount } from '@/domain/money.js';

const stacks = (o: Record<number, number>) =>
  new Map(Object.entries(o).map(([k, v]) => [Number(k), asAmount(v)]));

describe('CommitmentLedger', () => {
  it('resolves hand 3 turn: bet, raise-to, then a call that is a delta', () => {
    const l = new CommitmentLedger(stacks({ 5: 100000, 6: 100000 }));

    const bet = l.applyDelta(5, asAmount(8000));
    expect(bet.totalCommitted).toBe(8000);

    const raise = l.applyTotal(6, asAmount(16000));
    expect(raise.delta).toBe(16000);
    expect(raise.totalCommitted).toBe(16000);

    // The crux: "Calls 8000" is a DELTA, so hero's street total becomes 16000.
    const call = l.applyDelta(5, asAmount(8000));
    expect(call.totalCommitted).toBe(16000);

    expect(l.committedThisStreet(5)).toBe(16000);
    expect(l.committedThisStreet(6)).toBe(16000);
  });

  it('treats a preflop SB call as a delta on top of the posted blind', () => {
    // Hand 3 preflop: SB posts 4000, then "Calls 4000" -> total 8000, not 4000.
    const l = new CommitmentLedger(stacks({ 5: 89994, 6: 304627 }));
    l.applyAnte(5, asAmount(800));
    l.applyDelta(5, asAmount(4000));      // Posts SB
    l.applyDelta(6, asAmount(8000));      // Posts BB
    expect(l.toCall(5)).toBe(4000);
    const call = l.applyDelta(5, asAmount(4000));
    expect(call.totalCommitted).toBe(8000);
    expect(l.toCall(5)).toBe(0);
  });

  it('posts antes before blinds so an all-in jam reconciles', () => {
    // Hand 1: LaCigale has 441766, posts 800 ante + 8000 BB, jams "to 440966".
    const l = new CommitmentLedger(stacks({ 2: 441766 }));
    l.applyAnte(2, asAmount(800));
    expect(l.stack(2)).toBe(440966);
    l.applyDelta(2, asAmount(8000)); // Posts BB
    const jam = l.applyTotal(2, asAmount(440966));
    expect(jam.delta).toBe(432966);
    expect(jam.isAllIn).toBe(true);
    expect(l.stack(2)).toBe(0);
    // Ante is not street commitment, so the jam total is exactly stack-minus-ante.
    expect(l.committedTotal(2)).toBe(441766);
  });

  it('detects all-in without an explicit marker', () => {
    const l = new CommitmentLedger(stacks({ 1: 500 }));
    expect(l.applyDelta(1, asAmount(500)).isAllIn).toBe(true);
  });

  it('caps toCall at the remaining stack', () => {
    const l = new CommitmentLedger(stacks({ 1: 300, 2: 10000 }));
    l.applyDelta(2, asAmount(1000));
    expect(l.toCall(1)).toBe(300);
  });

  it('resets street commitment but keeps hand totals', () => {
    const l = new CommitmentLedger(stacks({ 1: 10000 }));
    l.applyDelta(1, asAmount(2000));
    l.nextStreet();
    expect(l.committedThisStreet(1)).toBe(0);
    expect(l.committedTotal(1)).toBe(2000);
    expect(l.currentBet()).toBe(0);
  });
});
