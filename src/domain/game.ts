import type { Hand } from './hand';

/**
 * Identity of the game a hand was played in: one tournament, or one cash table.
 *
 * This is what lets a multi-tabler follow a single table out of a history file
 * that interleaves several — the key ignores the source file on purpose, so
 * the same game stays one game across files and re-imports.
 *
 * A tournament is keyed by its id (a table inside it changes as tables break,
 * so the table would split one event into several "games"). Rooms that print no
 * tournament id fall back to the event name, then the table name. A cash game
 * is keyed by its table. Scoped per room because ids and table names are only
 * unique within one. Null when the file carries nothing to tell games apart.
 */
export function gameKey(hand: Pick<Hand, 'meta'>): string | null {
  const { meta } = hand;
  if (meta.gameMode === 'cash') {
    const table = meta.tableName ?? meta.tableId;
    return table === null ? null : `${meta.siteId}|cash|${table}`;
  }
  const t = meta.tournament;
  const id = t?.tournamentId ?? null;
  if (id !== null) return `${meta.siteId}|tournament|${id}`;
  const fallback = t?.name ?? meta.tableName ?? meta.tableId;
  return fallback === null ? null : `${meta.siteId}|tournament|name:${fallback}`;
}

/** Human label for a game: the tournament (with its id) or the table name. */
export function gameLabel(hand: Pick<Hand, 'meta'>): string {
  const { meta } = hand;
  if (meta.gameMode === 'cash') return meta.tableName ?? meta.tableId ?? 'Unnamed table';
  const t = meta.tournament;
  const name = t?.name ?? meta.tableName ?? null;
  const id = t?.tournamentId ?? null;
  if (name !== null && id !== null) return `${name} #${id}`;
  if (id !== null) return `Tournament #${id}`;
  return name ?? 'Unnamed tournament';
}
