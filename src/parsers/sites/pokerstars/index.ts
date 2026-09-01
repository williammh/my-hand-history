import {
  asAmount, type Amount, type AnteType, type CurrencyCode, type MoneyContext,
} from '@/domain/money';
import { parseCardList, type Card, type HoleCards } from '@/domain/cards';
import { derivePositions, type Position, type Street } from '@/domain/position';
import type { Action, ActionKind } from '@/domain/action';
import { computePots, type PotAward } from '@/domain/pot';
import type {
  GameMode, GameVariant, Hand, HandMeta, ParseWarning, PlayerSeat, Showdown, SiteId,
  StreetState, TournamentInfo,
} from '@/domain/hand';
import type { DetectionResult, ParseContext, ParseResult, SiteParser } from '@/parsers/types';
import { CommitmentLedger } from '@/parsers/shared/commitment-ledger';
import { normalizeSource } from '@/parsers/shared/text';
import { WarningCode, warn, fail } from '@/parsers/shared/warnings';
import { identifyBrand, isKnownBrand, normalizeBrand } from './brands';
import {
  KNOWN_SECTIONS, POKERSTARS, SECTION_TO_STREET, parseCents, parseNumeric,
} from './patterns';

/**
 * Which dialect of the shared grammar a room writes.
 *
 * The hand body is identical across all of them, which is why they share a
 * parser. The dialects differ only in how the room is identified: every
 * PokerStars-family room names itself in the header's brand word, while
 * GGPoker writes the bare word "Poker" and must be recognized by its hand-id
 * prefix instead. Its other quirks — "won (N)" summary awards, Spin & Gold
 * headers, the prize-roll lines — are handled unconditionally, since no other
 * room emits anything that collides with them.
 */
export type FormatFamily = 'pokerstars' | 'ggpoker';

/**
 * Amount semantics in this format, which the CommitmentLedger reconciles:
 *   "bets 4"          -> DELTA
 *   "calls 7500"      -> DELTA
 *   "raises 5000 to 10000" -> the FIRST number is the delta over the current
 *                             bet, the SECOND is the absolute street total.
 * The street total is the one to trust: it is what the room itself uses to
 * decide whether a raise is legal, and it survives multi-way reraises that a
 * running delta sum gets wrong.
 */

interface Sections {
  players: string[];
  /** Lines before *** HOLE CARDS ***: antes, blinds, and "Dealt to". */
  preHole: string[];
  showdown: string[];
  summary: string[];
  streets: { street: Street; boardText: string | null; lines: string[] }[];
  unknown: ParseWarning[];
}

/**
 * Splits a hand into its *** SECTION *** blocks.
 *
 * Antes and blinds are printed BEFORE *** HOLE CARDS *** with no section of
 * their own. They are still preflop action, so they are buffered and prepended
 * to the preflop block when it opens. Opening a separate street entry for them
 * would double-apply `ledger.nextStreet()` and corrupt street commitment for
 * every later raise.
 */
function splitSections(lines: readonly string[]): Sections {
  const out: Sections = {
    players: [], preHole: [], showdown: [], summary: [], streets: [], unknown: [],
  };
  let current: string | null = null;
  const preflopPosts: string[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const m = POKERSTARS.SECTION.exec(trimmed);
    if (m) {
      const name = m[1]!.trim().toUpperCase();
      current = name;
      const street = SECTION_TO_STREET[name as keyof typeof SECTION_TO_STREET];
      if (street) {
        // The LAST bracket group is the new card(s): the flop line carries one
        // group, turn and river carry "[board] [new]".
        const brackets = [...(m[2] ?? '').matchAll(/\[([^\]]*)\]/g)].map((b) => b[1] ?? '');
        const boardText = brackets.length > 0 ? brackets[brackets.length - 1]! : null;
        out.streets.push({
          street,
          boardText,
          lines: street === 'preflop' ? [...preflopPosts] : [],
        });
      } else if (!KNOWN_SECTIONS.has(name)) {
        out.unknown.push(warn(
          WarningCode.UNPARSED_LINE, `Unknown section "${name}"`,
          { lineNumber: i + 1, rawLine: line },
        ));
      }
      return;
    }
    if (!trimmed) return;

    switch (current) {
      case 'SHOW DOWN':
      case 'SHOWDOWN':
        out.showdown.push(line);
        break;
      case 'SUMMARY':
        out.summary.push(line);
        break;
      case null:
        // Everything above *** HOLE CARDS ***: seat lines, then the forced bets.
        if (POKERSTARS.SEAT.test(trimmed)) out.players.push(line);
        else if (
          // GGPoker prints the Spin & Gold prize roll between the table line
          // and the seats. It is hand metadata, not a forced bet, so it is
          // kept out of the preflop block the action loop reads.
          POKERSTARS.GG_MULTIPLIER.test(trimmed) || POKERSTARS.GG_PRIZE_POOL.test(trimmed)
        ) {
          out.preHole.push(line);
        } else {
          out.preHole.push(line);
          preflopPosts.push(line);
        }
        break;
      default: {
        const s = out.streets[out.streets.length - 1];
        if (s) s.lines.push(line);
        break;
      }
    }
  });

  return out;
}

const VERB_TO_KIND: Record<string, ActionKind> = {
  'posts small blind': 'post-sb',
  'posts the small blind': 'post-sb',
  'posts big blind': 'post-bb',
  'posts the big blind': 'post-bb',
  'posts small & big blinds': 'post-dead',
  'posts the ante': 'post-ante',
  'posts ante': 'post-ante',
  folds: 'fold',
  checks: 'check',
  calls: 'call',
  bets: 'bet',
  raises: 'raise',
};

const SUMMARY_TAG_TO_POSITION: Record<string, Position> = {
  button: 'BTN',
  'small blind': 'SB',
  'big blind': 'BB',
};

/** Roman numerals as PokerStars writes tournament levels ("Level XVII"). */
function parseLevel(raw: string | undefined): number | null {
  if (!raw) return null;
  const arabic = Number(raw);
  if (Number.isFinite(arabic)) return arabic;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const chars = raw.toUpperCase().split('');
  if (!chars.every((c) => c in values)) return null;
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    const v = values[chars[i]!]!;
    const next = i + 1 < chars.length ? values[chars[i + 1]!]! : 0;
    total += v < next ? -v : v;
  }
  return total;
}

/**
 * PokerStars stamps its own wall-clock time plus a timezone abbreviation, most
 * often ET. Abbreviations are ambiguous (ET is -4 or -5 depending on the date)
 * and JS has no zone database here, so the timestamp is kept as the room's
 * local wall time and the zone is recorded verbatim in `timezoneNote` rather
 * than being converted with a guessed offset.
 */
function toIsoDate(raw: string | undefined): string {
  const m = raw ? POKERSTARS.DATE_TIME.exec(raw.trim()) : null;
  if (!m) return new Date(0).toISOString();
  const [, y, mo, d, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h!.padStart(2, '0')}:${mi}:${s}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function currencyFromSymbol(body: string, declared: string | undefined): CurrencyCode {
  if (declared === 'USD' || declared === 'EUR' || declared === 'GBP') return declared;
  if (body.includes('€')) return 'EUR';
  if (body.includes('£')) return 'GBP';
  return 'USD';
}

function detectVariant(gameType: string): GameVariant {
  const g = gameType.toLowerCase();
  if (/omaha/.test(g)) return /5\s*card|5-card/.test(g) ? 'plo5' : 'plo';
  if (/hold\s*'?em/.test(g)) return /\bno limit\b|\bnl\b|pot limit/.test(g) ? 'nlhe' : 'limit-holdem';
  return 'unknown';
}

/**
 * The PokerStars format, shared by every room that emits it.
 *
 * `siteId` is fixed per registered instance so the registry can key parsers by
 * it, but the identity actually written onto each hand comes from the brand
 * word in that hand's own header — a file is allowed to say CoinPoker even if
 * it was routed here by the PokerStars entry.
 */
function parsePokerStarsHand(
  source: string,
  ctx: ParseContext,
  fallbackSiteId: SiteId,
  family: FormatFamily = 'pokerstars',
): ParseResult<Hand> {
  const isGG = family === 'ggpoker';
  const warnings: ParseWarning[] = [];
  const lines = source.split('\n');

  // ---- header ---------------------------------------------------------------
  const headerLine = lines.find((l) => POKERSTARS.HEADER.test(l.trim()));
  const hm = headerLine ? POKERSTARS.HEADER.exec(headerLine.trim()) : null;
  if (!hm) {
    return { ok: false, errors: [fail(WarningCode.MISSING_HEADER, 'No PokerStars-format header line found')] };
  }
  const [, brandRaw, handId, bodyRaw, dateRaw, tzRaw] = hm;
  if (!handId) {
    return { ok: false, errors: [fail(WarningCode.MISSING_HAND_ID, 'Header has no hand id')] };
  }

  // GGPoker writes the bare word "Poker" as its brand, so the header word
  // cannot name the room; the parser registration is the authority instead.
  // Every other room in this family is identified by that word.
  const brand = isGG ? null : identifyBrand(brandRaw ?? '');
  const siteId = brand === null ? fallbackSiteId : brand.known ? brand.siteId : fallbackSiteId;
  const body = bodyRaw ?? '';

  // ---- game mode, stakes, tournament ---------------------------------------
  const tm = POKERSTARS.HEADER_TOURNAMENT.exec(body);
  // "Spin & Gold $5.00 ($4.65+$0.35)" is a three-handed lottery sit & go. It
  // must be recognized BEFORE the cash pattern, which would otherwise read the
  // buy-in split in parentheses as the blinds — a silent, badly wrong parse.
  const spin = tm ? null : POKERSTARS.HEADER_SPIN.exec(body);
  const gameMode: GameMode = tm ? 'tournament' : spin ? 'sit-n-go' : 'cash';
  const isCash = gameMode === 'cash';

  let gameType: string;
  let stakesRaw: string;
  if (tm) {
    gameType = tm[3] ?? '';
    stakesRaw = tm[5] ?? '';
  } else if (spin) {
    // A Spin & Gold's blinds are never in the header; they come from the
    // posts, which the ledger reads below.
    gameType = "Hold'em No Limit";
    stakesRaw = '';
  } else {
    const cm = POKERSTARS.HEADER_CASH.exec(body);
    gameType = cm?.[1] ?? body;
    stakesRaw = cm?.[2] ?? '';
  }

  const sm = POKERSTARS.STAKES.exec(stakesRaw);
  if (!sm && !spin) {
    warnings.push(warn(WarningCode.BLIND_ANOMALY, `Unparseable stakes "${stakesRaw}"`));
  }

  // Chips are integers; real money is converted to cents so that no Amount is
  // ever a float (see domain/money.ts).
  const toAmt = (raw: string | undefined): number =>
    isCash ? (parseCents(raw) ?? 0) : Math.round(parseNumeric(raw) ?? 0);

  const smallBlind = asAmount(toAmt(sm?.[1]));
  let bigBlind = asAmount(toAmt(sm?.[2]));
  if (bigBlind <= 0 && !spin) {
    warnings.push(warn(WarningCode.BLIND_ANOMALY, `Unparseable big blind in "${stakesRaw}"`));
    bigBlind = asAmount(0);
  }
  // A third stakes group is the ante. Per-player antes are more often posted
  // explicitly line by line, and those are picked up from the action instead.
  const headerAnte = asAmount(sm?.[3] !== undefined ? toAmt(sm[3]) : 0);

  const currency: CurrencyCode = isCash
    ? currencyFromSymbol(body, sm?.[4])
    : 'CHIPS';

  // ---- table line -----------------------------------------------------------
  const tableLine = lines.find((l) => POKERSTARS.TABLE.test(l.trim()));
  const tbm = tableLine ? POKERSTARS.TABLE.exec(tableLine.trim()) : null;
  const tableName = tbm?.[1] ?? null;
  const maxSeats = tbm?.[2] ? Number(tbm[2]) : null;
  const declaredButton = tbm?.[4] ? Number(tbm[4]) : null;

  // ---- sections -------------------------------------------------------------
  const headerIdx = lines.indexOf(headerLine!);
  const tableIdx = tableLine ? lines.indexOf(tableLine) : headerIdx;
  const sections = splitSections(lines.slice(Math.max(headerIdx, tableIdx) + 1));
  warnings.push(...sections.unknown);

  // ---- seats ----------------------------------------------------------------
  interface RawSeat { seat: number; name: string; stack: Amount; sittingOut: boolean }
  const rawSeats: RawSeat[] = [];
  for (const line of sections.players) {
    const m = POKERSTARS.SEAT.exec(line.trim());
    if (!m) {
      warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed seat line', { rawLine: line }));
      continue;
    }
    rawSeats.push({
      seat: Number(m[1]),
      name: m[2]!.trim(),
      stack: asAmount(toAmt(m[3])),
      sittingOut: m[4] !== undefined,
    });
  }

  if (rawSeats.length === 0) {
    return { ok: false, errors: [fail(WarningCode.NO_PLAYERS, 'No seats parsed')] };
  }

  const byName = new Map(rawSeats.map((s) => [s.name, s]));
  const playerId = (name: string) => name.toLowerCase();

  let buttonSeat = declaredButton ?? -1;
  if (buttonSeat < 0 || !rawSeats.some((s) => s.seat === buttonSeat)) {
    // "Seat #N is the button" can name a seat that busted out and is no longer
    // listed. The nearest occupied seat walking backwards keeps the whole
    // position ring right, where falling back to the lowest seat would rotate
    // every player by an arbitrary amount.
    const sorted = [...rawSeats].sort((a, b) => a.seat - b.seat);
    const before = sorted.filter((s) => s.seat < (declaredButton ?? Infinity));
    buttonSeat = (before.length > 0 ? before[before.length - 1]! : sorted[sorted.length - 1]!).seat;
    warnings.push(warn(
      WarningCode.NO_BUTTON,
      declaredButton === null
        ? 'No button declared in table line; assumed nearest seat'
        : `Button seat ${declaredButton} is not occupied; assumed seat ${buttonSeat}`,
    ));
  }

  const derived = derivePositions({ seats: rawSeats.map((s) => s.seat), buttonSeat });

  // ---- hero and hole cards --------------------------------------------------
  // "Dealt to X [..]" sits above *** HOLE CARDS *** in some exports and below
  // it in others, so both regions are scanned rather than guessing at one.
  const holeCardsByName = new Map<string, HoleCards>();
  let heroName: string | null = null;
  const dealtCandidates = [
    ...sections.preHole,
    ...(sections.streets.find((s) => s.street === 'preflop')?.lines ?? []),
  ];
  for (const line of dealtCandidates) {
    const m = POKERSTARS.DEALT.exec(line.trim());
    if (!m) continue;
    const name = m[1]!.trim();
    const cards = parseCardList(m[2]!);
    if (!cards || cards.length < 2) {
      warnings.push(warn(WarningCode.BAD_CARD, `Unparseable hole cards "${m[2]}"`, { rawLine: line }));
      continue;
    }
    holeCardsByName.set(name, [cards[0]!, cards[1]!]);
    heroName = name;
  }

  const seats: PlayerSeat[] = rawSeats.map((s) => ({
    seat: s.seat,
    name: s.name,
    playerId: playerId(s.name),
    startingStack: s.stack,
    position: derived.get(s.seat) ?? 'BTN',
    declaredPosition: null,
    isButton: s.seat === buttonSeat,
    isHero: s.name === heroName,
    holeCards: holeCardsByName.get(s.name) ?? null,
    sittingOut: s.sittingOut,
  }));

  const heroSeat = seats.find((s) => s.isHero)?.seat ?? null;

  // ---- action ---------------------------------------------------------------
  const ledger = new CommitmentLedger(new Map(seats.map((s) => [s.seat, s.startingStack])));
  const actions: Action[] = [];
  const streetStates: StreetState[] = [];
  const showdown: Showdown[] = [];
  const awards: PotAward[] = [];
  const folded = new Set<number>();
  let board: Card[] = [];
  let actionIndex = 0;
  let sawAnte = false;

  const potSoFar = () => actions.reduce(
    (acc, a) => acc + (a.kind === 'uncalled-return' ? -a.amount : a.amount), 0,
  );

  const recordShowdown = (seat: number, entry: Showdown) => {
    const existing = showdown.find((sd) => sd.seat === seat);
    if (existing) Object.assign(existing, entry);
    else showdown.push(entry);
  };

  for (const block of sections.streets) {
    if (block.street !== 'preflop') {
      ledger.nextStreet();
      const newCards = block.boardText ? parseCardList(block.boardText) : null;
      if (newCards) {
        // The flop line prints all three cards; turn and river print only the
        // new one (SECTION already selected the last bracket group).
        board = block.street === 'flop' ? newCards : [...board, ...newCards];
      } else if (block.boardText) {
        warnings.push(warn(WarningCode.BAD_CARD, `Unparseable board "${block.boardText}"`));
      }
    }

    const boardAtStart: Card[] = [...board];
    const streetActions: Action[] = [];
    const potBefore = potSoFar();

    for (const line of block.lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Already consumed as hero's hole cards above.
      if (POKERSTARS.DEALT.test(trimmed)) continue;

      const uncalled = POKERSTARS.UNCALLED_RETURN.exec(trimmed);
      if (uncalled) {
        const name = uncalled[2]!.trim();
        const seat = byName.get(name);
        if (!seat) {
          warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Uncalled return to unknown player "${name}"`, { rawLine: line }));
          continue;
        }
        const amt = asAmount(toAmt(uncalled[1]));
        const action: Action = {
          index: actionIndex++,
          street: block.street,
          seat: seat.seat,
          playerId: playerId(name),
          kind: 'uncalled-return',
          amount: amt,
          totalCommitted: asAmount(Math.max(0, ledger.committedThisStreet(seat.seat) - amt)),
          isAllIn: false,
          timestamp: null,
          raw: trimmed,
        };
        ledger.applyDelta(seat.seat, asAmount(-amt));
        actions.push(action);
        streetActions.push(action);
        continue;
      }

      const collected = POKERSTARS.COLLECTED.exec(trimmed);
      if (collected) {
        const name = collected[1]!.trim();
        const seat = byName.get(name);
        if (!seat) {
          warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Collect by unknown player "${name}"`, { rawLine: line }));
          continue;
        }
        // "side pot-2" -> level 2; "main pot"/"pot" -> level 0.
        const potLabel = (collected[3] ?? '').toLowerCase();
        const levelMatch = /(\d+)/.exec(potLabel);
        awards.push({
          potLevel: levelMatch ? Number(levelMatch[1]) : 0,
          seat: seat.seat,
          amount: asAmount(toAmt(collected[2])),
          handDescription: null,
        });
        continue;
      }

      const show = POKERSTARS.SHOW_LINE.exec(trimmed);
      if (show) {
        const name = show[1]!.trim();
        const seat = byName.get(name);
        if (!seat) {
          warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Show line names unknown player "${name}"`, { rawLine: line }));
          continue;
        }
        const cards = parseCardList(show[2]!);
        recordShowdown(seat.seat, {
          seat: seat.seat,
          holeCards: cards && cards.length >= 2 ? [cards[0]!, cards[1]!] : null,
          mucked: false,
          handDescription: show[3]?.trim() ?? null,
        });
        continue;
      }

      if (POKERSTARS.DOES_NOT_SHOW.test(trimmed)) {
        const name = POKERSTARS.DOES_NOT_SHOW.exec(trimmed)![1]!.trim();
        const seat = byName.get(name);
        if (seat) {
          recordShowdown(seat.seat, {
            seat: seat.seat, holeCards: null, mucked: true, handDescription: null,
          });
        }
        continue;
      }

      const m = POKERSTARS.ACTION.exec(trimmed);
      if (!m) {
        // "X is disconnected" and friends are expected chatter, not a misparse.
        if (!POKERSTARS.NOISE.test(trimmed)) {
          warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed action line', { rawLine: line }));
        }
        continue;
      }

      const [, nameRaw, verbRaw, amountRaw, toAmountRaw, tail] = m;
      const name = nameRaw!.trim();
      const seat = byName.get(name);
      if (!seat) {
        warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Action by unknown player "${name}"`, { rawLine: line }));
        continue;
      }
      const kind = VERB_TO_KIND[verbRaw!.toLowerCase()];
      if (!kind) {
        warnings.push(warn(WarningCode.UNKNOWN_ACTION_VERB, `Unknown verb "${verbRaw}"`, { rawLine: line }));
        continue;
      }
      if (folded.has(seat.seat)) {
        warnings.push(warn(WarningCode.ACTION_AFTER_FOLD, `${name} acts after folding`, { rawLine: line }));
      }

      const explicitAllIn = POKERSTARS.ALL_IN.test(tail ?? '');
      let amount = asAmount(0);
      let totalCommitted = ledger.committedThisStreet(seat.seat);
      let isAllIn = explicitAllIn;

      if (kind === 'post-ante') {
        sawAnte = true;
        const raw = toAmt(amountRaw);
        const res = ledger.applyAnte(seat.seat, asAmount(raw));
        amount = asAmount(raw);
        totalCommitted = asAmount(0); // antes are not street commitment
        isAllIn = explicitAllIn || res.isAllIn;
      } else if (kind === 'raise') {
        // "raises 5000 to 10000": the second number is the absolute street
        // total, which is the one the ledger reconciles against.
        const total = toAmt(toAmountRaw ?? amountRaw);
        const res = ledger.applyTotal(seat.seat, asAmount(total));
        amount = res.delta;
        totalCommitted = res.totalCommitted;
        isAllIn = explicitAllIn || res.isAllIn;
      } else if (kind !== 'fold' && kind !== 'check') {
        const raw = toAmt(amountRaw);
        if (raw > 0) {
          const res = ledger.applyDelta(seat.seat, asAmount(raw));
          amount = asAmount(raw);
          totalCommitted = res.totalCommitted;
          isAllIn = explicitAllIn || res.isAllIn;
        }
      }

      if (kind === 'fold') folded.add(seat.seat);

      const action: Action = {
        index: actionIndex++,
        street: block.street,
        seat: seat.seat,
        playerId: playerId(name),
        kind,
        amount,
        totalCommitted,
        isAllIn,
        timestamp: null,
        raw: trimmed,
      };
      actions.push(action);
      streetActions.push(action);
    }

    streetStates.push({
      street: block.street,
      newCards: block.street === 'preflop'
        ? []
        : boardAtStart.slice(Math.max(0, boardAtStart.length - (block.street === 'flop' ? 3 : 1))),
      board: boardAtStart,
      actions: streetActions,
      potAtStart: asAmount(potBefore),
      potAtEnd: asAmount(potSoFar()),
    });
  }

  // ---- *** SHOW DOWN *** ----------------------------------------------------
  for (const line of sections.showdown) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const show = POKERSTARS.SHOW_LINE.exec(trimmed);
    if (show) {
      const name = show[1]!.trim();
      const seat = byName.get(name);
      if (!seat) {
        warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Showdown names unknown player "${name}"`, { rawLine: line }));
        continue;
      }
      const cards = parseCardList(show[2]!);
      if (!cards || cards.length < 2) {
        warnings.push(warn(WarningCode.BAD_CARD, `Unparseable showdown cards "${show[2]}"`, { rawLine: line }));
        continue;
      }
      recordShowdown(seat.seat, {
        seat: seat.seat,
        holeCards: [cards[0]!, cards[1]!],
        mucked: false,
        handDescription: show[3]?.trim() ?? null,
      });
      continue;
    }

    const collected = POKERSTARS.COLLECTED.exec(trimmed);
    if (collected) {
      const seat = byName.get(collected[1]!.trim());
      if (seat) {
        const potLabel = (collected[3] ?? '').toLowerCase();
        const levelMatch = /(\d+)/.exec(potLabel);
        awards.push({
          potLevel: levelMatch ? Number(levelMatch[1]) : 0,
          seat: seat.seat,
          amount: asAmount(toAmt(collected[2])),
          handDescription: null,
        });
      }
      continue;
    }

    const noShow = POKERSTARS.DOES_NOT_SHOW.exec(trimmed);
    if (noShow) {
      const seat = byName.get(noShow[1]!.trim());
      if (seat) {
        recordShowdown(seat.seat, {
          seat: seat.seat, holeCards: null, mucked: true, handDescription: null,
        });
      }
      continue;
    }

    if (!POKERSTARS.NOISE.test(trimmed)) {
      warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed showdown line', { rawLine: line }));
    }
  }

  // ---- *** SUMMARY *** ------------------------------------------------------
  // Awards come from the "collected" lines in the body, which are printed for
  // every pot. The summary is read for the reported total, the rake, and for
  // hole cards of players who showed but whose show line the body omitted.
  let reportedTotal: number | null = null;
  let rake = 0;
  const declaredPositions = new Map<number, Position>();

  for (const line of sections.summary) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const total = POKERSTARS.SUMMARY_TOTAL.exec(trimmed);
    if (total) {
      // This format's "Total pot" is the chips actually contested: it already
      // EXCLUDES any uncalled bet returned to the bettor, and the rake is taken
      // out of the winner's collect rather than out of this figure. That is the
      // same quantity validateHand computes from the actions (chip-moving
      // amounts minus uncalled returns), so it compares directly, with no
      // rake adjustment of the kind the Winamax parser needs.
      // Verified on the tournament sample's hand 1: 4900 antes + 2500 + 5000
      // + 10000 + 7500 + 9867x2 + 12409 - 12409 returned = 49634 = printed.
      //
      // GGPoker means the same thing by it, reached differently: its rake is
      // taken out of the winner's collect, so "Total pot $24.50 | Rake $1.50"
      // pairs with "collected $23.00" — total = collected + rake, and the
      // total is still the contested chips. Both rooms therefore compare
      // directly against the actions, with no adjustment either way.
      reportedTotal = toAmt(total[1]);
      rake = total[2] !== undefined ? toAmt(total[2]) : 0;
      continue;
    }
    if (POKERSTARS.BOARD.test(trimmed)) continue;
    if (POKERSTARS.GG_MULTIPLIER.test(trimmed) || POKERSTARS.GG_PRIZE_POOL.test(trimmed)) continue;

    const sm2 = POKERSTARS.SUMMARY_SEAT.exec(trimmed);
    if (!sm2) continue;
    const seatNo = Number(sm2[1]);
    const name = sm2[2]!.trim();
    const seat = byName.get(name) ?? rawSeats.find((s) => s.seat === seatNo);
    if (!seat) {
      warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Summary names unknown player "${name}"`, { rawLine: line }));
      continue;
    }

    const tag = sm2[3]?.toLowerCase();
    if (tag && SUMMARY_TAG_TO_POSITION[tag]) {
      declaredPositions.set(seat.seat, SUMMARY_TAG_TO_POSITION[tag]!);
    }

    const rest = (sm2[4] ?? '').trim();

    // GGPoker announces the winner only in the summary, as "won ($23.50)",
    // and prints no "collected" line in the body the way PokerStars does. Both
    // spellings are read here; the guard keeps a room that prints both from
    // recording the same award twice.
    const won = POKERSTARS.SUMMARY_WON.exec(rest);
    if (won && !awards.some((a) => a.seat === seat.seat)) {
      awards.push({
        potLevel: 0,
        seat: seat.seat,
        amount: asAmount(toAmt(won[1])),
        handDescription: null,
      });
    }

    const showed = POKERSTARS.SUMMARY_SHOWED.exec(rest);
    if (showed) {
      const cards = parseCardList(showed[1]!);
      recordShowdown(seat.seat, {
        seat: seat.seat,
        holeCards: cards && cards.length >= 2 ? [cards[0]!, cards[1]!] : null,
        mucked: /^mucked/i.test(rest),
        handDescription: showed[4]?.trim() ?? null,
      });
    }
  }

  // The summary's own position tags are the site's word on who was where; they
  // are kept as an audit trail beside the ring-derived position rather than
  // overriding it, and disagreement is reported.
  const seatsWithDeclared: PlayerSeat[] = seats.map((s) => {
    const declared = declaredPositions.get(s.seat) ?? null;
    if (declared && declared !== s.position) {
      // Heads-up is the known-good disagreement: the button posts the small
      // blind, and derivePositions labels that seat SB by design.
      const headsUpButton = seats.length === 2 && s.isButton;
      if (!headsUpButton) {
        warnings.push(warn(
          WarningCode.POSITION_MISMATCH,
          `${s.name} derived as ${s.position} but summary says ${declared}`,
        ));
      }
    }
    return { ...s, declaredPosition: declared };
  });

  // ---- money context --------------------------------------------------------
  const perPlayerAnte = actions.find((a) => a.kind === 'post-ante')?.amount ?? asAmount(0);
  const ante = headerAnte > 0 ? headerAnte : perPlayerAnte;
  const anteType: AnteType = ante <= 0
    ? 'none'
    // A single ante post covering the table is the big-blind ante; one post per
    // active player is the classic per-player ante.
    : sawAnte && actions.filter((a) => a.kind === 'post-ante').length === 1
      ? 'big-blind-ante'
      : 'per-player';

  // A Spin & Gold header carries the buy-in but never the blinds, so they are
  // recovered from the posts themselves. Everything downstream is denominated
  // in big blinds, so leaving these at zero would silently disable every
  // stack-depth and bet-sizing judgement on the hand.
  const postedBB = actions.find((a) => a.kind === 'post-bb')?.amount ?? asAmount(0);
  const postedSB = actions.find((a) => a.kind === 'post-sb')?.amount ?? asAmount(0);

  const money: MoneyContext = {
    currency,
    exponent: isCash ? 2 : 0,
    bigBlind: bigBlind > 0 ? bigBlind : postedBB,
    smallBlind: smallBlind > 0 ? smallBlind : postedSB,
    ante,
    anteType,
  };

  // ---- tournament info ------------------------------------------------------
  let tournament: TournamentInfo | null = null;
  if (tm) {
    const buyInRaw = (tm[2] ?? '').trim();
    const bm = POKERSTARS.BUYIN.exec(buyInRaw);
    // "$9.80+$1.20": the first figure is the prize-pool contribution, the rest
    // is the room's fee. Bounty formats add a third figure, which belongs with
    // the buy-in rather than the fee.
    const parts = bm
      ? [bm[2], bm[3], bm[4]].filter((x): x is string => x !== undefined).map((x) => parseCents(x) ?? 0)
      : [];
    const buyIn = parts.length > 0 ? parts[0]! : null;
    const fee = parts.length > 1 ? parts[parts.length - 1]! : null;
    const bounty = parts.length > 2 ? parts[1]! : 0;
    tournament = {
      tournamentId: tm[1] ?? null,
      name: null, // this format does not print the tournament name
      buyIn: buyIn === null ? null : asAmount(buyIn + bounty),
      fee: fee === null ? null : asAmount(fee),
      buyInCurrency: bm?.[5] ?? (buyInRaw.includes('€') ? 'EUR' : buyInRaw.includes('$') ? 'USD' : null),
      level: parseLevel(tm[4]),
    };
  } else if (spin) {
    // "Spin & Gold $5.00 ($4.65+$0.35)": the total is the advertised buy-in,
    // and the parenthesized pair splits it into prize contribution and fee.
    // The table name carries the only event label there is.
    const total = parseCents(spin[2]);
    const prize = parseCents(spin[3]);
    const fee = parseCents(spin[4]);
    tournament = {
      tournamentId: null, // a Spin & Gold prints no tournament number
      name: spin[1]?.replace(/\s+/g, ' ').trim() ?? null,
      buyIn: prize !== null ? asAmount(prize) : total !== null ? asAmount(total) : null,
      fee: fee === null ? null : asAmount(fee),
      buyInCurrency: body.includes('€') ? 'EUR' : body.includes('£') ? 'GBP' : 'USD',
      level: null, // blinds rise on a clock, and no level is printed
    };
  }

  const meta: HandMeta = {
    handId,
    siteId,
    tableId: tm?.[1] ?? null,
    tableName,
    playedAt: toIsoDate(dateRaw),
    timezoneNote: tzRaw ?? null,
    maxSeats,
    gameMode,
    variant: detectVariant(gameType),
    tournament,
    rake: asAmount(rake),
    sourceFile: ctx.fileName,
  };

  if (brand !== null && !brand.known) {
    warnings.push(warn(
      WarningCode.UNPARSED_LINE,
      `Unrecognized room "${brand.displayName}" — parsed with the PokerStars format as a fallback`,
    ));
  }

  const hand: Hand = {
    id: `${siteId}:${handId}`,
    meta,
    money,
    seats: seatsWithDeclared,
    heroSeat,
    buttonSeat,
    streets: streetStates,
    actions,
    finalBoard: board,
    showdown,
    pots: computePots(actions),
    awards,
    reportedTotalPot: reportedTotal === null ? null : asAmount(reportedTotal),
    warnings,
    source,
  };

  return { ok: true, value: hand, warnings };
}

function splitPokerStarsHands(text: string): readonly string[] {
  return text
    .split(POKERSTARS.HAND_SEPARATOR)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && POKERSTARS.CHUNK_START.test(c));
}

/** Brand words in a file's head, in the order they first appear. */
function brandsIn(sample: string): string[] {
  const out: string[] = [];
  const re = new RegExp(POKERSTARS.HEADER.source, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(sample)) !== null) {
    const b = m[1]!.trim();
    if (b && !out.includes(b)) out.push(b);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Builds a parser for one brand of the PokerStars format.
 *
 * `matches` decides whether a given file belongs to this registration, which is
 * what keeps the three entries from fighting over the same file: PokerStars and
 * CoinPoker each claim only their own brand word, and the fallback claims a
 * brand word no one else recognizes.
 */
function createPokerStarsFamilyParser(opts: {
  siteId: SiteId;
  displayName: string;
  confidence: number;
  matches: (brand: string) => boolean;
  reason: (brand: string) => string;
  /** Which dialect of the shared grammar this room writes. */
  family?: FormatFamily;
  /** Overrides brand-word detection for a room the brand word cannot identify. */
  detectFile?: (head: string) => DetectionResult | null;
}): SiteParser {
  return {
    siteId: opts.siteId,
    displayName: opts.displayName,
    status: 'stable',

    normalizeText: (raw: string) => normalizeSource(raw),

    detect(sample: string): DetectionResult {
      const head = sample.slice(0, 8192);
      if (opts.detectFile) {
        const own = opts.detectFile(head);
        if (own) return own;
      }
      const brands = brandsIn(head);
      const mine = brands.find(opts.matches);
      if (mine === undefined) {
        return { confidence: 0, reason: `no ${opts.displayName} header line` };
      }
      // A hand's body must look like this format too, so that a room merely
      // named in a chat line cannot claim the file.
      const structural = /^\*\*\* (?:HOLE CARDS|SUMMARY) \*\*\*/m.test(head)
        || /^Table\s+'.+?'.*Seat #\d+ is the button/m.test(head);
      if (!structural) {
        return { confidence: 0.2, reason: 'header matched but no PokerStars-format body' };
      }
      return { confidence: opts.confidence, reason: opts.reason(mine) };
    },

    splitHands: splitPokerStarsHands,

    parseHand(source: string, ctx: ParseContext): ParseResult<Hand> {
      return parsePokerStarsHand(source, ctx, opts.siteId, opts.family ?? 'pokerstars');
    },
  };
}

export const pokerstarsParser = createPokerStarsFamilyParser({
  siteId: 'pokerstars',
  displayName: 'PokerStars',
  confidence: 0.99,
  matches: (b) => normalizeBrand(b) === 'pokerstars',
  reason: () => 'PokerStars header line',
});

export const coinpokerParser = createPokerStarsFamilyParser({
  siteId: 'coinpoker',
  displayName: 'CoinPoker',
  confidence: 0.99,
  matches: (b) => normalizeBrand(b) === 'coinpoker',
  reason: () => 'CoinPoker header line (PokerStars format)',
});

export const wptGlobalParser = createPokerStarsFamilyParser({
  siteId: 'wpt-global',
  displayName: 'WPT Global',
  confidence: 0.99,
  matches: (b) => normalizeBrand(b) === 'wptglobal' || normalizeBrand(b) === 'wpt',
  reason: () => 'WPT Global header line (PokerStars format)',
});

/**
 * GGPoker (and its skins) write this same grammar, but their header brand word
 * is the bare word "Poker" — which identifies nothing. What does identify them
 * is the hand-id prefix: RC for Rush & Cash, SG for Spin & Gold, TM for
 * tournaments, HD for regular cash.
 *
 * That prefix is why GGPoker is registered as its own parser rather than as
 * another brand entry: brand-word matching cannot see it. Its other
 * departures from the family — announcing the winner as "won (N)" in the
 * summary rather than "collected N" in the body, the Spin & Gold header, and
 * the prize-roll lines — are read by the shared body for every room, since
 * nothing else in the family emits a line that collides with them.
 */
export const ggpokerParser = createPokerStarsFamilyParser({
  siteId: 'ggpoker',
  displayName: 'GGPoker',
  confidence: 0.99,
  family: 'ggpoker',
  matches: () => false, // identified by hand-id prefix, never by brand word
  reason: () => 'GGPoker hand id prefix',
  detectFile(head: string): DetectionResult | null {
    const m = POKERSTARS.HEADER.exec(head);
    const handId = m?.[2];
    if (!handId || !POKERSTARS.GG_HAND_ID.test(handId)) return null;
    const structural = /^\*\*\* (?:HOLE CARDS|SUMMARY) \*\*\*/m.test(head)
      || /^Table\s+'.+?'.*Seat #\d+ is the button/m.test(head);
    if (!structural) return { confidence: 0.2, reason: 'GG-style hand id but no matching body' };
    return { confidence: 0.99, reason: `GGPoker hand id "${handId}"` };
  },
});

/**
 * The fallback: a room this project has never heard of, writing the PokerStars
 * format.
 *
 * Its confidence sits below every real parser's so that argmax can never hand
 * it a file a genuine parser wants — it wins only when nothing else scores at
 * all, which is exactly the requested "assume PokerStars format" behavior.
 */
export const pokerstarsLikeParser = createPokerStarsFamilyParser({
  siteId: 'pokerstars-like',
  displayName: 'Other',
  confidence: 0.55,
  matches: (b) => !isKnownBrand(b),
  reason: (b) => `unrecognized room "${b}" using the PokerStars format`,
});
