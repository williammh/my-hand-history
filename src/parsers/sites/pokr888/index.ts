import {
  asAmount, type Amount, type AnteType, type CurrencyCode, type MoneyContext,
} from '@/domain/money';
import { parseCardList, type Card, type HoleCards } from '@/domain/cards';
import { derivePositions, type Street } from '@/domain/position';
import type { Action, ActionKind } from '@/domain/action';
import { computePots, type PotAward } from '@/domain/pot';
import type {
  GameMode, GameVariant, Hand, HandMeta, ParseWarning, PlayerSeat, Showdown,
  StreetState, TournamentInfo,
} from '@/domain/hand';
import type { DetectionResult, ParseContext, ParseResult, SiteParser } from '@/parsers/types';
import { CommitmentLedger } from '@/parsers/shared/commitment-ledger';
import { normalizeSource } from '@/parsers/shared/text';
import { WarningCode, warn, fail } from '@/parsers/shared/warnings';
import { P888, parseCents, parseNumeric } from './patterns';

const SITE_ID = '888poker' as const;

/**
 * AMOUNT SEMANTICS — the one thing this format gets right that the others do
 * not: EVERY bracketed amount is a DELTA, the chips added by that action.
 * "raises [550]" adds 550 on top of whatever the player already had out; it is
 * not the "raise to" total that PokerStars and Winamax print.
 *
 * This was not guessed. All six combinations of (raise, call) x (delta, total)
 * were replayed against the eight hands of the Pacific sample and checked
 * against each hand's printed "collected" figure. Delta/delta is the only
 * reading that reconciles all eight; the nearest rival (raise-as-total) misses
 * two hands by exactly one player's contribution:
 *
 *   hand 778483160  delta 1156 = printed 1156   |  total-reading 1056
 *   hand 778483258  delta 1389 = printed 1389   |  total-reading 1289
 *
 * Reading a raise as a total here would understate the raiser's commitment by
 * whatever they had already put in, which is exactly the error that makes
 * pot-odds verdicts wrong. The pot checksum test guards this permanently.
 */

interface Block {
  street: Street;
  /** Only the NEW cards for this street — 888 does not reprint the board. */
  boardText: string | null;
  lines: string[];
}

/** Lines of the per-hand header block, which `parseHand` reads by pattern. */
function isHeaderLine(trimmed: string): boolean {
  return (
    P888.GAME_NO.test(trimmed)
    || P888.BANNER.test(trimmed)
    || P888.STAKES_LINE.test(trimmed)
    || P888.TOURNAMENT_LINE.test(trimmed)
    || P888.TABLE_LINE.test(trimmed)
    || P888.BUTTON.test(trimmed)
    || P888.PLAYER_COUNT.test(trimmed)
  );
}

interface Sections {
  seats: string[];
  blocks: Block[];
  summary: string[];
  /** "Dealt to" lines, wherever they appear. */
  dealt: string[];
}

/**
 * Splits one hand into its seat list, street blocks, and summary.
 *
 * Antes and blinds precede "** Dealing down cards **" with no marker of their
 * own, so they are buffered into the preflop block. Opening a separate street
 * for them would double-apply `ledger.nextStreet()` and corrupt every later
 * street total.
 */
function splitSections(lines: readonly string[]): Sections {
  const out: Sections = { seats: [], blocks: [], summary: [], dealt: [] };
  const preflopPosts: string[] = [];
  let inSummary = false;
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (P888.SUMMARY.test(trimmed)) { inSummary = true; continue; }
    if (inSummary) { out.summary.push(line); continue; }

    if (P888.DEALT.test(trimmed)) { out.dealt.push(line); continue; }

    if (P888.DEALING_DOWN.test(trimmed)) {
      out.blocks.push({ street: 'preflop', boardText: null, lines: [...preflopPosts] });
      started = true;
      continue;
    }

    const ds = P888.DEALING_STREET.exec(trimmed);
    if (ds) {
      out.blocks.push({
        street: ds[1]!.toLowerCase() as Street,
        boardText: ds[2] ?? null,
        lines: [],
      });
      started = true;
      continue;
    }

    if (P888.SEAT.test(trimmed) && !started) { out.seats.push(line); continue; }

    if (!started) {
      // The header block is parsed separately, by pattern, from the whole
      // source; skipping those lines here is what keeps them from being
      // mistaken for forced bets. Everything else above the deal IS a forced
      // bet, so it is buffered into the preflop block.
      if (isHeaderLine(trimmed)) continue;
      preflopPosts.push(line);
      continue;
    }

    const block = out.blocks[out.blocks.length - 1];
    if (block) block.lines.push(line);
  }

  return out;
}

const VERB_TO_KIND: Record<string, ActionKind> = {
  'posts ante': 'post-ante',
  'posts small blind': 'post-sb',
  'posts big blind': 'post-bb',
  'posts dead blind': 'post-dead',
  folds: 'fold',
  checks: 'check',
  calls: 'call',
  bets: 'bet',
  raises: 'raise',
  allin: 'raise',
  'all-in': 'raise',
  'all in': 'raise',
};

/** "02 08 2026 09:01:09" is day-first, unlike the PokerStars family. */
function toIsoDate(d: string, mo: string, y: string, h: string, mi: string, s: string): string {
  const iso = `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:${s}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function detectVariant(gameType: string): GameVariant {
  const g = gameType.toLowerCase();
  if (/omaha/.test(g)) return /5|five/.test(g) ? 'plo5' : 'plo';
  if (/holdem|hold\s*'?em/.test(g)) return /no limit/.test(g) ? 'nlhe' : 'limit-holdem';
  return 'unknown';
}

export const pokr888Parser: SiteParser = {
  siteId: SITE_ID,
  displayName: '888poker',
  status: 'stable',

  normalizeText: (raw: string) => normalizeSource(raw),

  detect(sample: string): DetectionResult {
    const head = sample.slice(0, 8192);
    const banner = P888.BANNER.exec(head);
    if (banner) {
      // The banner names the brand: 888poker and PacificPoker share this format
      // and this parser, since Pacific is 888's own skin.
      return { confidence: 0.99, reason: `${banner[1]} hand history banner` };
    }
    if (P888.GAME_NO.test(head) && P888.DEALING_DOWN.test(head)) {
      return { confidence: 0.85, reason: '#Game No header with 888-style dealing lines' };
    }
    return { confidence: 0, reason: 'no 888poker markers' };
  },

  splitHands(text: string): readonly string[] {
    return text
      .split(P888.HAND_SEPARATOR)
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && /^#Game No\s*:/.test(c));
  },

  parseHand(source: string, ctx: ParseContext): ParseResult<Hand> {
    const warnings: ParseWarning[] = [];
    const lines = source.split('\n');

    // ---- identity -----------------------------------------------------------
    const gameNo = P888.GAME_NO.exec(source);
    const banner = P888.BANNER.exec(source);
    const handId = gameNo?.[1] ?? banner?.[2];
    if (!handId) {
      return { ok: false, errors: [fail(WarningCode.MISSING_HAND_ID, 'No "#Game No" line found')] };
    }

    // ---- stakes and date ----------------------------------------------------
    const sl = P888.STAKES_LINE.exec(source);
    if (!sl) {
      return { ok: false, errors: [fail(WarningCode.MISSING_HEADER, 'No blinds/date line found')] };
    }
    const [, curSymbol, sbRaw, bbRaw, gameType, dd, mm, yyyy, hh, mi, ss] = sl;

    const tourney = P888.TOURNAMENT_LINE.exec(source);
    // Currency on the blinds line is what separates a cash game from a
    // tournament: tournament blinds are bare chip counts.
    const isCash = curSymbol !== undefined && tourney === null;
    const gameMode: GameMode = isCash ? 'cash' : 'tournament';

    const toAmt = (raw: string | undefined): number =>
      isCash ? (parseCents(raw) ?? 0) : Math.round(parseNumeric(raw) ?? 0);

    const smallBlind = asAmount(toAmt(sbRaw));
    let bigBlind = asAmount(toAmt(bbRaw));
    if (bigBlind <= 0) {
      warnings.push(warn(WarningCode.BLIND_ANOMALY, `Unparseable big blind "${bbRaw}"`));
      bigBlind = asAmount(0);
    }

    const currency: CurrencyCode = isCash
      ? (curSymbol === '€' ? 'EUR' : curSymbol === '£' ? 'GBP' : 'USD')
      : 'CHIPS';

    // ---- table --------------------------------------------------------------
    let tableName: string | null = null;
    let maxSeats: number | null = null;
    if (tourney) {
      tableName = tourney[3] ? `Table #${tourney[3]}` : null;
      maxSeats = tourney[4] ? Number(tourney[4]) : null;
    } else {
      const tl = P888.TABLE_LINE.exec(source);
      if (tl) {
        tableName = tl[1]?.trim() ?? null;
        maxSeats = tl[2] ? Number(tl[2]) : null;
      }
    }

    const declaredButton = P888.BUTTON.exec(source);
    const buttonDeclared = declaredButton ? Number(declaredButton[1]) : null;

    // ---- sections -----------------------------------------------------------
    const sections = splitSections(lines);

    // ---- seats --------------------------------------------------------------
    interface RawSeat { seat: number; name: string; stack: Amount }
    const rawSeats: RawSeat[] = [];
    for (const line of sections.seats) {
      const m = P888.SEAT.exec(line.trim());
      if (!m) {
        warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed seat line', { rawLine: line }));
        continue;
      }
      rawSeats.push({ seat: Number(m[1]), name: m[2]!.trim(), stack: asAmount(toAmt(m[3])) });
    }
    if (rawSeats.length === 0) {
      return { ok: false, errors: [fail(WarningCode.NO_PLAYERS, 'No seats parsed')] };
    }

    const byName = new Map(rawSeats.map((s) => [s.name, s]));
    const playerId = (name: string) => name.toLowerCase();

    let buttonSeat = buttonDeclared ?? -1;
    if (buttonSeat < 0 || !rawSeats.some((s) => s.seat === buttonSeat)) {
      const sorted = [...rawSeats].sort((a, b) => a.seat - b.seat);
      const before = sorted.filter((s) => s.seat < (buttonDeclared ?? Infinity));
      buttonSeat = (before.length > 0 ? before[before.length - 1]! : sorted[sorted.length - 1]!).seat;
      warnings.push(warn(
        WarningCode.NO_BUTTON,
        buttonDeclared === null
          ? 'No button line; assumed nearest seat'
          : `Button seat ${buttonDeclared} is not occupied; assumed seat ${buttonSeat}`,
      ));
    }

    const derived = derivePositions({ seats: rawSeats.map((s) => s.seat), buttonSeat });

    // ---- hero ---------------------------------------------------------------
    const holeCardsByName = new Map<string, HoleCards>();
    let heroName: string | null = null;
    for (const line of sections.dealt) {
      const m = P888.DEALT.exec(line.trim());
      if (!m) continue;
      const cards = parseCardList(m[2]!);
      if (!cards || cards.length < 2) {
        warnings.push(warn(WarningCode.BAD_CARD, `Unparseable hole cards "${m[2]}"`, { rawLine: line }));
        continue;
      }
      holeCardsByName.set(m[1]!.trim(), [cards[0]!, cards[1]!]);
      heroName = m[1]!.trim();
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
      sittingOut: false,
    }));

    const heroSeat = seats.find((s) => s.isHero)?.seat ?? null;

    // ---- action -------------------------------------------------------------
    const ledger = new CommitmentLedger(new Map(seats.map((s) => [s.seat, s.startingStack])));
    const actions: Action[] = [];
    const streetStates: StreetState[] = [];
    const showdown: Showdown[] = [];
    const folded = new Set<number>();
    let board: Card[] = [];
    let actionIndex = 0;
    let antePosts = 0;

    const potSoFar = () => actions.reduce(
      (acc, a) => acc + (a.kind === 'uncalled-return' ? -a.amount : a.amount), 0,
    );

    const recordShowdown = (seat: number, entry: Showdown) => {
      const existing = showdown.find((sd) => sd.seat === seat);
      if (existing) Object.assign(existing, entry);
      else showdown.push(entry);
    };

    for (const block of sections.blocks) {
      if (block.street !== 'preflop') {
        ledger.nextStreet();
        const newCards = block.boardText ? parseCardList(block.boardText) : null;
        if (newCards) board = [...board, ...newCards];
        else if (block.boardText) {
          warnings.push(warn(WarningCode.BAD_CARD, `Unparseable board "${block.boardText}"`));
        }
      }

      const boardAtStart: Card[] = [...board];
      const streetActions: Action[] = [];
      const potBefore = potSoFar();

      for (const line of block.lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const collected = P888.COLLECTED.exec(trimmed);
        if (collected) continue; // awards are read from the summary

        const shows = P888.SHOWS.exec(trimmed);
        if (shows) {
          const seat = byName.get(shows[1]!.trim());
          if (seat) {
            const cards = parseCardList(shows[2]!);
            recordShowdown(seat.seat, {
              seat: seat.seat,
              holeCards: cards && cards.length >= 2 ? [cards[0]!, cards[1]!] : null,
              mucked: false,
              handDescription: shows[3]?.trim() || null,
            });
          }
          continue;
        }

        if (P888.NO_SHOW.test(trimmed)) {
          const seat = byName.get(P888.NO_SHOW.exec(trimmed)![1]!.trim());
          if (seat) {
            recordShowdown(seat.seat, {
              seat: seat.seat, holeCards: null, mucked: true, handDescription: null,
            });
          }
          continue;
        }

        const m = P888.ACTION.exec(trimmed);
        if (!m) {
          if (!P888.NOISE.test(trimmed)) {
            warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed action line', { rawLine: line }));
          }
          continue;
        }

        const name = m[1]!.trim();
        const seat = byName.get(name);
        if (!seat) {
          warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Action by unknown player "${name}"`, { rawLine: line }));
          continue;
        }
        const verb = m[2]!.toLowerCase();
        const kind = VERB_TO_KIND[verb];
        if (!kind) {
          warnings.push(warn(WarningCode.UNKNOWN_ACTION_VERB, `Unknown verb "${m[2]}"`, { rawLine: line }));
          continue;
        }
        if (folded.has(seat.seat)) {
          warnings.push(warn(WarningCode.ACTION_AFTER_FOLD, `${name} acts after folding`, { rawLine: line }));
        }

        let amount = asAmount(0);
        let totalCommitted = ledger.committedThisStreet(seat.seat);
        let isAllIn = /^all/i.test(verb);

        if (kind === 'post-ante') {
          antePosts += 1;
          const raw = toAmt(m[3]);
          const res = ledger.applyAnte(seat.seat, asAmount(raw));
          amount = asAmount(raw);
          totalCommitted = asAmount(0); // antes are not street commitment
          isAllIn = isAllIn || res.isAllIn;
        } else if (kind !== 'fold' && kind !== 'check') {
          // Every bracketed amount in this format is a delta — see the note at
          // the top of this file for the evidence.
          const raw = toAmt(m[3]);
          if (raw > 0) {
            const res = ledger.applyDelta(seat.seat, asAmount(raw));
            amount = asAmount(raw);
            totalCommitted = res.totalCommitted;
            isAllIn = isAllIn || res.isAllIn;
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

    // ---- uncalled bet -------------------------------------------------------
    // 888 never prints "Uncalled bet returned", but the chips are returned all
    // the same: a lone player left with more out than anyone else gets the
    // excess back. Without synthesizing it the pot overstates by that excess
    // and every checksum against "collected" fails.
    const lastStreet = streetStates[streetStates.length - 1];
    if (lastStreet) {
      const streetCommitted = new Map<number, number>();
      for (const a of lastStreet.actions) {
        if (a.kind === 'uncalled-return') continue;
        if (a.amount > 0) {
          streetCommitted.set(a.seat, (streetCommitted.get(a.seat) ?? 0) + a.amount);
        }
      }
      const sorted = [...streetCommitted.entries()].sort((a, b) => b[1] - a[1]);
      const top = sorted[0];
      const runnerUp = sorted[1]?.[1] ?? 0;
      if (top && top[1] > runnerUp) {
        const excess = asAmount(top[1] - runnerUp);
        const seatNo = top[0];
        const seat = rawSeats.find((s) => s.seat === seatNo);
        const action: Action = {
          index: actionIndex++,
          street: lastStreet.street,
          seat: seatNo,
          playerId: seat ? playerId(seat.name) : String(seatNo),
          kind: 'uncalled-return',
          amount: excess,
          totalCommitted: asAmount(Math.max(0, ledger.committedThisStreet(seatNo) - excess)),
          isAllIn: false,
          timestamp: null,
          raw: '(uncalled bet returned — synthesized; 888poker does not print this line)',
        };
        ledger.applyDelta(seatNo, asAmount(-excess));
        actions.push(action);
        // Keep the street slice and its running pot in step with the flat list.
        streetStates[streetStates.length - 1] = {
          ...lastStreet,
          actions: [...lastStreet.actions, action],
          potAtEnd: asAmount(lastStreet.potAtEnd - excess),
        };
      }
    }

    // ---- summary ------------------------------------------------------------
    const awards: PotAward[] = [];
    for (const line of sections.summary) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const collected = P888.COLLECTED.exec(trimmed);
      if (collected) {
        const seat = byName.get(collected[1]!.trim());
        if (!seat) {
          warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Collect by unknown player "${collected[1]}"`, { rawLine: line }));
          continue;
        }
        awards.push({
          potLevel: 0,
          seat: seat.seat,
          amount: asAmount(toAmt(collected[2])),
          handDescription: null,
        });
        continue;
      }

      const shows = P888.SHOWS.exec(trimmed);
      if (shows) {
        const seat = byName.get(shows[1]!.trim());
        if (seat) {
          const cards = parseCardList(shows[2]!);
          recordShowdown(seat.seat, {
            seat: seat.seat,
            holeCards: cards && cards.length >= 2 ? [cards[0]!, cards[1]!] : null,
            mucked: false,
            handDescription: shows[3]?.trim() || null,
          });
        }
        continue;
      }

      if (P888.NO_SHOW.test(trimmed)) {
        const seat = byName.get(P888.NO_SHOW.exec(trimmed)![1]!.trim());
        if (seat) {
          recordShowdown(seat.seat, {
            seat: seat.seat, holeCards: null, mucked: true, handDescription: null,
          });
        }
        continue;
      }

      if (P888.POT_LINE.test(trimmed) || P888.NOISE.test(trimmed)) continue;
      warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed summary line', { rawLine: line }));
    }

    // ---- money context ------------------------------------------------------
    const anteAmount = actions.find((a) => a.kind === 'post-ante')?.amount ?? asAmount(0);
    const anteType: AnteType = anteAmount <= 0
      ? 'none'
      : antePosts === 1 ? 'big-blind-ante' : 'per-player';

    const money: MoneyContext = {
      currency,
      exponent: isCash ? 2 : 0,
      bigBlind,
      smallBlind,
      ante: anteAmount,
      anteType,
    };

    // ---- tournament ---------------------------------------------------------
    let tournament: TournamentInfo | null = null;
    if (tourney) {
      const bm = P888.BUYIN.exec((tourney[2] ?? '').trim());
      const parts = bm
        ? [bm[1], bm[2], bm[3]].filter((x): x is string => x !== undefined).map((x) => parseCents(x) ?? 0)
        : [];
      const buyIn = parts.length > 0 ? parts[0]! : null;
      const fee = parts.length > 1 ? parts[parts.length - 1]! : null;
      const bounty = parts.length > 2 ? parts[1]! : 0;
      const label = (tourney[2] ?? '').trim();
      tournament = {
        tournamentId: tourney[1] ?? null,
        name: null, // the export prints the buy-in here, not the event name
        buyIn: buyIn === null ? null : asAmount(buyIn + bounty),
        fee: fee === null ? null : asAmount(fee),
        buyInCurrency: label.includes('€') ? 'EUR' : label.includes('£') ? 'GBP' : label.includes('$') ? 'USD' : null,
        level: null, // 888 does not print a level number
      };
    }

    const meta: HandMeta = {
      handId,
      siteId: SITE_ID,
      tableId: tourney?.[3] ?? null,
      tableName,
      playedAt: toIsoDate(dd!, mm!, yyyy!, hh!, mi!, ss!),
      timezoneNote: null, // the export stamps no timezone
      maxSeats,
      gameMode,
      variant: detectVariant(gameType ?? ''),
      tournament,
      rake: asAmount(0), // not printed in this format
      sourceFile: ctx.fileName,
    };

    // 888 prints no "Total pot" line. The awarded chips are the closest thing
    // to a site-reported total, and — because rake is not printed either — they
    // equal the contested pot exactly, which is what makes the checksum work.
    const reportedTotal = awards.length > 0
      ? awards.reduce((acc, a) => acc + a.amount, 0)
      : null;

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

    return { ok: true, value: hand, warnings };
  },
};
