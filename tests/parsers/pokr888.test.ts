import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { validateHand } from '@/parsers/shared/validate';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const tourneySource = read('../fixtures/pokr888/early-pko-rumble.txt');
const tourney = registry.parseFile(tourneySource, '888poker', 'early-pko-rumble.txt');

const cashSource = read('../fixtures/pokr888/cash-6max.txt');
const cash = registry.parseFile(cashSource, '888poker', 'cash-6max.txt');

describe('888poker parser — file level', () => {
  it('parses every hand in the Pacific sample with no failures', () => {
    expect(tourney.failures).toEqual([]);
    expect(tourney.hands).toHaveLength(8);
  });

  it('detects the room from the banner', () => {
    expect(registry.detect(tourneySource)?.siteId).toBe('888poker');
    expect(registry.detect(cashSource)?.siteId).toBe('888poker');
  });

  it('splits on the "#Game No" line', () => {
    expect(tourney.hands.map((h) => h.meta.handId)).toEqual([
      '778482528', '778483081', '778483160', '778483258',
      '778483343', '778483450', '778483624', '778483679',
    ]);
  });

  it('gives every hand a stable dedupe id', () => {
    expect(tourney.hands[0]!.id).toBe('888poker:778482528');
    expect(new Set(tourney.hands.map((h) => h.id)).size).toBe(8);
  });
});

/**
 * The single most important thing this parser gets right.
 *
 * Unlike PokerStars and Winamax, 888 writes EVERY bracketed amount as a delta
 * — "raises [550]" adds 550 to what the player already had out, rather than
 * raising the street total TO 550. All six readings of (raise, call) x (delta,
 * total) were replayed against these eight hands; only delta/delta reconciles
 * all of them, and the two hands below are where the readings diverge.
 */
describe('amount semantics — every bracketed figure is a delta', () => {
  it('matches the printed "collected" figure for every hand', () => {
    for (const h of tourney.hands) {
      expect(h.pots.total, `hand ${h.meta.handId}`).toBe(h.reportedTotalPot);
    }
  });

  it('reconciles the exact pot of all eight sample hands', () => {
    expect(tourney.hands.map((h) => h.pots.total)).toEqual([
      489, 181, 1156, 1389, 189, 2139, 189, 189,
    ]);
  });

  it('raises no validation issue anywhere in either fixture', () => {
    for (const h of [...tourney.hands, ...cash.hands]) {
      expect(validateHand(h), `hand ${h.meta.handId}`).toEqual([]);
    }
  });

  it('adds a raise on top of the blind already posted', () => {
    // Hand 778483258: h1karo666 posts the 50 big blind, then "raises [550]".
    // As a delta that is 600 committed; read as a street total it would be
    // 550, understating the pot by 100 — which is exactly the gap that makes
    // the printed 1389 unreachable.
    const hand = tourney.hands.find((h) => h.meta.handId === '778483258')!;
    const bb = hand.seats.find((s) => s.name === 'h1karo666')!;
    const raise = hand.actions.find((a) => a.seat === bb.seat && a.kind === 'raise')!;
    expect(raise.amount).toBe(550);
    expect(raise.totalCommitted).toBe(600);
    expect(hand.pots.total).toBe(1389);
  });

  it('adds a raise on top of chips already invested this street', () => {
    // Hand 778483160: xinfinity88 raises [100], then later raises [4751].
    // The second raise brings them to 4851, not to 4751.
    const hand = tourney.hands.find((h) => h.meta.handId === '778483160')!;
    const seat = hand.seats.find((s) => s.name === 'xinfinity88')!;
    const raises = hand.actions.filter((a) => a.seat === seat.seat && a.kind === 'raise');
    expect(raises.map((r) => r.amount)).toEqual([100, 4751]);
    expect(raises[1]!.totalCommitted).toBe(4851);
  });

  it('treats a call as the chips added, not the total reached', () => {
    // Hand 778483160: cal1205 posts the 25 small blind then "calls [75]",
    // reaching 100 to match the raise.
    const hand = tourney.hands.find((h) => h.meta.handId === '778483160')!;
    const seat = hand.seats.find((s) => s.name === 'cal1205')!;
    const call = hand.actions.find((a) => a.seat === seat.seat && a.kind === 'call')!;
    expect(call.amount).toBe(75);
    expect(call.totalCommitted).toBe(100);
  });
});

describe('the uncalled bet 888 never prints', () => {
  it('returns the excess when everyone folds to a bet', () => {
    // Hand 778482528: Artolya bets 311 on the turn and takes it down. 888
    // prints no "Uncalled bet returned" line, so the parser synthesizes one —
    // without it the pot would overstate by 311 and no checksum would hold.
    const hand = tourney.hands[0]!;
    const returned = hand.actions.filter((a) => a.kind === 'uncalled-return');
    expect(returned).toHaveLength(1);
    expect(returned[0]!.amount).toBe(311);
    expect(returned[0]!.raw).toContain('synthesized');
    expect(hand.pots.total).toBe(489);
  });

  it('returns only the excess over the runner-up, not the whole bet', () => {
    // Hand 778483258: xinfinity88 raises [100] and then raises [5399], which
    // as deltas puts 5499 out against h1karo666's 600. Only the 600 is
    // contested, so 4899 comes back — and the pot lands on the printed 1389.
    const hand = tourney.hands.find((h) => h.meta.handId === '778483258')!;
    const returned = hand.actions.find((a) => a.kind === 'uncalled-return')!;
    expect(returned.amount).toBe(4899);
    expect(hand.pots.total).toBe(1389);
  });

  it('synthesizes nothing when the last bet was called', () => {
    // Hand 778483450 goes to showdown with a called river bet.
    const hand = tourney.hands.find((h) => h.meta.handId === '778483450')!;
    expect(hand.actions.filter((a) => a.kind === 'uncalled-return')).toEqual([]);
    expect(hand.pots.total).toBe(2139);
  });
});

describe('tournament hand 1', () => {
  const hand = tourney.hands[0]!;

  it('parses the header', () => {
    expect(hand.meta.gameMode).toBe('tournament');
    expect(hand.meta.variant).toBe('nlhe');
    expect(hand.meta.maxSeats).toBe(8);
    expect(hand.buttonSeat).toBe(8);
  });

  it('reads the day-first date this format uses', () => {
    // "*** 02 08 2026 09:01:09" is 2 August, not 8 February.
    expect(hand.meta.playedAt).toBe('2026-08-02T09:01:09.000Z');
    // The export stamps no timezone at all, so none is invented.
    expect(hand.meta.timezoneNote).toBeNull();
  });

  it('parses tournament money as chips', () => {
    expect(hand.money.currency).toBe('CHIPS');
    expect(hand.money.exponent).toBe(0);
    expect(hand.money.smallBlind).toBe(25);
    expect(hand.money.bigBlind).toBe(50);
    expect(hand.money.ante).toBe(8);
    expect(hand.money.anteType).toBe('per-player');
  });

  it('splits the buy-in from the fee', () => {
    expect(hand.meta.tournament).toMatchObject({
      tournamentId: '293965397',
      buyIn: 500,  // $5
      fee: 100,    // $1
      buyInCurrency: 'USD',
    });
  });

  it('handles a non-contiguous seat list', () => {
    // Seats 1,2,3,5,6,7,8,10 — seat 4 and 9 are empty, which must not shift
    // anyone's position.
    expect(hand.seats.map((s) => s.seat)).toEqual([1, 2, 3, 5, 6, 7, 8, 10]);
    const byName = new Map(hand.seats.map((s) => [s.name, s]));
    expect(byName.get('Artolya')!.position).toBe('BTN');
    expect(byName.get('Noname057')!.position).toBe('SB');
    expect(byName.get('xinfinity88')!.position).toBe('BB');
  });

  it('accumulates the board across streets, which this format prints one at a time', () => {
    // "** Dealing turn ** [ 5c ]" gives only the new card.
    expect(hand.finalBoard).toEqual(['4c', '4h', 'Qh', '5c']);
    expect(hand.streets.map((s) => s.street)).toEqual(['preflop', 'flop', 'turn']);
    expect(hand.streets[1]!.board).toEqual(['4c', '4h', 'Qh']);
  });

  it('parses the comma-separated bracket card format', () => {
    expect(hand.streets[1]!.newCards).toEqual(['4c', '4h', 'Qh']);
  });
});

describe('showdowns', () => {
  it('records the cards of everyone who showed', () => {
    const hand = tourney.hands.find((h) => h.meta.handId === '778483450')!;
    const byS = new Map(hand.showdown.map((s) => [s.seat, s]));
    expect(byS.get(10)!.holeCards).toEqual(['As', '5h']);
    expect(byS.get(1)!.holeCards).toEqual(['Ac', 'Qh']);
  });

  it('marks a player who did not show as mucked', () => {
    const hand = cash.hands[0]!;
    // "Hero did not show his hand."
    const hero = hand.showdown.find((s) => s.seat === hand.heroSeat)!;
    expect(hero.mucked).toBe(true);
    expect(hero.holeCards).toBeNull();
  });
});

describe('cash games', () => {
  const hand = cash.hands[0]!;

  it('tells a cash game from a tournament by the currency on the blinds line', () => {
    expect(cash.failures).toEqual([]);
    expect(hand.meta.gameMode).toBe('cash');
    expect(hand.meta.tournament).toBeNull();
    expect(hand.meta.tableName).toBe('Aludra');
    expect(hand.meta.maxSeats).toBe(6);
  });

  it('converts currency to integer cents', () => {
    expect(hand.money.currency).toBe('USD');
    expect(hand.money.exponent).toBe(2);
    expect(hand.money.smallBlind).toBe(50);
    expect(hand.money.bigBlind).toBe(100);
    const stacks = new Map(hand.seats.map((s) => [s.name, s.startingStack]));
    expect(stacks.get('Player2')).toBe(14250);
    expect(stacks.get('Player3')).toBe(6510);
    for (const s of hand.seats) expect(Number.isInteger(s.startingStack)).toBe(true);
  });

  it('identifies hero and their cards', () => {
    expect(hand.heroSeat).toBe(4);
    expect(hand.seats.find((s) => s.isHero)!.holeCards).toEqual(['Ah', 'Kd']);
  });

  it('reconciles the pot against the printed collect', () => {
    expect(hand.pots.total).toBe(6250);
    expect(hand.reportedTotalPot).toBe(6250);
    expect(hand.actions.find((a) => a.kind === 'uncalled-return')!.amount).toBe(6950);
  });
});

describe('edge cases', () => {
  const parsed = registry.parseFile(read('../fixtures/pokr888/edge-cases.txt'), '888poker', 'edge-cases.txt');

  it('parses cleanly', () => {
    expect(parsed.failures).toEqual([]);
    for (const h of parsed.hands) expect(validateHand(h)).toEqual([]);
  });

  it('infers all-in from the stack, since this format prints no all-in marker', () => {
    // Shorty has 310, posts a 10 ante and calls 300 — leaving nothing.
    const hand = parsed.hands[0]!;
    const shorty = hand.seats.find((s) => s.name === 'Shorty')!;
    const call = hand.actions.find((a) => a.seat === shorty.seat && a.kind === 'call')!;
    expect(call.isAllIn).toBe(true);
  });

  it('does not mistake a header line for a player action', () => {
    // "Total number of players : 4" and the banner sit in the same block as
    // the forced bets and must not be read as actions.
    const hand = parsed.hands[0]!;
    expect(hand.warnings).toEqual([]);
    expect(hand.actions.every((a) => a.seat > 0)).toBe(true);
  });
});
