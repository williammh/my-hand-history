import { describe, expect, it } from 'vitest';
import { MAX_CHIPS, chipBreakdown } from '@/components/replay/chips';

const values = (amount: number) => chipBreakdown(amount).map((d) => d.value);

describe('chipBreakdown', () => {
  it('breaks an amount into the fewest chips, largest first', () => {
    expect(values(1_630)).toEqual([1_000, 500, 100, 25, 5]);
    expect(values(5_000_000)).toEqual([5_000_000]);
  });

  it('draws nothing for zero', () => {
    expect(values(0)).toEqual([]);
  });

  it('caps the stack, dropping the smallest chips', () => {
    const chips = values(4_444);
    expect(chips).toHaveLength(MAX_CHIPS);
    expect(chips.slice(0, 4)).toEqual([1_000, 1_000, 1_000, 1_000]);
  });
});
