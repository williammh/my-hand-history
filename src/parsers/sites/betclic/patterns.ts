/**
 * Every Betclic regex lives here and nowhere else, so format drift is a
 * one-file change and the parser body stays readable.
 */
export const BETCLIC = {
  /** Exactly a run of dashes on its own line. The sample uses 12. */
  HAND_SEPARATOR: /^-{6,}$/m,

  SECTION: /^\*\*\* ([A-Z][A-Z\- ]*) \*\*\*(?:\s*\[([^\]]*)\])?\s*$/,

  HEADER_FIELD: /^([A-Za-z&' ]+):\s*(.*)$/,

  /** "Seat 5: SIMBAROI (56394) [BTN Hero]" — the bracket is optional. */
  SEAT: /^Seat (\d+):\s+(.+?)\s+\((\d+)\)(?:\s*\[([^\]]*)\])?\s*$/,

  /** "SIMBAROI: [9s 2c]" */
  HOLE_CARDS: /^(.+?):\s*\[([^\]]+)\]\s*$/,

  /**
   * "14:05:34 - LaCigale: Raises to 440966 and is all-in"
   * Timestamp optional; amount optional (Folds/Checks); trailing clause captured.
   */
  ACTION:
    /^(?:(\d{1,2}:\d{2}:\d{2})\s*-\s*)?(.+?):\s*(Posts Ante|Posts SB|Posts BB|Posts Dead|Posts Straddle|Folds|Checks|Calls|Bets|Raises to|Raises|Shows|Mucks|Returns|Uncalled)\b\s*([\d,.]+)?(.*)$/,

  ALL_IN: /\band is all-in\b/i,

  /** "14:06:59 - mehdiiii: Sits out" — session/connection noise, not a game action. */
  TABLE_EVENT: /^\d{1,2}:\d{2}:\d{2}\s*-\s*.+?:\s*(Sits out|Sits in|Disconnected|Reconnected)\s*$/,

  /**
   * "Kamaz shows [Ah Th] (Three of a Kind) [Ts Th Tc Ah 5s]" — no colon, no
   * timestamp, lowercase verb; distinct enough from ACTION to need its own line.
   */
  SHOWDOWN_LINE: /^(.+?)\s+(shows|mucks)\s+\[([^\]]+)\](?:\s*\(([^)]+)\))?(?:\s*\[([^\]]*)\])?\s*$/i,

  /**
   * "LaCigale wins main pot of 453766" / "... side pot 1 of N with a flush" /
   * "carréra63 wins 1st side pot of 260" — the ordinal can precede "side pot".
   */
  SUMMARY_WIN:
    /^(.+?)\s+wins\s+(main pot|(?:\d+(?:st|nd|rd|th)\s+)?side pot(?:\s*\d+)?)\s+of\s+([\d,.]+)(?:\s+with\s+(.+?))?\s*$/i,

  BLINDS: /^([\d,.]+)\s*\/\s*([\d,.]+)$/,

  /** "5.00€" after mojibake repair, or "5.00 EUR". */
  BUY_IN: /^([\d.,]+)\s*(\S+)?$/,

  DATE_TIME: /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s*\(([^)]+)\))?$/,
} as const;

export type SectionName =
  | 'HEADER' | 'PLAYERS' | 'HOLE CARDS'
  | 'PRE-FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'SUMMARY';

export const SECTION_TO_STREET = {
  'PRE-FLOP': 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
} as const;

/** Parses "440966" or "5.00" / "1,234.56" into a number. Null when unparseable. */
export function parseNumeric(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '');
  // Thousands separators only; the sample uses none, but other exports do.
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(/,/g, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
