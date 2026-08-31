import type { Position, Street } from '@/domain/position';
import type { SiteId } from '@/domain/hand';
import type { Severity } from '@/analysis/types';
import type { Rank } from '@/domain/cards';
import type { BoardTexture, Connectedness, SuitTexture } from './board';

/**
 * How hero entered the pot preflop. This is the "Pot Type" axis of the filter:
 * it names the shape of the preflop betting, not who won.
 *
 * `limp` and `srp` split on whether the pot was ever raised, because a limped
 * pot plays nothing like a single-raised one. `iso` is a raise over one or more
 * limpers, and `squeeze` a 3bet over a raise plus at least one caller — both
 * are 3bet-family sizes with different ranges, so collapsing them into `3bet`
 * would hide the distinction the filter exists to make.
 */
export type PotType = 'preflop' | 'limp' | 'srp' | 'iso' | '3bet' | '4bet' | '5bet' | 'squeeze';

/** Hero's position relative to the last preflop aggressor they faced. */
export type RelativePosition = 'ip' | 'oop';

/** Whether hero drove the preflop betting or came along. */
export type PreflopAggression = 'raiser' | 'caller';

/**
 * Hero's line on a street, as a compact token: the sequence of hero's own
 * voluntary actions on that street, joined.
 *
 * Two actions is the cap the UI exposes ("bet call", "check raise"); a longer
 * street collapses to its first two, since a third hero action on one street is
 * rare enough that giving it its own filter token would fragment the list more
 * than it would help.
 */
export type LineToken =
  | 'raise' | 'raise-fold' | 'raise-call' | 'raise-raise'
  | 'bet' | 'bet-fold' | 'bet-call' | 'bet-raise'
  | 'check' | 'check-fold' | 'check-call' | 'check-raise'
  | 'call' | 'call-fold' | 'call-call' | 'call-raise'
  | 'fold';

/** Effective-stack buckets, in big blinds, matching the screenshot's ladder. */
export type StackBucket = 20 | 40 | 50 | 75 | 100 | 150 | 200;

/**
 * Per-hand facts the filters match against, derived once per hand.
 *
 * Precomputed rather than recomputed per predicate because filtering runs over
 * the whole library on every keystroke of a filter change, and the derivations
 * (stack rebuilds, street slicing) are the expensive part.
 */
export interface HandFacts {
  readonly handId: string;
  readonly siteId: SiteId;
  /** File this hand was imported from; null when it was parsed without one. */
  readonly sourceFile: string | null;
  readonly potType: PotType;
  readonly heroPosition: Position | null;
  /** Positions of every opponent who voluntarily put money in preflop. */
  readonly opponentPositions: readonly Position[];
  readonly relativePosition: RelativePosition | null;
  readonly preflopAggression: PreflopAggression | null;
  /** Effective stack in BB at the start of the hand, rounded to the ladder. */
  readonly effectiveStackBB: number | null;
  /** Streets on which hero had at least one voluntary action. */
  readonly streetsPlayed: ReadonlySet<Street>;
  readonly sawFlop: boolean;
  /** Hero's line per street, absent when hero never acted there. */
  readonly lineByStreet: Readonly<Partial<Record<Street, LineToken>>>;
  /** Hero-only IP/OOP per postflop street, versus the last live aggressor. */
  readonly relativeByStreet: Readonly<Partial<Record<Street, RelativePosition>>>;
  /** Worst verdict severity the engine gave hero on each street. */
  readonly severityByStreet: Readonly<Partial<Record<Street, Severity>>>;
  /** Flop texture, or null when the hand never reached a flop. */
  readonly board: BoardTexture | null;
}

/**
 * The active filter selection.
 *
 * Every axis is a set of accepted values, and an EMPTY set means "no constraint"
 * rather than "match nothing" — that is what makes a freshly-opened panel show
 * the whole library, and it lets each axis be reasoned about independently.
 * Within an axis values are OR'd; across axes they are AND'ed.
 */
export interface FilterCriteria {
  /** Poker rooms to keep. Empty means every room in the library. */
  readonly sites: ReadonlySet<SiteId>;
  /**
   * Source files to keep, matched on the file name a hand was imported from.
   *
   * Unlike every other axis, the values here are not a fixed vocabulary — they
   * are whatever the library happens to hold, so a selection can outlive the
   * hands that justified it (clear the library, re-import different files). The
   * panel prunes stale names against the files actually present; matching stays
   * a plain set membership test so a stale name simply matches nothing.
   */
  readonly sourceFiles: ReadonlySet<string>;
  readonly potTypes: ReadonlySet<PotType>;
  readonly relativePositions: ReadonlySet<RelativePosition>;
  readonly heroPositions: ReadonlySet<Position>;
  readonly opponentPositions: ReadonlySet<Position>;
  readonly stacks: ReadonlySet<StackBucket>;
  readonly preflopAggression: ReadonlySet<PreflopAggression>;
  /** Street whose line/severity filters below apply. */
  readonly street: Street;
  readonly heroStreetPosition: RelativePosition | 'any';
  readonly severities: ReadonlySet<Severity>;
  readonly lines: ReadonlySet<LineToken>;
  /** When true, keep only hands hero saw a flop in. */
  readonly sawFlopOnly: boolean;

  /**
   * Flop texture. `highestRank`/`lowestRank` are BOUNDS, not exact matches:
   * "connected, highest A, lowest 8" selects AKQ, KQJ, QJT, JT9 and T98 —
   * every run whose top card is at most A and whose bottom card is at least 8.
   */
  readonly connectedness: ReadonlySet<Connectedness>;
  readonly suitTextures: ReadonlySet<SuitTexture>;
  readonly highestRank: Rank | null;
  readonly lowestRank: Rank | null;
}

export const EMPTY_CRITERIA: FilterCriteria = {
  sites: new Set(),
  sourceFiles: new Set(),
  potTypes: new Set(),
  relativePositions: new Set(),
  heroPositions: new Set(),
  opponentPositions: new Set(),
  stacks: new Set(),
  preflopAggression: new Set(),
  street: 'preflop',
  heroStreetPosition: 'any',
  severities: new Set(),
  lines: new Set(),
  sawFlopOnly: false,
  connectedness: new Set(),
  suitTextures: new Set(),
  highestRank: null,
  lowestRank: null,
};
