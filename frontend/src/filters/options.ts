import type { Position, Street } from '@/domain/position.js';
import type { Severity } from '@/analysis/types.js';
import type { Connectedness, SuitTexture } from './board.js';
import type {
  LineToken, PotType, PreflopAggression, RelativePosition, StackBucket,
} from './types.js';

export interface Option<T> {
  readonly value: T;
  readonly label: string;
  /** Shown on hover — room for the definition a two-word label cannot carry. */
  readonly hint?: string;
}

export const POT_TYPES: readonly Option<PotType>[] = [
  { value: 'preflop', label: 'Preflop', hint: 'Folded through — no voluntary money in' },
  { value: 'limp', label: 'Limp', hint: 'Never raised preflop' },
  { value: 'srp', label: 'SRP', hint: 'Single raised pot' },
  { value: 'iso', label: 'Iso', hint: 'Raise over one or more limpers' },
  { value: '3bet', label: '3Bet' },
  { value: '4bet', label: '4Bet' },
  { value: '5bet', label: '5Bet' },
  { value: 'squeeze', label: 'Squeeze', hint: '3bet over a raise and at least one caller' },
];

export const RELATIVE_POSITIONS: readonly Option<RelativePosition>[] = [
  { value: 'ip', label: 'IP', hint: 'Hero acts after the preflop aggressor' },
  { value: 'oop', label: 'OOP', hint: 'Hero acts before the preflop aggressor' },
];

/** Blinds first, matching how the screenshots order the position lists. */
export const POSITIONS: readonly Option<Position>[] = [
  { value: 'SB', label: 'SB' },
  { value: 'BB', label: 'BB' },
  { value: 'UTG', label: 'UTG' },
  { value: 'UTG1', label: 'UTG+1' },
  { value: 'UTG2', label: 'UTG+2' },
  { value: 'UTG3', label: 'UTG+3' },
  { value: 'LJ', label: 'LJ' },
  { value: 'HJ', label: 'HJ' },
  { value: 'CO', label: 'CO' },
  { value: 'BTN', label: 'BTN' },
];

export const STACKS: readonly Option<StackBucket>[] = [
  { value: 20, label: '20' },
  { value: 40, label: '40' },
  { value: 50, label: '50' },
  { value: 75, label: '75' },
  { value: 100, label: '100' },
  { value: 150, label: '150' },
  { value: 200, label: '200' },
];

export const PREFLOP_AGGRESSION: readonly Option<PreflopAggression>[] = [
  { value: 'raiser', label: 'Raiser' },
  { value: 'caller', label: 'Caller' },
];

export const STREETS: readonly Option<Street>[] = [
  { value: 'preflop', label: 'Preflop' },
  { value: 'flop', label: 'Flop' },
  { value: 'turn', label: 'Turn' },
  { value: 'river', label: 'River' },
];

export const SEVERITIES: readonly Option<Severity>[] = [
  { value: 'ok', label: 'Correct' },
  { value: 'inaccuracy', label: 'Inaccuracy' },
  { value: 'mistake', label: 'Mistake' },
  { value: 'blunder', label: 'Blunder' },
];

/**
 * Lines offered per street. Preflop has no betting lead to check into, so it
 * drops the check-family tokens the postflop streets carry.
 */
const POSTFLOP_LINES: readonly Option<LineToken>[] = [
  { value: 'bet', label: 'Bet' },
  { value: 'bet-fold', label: 'Bet Fold' },
  { value: 'bet-call', label: 'Bet Call' },
  { value: 'bet-raise', label: 'Bet Raise' },
  { value: 'check', label: 'Check' },
  { value: 'check-fold', label: 'Check Fold' },
  { value: 'check-call', label: 'Check Call' },
  { value: 'check-raise', label: 'Check Raise' },
  { value: 'raise', label: 'Raise' },
  { value: 'raise-fold', label: 'Raise Fold' },
  { value: 'raise-call', label: 'Raise Call' },
  { value: 'call', label: 'Call' },
  { value: 'fold', label: 'Fold' },
];

const PREFLOP_LINES: readonly Option<LineToken>[] = [
  { value: 'raise', label: 'Raise' },
  { value: 'raise-fold', label: 'Raise Fold' },
  { value: 'raise-call', label: 'Raise Call' },
  { value: 'raise-raise', label: 'Raise Raise' },
  { value: 'call', label: 'Call' },
  { value: 'call-fold', label: 'Call Fold' },
  { value: 'call-call', label: 'Call Call' },
  { value: 'call-raise', label: 'Call Raise' },
  { value: 'fold', label: 'Fold' },
];

export function linesFor(street: Street): readonly Option<LineToken>[] {
  return street === 'preflop' ? PREFLOP_LINES : POSTFLOP_LINES;
}

export const CONNECTEDNESS: readonly Option<Connectedness>[] = [
  { value: 'connected', label: '3 card connected', hint: 'Three ranks in a row: AKQ, JT9' },
  { value: 'one-gap', label: 'One gap', hint: 'AKJ, JT8' },
  { value: 'two-gap', label: 'Two gap', hint: 'AKT, J97' },
  { value: 'disconnected', label: 'Disconnected', hint: 'Wider than two gaps' },
  { value: 'paired', label: 'Paired', hint: 'Two or three of a kind on the flop' },
];

export const SUIT_TEXTURES: readonly Option<SuitTexture>[] = [
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'two-tone', label: 'Two tone' },
  { value: 'monotone', label: 'Monotone' },
];
