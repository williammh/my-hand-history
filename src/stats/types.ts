import type { SiteId } from '@/domain/hand';
import type { Street } from '@/domain/position';

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
}
