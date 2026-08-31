import type { Amount } from './money';
import type { Street } from './position';

export type ActionKind =
  | 'post-ante'
  | 'post-sb'
  | 'post-bb'
  | 'post-dead'
  | 'straddle'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'muck'
  | 'show'
  | 'uncalled-return';

/** Kinds that move chips from a stack into the pot. */
export const CHIP_MOVING: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'post-ante', 'post-sb', 'post-bb', 'post-dead', 'straddle', 'call', 'bet', 'raise',
]);

/** Blind/ante posts are forced — they are not voluntary decisions to judge. */
export const FORCED: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'post-ante', 'post-sb', 'post-bb', 'post-dead',
]);

export const isVoluntary = (k: ActionKind): boolean =>
  !FORCED.has(k) && k !== 'muck' && k !== 'show' && k !== 'uncalled-return';

export interface Action {
  /** Monotonic across the whole hand, not per street. The replay scrub index. */
  readonly index: number;
  readonly street: Street;
  readonly seat: number;
  readonly playerId: string;
  readonly kind: ActionKind;

  /**
   * Chips this action moves into the pot — always a DELTA. Zero for fold/check.
   * This is the only field pot math may use.
   *
   * Rooms are inconsistent here: Betclic writes "Calls 8000" as a delta but
   * "Raises to 16000" as an absolute street total. Parsers reconcile both into
   * this field via CommitmentLedger.
   */
  readonly amount: Amount;

  /**
   * The player's total commitment ON THIS STREET after the action. Equals the
   * site's "Raises to N". Drives facing-bet and raise-size logic.
   */
  readonly totalCommitted: Amount;

  readonly isAllIn: boolean;
  readonly timestamp: string | null;
  /** Verbatim source line — makes misparse reports precise. */
  readonly raw: string;
}
