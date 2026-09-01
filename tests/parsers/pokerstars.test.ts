import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { validateHand } from '@/parsers/shared/validate';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const tourneySource = read('../fixtures/pokerstars/mini-sunday-fenomeno.txt');
const tourney = registry.parseFile(tourneySource, 'pokerstars', 'mini-sunday-fenomeno.txt');

const cashSource = read('../fixtures/pokerstars/cash-6max.txt');
const cash = registry.parseFile(cashSource, 'pokerstars', 'cash-6max.txt');

describe('PokerStars parser — file level', () => {
  it('parses every hand in the tournament sample with no failures', () => {
    expect(tourney.failures).toEqual([]);
    expect(tourney.hands).toHaveLength(10);
  });

  it('detects the room from the file alone', () => {
    expect(registry.detect(tourneySource)?.siteId).toBe('pokerstars');
    expect(registry.detect(cashSource)?.siteId).toBe('pokerstars');
  });

  it('gives every hand a stable dedupe id', () => {
    expect(tourney.hands[0]!.id).toBe('pokerstars:261627320204');
    expect(new Set(tourney.hands.map((h) => h.id)).size).toBe(10);
  });

  it('stamps the source file onto every hand', () => {
    for (const h of tourney.hands) expect(h.meta.sourceFile).toBe('mini-sunday-fenomeno.txt');
  });
});

describe('pot checksums — the highest-value regression guard', () => {
  it('matches the site-reported total for every tournament hand', () => {
    // Every hand's chips-in must equal the printed "Total pot", which in this
    // format is already net of any uncalled bet returned.
    for (const h of tourney.hands) {
      expect(h.pots.total, `hand ${h.meta.handId}`).toBe(h.reportedTotalPot);
    }
  });

  it('raises no validation issue on any hand in either fixture', () => {
    for (const h of [...tourney.hands, ...cash.hands]) {
      expect(validateHand(h), `hand ${h.meta.handId}`).toEqual([]);
    }
  });

  it('reconciles the specific figures the sample prints', () => {
    expect(tourney.hands.map((h) => h.pots.total)).toEqual([
      49634, 42400, 21400, 36400, 21400, 21400, 62784, 21400, 12400, 55444,
    ]);
  });
});

describe('tournament hand 1 — antes, blinds, and a river fold', () => {
  const hand = tourney.hands[0]!;

  it('parses the header', () => {
    expect(hand.meta.gameMode).toBe('tournament');
    expect(hand.meta.variant).toBe('nlhe');
    expect(hand.meta.tableName).toBe('4018426247 100');
    expect(hand.meta.maxSeats).toBe(8);
    expect(hand.buttonSeat).toBe(5);
  });

  it('keeps the room-local wall time and records the zone rather than guessing an offset', () => {
    // "2026/08/02 17:31:45 ET" — ET is -4 or -5 depending on the date, and
    // there is no zone database here, so the abbreviation is preserved instead
    // of being folded into the timestamp with a guessed offset.
    expect(hand.meta.playedAt).toBe('2026-08-02T17:31:45.000Z');
    expect(hand.meta.timezoneNote).toBe('ET');
  });

  it('parses tournament money as chips, not currency', () => {
    expect(hand.money.currency).toBe('CHIPS');
    expect(hand.money.exponent).toBe(0);
    expect(hand.money.smallBlind).toBe(2500);
    expect(hand.money.bigBlind).toBe(5000);
  });

  it('reads the per-player ante from the posts, not the blind block', () => {
    expect(hand.money.ante).toBe(700);
    expect(hand.money.anteType).toBe('per-player');
    expect(hand.actions.filter((a) => a.kind === 'post-ante')).toHaveLength(7);
  });

  it('splits the buy-in from the fee', () => {
    expect(hand.meta.tournament).toMatchObject({
      tournamentId: '4018426247',
      buyIn: 980,   // $9.80 in cents
      fee: 120,     // $1.20
      buyInCurrency: 'USD',
      level: 17,    // Level XVII
    });
  });

  it('derives positions from the button, and agrees with the summary tags', () => {
    const byName = new Map(hand.seats.map((s) => [s.name, s]));
    expect(byName.get('Livino Showtime')!.position).toBe('BTN');
    expect(byName.get('TunicoTT')!.position).toBe('SB');
    expect(byName.get('Massey_Crush')!.position).toBe('BB');
    // The site's own tags are kept beside the derived value as an audit trail.
    expect(byName.get('TunicoTT')!.declaredPosition).toBe('SB');
    expect(byName.get('Massey_Crush')!.declaredPosition).toBe('BB');
  });

  it('has no hero, because this export contains no "Dealt to" line', () => {
    expect(hand.heroSeat).toBeNull();
    for (const s of hand.seats) expect(s.holeCards).toBeNull();
  });

  it('reads "raises N to M" as an absolute street total', () => {
    const raise = hand.actions.find((a) => a.kind === 'raise')!;
    // "Livino Showtime: raises 5000 to 10000" — 10000 is the street total and
    // 10000 is also the delta here, since nothing was committed beforehand.
    expect(raise.totalCommitted).toBe(10000);
    expect(raise.amount).toBe(10000);

    // "TunicoTT: calls 7500" from a 2500 small blind reaches the same total.
    const call = hand.actions.find((a) => a.kind === 'call')!;
    expect(call.amount).toBe(7500);
    expect(call.totalCommitted).toBe(10000);
  });

  it('returns the uncalled river bet', () => {
    const returned = hand.actions.find((a) => a.kind === 'uncalled-return')!;
    expect(returned.amount).toBe(12409);
    // Returned chips were never contested, so they leave the pot again.
    expect(hand.pots.total).toBe(49634);
  });

  it('builds the board street by street', () => {
    expect(hand.finalBoard).toEqual(['9s', 'Kh', '8s', 'Js', 'Kd']);
    expect(hand.streets.map((s) => s.street)).toEqual(['preflop', 'flop', 'turn', 'river']);
    expect(hand.streets[1]!.board).toEqual(['9s', 'Kh', '8s']);
    expect(hand.streets[3]!.board).toEqual(['9s', 'Kh', '8s', 'Js', 'Kd']);
  });

  it('treats a disconnect notice as chatter, not a misparse', () => {
    // "Roma140288 is disconnected" sits in the middle of the preflop action.
    expect(hand.warnings).toEqual([]);
    expect(hand.actions.some((a) => /disconnected/.test(a.raw))).toBe(false);
  });
});

describe('tournament hand 7 — an all-in showdown', () => {
  const hand = tourney.hands.find((h) => h.meta.handId === '261627393386')!;

  it('records both players\' hole cards from the showdown', () => {
    expect(hand.showdown).toHaveLength(2);
    const byS = new Map(hand.showdown.map((s) => [s.seat, s]));
    expect(byS.get(3)!.holeCards).toEqual(['Kh', 'Ks']);
    expect(byS.get(3)!.handDescription).toBe('two pair, Kings and Fives');
    expect(byS.get(5)!.holeCards).toEqual(['2h', 'Qh']);
  });

  it('flags the all-in shove', () => {
    const shove = hand.actions.find((a) => a.isAllIn && a.kind === 'raise')!;
    expect(shove.totalCommitted).toBe(26692);
  });

  it('awards the pot to the winner', () => {
    expect(hand.awards).toEqual([
      { potLevel: 0, seat: 3, amount: 62784, handDescription: null },
    ]);
  });
});

describe('cash games', () => {
  const hand = cash.hands[0]!;

  it('parses the cash header the tournament pattern must not claim', () => {
    expect(cash.failures).toEqual([]);
    expect(hand.meta.gameMode).toBe('cash');
    expect(hand.meta.tournament).toBeNull();
    expect(hand.meta.tableName).toBe('Aludra');
    expect(hand.meta.maxSeats).toBe(6);
  });

  it('converts currency to integer cents, never a float', () => {
    expect(hand.money.currency).toBe('USD');
    expect(hand.money.exponent).toBe(2);
    expect(hand.money.smallBlind).toBe(50);
    expect(hand.money.bigBlind).toBe(100);
    // $142.50 and $65.10 are the ones that break naive float math.
    const stacks = new Map(hand.seats.map((s) => [s.name, s.startingStack]));
    expect(stacks.get('Player2')).toBe(14250);
    expect(stacks.get('Player3')).toBe(6510);
    for (const s of hand.seats) expect(Number.isInteger(s.startingStack)).toBe(true);
  });

  it('has no ante', () => {
    expect(hand.money.ante).toBe(0);
    expect(hand.money.anteType).toBe('none');
  });

  it('identifies hero from the "Dealt to" line below *** HOLE CARDS ***', () => {
    // Cash exports print "Dealt to" after the section marker; tournament
    // exports print it before. Both must find hero.
    expect(hand.heroSeat).toBe(4);
    expect(hand.seats.find((s) => s.isHero)!.holeCards).toEqual(['Ah', 'Kd']);
  });

  it('records the rake', () => {
    expect(hand.meta.rake).toBe(250);
  });

  it('reconciles a multi-street pot with an uncalled river bet', () => {
    expect(hand.pots.total).toBe(6250);
    expect(hand.reportedTotalPot).toBe(6250);
    expect(hand.actions.find((a) => a.kind === 'uncalled-return')!.amount).toBe(6950);
  });
});

describe('edge cases — side pots, heads-up, and split pots', () => {
  const parsed = registry.parseFile(read('../fixtures/pokerstars/edge-cases.txt'), 'pokerstars', 'edge-cases.txt');

  it('parses all three hands cleanly', () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.hands).toHaveLength(3);
    for (const h of parsed.hands) expect(validateHand(h)).toEqual([]);
  });

  it('builds a main pot and a side pot from unequal all-ins', () => {
    const hand = parsed.hands[0]!;
    // Shorty is all-in for 425; the 1750 excess between Middler and Caller
    // forms a side pot that Shorty cannot win.
    expect(hand.pots.pots).toEqual([
      { level: 0, amount: 1800, eligibleSeats: [1, 3, 4] },
      { level: 1, amount: 3500, eligibleSeats: [3, 4] },
    ]);
  });

  it('reads the side-pot ordinal out of the collect line', () => {
    const hand = parsed.hands[0]!;
    expect(hand.awards).toEqual([
      { potLevel: 0, seat: 3, amount: 1800, handDescription: null },
      { potLevel: 1, seat: 3, amount: 3500, handDescription: null },
    ]);
  });

  it('labels the heads-up button as SB without warning about it', () => {
    const hu = parsed.hands[1]!;
    const alice = hu.seats.find((s) => s.name === 'Alice')!;
    // In heads-up the button posts the small blind. derivePositions labels the
    // seat SB, and the summary's "(button)" tag must not be reported as a
    // disagreement.
    expect(alice.isButton).toBe(true);
    expect(alice.position).toBe('SB');
    expect(hu.warnings).toEqual([]);
  });

  it('records both winners of a split pot', () => {
    const split = parsed.hands[2]!;
    expect(split.awards).toEqual([
      { potLevel: 0, seat: 2, amount: 50, handDescription: null },
      { potLevel: 0, seat: 3, amount: 50, handDescription: null },
    ]);
  });
});
