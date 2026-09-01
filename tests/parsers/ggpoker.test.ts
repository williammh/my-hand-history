import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { validateHand } from '@/parsers/shared/validate';
import { gameModeOptions, siteOptions } from '@/filters/options';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const cashSource = read('../fixtures/ggpoker/cash-rush-and-cash.txt');
const cash = registry.parseFile(cashSource, 'ggpoker', 'cash-rush-and-cash.txt');

const spinSource = read('../fixtures/ggpoker/spin-and-gold.txt');
const spin = registry.parseFile(spinSource, 'ggpoker', 'spin-and-gold.txt');

const tourneySource = read('../fixtures/ggpoker/tournament.txt');
const tourney = registry.parseFile(tourneySource, 'ggpoker', 'tournament.txt');

/**
 * GGPoker writes the same hand body as PokerStars, so it shares that parser.
 * What it does NOT share is how it identifies itself: its header brand word is
 * the bare word "Poker", which names no room at all. These tests pin the
 * hand-id prefix (RC / SG / TM / HD) as the real signal.
 */
describe('detection', () => {
  it('recognizes each GGPoker game type by its hand-id prefix', () => {
    expect(registry.detect(cashSource)?.siteId).toBe('ggpoker');    // RC — Rush & Cash
    expect(registry.detect(spinSource)?.siteId).toBe('ggpoker');    // SG — Spin & Gold
    expect(registry.detect(tourneySource)?.siteId).toBe('ggpoker'); // TM — tournament
  });

  it('does not let the bare word "Poker" fall through to the unknown-room fallback', () => {
    // "Poker Hand #..." would otherwise be read as a room literally named
    // "Poker" and filed under pokerstars-like.
    expect(cash.siteId).toBe('ggpoker');
    expect(cash.hands[0]!.meta.siteId).toBe('ggpoker');
  });

  it('does not claim a PokerStars file', () => {
    expect(registry.detect(read('../fixtures/pokerstars/mini-sunday-fenomeno.txt'))?.siteId)
      .toBe('pokerstars');
  });

  it('does not claim a GG-style hand id without a matching body', () => {
    expect(registry.detect('Poker Hand #RC1: chat log\nnothing else\n')).toBeNull();
  });

  it('gives every hand a room-scoped dedupe id', () => {
    expect(cash.hands[0]!.id).toBe('ggpoker:RC103014874');
    expect(spin.hands[0]!.id).toBe('ggpoker:SG987654321');
    expect(tourney.hands[0]!.id).toBe('ggpoker:TM876543210');
  });
});

describe('pot checksums', () => {
  it('reconciles every fixture hand against the printed total', () => {
    for (const parsed of [cash, spin, tourney]) {
      for (const h of parsed.hands) {
        expect(h.pots.total, `hand ${h.meta.handId}`).toBe(h.reportedTotalPot);
        expect(validateHand(h), `hand ${h.meta.handId}`).toEqual([]);
      }
    }
  });

  it('reads the printed total as the contested chips, with rake coming off the collect', () => {
    // "Total pot $24.50 | Rake $1.50" pairs with "collected $23.00":
    // total = collected + rake, and the total is what the actions add up to.
    const hand = cash.hands[0]!;
    expect(hand.reportedTotalPot).toBe(2450);
    expect(hand.meta.rake).toBe(150);
    expect(hand.awards[0]!.amount).toBe(2300);
    expect(hand.awards[0]!.amount + hand.meta.rake).toBe(hand.reportedTotalPot);
  });
});

describe('Rush & Cash — a cash game', () => {
  const hand = cash.hands[0]!;

  it('parses the header', () => {
    expect(cash.failures).toEqual([]);
    expect(hand.meta.gameMode).toBe('cash');
    expect(hand.meta.tournament).toBeNull();
    expect(hand.meta.tableName).toBe('RushAndCash100');
    expect(hand.meta.maxSeats).toBe(6);
    expect(hand.buttonSeat).toBe(1);
    expect(hand.meta.variant).toBe('nlhe');
  });

  it('carries no timezone, because GGPoker stamps none', () => {
    expect(hand.meta.playedAt).toBe('2026-08-31T18:22:10.000Z');
    expect(hand.meta.timezoneNote).toBeNull();
  });

  it('converts money to integer cents', () => {
    expect(hand.money.currency).toBe('USD');
    expect(hand.money.exponent).toBe(2);
    expect(hand.money.smallBlind).toBe(50);
    expect(hand.money.bigBlind).toBe(100);
    const stacks = new Map(hand.seats.map((s) => [s.name, s.startingStack]));
    expect(stacks.get('a1b2c3d4')).toBe(14250); // $142.50
    expect(stacks.get('f5e6d7c8')).toBe(6510);  // $65.10
    for (const s of hand.seats) expect(Number.isInteger(s.startingStack)).toBe(true);
  });

  it('identifies hero', () => {
    expect(hand.heroSeat).toBe(3);
    expect(hand.seats.find((s) => s.isHero)!.holeCards).toEqual(['Ah', 'Kd']);
  });

  it('reads "raises X to Y" as an absolute street total', () => {
    // Hero has the $1.00 big blind out, then "raises $5.50 to $8.00": the
    // delta is $7.00 and the street total is $8.00.
    const heroRaise = hand.actions.find((a) => a.seat === 3 && a.kind === 'raise')!;
    expect(heroRaise.amount).toBe(700);
    expect(heroRaise.totalCommitted).toBe(800);
  });

  it('returns the uncalled turn bet', () => {
    const returned = hand.actions.find((a) => a.kind === 'uncalled-return')!;
    expect(returned.amount).toBe(1850);
    expect(hand.pots.total).toBe(2450);
  });

  it('takes the award from the summary\'s "won", which is the only place GG prints it', () => {
    expect(hand.awards).toEqual([
      { potLevel: 0, seat: 3, amount: 2300, handDescription: null },
    ]);
  });
});

describe('Spin & Gold — a lottery sit & go', () => {
  const hand = spin.hands[0]!;

  it('is a sit-n-go, not a cash game', () => {
    // The header is "Spin & Gold $5.00 ($4.65+$0.35)". Without a dedicated
    // pattern the generic cash header claims it and reads the buy-in split
    // "$4.65+$0.35" as the blinds — a parse that looks fine and is very wrong.
    expect(spin.failures).toEqual([]);
    expect(hand.meta.gameMode).toBe('sit-n-go');
    expect(hand.money.currency).toBe('CHIPS');
    expect(hand.money.exponent).toBe(0);
  });

  it('splits the buy-in into prize contribution and fee', () => {
    expect(hand.meta.tournament).toMatchObject({
      name: 'Spin & Gold',
      buyIn: 465, // $4.65 to the prize pool
      fee: 35,    // $0.35 to the room
      buyInCurrency: 'USD',
      tournamentId: null, // a Spin & Gold prints no tournament number
      level: null,        // blinds rise on a clock, with no level printed
    });
  });

  it('recovers the blinds from the posts, since the header omits them', () => {
    // Everything downstream is denominated in big blinds, so a zero BB would
    // silently disable every stack-depth and sizing judgement on the hand.
    expect(hand.money.smallBlind).toBe(10);
    expect(hand.money.bigBlind).toBe(20);
  });

  it('does not warn about the blinds it legitimately could not find in the header', () => {
    expect(hand.warnings).toEqual([]);
  });

  it('ignores the prize-roll lines without treating them as actions', () => {
    // "Multiplier: 2x" and "Total Prize Pool: $10.00" sit between the table
    // line and the seats, where forced bets are otherwise buffered from.
    expect(hand.actions.every((a) => !/Multiplier|Prize Pool/.test(a.raw))).toBe(true);
    expect(hand.actions[0]!.kind).toBe('post-sb');
  });

  it('parses the three-handed table', () => {
    expect(hand.meta.maxSeats).toBe(3);
    expect(hand.seats).toHaveLength(3);
    const byName = new Map(hand.seats.map((s) => [s.name, s.position]));
    expect(byName.get('e4d3c2b1')).toBe('BTN');
    expect(byName.get('a1b2c3d4')).toBe('SB');
    expect(byName.get('Hero')).toBe('BB');
  });

  it('reconciles the pot', () => {
    expect(hand.pots.total).toBe(80);
    expect(hand.awards).toEqual([{ potLevel: 0, seat: 3, amount: 80, handDescription: null }]);
  });
});

describe('tournaments', () => {
  const hand = tourney.hands[0]!;

  it('parses the header the PokerStars tournament pattern already covers', () => {
    expect(tourney.failures).toEqual([]);
    expect(hand.meta.gameMode).toBe('tournament');
    expect(hand.meta.tableName).toBe('Bounty Hunters $11 - 042');
    expect(hand.meta.maxSeats).toBe(8);
    expect(hand.buttonSeat).toBe(5);
  });

  it('splits the buy-in from the fee and reads the level', () => {
    expect(hand.meta.tournament).toMatchObject({
      tournamentId: '12345',
      buyIn: 1000, // $10
      fee: 100,    // $1
      buyInCurrency: 'USD',
      level: 1,    // Level I
    });
  });

  it('parses chips as integers with no currency', () => {
    expect(hand.money.currency).toBe('CHIPS');
    expect(hand.money.smallBlind).toBe(10);
    expect(hand.money.bigBlind).toBe(20);
    for (const s of hand.seats) expect(s.startingStack).toBe(10000);
  });

  it('leaves the board empty when the hand ends preflop', () => {
    expect(hand.finalBoard).toEqual([]);
    expect(hand.streets.map((s) => s.street)).toEqual(['preflop']);
  });

  it('takes the award from a summary line with no position tag', () => {
    // "Seat 2: Hero won (50)" — no "(big blind)" tag to strip first.
    expect(hand.awards).toEqual([
      { potLevel: 0, seat: 2, amount: 50, handDescription: null },
    ]);
  });
});

describe('edge cases — showdowns and side pots', () => {
  const parsed = registry.parseFile(read('../fixtures/ggpoker/edge-cases.txt'), 'ggpoker', 'edge-cases.txt');

  it('parses both hands cleanly', () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.hands).toHaveLength(2);
    for (const h of parsed.hands) expect(validateHand(h)).toEqual([]);
  });

  it('records every player\'s cards and hand description at showdown', () => {
    const hand = parsed.hands[0]!;
    const byS = new Map(hand.showdown.map((s) => [s.seat, s]));
    expect(byS.get(3)!.holeCards).toEqual(['Qs', 'Qh']);
    expect(byS.get(3)!.handDescription).toBe('three of a kind, Queens');
    expect(byS.get(2)!.holeCards).toEqual(['Ah', 'Kh']);
  });

  it('builds a main pot and a side pot from unequal all-ins', () => {
    const hand = parsed.hands[1]!;
    // shortstack is all-in for 280 (300 less the 20 ante); the 900 excess
    // between midstack and Hero forms a side pot shortstack cannot win.
    expect(hand.pots.pots).toEqual([
      { level: 0, amount: 900, eligibleSeats: [1, 2, 3] },
      { level: 1, amount: 1800, eligibleSeats: [2, 3] },
    ]);
  });

  it('reads side-pot ordinals from the body\'s collect lines', () => {
    const hand = parsed.hands[1]!;
    expect(hand.awards).toEqual([
      { potLevel: 0, seat: 2, amount: 900, handDescription: null },
      { potLevel: 1, seat: 2, amount: 1800, handDescription: null },
    ]);
  });

  it('does not double-count an award printed both in the body and the summary', () => {
    // The body says "collected N from main pot" and the summary says
    // "won (N)" for the same player. Only one award may be recorded.
    const hand = parsed.hands[1]!;
    expect(hand.awards.filter((a) => a.seat === 2)).toHaveLength(2); // main + side, not four
    expect(hand.awards.reduce((n, a) => n + a.amount, 0)).toBe(2700);
  });

  it('flags both all-in shoves', () => {
    const hand = parsed.hands[1]!;
    const allIns = hand.actions.filter((a) => a.isAllIn);
    expect(allIns.map((a) => a.totalCommitted)).toEqual([280, 1180]);
  });
});

describe('the filter layer', () => {
  it('offers GGPoker as a room, whether or not hands are loaded', () => {
    const rooms = registry.list();
    expect(rooms.map((r) => r.siteId)).toContain('ggpoker');
    expect(rooms.find((r) => r.siteId === 'ggpoker')!.displayName).toBe('GGPoker');
  });

  it('counts loaded GGPoker hands under their own room', () => {
    const names = new Map(registry.list().map((p) => [p.siteId, p.displayName]));
    const hands = [...cash.hands, ...spin.hands, ...tourney.hands];
    const gg = siteOptions(hands, names).find((o) => o.value === 'ggpoker')!;
    expect(gg.count).toBe(3);
  });

  it('files a Spin & Gold under the Sit & Go mode filter, not Cash', () => {
    // The mode axis is a closed vocabulary that already had 'sit-n-go' in it;
    // this is the first parser to actually produce one.
    const modes = gameModeOptions([...spin.hands, ...cash.hands]);
    const byValue = new Map(modes.map((m) => [m.value, m.count]));
    expect(byValue.get('sit-n-go')).toBe(1);
    expect(byValue.get('cash')).toBe(1);
  });
});
