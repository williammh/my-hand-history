import type { Amount } from '@/domain/money';
import type { Board, HoleCards } from '@/domain/cards';
import type { Position, Street } from '@/domain/position';
import type { Action, ActionKind } from '@/domain/action';

export type Severity = 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

/** Preflop scenario, which selects which chart applies. */
export type PreflopScenario = 'rfi' | 'vs-raise' | 'vs-3bet' | 'blind-vs-blind';

/** One spot where a player had a voluntary decision to make. */
export interface DecisionPoint {
  /** Index into Hand.actions — the action being judged. */
  readonly actionIndex: number;
  /** Seat of the player being judged — hero or a villain. */
  readonly seat: number;
  readonly street: Street;
  readonly position: Position;
  readonly heroCards: HoleCards | null;
  readonly board: Board;
  /** Pot before hero acts. */
  readonly potBefore: Amount;
  /** Chips hero must add to continue. Zero when hero can check. */
  readonly toCall: Amount;
  /** Effective stack versus the smallest live opponent, in BB. */
  readonly effectiveStackBB: number;
  /** Hero's own stack in BB, before this hand's chips went in. */
  readonly startingStackBB: number;
  readonly playersInHand: number;
  readonly facingRaise: boolean;
  /** Preflop only; null postflop. */
  readonly scenario: PreflopScenario | null;
  /** Whether anyone had voluntarily put chips in before hero acted. */
  readonly potIsUnopened: boolean;
  /**
   * Position of the player who last bet or raised on this street, if any.
   * Drives the assumed villain range: an UTG raiser and a BTN raiser hold very
   * different hands, and judging a call against the wrong one is worse than not
   * judging it at all.
   */
  readonly aggressorPosition: Position | null;
  /** Number of bets/raises on this street before hero acted. */
  readonly raisesBefore: number;
  /**
   * Position of the player who took the betting lead preflop, if any.
   * Postflop streets often open with a check, which erases the street-local
   * aggressor — but villain's range is still anchored to how they entered the
   * pot, so that context has to survive the street boundary.
   */
  readonly preflopAggressorPosition: Position | null;
  /** Number of preflop bets/raises by anyone, hero included. */
  readonly preflopRaiseCount: number;
  /** Hero's stack before acting, in BB. */
  readonly heroStackBB: number;
}

export type SuggestedKind = Extract<ActionKind, 'fold' | 'check' | 'call' | 'bet' | 'raise'>;

export interface SuggestedAction {
  readonly kind: SuggestedKind;
  /** Sizing as a fraction of pot; null for fold/check/call. */
  readonly sizingPotFraction: number | null;
  /** GTO frequency, 0..1. Heuristics emit only 0 or 1. */
  readonly frequency: number;
  /** EV relative to the best action, in BB. Zero for the best action. */
  readonly evLossBB: number | null;
  /** True when this represents an all-in shove. */
  readonly isAllIn?: boolean;
}

export interface DecisionVerdict {
  readonly actionIndex: number;
  readonly severity: Severity;
  readonly actualAction: Action;
  readonly recommended: readonly SuggestedAction[];
  readonly evLossBB: number | null;
  readonly explanation: string;
  /** Machine-readable, for filtering and leak aggregation. */
  readonly code: string;
  /**
   * How much to trust this. Chart lookups are 'high'; pot-odds heuristics are
   * 'low' and the UI must say so, otherwise a later solver reads as a
   * contradiction rather than an upgrade.
   */
  readonly confidence: 'low' | 'medium' | 'high';
}

export interface SkippedDecision {
  readonly actionIndex: number;
  readonly reason: string;
}

export interface HandAnalysis {
  readonly handId: string;
  readonly engineId: string;
  readonly engineVersion: string;
  readonly verdicts: readonly DecisionVerdict[];
  readonly totalEvLossBB: number | null;
  /** Decisions the engine declined to judge, with a visible reason. */
  readonly skipped: readonly SkippedDecision[];
}
