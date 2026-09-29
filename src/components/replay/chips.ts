export interface Denomination {
  readonly value: number;
  /** Literal Tailwind classes so the scanner picks them up. */
  readonly face: string;
  readonly edge: string;
}

/** Largest first — the order a greedy breakdown consumes them in. */
export const DENOMINATIONS: readonly Denomination[] = [
  { value: 5_000_000, face: 'bg-rose-950', edge: 'border-amber-300' },
  { value: 1_000_000, face: 'bg-lime-400', edge: 'border-lime-950' },
  { value: 500_000, face: 'bg-amber-800', edge: 'border-amber-200' },
  { value: 100_000, face: 'bg-cyan-400', edge: 'border-cyan-950' },
  { value: 25_000, face: 'bg-pink-500', edge: 'border-white' },
  { value: 5_000, face: 'bg-orange-500', edge: 'border-white' },
  { value: 1_000, face: 'bg-yellow-400', edge: 'border-yellow-900' },
  { value: 500, face: 'bg-purple-600', edge: 'border-white' },
  { value: 100, face: 'bg-zinc-900', edge: 'border-white' },
  { value: 25, face: 'bg-green-600', edge: 'border-white' },
  { value: 10, face: 'bg-blue-600', edge: 'border-white' },
  { value: 5, face: 'bg-red-600', edge: 'border-white' },
  { value: 1, face: 'bg-slate-100', edge: 'border-slate-500' },
];

export const MAX_CHIPS = 8;

/**
 * Greedy breakdown of an amount into chips, largest first, capped at what a
 * stack draws. The cap drops the smallest chips, so a stack is a picture of
 * the amount, not an exact count — the exact figure is always shown as text.
 */
export function chipBreakdown(amount: number): Denomination[] {
  const chips: Denomination[] = [];
  let rest = amount;
  for (const d of DENOMINATIONS) {
    while (rest >= d.value && chips.length < MAX_CHIPS) {
      chips.push(d);
      rest -= d.value;
    }
  }
  return chips;
}
