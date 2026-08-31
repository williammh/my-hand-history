/**
 * Money is always an integer in the hand's minor unit: chips for tournaments,
 * cents for cash games. Never a float — `0.1 + 0.2` problems in pot math show up
 * as off-by-one-cent checksum failures that are miserable to track down.
 *
 * `Amount` is a branded `number` rather than a `bigint` so that a parsed Hand
 * stays JSON-serializable: it goes into IndexedDB and, later, over the wire to a
 * solver, both of which would need a revive step for bigint.
 */
export type Amount = number & { readonly __brand: 'Amount' };

export const ZERO = 0 as Amount;

export function amount(n: number): Amount {
  if (!Number.isInteger(n)) throw new RangeError(`Amount must be an integer, got ${n}`);
  return n as Amount;
}

/** Unchecked cast for hot paths where the caller has already proven integrality. */
export const asAmount = (n: number): Amount => n as Amount;

export const addAmount = (a: Amount, b: Amount): Amount => (a + b) as Amount;
export const subAmount = (a: Amount, b: Amount): Amount => (a - b) as Amount;
export const sumAmounts = (xs: Iterable<Amount>): Amount => {
  let total = 0;
  for (const x of xs) total += x;
  return total as Amount;
};
export const maxAmount = (a: Amount, b: Amount): Amount => (a > b ? a : b);
export const minAmount = (a: Amount, b: Amount): Amount => (a < b ? a : b);

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHIPS';
export type AnteType = 'none' | 'per-player' | 'big-blind-ante';

export interface MoneyContext {
  /** CHIPS for tournaments; an ISO code for cash games. */
  readonly currency: CurrencyCode;
  /** Decimal places in the minor unit: 0 for chips, 2 for real currency. */
  readonly exponent: 0 | 2;
  readonly bigBlind: Amount;
  readonly smallBlind: Amount;
  /** Per-player ante, or the single big-blind ante. ZERO when there is none. */
  readonly ante: Amount;
  readonly anteType: AnteType;
}

/**
 * Big blinds are always derived, never stored — the BB changes between levels and
 * a stored BB figure silently goes stale.
 */
export function toBB(a: Amount, ctx: MoneyContext): number {
  if (ctx.bigBlind === 0) return 0;
  return a / ctx.bigBlind;
}
