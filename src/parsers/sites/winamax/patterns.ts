/**
 * Every Winamax regex lives here and nowhere else, so format drift is a
 * one-file change and the parser body stays readable.
 */
export const WINAMAX = {
  /** Hands are separated by exactly one blank line before the next header. */
  HAND_SEPARATOR: /\n{2,}(?=Winamax Poker)/,

  /**
   * "Winamax Poker - CashGame - HandId: #20183568-872-1728408886 - Holdem no
   * limit (0.02€/0.05€) - 2024/10/08 17:34:46 UTC"
   * Tournament hands instead read:
   * "Winamax Poker - Tournament "NAME"(buyIn) - HandId: #... - Holdem no
   * limit (level, SB/BB) - date"
   */
  HEADER:
    /^Winamax Poker\s*-\s*(CashGame|Tournament)\s*(.*?)-\s*HandId:\s*#(\S+)\s*-\s*(.+?)\s*\(([^)]*)\)\s*-\s*(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) UTC\s*$/m,

  /** "(0.02€/0.05€)" or "(level1, 10/20)" or "(10/20/20)" (BB ante). */
  BLINDS_BLOCK: /(?:.*,\s*)?([\d,.]+)\s*€?\/\s*([\d,.]+)\s*€?(?:\/\s*([\d,.]+)\s*€?)?\s*$/,

  /** "Table: 'Alcácer do Sal 02' 5-max (real money) Seat #5 is the button" */
  TABLE:
    /^Table:\s*'(.+?)'\s*(\d+)-max(?:\s*\(([^)]*)\))?\s*Seat #(\d+) is the button\s*$/m,

  SECTION: /^\*\*\* ([A-Z][A-Z /-]*?) \*\*\*(?:\s*(\[.*\]))?\s*$/,

  /** "Seat 1: 20BJ (5.19€)" — stack currency symbol optional for tourneys (chip counts). */
  SEAT: /^Seat (\d+):\s+(.+?)\s+\(([\d,.]+)\s*€?\)\s*$/,

  /** "Dealt to 6T3MAT1K [Qd 5h]" */
  DEALT: /^Dealt to\s+(.+?)\s+\[([^\]]+)\]\s*$/,

  /**
   * A single action line, name first with NO trailing colon:
   *   "20BJ raises 0.05€ to 0.10€"
   *   "6T3MAT1K posts small blind 0.02€"
   *   "LF-Genie49 posts big blind 0.05€ out of position"
   *   "ghoustryde raises 4.85€ to 5€ and is all-in"
   *   "20BJ folds" / "6T3MAT1K checks"
   * Verb group ordered longest-first so "raises" doesn't swallow "raises ... to".
   */
  ACTION:
    /^(.+?)\s+(posts small blind|posts big blind|posts ante|posts dead blind|posts|folds|checks|calls|bets|raises)\s*([\d,.]+\s*€?)?(?:\s*to\s*([\d,.]+\s*€?))?(.*)$/,

  ALL_IN: /\band is all-in\b/i,
  OUT_OF_POSITION: /\bout of position\b/i,

  /** "20BJ shows [Ks Jd] (One pair : Kings)" — no colon, lowercase verb. */
  SHOW_LINE: /^(.+?)\s+shows\s+\[([^\]]+)\](?:\s*\(([^)]+)\))?\s*$/i,

  /** "6T3MAT1K collected 0.58€ from pot" (cash) / "... from pot 2" (side pot). */
  COLLECTED: /^(.+?)\s+collected\s+([\d,.]+)\s*€?\s+from pot(?:\s*(\d+))?\s*$/i,

  UNCALLED_RETURN: /^(.+?)\s+(?:has\s+)?(?:been\s+)?returned\s+(?:the\s+)?uncalled\s+bet(?:\s+of)?\s+([\d,.]+)\s*€?\s*$/i,

  DOES_NOT_SHOW: /^(.+?)\s+(?:does not show|mucks)(?:\s+.*)?$/i,

  /** "Total pot 0.58€ | Rake 0.02€" / "Total pot 0.20€ | No rake" */
  SUMMARY_TOTAL:
    /^Total pot\s+([\d,.]+)\s*€?(?:\s*\|\s*(?:Rake\s+([\d,.]+)\s*€?|No rake))?\s*$/i,

  /** "Board: [Ks Jd Ad 2c]" */
  BOARD: /^Board:\s*\[([^\]]*)\]\s*$/,

  /**
   * "Seat 1: 20BJ (small blind) won 0.58€"
   * "Seat 3: 6T3MAT1K (button) won 0.76€"
   * "Seat 3: 6T3MAT1K showed [Js Ks] and lost with One pair : Kings"
   * "Seat 5: ghoustryde showed [Kh Qc] and won 2.03€ with One pair : Kings"
   * "Seat 1: 20BJ won 0.26€" (no position tag)
   * "Seat 2: LF-Genie49 (big blind) mucked"
   */
  SUMMARY_SEAT:
    /^Seat (\d+):\s+(.+?)(?:\s*\(([^)]+)\))?\s+(won|showed|lost|mucked)\b(.*)$/i,

  /** The amount trailing "won" in a summary line, after the verb has already been stripped. */
  SUMMARY_WON_AMOUNT: /^([\d,.]+)\s*€?/,
  SUMMARY_SHOWED: /^showed\s+\[([^\]]+)\]\s+and\s+(won|lost)(?:\s+([\d,.]+)\s*€?)?(?:\s+with\s+(.+))?$/i,

  DATE_TIME: /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,

  /**
   * The tournament label block between "Tournament" and "- HandId":
   *   `"Kill The Fish"(5€ + 0.50€) ` -> name "Kill The Fish", buy-in 5, fee 0.50
   *   `"Sunday Special"(10€) `       -> name "Sunday Special", buy-in 10, no fee
   * Buy-in/fee are absent for freerolls, where only the quoted name remains.
   */
  TOURNAMENT_LABEL: /^"(.*)"\s*(?:\(([\d,.]+)\s*€?\s*(?:\+\s*([\d,.]+)\s*€?)?\))?\s*$/,
} as const;

export type SectionName =
  | 'ANTE/BLINDS' | 'PRE-FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOW DOWN' | 'SUMMARY';

export const SECTION_TO_STREET = {
  'PRE-FLOP': 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
} as const;

/** Parses "440966" or "5.00" / "1,234.56" into a number. Null when unparseable. */
export function parseNumeric(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/€/g, '').replace(/\s/g, '');
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(/,/g, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Winamax cash games are denominated in euros with 2 decimal places; converts
 * a euro string like "0.58" into integer cents. Tournament chip amounts have
 * no currency symbol and are already integers, so this is only used for cash.
 */
export function parseCents(raw: string | undefined): number | null {
  const n = parseNumeric(raw);
  return n === null ? null : Math.round(n * 100);
}
