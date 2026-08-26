import { asAmount, type Amount, type MoneyContext, type AnteType, type CurrencyCode } from '@/domain/money.js';
import { parseCardList, type Card, type HoleCards } from '@/domain/cards.js';
import { derivePositions, STREET_ORDER, type Street } from '@/domain/position.js';
import type { Action, ActionKind } from '@/domain/action.js';
import { CHIP_MOVING } from '@/domain/action.js';
import { computePots } from '@/domain/pot.js';
import type {
  GameMode, Hand, HandMeta, ParseWarning, PlayerSeat, Showdown, StreetState, TournamentInfo,
} from '@/domain/hand.js';
import type { PotAward } from '@/domain/pot.js';
import type { DetectionResult, ParseContext, ParseResult, SiteParser } from '@/parsers/types.js';
import { CommitmentLedger } from '@/parsers/shared/commitment-ledger.js';
import { normalizeSource } from '@/parsers/shared/text.js';
import { WarningCode, warn, fail } from '@/parsers/shared/warnings.js';
import { WINAMAX, parseNumeric, parseCents, SECTION_TO_STREET } from './patterns.js';

const SITE_ID = 'winamax' as const;

interface Sections {
  players: string[];
  dealt: string[];
  showdown: string[];
  summary: string[];
  streets: { street: Street; boardText: string | null; lines: string[] }[];
  unknown: ParseWarning[];
}

/**
 * Splits a hand into its *** SECTION *** blocks. The header/table lines are
 * consumed separately before this runs.
 *
 * ANTE/BLINDS posts precede *** PRE-FLOP *** as their own section, but they
 * are still preflop street action — they are buffered and prepended to the
 * preflop block once it opens, rather than becoming a second "preflop" entry
 * in `streets` (which would double-apply ledger.nextStreet() and corrupt
 * street-commitment tracking for every later raise).
 */
function splitSections(lines: string[]): Sections {
  const out: Sections = {
    players: [], dealt: [], showdown: [], summary: [], streets: [], unknown: [],
  };
  let current: string | null = null;
  let anteBlindsLines: string[] = [];

  lines.forEach((line, i) => {
    const m = WINAMAX.SECTION.exec(line.trim());
    if (m) {
      const name = m[1]!.trim().toUpperCase();
      current = name;
      const street = SECTION_TO_STREET[name as keyof typeof SECTION_TO_STREET];
      if (street) {
        // Board text is the LAST bracket group on the line: flop has one
        // "[Ks Jd Ad]", turn/river have two "[board][new]" — take the new one
        // if present, else the only one.
        const brackets = [...line.matchAll(/\[([^\]]*)\]/g)].map((b) => b[1] ?? '');
        const boardText = brackets.length > 0 ? brackets[brackets.length - 1]! : null;
        const initialLines = street === 'preflop' ? anteBlindsLines : [];
        out.streets.push({ street, boardText, lines: initialLines });
      } else if (!['ANTE/BLINDS', 'SHOW DOWN', 'SUMMARY'].includes(name)) {
        out.unknown.push(
          warn(WarningCode.UNPARSED_LINE, `Unknown section "${name}"`, { lineNumber: i + 1, rawLine: line }),
        );
      }
      return;
    }
    if (!line.trim()) return;

    switch (current) {
      case 'SHOW DOWN': out.showdown.push(line); break;
      case 'SUMMARY': out.summary.push(line); break;
      case 'ANTE/BLINDS':
      case null:
        // Player/table lines precede ANTE/BLINDS; "Dealt to" also lands here.
        if (WINAMAX.DEALT.test(line.trim())) out.dealt.push(line);
        else if (WINAMAX.SEAT.test(line.trim())) out.players.push(line);
        else if (current === 'ANTE/BLINDS') anteBlindsLines.push(line);
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
  'posts big blind': 'post-bb',
  'posts ante': 'post-ante',
  'posts dead blind': 'post-dead',
  posts: 'post-dead',
  folds: 'fold',
  checks: 'check',
  calls: 'call',
  bets: 'bet',
  raises: 'raise',
};

function toIsoDate(raw: string | undefined): string {
  if (!raw) return new Date(0).toISOString();
  const m = WINAMAX.DATE_TIME.exec(raw.trim());
  if (!m) return new Date(0).toISOString();
  const [, y, mo, d, h, mi, s] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString();
}

export const winamaxParser: SiteParser = {
  siteId: SITE_ID,
  displayName: 'Winamax',
  status: 'stable',

  normalizeText(raw: string): string {
    return normalizeSource(raw);
  },

  detect(sample: string): DetectionResult {
    const head = sample.slice(0, 4096);
    if (/^Winamax Poker\s*-/m.test(head)) {
      return { confidence: 0.99, reason: 'Winamax Poker header line' };
    }
    return { confidence: 0, reason: 'no Winamax markers' };
  },

  splitHands(text: string): readonly string[] {
    return text
      .split(WINAMAX.HAND_SEPARATOR)
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && c.startsWith('Winamax Poker'));
  },

  parseHand(source: string, ctx: ParseContext): ParseResult<Hand> {
    const warnings: ParseWarning[] = [];
    const lines = source.split('\n');

    if (lines.length === 0) {
      return { ok: false, errors: [fail(WarningCode.MISSING_HEADER, 'Empty hand chunk')] };
    }

    // ---- header line ---------------------------------------------------------
    const headerLine = lines.find((l) => WINAMAX.HEADER.test(l.trim()));
    const hm = headerLine ? WINAMAX.HEADER.exec(headerLine.trim()) : null;
    if (!hm) {
      return { ok: false, errors: [fail(WarningCode.MISSING_HEADER, 'No Winamax header line found')] };
    }
    const [, gameModeRaw, tourneyLabel, handId, gameTypeRaw, stakesRaw, dateRaw] = hm;
    if (!handId) {
      return { ok: false, errors: [fail(WarningCode.MISSING_HAND_ID, 'Header has no HandId')] };
    }

    // ---- table line ------------------------------------------------------------
    const tableLine = lines.find((l) => WINAMAX.TABLE.test(l.trim()));
    const tm = tableLine ? WINAMAX.TABLE.exec(tableLine.trim()) : null;
    const tableName = tm?.[1] ?? null;
    const maxSeats = tm?.[2] ? Number(tm[2]) : null;
    const buttonSeatDeclared = tm?.[4] ? Number(tm[4]) : null;

    // ---- game mode / money context ---------------------------------------------
    const gameMode: GameMode = gameModeRaw === 'CashGame' ? 'cash' : 'tournament';

    const bm = WINAMAX.BLINDS_BLOCK.exec((stakesRaw ?? '').trim());
    const isCash = gameMode === 'cash';
    const toAmt = (raw: string | undefined) =>
      isCash ? (parseCents(raw) ?? 0) : Math.round(parseNumeric(raw) ?? 0);

    const smallBlind = asAmount(toAmt(bm?.[1]));
    let bigBlind = asAmount(toAmt(bm?.[2]));
    let anteAmount = asAmount(toAmt(bm?.[3]));
    if (bigBlind <= 0) {
      warnings.push(warn(WarningCode.BLIND_ANOMALY, `Unparseable blinds "${stakesRaw}"`));
      bigBlind = asAmount(0);
    }
    // Tournament stakes sometimes read "level, SB/BB" with no third ante field —
    // the ante (if any) is posted explicitly per-player and picked up from the
    // ANTE/BLINDS section instead, so a missing third group is not an error.
    if (!bm?.[3]) anteAmount = asAmount(0);

    const anteType: AnteType = anteAmount > 0 ? 'per-player' : 'none';

    const money: MoneyContext = {
      currency: (isCash ? 'EUR' : 'CHIPS') as CurrencyCode,
      exponent: isCash ? 2 : 0,
      bigBlind, smallBlind, ante: anteAmount, anteType,
    };

    // ---- sections ----------------------------------------------------------
    const bodyStart = tableLine ? lines.indexOf(tableLine) + 1 : lines.indexOf(headerLine!) + 1;
    const sections = splitSections(lines.slice(bodyStart));
    warnings.push(...sections.unknown);

    // ---- seats ---------------------------------------------------------------
    interface RawSeat { seat: number; name: string; stack: Amount }
    const rawSeats: RawSeat[] = [];
    for (const line of sections.players) {
      const m = WINAMAX.SEAT.exec(line.trim());
      if (!m) {
        warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed seat line', { rawLine: line }));
        continue;
      }
      rawSeats.push({
        seat: Number(m[1]),
        name: m[2]!.trim(),
        stack: asAmount(toAmt(m[3])),
      });
    }

    if (rawSeats.length === 0) {
      return { ok: false, errors: [fail(WarningCode.NO_PLAYERS, 'No seats parsed')] };
    }

    const byName = new Map(rawSeats.map((s) => [s.name, s]));
    const playerId = (name: string) => name.toLowerCase();

    let buttonSeat = buttonSeatDeclared ?? -1;
    if (buttonSeat < 0 || !rawSeats.some((s) => s.seat === buttonSeat)) {
      const sorted = [...rawSeats].sort((a, b) => a.seat - b.seat);
      buttonSeat = sorted[0]!.seat;
      warnings.push(warn(WarningCode.NO_BUTTON, 'No button declared in table line; assumed lowest seat'));
    }

    const derived = derivePositions({ seats: rawSeats.map((s) => s.seat), buttonSeat });

    // ---- hole cards (hero only — Winamax's "Dealt to" line) -------------------
    const holeCardsByName = new Map<string, HoleCards>();
    let heroName: string | null = null;
    for (const line of sections.dealt) {
      const m = WINAMAX.DEALT.exec(line.trim());
      if (!m) continue;
      const cards = parseCardList(m[2]!);
      if (!cards || cards.length !== 2) {
        warnings.push(warn(WarningCode.BAD_CARD, `Unparseable hole cards "${m[2]}"`, { rawLine: line }));
        continue;
      }
      const name = m[1]!.trim();
      holeCardsByName.set(name, [cards[0]!, cards[1]!]);
      heroName = name;
    }

    const seats: PlayerSeat[] = rawSeats.map((s) => {
      const position = derived.get(s.seat) ?? 'BTN';
      return {
        seat: s.seat,
        name: s.name,
        playerId: playerId(s.name),
        startingStack: s.stack,
        position,
        declaredPosition: null,
        isButton: s.seat === buttonSeat,
        isHero: s.name === heroName,
        holeCards: holeCardsByName.get(s.name) ?? null,
        sittingOut: false,
      };
    });

    const heroSeat = seats.find((s) => s.isHero)?.seat ?? null;

    // ---- actions -----------------------------------------------------------
    const ledger = new CommitmentLedger(new Map(seats.map((s) => [s.seat, s.startingStack])));
    const actions: Action[] = [];
    const streetStates: StreetState[] = [];
    const showdown: Showdown[] = [];
    const folded = new Set<number>();
    let board: Card[] = [];
    let actionIndex = 0;

    for (const block of sections.streets) {
      if (block.street !== 'preflop') {
        ledger.nextStreet();
        const newCards = block.boardText ? parseCardList(block.boardText) : null;
        if (newCards) {
          // Winamax prints the FULL cumulative board on flop, but only the
          // latest card(s) on turn/river when two bracket groups are present
          // (the SECTION regex already selected the last group above, which
          // for turn/river is the single new card).
          if (block.street === 'flop') board = newCards;
          else board = [...board, ...newCards];
        } else if (block.boardText) {
          warnings.push(warn(WarningCode.BAD_CARD, `Unparseable board "${block.boardText}"`));
        }
      }

      const boardAtStreetStart: Card[] = [...board];
      const streetActions: Action[] = [];
      const potBefore = actions.reduce(
        (acc, a) => acc + (a.kind === 'uncalled-return' ? -a.amount : a.amount), 0,
      );

      for (const line of block.lines) {
        const trimmed = line.trim();

        const uncalled = WINAMAX.UNCALLED_RETURN.exec(trimmed);
        if (uncalled) {
          const name = uncalled[1]!.trim();
          const seat = byName.get(name);
          if (!seat) {
            warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Uncalled return to unknown player "${name}"`, { rawLine: line }));
            continue;
          }
          const amt = asAmount(toAmt(uncalled[2]));
          const action: Action = {
            index: actionIndex++,
            street: block.street,
            seat: seat.seat,
            playerId: playerId(name),
            kind: 'uncalled-return',
            amount: amt,
            totalCommitted: asAmount(ledger.committedThisStreet(seat.seat) - amt),
            isAllIn: false,
            timestamp: null,
            raw: trimmed,
          };
          ledger.applyDelta(seat.seat, asAmount(-amt));
          actions.push(action);
          streetActions.push(action);
          continue;
        }

        if (WINAMAX.COLLECTED.test(trimmed) || WINAMAX.DOES_NOT_SHOW.test(trimmed)) continue;

        const showLine = WINAMAX.SHOW_LINE.exec(trimmed);
        if (showLine) {
          const name = showLine[1]!.trim();
          const seat = byName.get(name);
          if (!seat) {
            warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Show line names unknown player "${name}"`, { rawLine: line }));
            continue;
          }
          const cards = parseCardList(showLine[2]!);
          showdown.push({
            seat: seat.seat,
            holeCards: cards && cards.length === 2 ? [cards[0]!, cards[1]!] : null,
            mucked: false,
            handDescription: showLine[3]?.trim() ?? null,
          });
          continue;
        }

        const m = WINAMAX.ACTION.exec(trimmed);
        if (!m) {
          warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed action line', { rawLine: line }));
          continue;
        }
        const [, nameRaw, verb, amountRaw, toAmountRaw, tail] = m;
        const name = nameRaw!.trim();
        const seat = byName.get(name);
        if (!seat) {
          warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Action by unknown player "${name}"`, { rawLine: line }));
          continue;
        }
        const kind = VERB_TO_KIND[verb!];
        if (!kind) {
          warnings.push(warn(WarningCode.UNKNOWN_ACTION_VERB, `Unknown verb "${verb}"`, { rawLine: line }));
          continue;
        }

        if (folded.has(seat.seat)) {
          warnings.push(warn(WarningCode.ACTION_AFTER_FOLD, `${name} acts after folding`, { rawLine: line }));
        }

        const explicitAllIn = WINAMAX.ALL_IN.test(tail ?? '');
        let amount = asAmount(0);
        let totalCommitted = ledger.committedThisStreet(seat.seat);
        let isAllIn = explicitAllIn;

        if (kind === 'post-ante') {
          const rawAmount = toAmt(amountRaw);
          const res = ledger.applyAnte(seat.seat, asAmount(rawAmount));
          amount = asAmount(rawAmount);
          totalCommitted = asAmount(0); // antes are not street commitment
          isAllIn = explicitAllIn || res.isAllIn;
        } else if (kind === 'raise') {
          // "raises DELTA to TOTAL" — Winamax prints both; trust TOTAL as the
          // absolute street commitment and reconcile via the ledger.
          const totalRaw = toAmt(toAmountRaw);
          const res = ledger.applyTotal(seat.seat, asAmount(totalRaw));
          amount = res.delta;
          totalCommitted = res.totalCommitted;
          isAllIn = explicitAllIn || res.isAllIn;
        } else if (kind === 'fold' || kind === 'check') {
          // no chips move
        } else {
          const rawAmount = toAmt(amountRaw);
          if (rawAmount > 0) {
            const res = ledger.applyDelta(seat.seat, asAmount(rawAmount));
            amount = asAmount(rawAmount);
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

      const potAfter = actions.reduce(
        (acc, a) => acc + (a.kind === 'uncalled-return' ? -a.amount : a.amount), 0,
      );

      streetStates.push({
        street: block.street,
        newCards: block.street === 'preflop'
          ? []
          : boardAtStreetStart.slice(Math.max(0, boardAtStreetStart.length - (block.street === 'flop' ? 3 : 1))),
        board: boardAtStreetStart,
        actions: streetActions,
        potAtStart: asAmount(potBefore),
        potAtEnd: asAmount(potAfter),
      });
    }

    // ---- showdown section (*** SHOW DOWN ***) ---------------------------------
    for (const line of sections.showdown) {
      const trimmed = line.trim();
      const m = WINAMAX.SHOW_LINE.exec(trimmed);
      if (!m) {
        if (WINAMAX.DOES_NOT_SHOW.test(trimmed)) continue;
        warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed showdown line', { rawLine: line }));
        continue;
      }
      const name = m[1]!.trim();
      const seat = byName.get(name);
      if (!seat) {
        warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Showdown names unknown player "${name}"`, { rawLine: line }));
        continue;
      }
      const cards = parseCardList(m[2]!);
      if (!cards || cards.length !== 2) {
        warnings.push(warn(WarningCode.BAD_CARD, `Unparseable showdown cards "${m[2]}"`, { rawLine: line }));
        continue;
      }
      const existing = showdown.find((sd) => sd.seat === seat.seat);
      const entry: Showdown = {
        seat: seat.seat,
        holeCards: [cards[0]!, cards[1]!],
        mucked: false,
        handDescription: m[3]?.trim() ?? null,
      };
      if (existing) Object.assign(existing, entry);
      else showdown.push(entry);
    }

    // ---- summary -----------------------------------------------------------
    const awards: PotAward[] = [];
    let reportedTotal: number | null = null;
    let reportedRake: number | null = null;
    for (const line of sections.summary) {
      const trimmed = line.trim();

      const tm2 = WINAMAX.SUMMARY_TOTAL.exec(trimmed);
      if (tm2) {
        // Winamax's printed "Total pot" is NET of rake (0.58€ pot | 0.02€
        // rake means 0.60€ actually went in), unlike the domain model's
        // reportedTotalPot / validateHand checksum, which compares against
        // the GROSS chips moved in actions. Add rake back so the two agree.
        reportedRake = tm2[2] !== undefined ? toAmt(tm2[2]) : 0;
        reportedTotal = toAmt(tm2[1]) + reportedRake;
        continue;
      }
      if (WINAMAX.BOARD.test(trimmed)) continue;

      const sm = WINAMAX.SUMMARY_SEAT.exec(trimmed);
      if (!sm) continue;
      const [, , nameRaw, , verb, rest] = sm;
      const name = nameRaw!.trim();
      const seat = byName.get(name);
      if (!seat) {
        warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Summary names unknown player "${name}"`, { rawLine: line }));
        continue;
      }

      const restTrimmed = (rest ?? '').trim();
      const wonMatch = WINAMAX.SUMMARY_WON_AMOUNT.exec(restTrimmed);
      const showedMatch = WINAMAX.SUMMARY_SHOWED.exec(restTrimmed);

      if (verb!.toLowerCase() === 'showed' && showedMatch) {
        const cards = parseCardList(showedMatch[1]!);
        const existing = showdown.find((sd) => sd.seat === seat.seat);
        const entry: Showdown = {
          seat: seat.seat,
          holeCards: cards && cards.length === 2 ? [cards[0]!, cards[1]!] : null,
          mucked: false,
          handDescription: showedMatch[4]?.trim() ?? null,
        };
        if (existing) Object.assign(existing, entry);
        else showdown.push(entry);

        if (showedMatch[2]!.toLowerCase() === 'won' && showedMatch[3]) {
          awards.push({
            potLevel: 0,
            seat: seat.seat,
            amount: asAmount(toAmt(showedMatch[3])),
            handDescription: showedMatch[4]?.trim() ?? null,
          });
        }
        continue;
      }

      if (wonMatch) {
        awards.push({
          potLevel: 0,
          seat: seat.seat,
          amount: asAmount(toAmt(wonMatch[1])),
          handDescription: null,
        });
      }
    }

    // Multiple winners at the same pot level (split pots) are all level 0 —
    // Winamax does not print side-pot ordinals the way Betclic does within
    // this sample format, so awards are recorded as they are printed.

    const gameTypeStr = gameTypeRaw ?? '';
    const tlm = WINAMAX.TOURNAMENT_LABEL.exec((tourneyLabel ?? '').trim());
    const tournament: TournamentInfo | null = gameMode !== 'cash'
      ? {
          tournamentId: null,
          name: tlm?.[1]?.trim() || null,
          buyIn: tlm?.[2] !== undefined ? asAmount(parseCents(tlm[2]) ?? 0) : null,
          fee: tlm?.[3] !== undefined ? asAmount(parseCents(tlm[3]) ?? 0) : null,
          buyInCurrency: tlm?.[2] !== undefined ? 'EUR' : null,
          level: null,
        }
      : null;

    const meta: HandMeta = {
      handId,
      siteId: SITE_ID,
      tableId: null,
      tableName,
      playedAt: toIsoDate(dateRaw),
      timezoneNote: 'UTC',
      maxSeats,
      gameMode,
      variant: /hold\s*'?em/i.test(gameTypeStr) ? 'nlhe' : 'unknown',
      tournament,
      rake: asAmount(reportedRake ?? 0),
    };

    const hand: Hand = {
      id: `${SITE_ID}:${handId}`,
      meta,
      money,
      seats,
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

    void ctx;
    void STREET_ORDER;
    void CHIP_MOVING;
    return { ok: true, value: hand, warnings };
  },
};
