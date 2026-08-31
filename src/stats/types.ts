import type { SiteId } from '@/domain/hand';
import type { Street } from '@/domain/position';
import type { Amount, CurrencyCode, MoneyContext } from '@/domain/money';

/**
 * `${siteId}:${playerId}` — identity is per room, since the same username on
 * two different rooms is almost certainly two different people.
 */
export type PlayerKey = string & { __brand: 'PlayerKey' };

export function playerKey(siteId: SiteId, playerId: string): PlayerKey {
  return `${siteId}:${playerId}` as PlayerKey;
}

/** A stat as hits over the spots that offered it, so the UI can show 12/38 next to 32%. */
export interface Counter {
  readonly hits: number;
  readonly opportunities: number;
}

export const EMPTY_COUNTER: Counter = { hits: 0, opportunities: 0 };

export function addCounter(a: Counter, b: Counter): Counter {
  return { hits: a.hits + b.hits, opportunities: a.opportunities + b.opportunities };
}

/** Null when there is no sample to divide. */
export function pct(c: Counter): number | null {
  return c.opportunities === 0 ? null : (c.hits / c.opportunities) * 100;
}

export interface StreetAggression {
  readonly betsRaises: number;
  readonly calls: number;
}

export const EMPTY_AGGRESSION: StreetAggression = { betsRaises: 0, calls: 0 };

export function addAggression(a: StreetAggression, b: StreetAggression): StreetAggression {
  return { betsRaises: a.betsRaises + b.betsRaises, calls: a.calls + b.calls };
}

/**
 * Bets+raises over calls. Null with no postflop action at all (nothing to
 * judge); Infinity when there is aggression but never a call to divide by —
 * the UI renders that as "∞", not as a crash.
 */
export function aggressionFactor(a: StreetAggression): number | null {
  if (a.betsRaises === 0 && a.calls === 0) return null;
  if (a.calls === 0) return Infinity;
  return a.betsRaises / a.calls;
}

export type PostflopStreet = Extract<Street, 'flop' | 'turn' | 'river'>;
export const POSTFLOP_STREETS: readonly PostflopStreet[] = ['flop', 'turn', 'river'];

/**
 * Wins, losses, and ties, summed across hands. A "win" is a strictly positive
 * net result for the hand, a "loss" strictly negative, and a "tie" exactly
 * zero — which covers both a chopped pot and a hand where nothing was ever
 * put in (e.g. everyone else folded preflop before this seat acted).
 */
export interface WinLoss {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

export const EMPTY_WIN_LOSS: WinLoss = { wins: 0, losses: 0, ties: 0 };

export function addWinLoss(a: WinLoss, b: WinLoss): WinLoss {
  return { wins: a.wins + b.wins, losses: a.losses + b.losses, ties: a.ties + b.ties };
}

/**
 * One seat's raw counts for one hand — booleans and small tallies only, no
 * percentages. Aggregated across hands by `aggregatePlayers`.
 */
export interface PlayerHandFacts {
  readonly key: PlayerKey;
  readonly name: string;
  readonly siteId: SiteId;
  readonly isHero: boolean;

  readonly vpip: Counter;
  readonly pfr: Counter;
  readonly threeBet: Counter;
  readonly foldToThreeBet: Counter;
  readonly steal: Counter;
  readonly foldToSteal: Counter;
  readonly flopCbet: Counter;
  readonly foldToFlopCbet: Counter;
  readonly wtsd: Counter;
  readonly wsd: Counter;
  readonly aggression: StreetAggression;
  readonly byStreet: Readonly<Record<PostflopStreet, StreetAggression>>;

  /** This hand's net result in big blinds — positive, negative, or zero. */
  readonly netBB: number;
  readonly winLoss: WinLoss;
  /** This hand's net result in its own minor unit (chips or cents) — see PlayerStats.chips. */
  readonly netAmount: Amount;
  readonly money: MoneyContext;
}

/**
 * A chip/cash total across hands, valid only when every hand contributing to
 * it shared the same currency. Tournament chips have no fixed value and cash
 * games can be in different currencies, so summing raw amounts across hands
 * that don't agree on `currency` would silently add unrelated units together
 * — `null` is how the aggregator says "don't render this as a chip number".
 */
export interface ChipTotals {
  readonly currency: CurrencyCode;
  readonly exponent: 0 | 2;
  readonly net: Amount;
  readonly sumWin: Amount;
  readonly sumLoss: Amount;
}

export interface PlayerStats {
  readonly key: PlayerKey;
  readonly name: string;
  readonly siteId: SiteId;
  readonly isHero: boolean;
  /** Hands dealt in, within the filtered set. */
  readonly hands: number;

  readonly vpip: Counter;
  readonly pfr: Counter;
  readonly threeBet: Counter;
  readonly foldToThreeBet: Counter;
  readonly steal: Counter;
  readonly foldToSteal: Counter;
  readonly flopCbet: Counter;
  readonly foldToFlopCbet: Counter;
  readonly wtsd: Counter;
  readonly wsd: Counter;
  readonly aggression: StreetAggression;
  readonly byStreet: Readonly<Record<PostflopStreet, StreetAggression>>;

  /** Total net result across the sample, in big blinds. */
  readonly netBB: number;
  readonly winLoss: WinLoss;
  /** Sum of netBB over winning hands only — the numerator for average win size. */
  readonly sumWinBB: number;
  /** Sum of netBB over losing hands only (negative) — the numerator for average loss size. */
  readonly sumLossBB: number;
  /** Chip/cash totals, or null once the sample mixes more than one currency. */
  readonly chips: ChipTotals | null;
}

/** Average BB won on winning hands. Null with no wins to average. */
export function averageWinBB(stats: Pick<PlayerStats, 'winLoss' | 'sumWinBB'>): number | null {
  return stats.winLoss.wins === 0 ? null : stats.sumWinBB / stats.winLoss.wins;
}

/** Average BB lost on losing hands, reported as a negative number. Null with no losses. */
export function averageLossBB(stats: Pick<PlayerStats, 'winLoss' | 'sumLossBB'>): number | null {
  return stats.winLoss.losses === 0 ? null : stats.sumLossBB / stats.winLoss.losses;
}

/** Average chip/cash amount won on winning hands. Null with no wins or a mixed-currency sample. */
export function averageWinAmount(stats: Pick<PlayerStats, 'winLoss' | 'chips'>): number | null {
  if (!stats.chips || stats.winLoss.wins === 0) return null;
  return stats.chips.sumWin / stats.winLoss.wins;
}

/** Average chip/cash amount lost on losing hands, as a negative number. Null likewise. */
export function averageLossAmount(stats: Pick<PlayerStats, 'winLoss' | 'chips'>): number | null {
  if (!stats.chips || stats.winLoss.losses === 0) return null;
  return stats.chips.sumLoss / stats.winLoss.losses;
}
