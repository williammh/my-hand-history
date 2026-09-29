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

/**
 * How an action reads in the UI. Two registers, because the two surfaces have
 * very different room: the action log has a full row, while the seat badge on
 * the felt sits in a fixed-height row where a wrapped label would grow the
 * seat card and, with it, the whole replay panel.
 */
const ACTION_LABELS: Record<ActionKind, { readonly long: string; readonly short: string }> = {
  'post-ante': { long: 'ante', short: 'ante' },
  'post-sb': { long: 'small blind', short: 'sb' },
  'post-bb': { long: 'big blind', short: 'bb' },
  'post-dead': { long: 'dead blind', short: 'dead' },
  straddle: { long: 'straddle', short: 'straddle' },
  fold: { long: 'fold', short: 'fold' },
  check: { long: 'check', short: 'check' },
  call: { long: 'call', short: 'call' },
  bet: { long: 'bet', short: 'bet' },
  raise: { long: 'raise', short: 'raise' },
  muck: { long: 'muck', short: 'muck' },
  show: { long: 'show', short: 'show' },
  // Every site prints this as an "uncalled bet" returned to the bettor, so
  // that is the phrase players expect. The badge on the felt has room for
  // only one word.
  'uncalled-return': { long: 'uncalled bet', short: 'uncalled' },
};

export const actionLabel = (k: ActionKind): string => ACTION_LABELS[k]?.long ?? k;
export const shortActionLabel = (k: ActionKind): string => ACTION_LABELS[k]?.short ?? k;

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
