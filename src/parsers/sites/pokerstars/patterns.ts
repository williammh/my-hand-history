/**
 * Every PokerStars-format regex lives here and nowhere else, so format drift is
 * a one-file change and the parser body stays readable.
 *
 * The same grammar is emitted verbatim by several rooms — CoinPoker is a known
 * clone, and other rooms license the same client — so the brand word at the
 * head of the header line is a capture group rather than a literal. See
 * `brands.ts` for how that word is turned into a SiteId.
 */
export const POKERSTARS = {
  /**
   * Hands are separated by a blank line before the next header. The brand word
   * is matched loosely (letters, digits, spaces, dots) so a room this parser
   * has never heard of still splits correctly.
   */
  HAND_SEPARATOR: /\n\s*\n(?=[A-Za-z][A-Za-z0-9 .'&-]{0,30}?\s+(?:Hand|Game)\s+#)/,

  /** Recognizes the first line of a chunk, whatever the brand. */
  CHUNK_START: /^[A-Za-z][A-Za-z0-9 .'&-]{0,30}?\s+(?:Hand|Game)\s+#/,

  /**
   * Tournament:
   *   "PokerStars Hand #261627320204: Tournament #4018426247, $9.80+$1.20 USD
   *    Hold'em No Limit - Level XVII (2500/5000) - 2026/08/02 17:31:45 ET"
   * Cash:
   *   "PokerStars Hand #240192837465: Hold'em No Limit ($0.50/$1.00 USD)
   *    - 2026/08/31 14:22:10 ET"
   *
   * Split into brand / hand id / body / date so that the body — which differs
   * completely between the two game modes — is parsed by its own pattern.
   * "Zoom Hand", "Game" and a trailing hand-id suffix are all tolerated.
   */
  HEADER:
    /^([A-Za-z][A-Za-z0-9 .'&-]{0,30}?)\s+(?:Zoom\s+)?(?:Hand|Game)\s+#(\S+?):\s*(.*?)\s*-\s*(\d{4}\/\d{2}\/\d{2}\s+\d{1,2}:\d{2}:\d{2})\s*(\w{1,4})?\s*(?:\[.*\])?\s*$/m,

  /**
   * The tournament flavor of the header body:
   * "Tournament #4018426247, $9.80+$1.20 USD Hold'em No Limit - Level XVII (2500/5000)"
   * Buy-in is absent for freerolls ("Freeroll"), and the level block may be
   * missing entirely on some exports.
   */
  HEADER_TOURNAMENT:
    /^Tournament\s+#(\S+?),\s*(.*?)\s+((?:No Limit|Pot Limit|Limit|Fixed Limit).*?|.*?(?:Hold'em|Omaha|Stud).*?)\s*-\s*(?:Level\s+(\S+)\s*)?\(([^)]*)\)\s*$/i,

  /** "Hold'em No Limit ($0.50/$1.00 USD)" — the cash flavor. */
  HEADER_CASH: /^(.*?)\s*\(([^)]*)\)\s*$/,

  /** "$9.80+$1.20 USD" / "$5+$0.50+$0.45 USD" (rebuy/bounty) / "Freeroll". */
  BUYIN: /^(?:([^\d\s]{0,3})\s*([\d,.]+))(?:\s*\+\s*(?:[^\d\s]{0,3})\s*([\d,.]+))?(?:\s*\+\s*(?:[^\d\s]{0,3})\s*([\d,.]+))?\s*([A-Z]{3})?\s*$/,

  /**
   * The parenthesized stakes block.
   *   Tournament: "2500/5000" or "2500/5000/500" (ante)
   *   Cash:       "$0.50/$1.00 USD"
   */
  STAKES: /^\s*(?:[^\d\s]{0,3})\s*([\d,.]+)\s*\/\s*(?:[^\d\s]{0,3})\s*([\d,.]+)(?:\s*\/\s*(?:[^\d\s]{0,3})\s*([\d,.]+))?\s*([A-Z]{3})?\s*$/,

  /**
   * "Table '4018426247 100' 8-max Seat #5 is the button"
   * "Table 'Aludra' 6-max (Real Money) Seat #3 is the button"
   * Max-seat count is optional: some cash exports omit "N-max" entirely.
   */
  TABLE:
    /^Table\s+'(.+?)'\s*(?:(\d+)-max)?\s*(?:\(([^)]*)\))?\s*Seat #(\d+) is the button\s*$/m,

  /** "Seat 1: ballack1010 (103639 in chips)" / "Seat 4: Hero ($100 in chips)" */
  SEAT:
    /^Seat (\d+):\s+(.+?)\s+\((?:[^\d\s]{0,3})\s*([\d,.]+)\s+in chips(?:,\s*(?:[^\d\s]{0,3})\s*[\d,.]+\s+bounty)?\)\s*(\(sitting out\)|is sitting out)?\s*$/,

  /** Sections: "*** HOLE CARDS ***", "*** FLOP *** [9s Kh 8s]" */
  SECTION: /^\*\*\* ([A-Z][A-Z0-9 '-]*?) \*\*\*(.*)$/,

  /** "Dealt to eastcoastbidder [Ah Kd]" */
  DEALT: /^Dealt to\s+(.+?)\s+\[([^\]]+)\]\s*$/,

  /**
   * An action line — the name is followed by a COLON, which is what separates
   * this format from Winamax's.
   *   "Livino Showtime: raises 5000 to 10000"
   *   "TunicoTT: posts small blind 2500"
   *   "eastcoastbidder: raises 131732 to 143732 and is all-in"
   *   "ballack1010: folds"
   *   "Hero: bets $4"
   * Verbs are ordered longest-first so "posts" cannot swallow "posts the ante".
   */
  ACTION:
    /^(.+?):\s+(posts small blind|posts big blind|posts small \& big blinds|posts the ante|posts the small blind|posts the big blind|posts ante|folds|checks|calls|bets|raises)\s*(?:(?:[^\d\s]{0,3})\s*([\d,.]+))?(?:\s*to\s*(?:[^\d\s]{0,3})\s*([\d,.]+))?(.*)$/,

  ALL_IN: /\band is all-in\b/i,

  /** "Uncalled bet (12409) returned to TunicoTT" */
  UNCALLED_RETURN:
    /^Uncalled bet\s*\((?:[^\d\s]{0,3})\s*([\d,.]+)\)\s*returned to\s+(.+?)\s*$/i,

  /** "TunicoTT collected 49634 from pot" / "... from side pot-2" */
  COLLECTED:
    /^(.+?)\s+collected\s+(?:[^\d\s]{0,3})\s*([\d,.]+)\s+from\s+(?:the\s+)?(main pot|side pot(?:-\d+)?|pot)\s*$/i,

  /** "Livino Showtime: shows [2h Qh] (two pair, Fives and Deuces)" */
  SHOW_LINE: /^(.+?):\s+shows\s+\[([^\]]+)\](?:\s*\(([^)]*)\))?\s*$/i,

  /** "TunicoTT: doesn't show hand" / "Hero: mucks hand" */
  DOES_NOT_SHOW: /^(.+?):\s+(?:doesn't show hand|mucks hand|does not show hand)\s*$/i,

  /** Lines that carry no action: "Roma140288 is disconnected", "X has timed out". */
  NOISE:
    /^(.+?)\s+(?:is disconnected|is connected|has timed out(?: while (?:being )?disconnected)?|was removed from the table|is sitting out|has returned|said,|leaves the table|joins the table|will be allowed to play after the button|re-buys and receives|has re-?entered|finished the tournament|wins the tournament)\b/i,

  /** "Total pot 49634 | Rake 0" / "Total pot $124 | Rake $3 | Main pot $60. Side pot $61." */
  SUMMARY_TOTAL:
    /^Total pot\s+(?:[^\d\s]{0,3})\s*([\d,.]+)(?:.*?\|\s*Rake\s+(?:[^\d\s]{0,3})\s*([\d,.]+))?/i,

  /** "Board [9s Kh 8s Js Kd]" */
  BOARD: /^Board\s*\[([^\]]*)\]\s*$/i,

  /**
   * "Seat 6: TunicoTT (small blind) collected (49634)"
   * "Seat 3: Roma140288 (button) showed [Kh Ks] and won (62784) with two pair..."
   * "Seat 5: Livino Showtime (big blind) showed [2h Qh] and lost with two pair..."
   * "Seat 1: ballack1010 folded before Flop (didn't bet)"
   * The position tag is optional and the trailing text is left to SUMMARY_*.
   */
  SUMMARY_SEAT: /^Seat (\d+):\s+(.+?)(?:\s+\((button|small blind|big blind)\))?\s+(.*)$/i,

  /** "collected (49634)" — the tail of a summary seat line. */
  SUMMARY_COLLECTED: /^collected\s*\((?:[^\d\s]{0,3})\s*([\d,.]+)\)/i,

  /**
   * "won ($23.50)" / "won (80)" — GGPoker's summary verb where PokerStars
   * writes "collected". Same meaning, different word.
   */
  SUMMARY_WON: /^won\s*\((?:[^\d\s]{0,3})\s*([\d,.]+)\)/i,

  /** "showed [Kh Ks] and won (62784) with two pair, Kings and Fives" */
  SUMMARY_SHOWED:
    /^(?:showed|mucked)\s+\[([^\]]+)\](?:\s+and\s+(won|lost)\s*(?:\((?:[^\d\s]{0,3})\s*([\d,.]+)\))?(?:\s+with\s+(.+?))?)?\s*$/i,

  /** "2026/08/02 17:31:45" — the date half of the header, timezone stripped. */
  DATE_TIME: /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/,

  /**
   * GGPoker's lottery-style sit & go header body:
   *   "Spin & Gold $5.00 ($4.65+$0.35)"
   *   "Spin & Gold $1 ($0.93+$0.07)"
   * Without this the generic cash pattern claims the line and reads the
   * buy-in split "$4.65+$0.35" as the blinds, which is silently very wrong.
   */
  HEADER_SPIN:
    /^(Spin\s*(?:&|and)\s*Gold|Spin\s*(?:&|and)\s*Go|Flip\s*&\s*Go)\s*(?:[^\d\s]{0,3})\s*([\d,.]+)?\s*(?:\(\s*(?:[^\d\s]{0,3})\s*([\d,.]+)\s*\+\s*(?:[^\d\s]{0,3})\s*([\d,.]+)\s*\))?\s*$/i,

  /** "Multiplier: 2x" — the prize multiplier a Spin & Gold rolls before play. */
  GG_MULTIPLIER: /^Multiplier:\s*([\d,.]+)\s*x\s*$/i,

  /** "Total Prize Pool: $10.00" */
  GG_PRIZE_POOL: /^Total Prize Pool:\s*(?:[^\d\s]{0,3})\s*([\d,.]+)\s*$/i,

  /**
   * GGPoker hand ids are prefixed by game type — RC for Rush & Cash, SG for
   * Spin & Gold, TM for tournaments, HD for regular cash. The prefix is the
   * only in-file signal of the room, since the header's brand word is the bare
   * word "Poker".
   */
  GG_HAND_ID: /^(RC|SG|TM|HD|OM|CG)[A-Z]*\d+$/,
} as const;

export const SECTION_TO_STREET = {
  'HOLE CARDS': 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
} as const;

/** Sections that carry no street action but are still expected. */
export const KNOWN_SECTIONS = new Set([
  'HOLE CARDS', 'FLOP', 'TURN', 'RIVER', 'SHOW DOWN', 'SHOWDOWN', 'SUMMARY',
  'FIRST FLOP', 'FIRST TURN', 'FIRST RIVER',
  'SECOND FLOP', 'SECOND TURN', 'SECOND RIVER',
]);

/** Parses "440966", "1,234.56" or "5.00" into a number. Null when unparseable. */
export function parseNumeric(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[^\d,.]/g, '').replace(/\s/g, '');
  if (cleaned === '') return null;
  // "1,234.56" -> thousands separator; "1,50" -> decimal comma.
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(/,/g, '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Converts a currency string like "0.50" into integer cents. */
export function parseCents(raw: string | undefined): number | null {
  const n = parseNumeric(raw);
  return n === null ? null : Math.round(n * 100);
}
