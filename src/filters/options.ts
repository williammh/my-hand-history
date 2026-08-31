import type { Position, Street } from '@/domain/position';
import type { GameMode, SiteId } from '@/domain/hand';
import type { Severity } from '@/analysis/types';
import { type PlayerKey, playerKey } from '@/stats/types';
import type { Connectedness, SuitTexture } from './board';
import type {
  LineToken, PotType, PreflopAggression, RelativePosition, StackBucket,
} from './types';

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

/**
 * Source options are derived from the library, not declared here.
 *
 * Every other axis has a closed vocabulary known at build time; rooms present
 * and file names imported are only knowable at runtime, so these are computed
 * from the hands themselves. Counts ride along because a file name alone does
 * not say whether picking it leaves you with 4 hands or 400.
 */
export interface SourceOption<T extends string> extends Option<T> {
  readonly count: number;
}

/**
 * Every supported room, labelled by the parser registry, most hands first.
 *
 * Unlike source files, rooms are a closed vocabulary known at build time — the
 * registry's own list — so every supported room is always offered, even one
 * with zero hands loaded yet: a player choosing which room to filter to should
 * not need hands from that room already sitting in the library to see it as
 * an option.
 */
export function siteOptions(
  hands: readonly { meta: { siteId: SiteId } }[],
  displayNames: ReadonlyMap<SiteId, string>,
): readonly SourceOption<SiteId>[] {
  const counts = new Map<SiteId, number>();
  for (const h of hands) counts.set(h.meta.siteId, (counts.get(h.meta.siteId) ?? 0) + 1);

  // Every registered room first, even at zero hands, plus any room a hand
  // carries that the registry no longer names (e.g. a parser that was
  // retired after hands from it were already imported).
  const rooms = new Set<SiteId>([...displayNames.keys(), ...counts.keys()]);

  return [...rooms]
    .map((value) => ({ value, label: displayNames.get(value) ?? value, count: counts.get(value) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Every supported game mode, in play-frequency order (cash first), with
 * counts from the loaded library.
 *
 * Closed vocabulary like `siteOptions` — all three modes are always offered,
 * even at zero hands, so the axis is not empty on a fresh load.
 */
export const GAME_MODE_LABELS: Readonly<Record<GameMode, string>> = {
  cash: 'Cash',
  tournament: 'Tournament',
  'sit-n-go': 'Sit & Go',
};

export function gameModeOptions(
  hands: readonly { meta: { gameMode: GameMode } }[],
): readonly SourceOption<GameMode>[] {
  const counts = new Map<GameMode, number>();
  for (const h of hands) counts.set(h.meta.gameMode, (counts.get(h.meta.gameMode) ?? 0) + 1);

  return (Object.keys(GAME_MODE_LABELS) as GameMode[])
    .map((value) => ({ value, label: GAME_MODE_LABELS[value], count: counts.get(value) ?? 0 }));
}

/**
 * File names present in the library.
 *
 * Sorted by name rather than by count: exports are usually named with a date,
 * so alphabetical puts a player's sessions in chronological order — which is
 * how they think about them. Hands with no file name are left out entirely,
 * since there is no name to offer as a choice.
 */
export function sourceFileOptions(
  hands: readonly { meta: { sourceFile: string | null } }[],
): readonly SourceOption<string>[] {
  const counts = new Map<string, number>();
  for (const h of hands) {
    const f = h.meta.sourceFile;
    if (f !== null) counts.set(f, (counts.get(f) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface PlayerOption extends SourceOption<PlayerKey> {
  readonly siteId: SiteId;
  readonly name: string;
}

/**
 * Usernames present in the library, keyed per room (see PlayerKey). Sorted by
 * count desc then name, matching `siteOptions`' "most hands first" ordering —
 * the players you actually have a sample on should be easy to find.
 *
 * The label is just the username, UNLESS the same username exists on more
 * than one room, in which case it would be ambiguous in the dropdown — those
 * get `name (Room)` instead. The hint always carries the room, so hovering
 * any option confirms which room it came from.
 */
export function playerOptions(
  hands: readonly { meta: { siteId: SiteId }; seats: readonly { playerId: string; name: string; sittingOut: boolean }[] }[],
  displayNames: ReadonlyMap<SiteId, string>,
): readonly PlayerOption[] {
  const counts = new Map<PlayerKey, { siteId: SiteId; name: string; count: number }>();
  for (const h of hands) {
    for (const s of h.seats) {
      if (s.sittingOut) continue;
      const key = playerKey(h.meta.siteId, s.playerId);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { siteId: h.meta.siteId, name: s.name, count: 1 });
    }
  }

  const namesSeen = new Map<string, Set<SiteId>>();
  for (const { siteId, name } of counts.values()) {
    const set = namesSeen.get(name) ?? new Set<SiteId>();
    set.add(siteId);
    namesSeen.set(name, set);
  }

  return [...counts.entries()]
    .map(([value, { siteId, name, count }]) => {
      const ambiguous = (namesSeen.get(name)?.size ?? 0) > 1;
      const room = displayNames.get(siteId) ?? siteId;
      return {
        value,
        label: ambiguous ? `${name} (${room})` : name,
        hint: room,
        count,
        siteId,
        name,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
