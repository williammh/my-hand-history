import { describe, it, expect } from 'vitest';
import { evaluate, categoryOf, HandCategory, describe as describeHand } from '@/analysis/equity/evaluator';
import type { Card } from '@/domain/cards';

const h = (s: string) => s.split(' ') as Card[];

describe('hand evaluator', () => {
  it('ranks categories in the right order', () => {
    const straightFlush = evaluate(h('9h 8h 7h 6h 5h'));
    const quads = evaluate(h('9h 9d 9s 9c 5h'));
    const boat = evaluate(h('9h 9d 9s 5c 5h'));
    const flush = evaluate(h('Ah 8h 7h 6h 2h'));
    const straight = evaluate(h('9h 8d 7s 6c 5h'));
    const trips = evaluate(h('9h 9d 9s 6c 2h'));
    const twoPair = evaluate(h('9h 9d 6s 6c 2h'));
    const pair = evaluate(h('9h 9d 7s 6c 2h'));
    const high = evaluate(h('Ah Jd 7s 6c 2h'));
    const ordered = [straightFlush, quads, boat, flush, straight, trips, twoPair, pair, high];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i - 1]!).toBeGreaterThan(ordered[i]!);
    }
  });

  it('identifies the wheel straight', () => {
    expect(categoryOf(evaluate(h('Ah 2d 3s 4c 5h')))).toBe(HandCategory.STRAIGHT);
  });

  it('picks the best five from seven cards', () => {
    // Board Qh 9d Qd 5c Ah with hero JhTd: only a pair of queens plays.
    expect(categoryOf(evaluate(h('Qh 9d Qd 5c Ah Jh Td')))).toBe(HandCategory.PAIR);
    // With QJ hero has trips.
    expect(categoryOf(evaluate(h('Qh 9d Qd 5c Ah Qs Td')))).toBe(HandCategory.TRIPS);
  });

  it('compares kickers within a category', () => {
    expect(evaluate(h('Ah Ad Ks 7c 2h'))).toBeGreaterThan(evaluate(h('Ah Ad Qs 7c 2h')));
  });

  it('describes hands in words', () => {
    expect(describeHand(h('Qh 9d Qd 5c Ah Jh Td'))).toBe('pair');
    expect(describeHand(h('9h 8h 7h 6h 5h'))).toBe('straight flush');
  });
});
