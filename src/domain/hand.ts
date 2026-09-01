import type { Amount, MoneyContext } from './money';
import type { Board, HoleCards } from './cards';
import type { Position, Street } from './position';
import type { Action } from './action';
import type { PotState, PotAward } from './pot';

/**
 * `pokerstars-like` is the fallback identity for a room that emits the
 * PokerStars text format under its own brand name. Those hands are still
 * parsed, but they are kept under their own id rather than being filed as
 * PokerStars: player identity is scoped per room (`stats/types.ts`), so
 * pooling an unrecognized room into PokerStars would silently merge two
 * different people who happen to share a screen name.
 */
export type SiteId =
  | 'betclic-fr'
  | 'pokerstars'
  | 'ggpoker'
  | 'winamax'
  | '888poker'
  | 'coinpoker'
  | 'wpt-global'
  | 'pokerstars-like';
export type GameMode = 'tournament' | 'cash' | 'sit-n-go';
export type GameVariant = 'nlhe' | 'plo' | 'plo5' | 'limit-holdem' | 'unknown';
export type ParseSeverity = 'warning' | 'error';

export interface ParseWarning {
  readonly code: string;
  readonly message: string;
  readonly lineNumber: number | null;
  readonly rawLine: string | null;
  readonly severity: ParseSeverity;
}

export interface PlayerSeat {
  readonly seat: number;
  /** Display name as written in the file, after encoding repair. */
  readonly name: string;
  /** Stable cross-hand identity. Lowercased name until a site gives real IDs. */
  readonly playerId: string;
  /** Stack BEFORE antes and blinds are posted. */
  readonly startingStack: Amount;
  /** Resolved by derivePositions — not read verbatim from the file. */
  readonly position: Position;
  /** What the site literally printed in brackets, kept as an audit trail. */
  readonly declaredPosition: Position | null;
  readonly isButton: boolean;
  readonly isHero: boolean;
  /** Hero's always (when present); villains' only at showdown. */
  readonly holeCards: HoleCards | null;
  readonly sittingOut: boolean;
}

export interface StreetState {
  readonly street: Street;
  /** Cards revealed at the START of this street. Empty preflop. */
  readonly newCards: Board;
  /** Cumulative board visible during this street. */
  readonly board: Board;
  /** Slice of Hand.actions — the SAME objects, so identity comparison works. */
  readonly actions: readonly Action[];
  readonly potAtStart: Amount;
  readonly potAtEnd: Amount;
}

export interface Showdown {
  readonly seat: number;
  readonly holeCards: HoleCards | null;
  readonly mucked: boolean;
  readonly handDescription: string | null;
}

export interface TournamentInfo {
  readonly tournamentId: string | null;
  readonly name: string | null;
  readonly buyIn: Amount | null;
  readonly fee: Amount | null;
  readonly buyInCurrency: string | null;
  readonly level: number | null;
}

export interface HandMeta {
  readonly handId: string;
  readonly siteId: SiteId;
  readonly tableId: string | null;
  readonly tableName: string | null;
  /** ISO 8601. */
  readonly playedAt: string;
  readonly timezoneNote: string | null;
  readonly maxSeats: number | null;
  readonly gameMode: GameMode;
  readonly variant: GameVariant;
  readonly tournament: TournamentInfo | null;
  readonly rake: Amount;
  /**
   * Name of the file this hand was imported from, or null when it was parsed
   * without one. Lives on the hand rather than only in the storage summary
   * because the library is now a merge of several files, and "which file did
   * this come from" is a filter axis that has to survive a page reload.
   */
  readonly sourceFile: string | null;
}

export interface Hand {
  /** `${siteId}:${handId}` — dedupes re-uploaded files. */
  readonly id: string;
  readonly meta: HandMeta;
  readonly money: MoneyContext;
  readonly seats: readonly PlayerSeat[];
  readonly heroSeat: number | null;
  readonly buttonSeat: number;
  readonly streets: readonly StreetState[];
  /** Flat, ordered, authoritative. StreetState.actions are slices of this. */
  readonly actions: readonly Action[];
  readonly finalBoard: Board;
  readonly showdown: readonly Showdown[];
  readonly pots: PotState;
  readonly awards: readonly PotAward[];
  /** What the site reported, for checksum comparison. */
  readonly reportedTotalPot: Amount | null;
  readonly warnings: readonly ParseWarning[];
  /** Verbatim source, for the "show raw" affordance. */
  readonly source: string;
}

export function seatOf(hand: Hand, seat: number): PlayerSeat | undefined {
  return hand.seats.find((s) => s.seat === seat);
}

export function hero(hand: Hand): PlayerSeat | undefined {
  return hand.heroSeat === null ? undefined : seatOf(hand, hand.heroSeat);
}
