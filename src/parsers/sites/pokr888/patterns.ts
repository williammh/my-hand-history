/**
 * Every 888poker / PacificPoker regex lives here and nowhere else.
 *
 * The format is materially different from the PokerStars family: player names
 * carry no trailing colon, amounts sit in square brackets, streets are
 * announced by "** Dealing X **" rather than "*** X ***", and board cards are
 * comma-separated inside a spaced bracket.
 */
export const P888 = {
  /**
   * Each hand opens with "#Game No : 778482528". That line, not the banner
   * below it, is the reliable separator: the banner repeats the same id but is
   * absent from some exports.
   */
  HAND_SEPARATOR: /\n(?=#Game No\s*:)/,

  GAME_NO: /^#Game No\s*:\s*(\d+)\s*$/m,

  /** "***** 888poker Hand History for Game 778482528 *****" */
  BANNER: /^\*+\s*(.+?)\s+Hand History for Game\s+(\d+)\s*\*+\s*$/m,

  /**
   * "25/50 Blinds No Limit Holdem - *** 02 08 2026 09:01:09"
   * "$0.50/$1.00 Blinds No Limit Holdem - *** 31 08 2026 14:22:10"
   * Blinds are chips in tournaments and currency in cash games, which is the
   * only reliable in-file signal of the game mode before the table line.
   */
  STAKES_LINE:
    /^(?:([^\d\s]{1,3})\s*)?([\d,.]+)\s*\/\s*(?:[^\d\s]{1,3})?\s*([\d,.]+)\s+Blinds\s+(.+?)\s*-\s*\*+\s*(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*$/m,

  /** "Tournament #293965397 $5 + $1 - Table #1 8 Max (Real Money)" */
  TOURNAMENT_LINE:
    /^Tournament\s+#(\S+)\s+(.*?)\s*-\s*Table\s+#?(\S+?)\s+(?:(\d+)\s*Max\s*)?(?:\(([^)]*)\))?\s*$/m,

  /** "Table Aludra 6 Max (Real Money)" — the cash-game table line. */
  TABLE_LINE:
    /^Table\s+(.+?)\s+(?:(\d+)\s*Max\s*)?(?:\(([^)]*)\))?\s*$/m,

  /** "$5 + $1" / "$5 + $0.50 + $0.45" (bounty) / "Freeroll" */
  BUYIN: /^(?:[^\d\s]{0,3})\s*([\d,.]+)(?:\s*\+\s*(?:[^\d\s]{0,3})\s*([\d,.]+))?(?:\s*\+\s*(?:[^\d\s]{0,3})\s*([\d,.]+))?\s*$/,

  /** "Seat 8 is the button" */
  BUTTON: /^Seat\s+(\d+)\s+is the button\s*$/m,

  /** "Total number of players : 8" */
  PLAYER_COUNT: /^Total number of players\s*:\s*(\d+)\s*$/m,

  /** "Seat 1: xinfinity88 ( 5000 )" / "Seat 4: Hero ( $100 )" */
  SEAT: /^Seat\s+(\d+):\s+(.+?)\s+\(\s*(?:[^\d\s]{0,3})\s*([\d,.]+)\s*\)\s*$/,

  /** "** Dealing down cards **" opens preflop. */
  DEALING_DOWN: /^\*+\s*Dealing down cards\s*\*+\s*$/i,

  /** "** Dealing flop ** [ 4c, 4h, Qh ]" — only the NEW cards are printed. */
  DEALING_STREET:
    /^\*+\s*Dealing\s+(flop|turn|river)\s*\*+\s*(?:\[\s*([^\]]*?)\s*\])?\s*$/i,

  /** "** Summary **" */
  SUMMARY: /^\*+\s*Summary\s*\*+\s*$/i,

  /** "Dealt to Hero [ Ah, Kd ]" */
  DEALT: /^Dealt to\s+(.+?)\s+\[\s*([^\]]*?)\s*\]\s*$/i,

  /**
   * An action line. Names carry no colon, so the verb list is what anchors the
   * match — it is ordered longest-first so "posts ante" cannot be read as
   * "posts". Amounts are ALWAYS deltas in this format (see index.ts).
   */
  ACTION:
    /^(.+?)\s+(posts ante|posts small blind|posts big blind|posts dead blind|folds|checks|calls|bets|raises|allin|all-in|all in)(?:\s*\[\s*(?:[^\d\s]{0,3})\s*([\d,.]+)\s*\])?\s*$/i,

  /** "Artolya collected [ 489 ]" */
  COLLECTED: /^(.+?)\s+collected\s+\[\s*(?:[^\d\s]{0,3})\s*([\d,.]+)\s*\]\s*$/i,

  /** "Noname057 shows [ As, 5h ]" */
  SHOWS: /^(.+?)\s+shows\s+\[\s*([^\]]*?)\s*\](?:\s*(?:\.|,)?\s*(.*))?$/i,

  /** "Hero did not show his hand." / "X mucks" */
  NO_SHOW: /^(.+?)\s+(?:did not show(?:\s+(?:his|her|their)\s+hand)?|mucks(?:\s+hand)?|does not show)\b/i,

  /** Chatter that carries no action. */
  NOISE:
    /^(.+?)\s+(?:has joined the table|has left the table|is disconnected|is connected|has timed out|sits out|is sitting out|joins the game|leaves the game|wins the tournament|finished in)\b/i,

  /** "Main Pot: 1200 | Side Pot 1: 300" — some exports print pot lines. */
  POT_LINE: /^(?:Main|Side)\s+Pot(?:\s*\d*)\s*:\s*(?:[^\d\s]{0,3})\s*([\d,.]+)/i,
} as const;

export const DEALING_TO_STREET = {
  flop: 'flop',
  turn: 'turn',
  river: 'river',
} as const;

/** Parses "5000", "1,234.56" or "0.50" into a number. Null when unparseable. */
export function parseNumeric(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[^\d,.]/g, '').replace(/\s/g, '');
  if (cleaned === '') return null;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(/,/g, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Converts a currency string into integer cents. */
export function parseCents(raw: string | undefined): number | null {
  const n = parseNumeric(raw);
  return n === null ? null : Math.round(n * 100);
}
