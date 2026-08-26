import { asAmount, type Amount, type MoneyContext, type AnteType, type CurrencyCode } from '@/domain/money.js';
import { parseCard, parseCardList, type Card, type HoleCards } from '@/domain/cards.js';
import { derivePositions, STREET_ORDER, type Position, type Street } from '@/domain/position.js';
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
import { BETCLIC, parseNumeric, SECTION_TO_STREET } from './patterns.js';
import { parseSeatTags } from './seat-tags.js';

const SITE_ID = 'betclic-fr' as const;

interface Sections {
  header: string[];
  players: string[];
  holeCards: string[];
  showdown: string[];
  summary: string[];
  streets: { street: Street; boardText: string | null; lines: string[] }[];
  unknown: ParseWarning[];
}

/** Splits a hand into its *** SECTION *** blocks, keeping line numbers for warnings. */
function splitSections(lines: string[]): Sections {
  const out: Sections = {
    header: [], players: [], holeCards: [], showdown: [], summary: [], streets: [], unknown: [],
  };
  let current: string | null = null;

  lines.forEach((line, i) => {
    const m = BETCLIC.SECTION.exec(line.trim());
    if (m) {
      const name = m[1]!.trim().toUpperCase();
      current = name;
      const street = SECTION_TO_STREET[name as keyof typeof SECTION_TO_STREET];
      if (street) out.streets.push({ street, boardText: m[2] ?? null, lines: [] });
      else if (!['HEADER', 'PLAYERS', 'HOLE CARDS', 'SHOWDOWN', 'SUMMARY'].includes(name)) {
        out.unknown.push(
          warn(WarningCode.UNPARSED_LINE, `Unknown section "${name}"`, { lineNumber: i + 1, rawLine: line }),
        );
      }
      return;
    }
    if (!line.trim()) return;

    switch (current) {
      case 'HEADER': out.header.push(line); break;
      case 'PLAYERS': out.players.push(line); break;
      case 'HOLE CARDS': out.holeCards.push(line); break;
      case 'SHOWDOWN': out.showdown.push(line); break;
      case 'SUMMARY': out.summary.push(line); break;
      default: {
        const s = out.streets[out.streets.length - 1];
        if (s) s.lines.push(line);
        break;
      }
    }
  });

  return out;
}

function parseHeaderFields(lines: string[]): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of lines) {
    const m = BETCLIC.HEADER_FIELD.exec(line.trim());
    if (m) fields.set(m[1]!.trim().toLowerCase(), m[2]!.trim());
  }
  return fields;
}

function toIsoDate(raw: string | undefined): { iso: string; tz: string | null } {
  if (!raw) return { iso: new Date(0).toISOString(), tz: null };
  const m = BETCLIC.DATE_TIME.exec(raw.trim());
  if (!m) return { iso: new Date(0).toISOString(), tz: null };
  const tz = m[3] ?? null;
  // Betclic stamps UTC explicitly; treat anything else as UTC too rather than
  // silently applying the viewer's local offset.
  return { iso: new Date(`${m[1]}T${m[2]}Z`).toISOString(), tz };
}

const VERB_TO_KIND: Record<string, ActionKind> = {
  'Posts Ante': 'post-ante',
  'Posts SB': 'post-sb',
  'Posts BB': 'post-bb',
  'Posts Dead': 'post-dead',
  'Posts Straddle': 'straddle',
  Folds: 'fold',
  Checks: 'check',
  Calls: 'call',
  Bets: 'bet',
  'Raises to': 'raise',
  Raises: 'raise',
  Shows: 'show',
  Mucks: 'muck',
  Returns: 'uncalled-return',
  Uncalled: 'uncalled-return',
};

/** Verbs whose amount is an absolute street total rather than a delta. */
const ABSOLUTE_VERBS = new Set(['Raises to']);

export const betclicParser: SiteParser = {
  siteId: SITE_ID,
  displayName: 'Betclic.fr',
  status: 'stable',

  normalizeText(raw: string): string {
    return normalizeSource(raw);
  },

  detect(sample: string): DetectionResult {
    const head = sample.slice(0, 4096);
    if (/^Site:\s*Betclic/im.test(head)) {
      return { confidence: 0.99, reason: 'Site: Betclic header field' };
    }
    if (/\*\*\* HEADER \*\*\*/.test(head) && /^Hand ID:/im.test(head)) {
      return { confidence: 0.45, reason: 'Betclic-style HEADER/Hand ID layout' };
    }
    return { confidence: 0, reason: 'no Betclic markers' };
  },

  splitHands(text: string): readonly string[] {
    return text
      .split(BETCLIC.HAND_SEPARATOR)
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && c.includes('*** HEADER ***'));
  },

  parseHand(source: string, ctx: ParseContext): ParseResult<Hand> {
    const warnings: ParseWarning[] = [];
    const errors: ParseWarning[] = [];
    const lines = source.split('\n');

    const sections = splitSections(lines);
    warnings.push(...sections.unknown);

    if (sections.header.length === 0) {
      return { ok: false, errors: [fail(WarningCode.MISSING_HEADER, 'No *** HEADER *** section')] };
    }

    const fields = parseHeaderFields(sections.header);
    const handId = fields.get('hand id');
    if (!handId) {
      return { ok: false, errors: [fail(WarningCode.MISSING_HAND_ID, 'Header has no Hand ID')] };
    }

    // ---- money context -----------------------------------------------------
    const blindsRaw = fields.get('blinds') ?? '';
    const bm = BETCLIC.BLINDS.exec(blindsRaw);
    const smallBlind = asAmount(Math.round(parseNumeric(bm?.[1]) ?? 0));
    const bigBlind = asAmount(Math.round(parseNumeric(bm?.[2]) ?? 0));
    if (bigBlind <= 0) {
      warnings.push(warn(WarningCode.BLIND_ANOMALY, `Unparseable blinds "${blindsRaw}"`));
    }

    // Sit & Go is checked first: its header also contains the word "tournament"
    // on some Betclic exports, so the broader test would swallow it.
    const gameModeRaw = fields.get('game mode') ?? '';
    const gameMode: GameMode =
      /sit\s*&?\s*go|sng/i.test(gameModeRaw) ? 'sit-n-go'
      : /tournament/i.test(gameModeRaw) ? 'tournament'
      : 'cash';
    if (gameModeRaw.trim() === '') {
      warnings.push(warn(WarningCode.UNPARSED_LINE, 'No "Game Mode" header; assuming cash game'));
    }
    const anteAmount = asAmount(Math.round(parseNumeric(fields.get('ante')) ?? 0));
    const anteType: AnteType = anteAmount > 0 ? 'per-player' : 'none';

    const money: MoneyContext = {
      currency: (gameMode === 'cash' ? 'EUR' : 'CHIPS') as CurrencyCode,
      exponent: gameMode === 'cash' ? 2 : 0,
      bigBlind, smallBlind, ante: anteAmount, anteType,
    };

    // ---- seats -------------------------------------------------------------
    interface RawSeat {
      seat: number; name: string; stack: Amount;
      declaredPosition: Position | null; isHero: boolean; sittingOut: boolean;
    }
    const rawSeats: RawSeat[] = [];
    for (const line of sections.players) {
      const m = BETCLIC.SEAT.exec(line.trim());
      if (!m) {
        warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed seat line', { rawLine: line }));
        continue;
      }
      const tags = parseSeatTags(m[4]);
      if (tags.unknownTokens.length) {
        warnings.push(warn(
          WarningCode.UNKNOWN_SEAT_TOKEN,
          `Unknown seat tokens: ${tags.unknownTokens.join(', ')}`,
          { rawLine: line },
        ));
      }
      rawSeats.push({
        seat: Number(m[1]),
        name: m[2]!.trim(),
        stack: asAmount(Math.round(parseNumeric(m[3]) ?? 0)),
        declaredPosition: tags.declaredPosition,
        isHero: tags.isHero,
        sittingOut: tags.sittingOut,
      });
    }

    if (rawSeats.length === 0) {
      return { ok: false, errors: [fail(WarningCode.NO_PLAYERS, 'No seats parsed')] };
    }

    const byName = new Map(rawSeats.map((s) => [s.name, s]));
    const playerId = (name: string) => name.toLowerCase();

    // The button may be declared, or inferred from the blinds when it is not.
    let buttonSeat = rawSeats.find((s) => s.declaredPosition === 'BTN')?.seat ?? -1;
    if (buttonSeat < 0) {
      const sb = rawSeats.find((s) => s.declaredPosition === 'SB');
      const sorted = [...rawSeats].sort((a, b) => a.seat - b.seat);
      if (sb) {
        // Button is the seat immediately before the small blind.
        const i = sorted.findIndex((s) => s.seat === sb.seat);
        buttonSeat = sorted[(i - 1 + sorted.length) % sorted.length]!.seat;
      } else {
        buttonSeat = sorted[0]!.seat;
        warnings.push(warn(WarningCode.NO_BUTTON, 'No button or SB declared; assumed lowest seat'));
      }
    }

    const derived = derivePositions({ seats: rawSeats.map((s) => s.seat), buttonSeat });

    // ---- hole cards --------------------------------------------------------
    const holeCardsByName = new Map<string, HoleCards>();
    for (const line of sections.holeCards) {
      const m = BETCLIC.HOLE_CARDS.exec(line.trim());
      if (!m) continue;
      const cards = parseCardList(m[2]!);
      if (!cards || cards.length !== 2) {
        warnings.push(warn(WarningCode.BAD_CARD, `Unparseable hole cards "${m[2]}"`, { rawLine: line }));
        continue;
      }
      holeCardsByName.set(m[1]!.trim(), [cards[0]!, cards[1]!]);
    }

    const seats: PlayerSeat[] = rawSeats.map((s) => {
      const position = derived.get(s.seat) ?? s.declaredPosition ?? 'BTN';
      // Heads-up: the button seat is BTN and SB simultaneously (same physical
      // role), so BTN-vs-SB on that seat is not a real disagreement.
      const isHeadsUpButton = rawSeats.length === 2 && s.seat === buttonSeat
        && ((s.declaredPosition === 'BTN' && position === 'SB')
          || (s.declaredPosition === 'SB' && position === 'BTN'));
      if (s.declaredPosition && position !== s.declaredPosition && !isHeadsUpButton) {
        warnings.push(warn(
          WarningCode.POSITION_MISMATCH,
          `Seat ${s.seat}: site says ${s.declaredPosition}, ring math says ${position}`,
        ));
      }
      return {
        seat: s.seat,
        name: s.name,
        playerId: playerId(s.name),
        startingStack: s.stack,
        // Trust the site's explicit tag over ring math when they disagree.
        position: s.declaredPosition ?? position,
        declaredPosition: s.declaredPosition,
        isButton: s.seat === buttonSeat,
        isHero: s.isHero,
        holeCards: holeCardsByName.get(s.name) ?? null,
        sittingOut: s.sittingOut,
      };
    });

    let heroSeat = seats.find((s) => s.isHero)?.seat ?? null;
    if (heroSeat === null && holeCardsByName.size === 1) {
      // Some exports omit [Hero]; the only revealed hand is hero's.
      const only = [...holeCardsByName.keys()][0]!;
      heroSeat = byName.get(only)?.seat ?? null;
    }

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
        if (newCards) board = newCards; // Betclic prints the full board each street
        else if (block.boardText) {
          warnings.push(warn(WarningCode.BAD_CARD, `Unparseable board "${block.boardText}"`));
        }
      }

      const boardAtStreetStart: Card[] = [...board];
      const streetActions: Action[] = [];
      const potBefore = actions.reduce(
        (acc, a) => acc + (a.kind === 'uncalled-return' ? -a.amount : a.amount), 0,
      );

      for (const line of block.lines) {
        if (BETCLIC.TABLE_EVENT.test(line.trim())) continue;
        const m = BETCLIC.ACTION.exec(line.trim());
        if (!m) {
          warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed action line', { rawLine: line }));
          continue;
        }
        const [, timestamp, nameRaw, verb, amountRaw, tail] = m;
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

        if (folded.has(seat.seat) && kind !== 'show' && kind !== 'muck') {
          warnings.push(warn(WarningCode.ACTION_AFTER_FOLD, `${name} acts after folding`, { rawLine: line }));
        }

        const explicitAllIn = BETCLIC.ALL_IN.test(tail ?? '');
        const rawAmount = Math.round(parseNumeric(amountRaw) ?? 0);

        let amount = asAmount(0);
        let totalCommitted = ledger.committedThisStreet(seat.seat);
        let isAllIn = explicitAllIn;

        if (kind === 'post-ante') {
          const res = ledger.applyAnte(seat.seat, asAmount(rawAmount));
          amount = asAmount(rawAmount);
          totalCommitted = ledger.committedThisStreet(seat.seat);
          isAllIn = explicitAllIn || res.isAllIn;
        } else if (kind === 'uncalled-return') {
          amount = asAmount(rawAmount);
        } else if (ABSOLUTE_VERBS.has(verb!)) {
          const res = ledger.applyTotal(seat.seat, asAmount(rawAmount));
          amount = res.delta;
          totalCommitted = res.totalCommitted;
          isAllIn = explicitAllIn || res.isAllIn;
        } else if (rawAmount > 0) {
          const res = ledger.applyDelta(seat.seat, asAmount(rawAmount));
          amount = asAmount(rawAmount);
          totalCommitted = res.totalCommitted;
          isAllIn = explicitAllIn || res.isAllIn;
        }

        if (kind === 'fold') folded.add(seat.seat);
        if (kind === 'show' || kind === 'muck') {
          const shown = /\[([^\]]+)\]/.exec(tail ?? '');
          const cards = shown ? parseCardList(shown[1]!) : null;
          showdown.push({
            seat: seat.seat,
            holeCards: cards && cards.length === 2 ? [cards[0]!, cards[1]!] : null,
            mucked: kind === 'muck',
            handDescription: null,
          });
        }

        const action: Action = {
          index: actionIndex++,
          street: block.street,
          seat: seat.seat,
          playerId: playerId(name),
          kind,
          amount,
          totalCommitted,
          isAllIn,
          timestamp: timestamp ?? null,
          raw: line.trim(),
        };
        actions.push(action);
        streetActions.push(action);
      }

      // Betclic sometimes omits the "Returns uncalled bet" line when an all-in
      // raise exceeds every remaining live opponent's stack (no one left who
      // could ever call it) — verified on hand 472 of the 2025-07-16 sample,
      // where a 540 all-in against a 530 stack leaves 10 chips unreturned and
      // unprinted. Infer and synthesize the return so the pot checksum holds.
      const alreadyReturned = streetActions.some((a) => a.kind === 'uncalled-return');
      if (!alreadyReturned) {
        const live = streetActions
          .filter((a) => CHIP_MOVING.has(a.kind) && !folded.has(a.seat))
          .reduce((acc, a) => {
            acc.set(a.seat, ledger.committedThisStreet(a.seat));
            return acc;
          }, new Map<number, number>());
        if (live.size >= 1) {
          const committedDesc = [...live.entries()].sort((a, b) => b[1] - a[1]);
          const [topSeat, topAmount] = committedDesc[0]!;
          const nextAmount = committedDesc[1]?.[1] ?? 0;
          const excess = topAmount - Math.max(nextAmount, 0);
          if (excess > 0 && nextAmount < topAmount && live.size > 1) {
            const returnAction: Action = {
              index: actionIndex++,
              street: block.street,
              seat: topSeat,
              playerId: seats.find((s) => s.seat === topSeat)!.playerId,
              kind: 'uncalled-return',
              amount: asAmount(excess),
              totalCommitted: asAmount(topAmount - excess),
              isAllIn: false,
              timestamp: null,
              raw: '(inferred: uncalled bet, unprinted by site)',
            };
            actions.push(returnAction);
            streetActions.push(returnAction);
          }
        }
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

    // ---- showdown ------------------------------------------------------------
    // "Name shows/mucks [cards] (Hand Description) [best five]" — no colon or
    // verb-token shape, so it needs its own line format rather than ACTION's.
    for (const line of sections.showdown) {
      const m = BETCLIC.SHOWDOWN_LINE.exec(line.trim());
      if (!m) {
        warnings.push(warn(WarningCode.UNPARSED_LINE, 'Unparsed showdown line', { rawLine: line }));
        continue;
      }
      const [, nameRaw, verb, cardsRaw, description] = m;
      const name = nameRaw!.trim();
      const seat = byName.get(name);
      if (!seat) {
        warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Showdown names unknown player "${name}"`, { rawLine: line }));
        continue;
      }
      const mucked = verb!.toLowerCase() === 'mucks';
      const cards = parseCardList(cardsRaw!);
      if (!cards || cards.length !== 2) {
        warnings.push(warn(WarningCode.BAD_CARD, `Unparseable showdown cards "${cardsRaw}"`, { rawLine: line }));
        continue;
      }
      showdown.push({
        seat: seat.seat,
        holeCards: [cards[0]!, cards[1]!],
        mucked,
        handDescription: description?.trim() ?? null,
      });
    }

    // ---- summary -----------------------------------------------------------
    const awards: PotAward[] = [];
    for (const line of sections.summary) {
      const m = BETCLIC.SUMMARY_WIN.exec(line.trim());
      if (!m) continue;
      const seat = byName.get(m[1]!.trim());
      if (!seat) {
        warnings.push(warn(WarningCode.UNKNOWN_PLAYER, `Summary names unknown player "${m[1]}"`, { rawLine: line }));
        continue;
      }
      const potLabel = m[2]!.toLowerCase();
      const level = potLabel.startsWith('main') ? 0 : Number(/\d+/.exec(potLabel)?.[0] ?? 1);
      awards.push({
        potLevel: level,
        seat: seat.seat,
        amount: asAmount(Math.round(parseNumeric(m[3]) ?? 0)),
        handDescription: m[4]?.trim() ?? null,
      });
    }

    const tournament: TournamentInfo | null = gameMode !== 'cash'
      ? {
          tournamentId: fields.get('game id') ?? null,
          name: fields.get('game name') ?? null,
          buyIn: null,
          fee: null,
          buyInCurrency: (() => {
            const m = BETCLIC.BUY_IN.exec(fields.get('buy in') ?? '');
            return m?.[2] ?? null;
          })(),
          level: null,
        }
      : null;

    const { iso, tz } = toIsoDate(fields.get('date & time'));

    const meta: HandMeta = {
      handId,
      siteId: SITE_ID,
      tableId: fields.get('table id') ?? null,
      tableName: fields.get('game name') ?? null,
      playedAt: iso,
      timezoneNote: tz,
      maxSeats: null,
      gameMode,
      variant: /hold\s*'?em/i.test(fields.get('game type') ?? '') ? 'nlhe' : 'unknown',
      tournament,
      rake: asAmount(Math.round(parseNumeric(fields.get('rake')) ?? 0)),
    };

    const reportedTotal = parseNumeric(fields.get('total pot'));

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
      reportedTotalPot: reportedTotal === null ? null : asAmount(Math.round(reportedTotal)),
      warnings,
      source,
    };

    void ctx;
    void errors;
    void STREET_ORDER;
    return { ok: true, value: hand, warnings };
  },
};
