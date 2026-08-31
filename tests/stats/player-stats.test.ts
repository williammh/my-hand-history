import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '@/parsers/index';
import type { Hand } from '@/domain/hand';
import { playerHandFacts } from '@/stats/player-facts';
import { aggregatePlayers } from '@/stats/aggregate';
import { pct, aggressionFactor, averageWinBB, averageLossBB, playerKey } from '@/stats/types';

/**
 * Synthetic Winamax hands, one scenario per hand, so each stat's exact
 * numerator/denominator can be verified by inspection rather than by reading
 * a 1000-line real session. 5-max, button on seat 5, so positions are fixed:
 * seat1=SB, seat2=BB, seat3=UTG, seat4=CO, seat5=BTN.
 */
const HEADER = (id: string) =>
  `Winamax Poker - CashGame - HandId: #${id} - Holdem no limit (0.02€/0.05€) - 2024/10/08 17:34:46 UTC`;
const TABLE = `Table: 'Synthetic' 5-max (real money) Seat #5 is the button`;
const SEATS =
  `Seat 1: P1 (5€)\nSeat 2: P2 (5€)\nSeat 3: P3 (5€)\nSeat 4: P4 (5€)\nSeat 5: P5 (5€)`;

/** Hand 1 — UTG (P3) opens, CO (P4) 3bets, P3 folds. Nobody sees a flop. */
const HAND_1 = `${HEADER('1')}
${TABLE}
${SEATS}
*** ANTE/BLINDS ***
P1 posts small blind 0.02€
P2 posts big blind 0.05€
Dealt to P1 [2h 3h]
*** PRE-FLOP ***
P3 raises 0.10€ to 0.15€
P4 raises 0.30€ to 0.45€
P5 folds
P1 folds
P2 folds
P3 folds
P4 collected 0.67€ from pot
*** SUMMARY ***
Total pot 0.67€ | No rake
Seat 4: P4 won 0.67€
`;

/**
 * Hand 2 — CO (P4) is first in and raises (a steal attempt from CO). SB and
 * BB fold to it — SB gets a fold-to-steal opportunity and folds; BB gets one
 * too and also folds. BTN (P5) also folds without ever facing anything past
 * "first in", so no opportunity there.
 */
const HAND_2 = `${HEADER('2')}
${TABLE}
${SEATS}
*** ANTE/BLINDS ***
P1 posts small blind 0.02€
P2 posts big blind 0.05€
Dealt to P1 [4h 5h]
*** PRE-FLOP ***
P3 folds
P4 raises 0.10€ to 0.12€
P5 folds
P1 folds
P2 folds
P4 collected 0.19€ from pot
*** SUMMARY ***
Total pot 0.19€ | No rake
Seat 4: P4 won 0.19€
`;

/**
 * Hand 3 — BTN (P5) steal-raises, SB (P1) calls (not a fold-to-steal hit for
 * P1: this is a VPIP/call, giving P1 a fold-to-steal OPPORTUNITY they did not
 * take), BB (P2) folds (a fold-to-steal HIT for P2). Reaches a flop: P5 is
 * the preflop aggressor, bets the flop (a cbet), P1 calls it (a
 * fold-to-flop-cbet opportunity for P1, not taken).
 */
const HAND_3 = `${HEADER('3')}
${TABLE}
${SEATS}
*** ANTE/BLINDS ***
P1 posts small blind 0.02€
P2 posts big blind 0.05€
Dealt to P1 [6h 7h]
*** PRE-FLOP ***
P3 folds
P4 folds
P5 raises 0.10€ to 0.12€
P1 calls 0.10€
P2 folds
*** FLOP *** [Ks Jd 2d]
P1 checks
P5 bets 0.15€
P1 calls 0.15€
*** TURN *** [Ks Jd 2d 9c]
P1 checks
P5 checks
*** RIVER *** [Ks Jd 2d 9c 4h]
P1 checks
P5 checks
P5 collected 0.61€ from pot
*** SUMMARY ***
Total pot 0.61€ | No rake
Seat 5: P5 (button) won 0.61€
`;

/**
 * Hand 4 — UTG (P3) opens, BB (P2) calls, checked down to showdown so P2
 * (and P3) both see a flop and go to showdown; P2 wins with the best hand
 * (a WSD hit), P3 loses (a WTSD hit, WSD miss).
 */
const HAND_4 = `${HEADER('4')}
${TABLE}
${SEATS}
*** ANTE/BLINDS ***
P1 posts small blind 0.02€
P2 posts big blind 0.05€
Dealt to P2 [Ah Ad]
*** PRE-FLOP ***
P3 raises 0.10€ to 0.12€
P4 folds
P5 folds
P1 folds
P2 calls 0.07€
*** FLOP *** [2c 7d 9h]
P2 checks
P3 checks
*** TURN *** [2c 7d 9h 4s]
P2 checks
P3 checks
*** RIVER *** [2c 7d 9h 4s Ks]
P2 checks
P3 checks
*** SHOWDOWN ***
P2 shows [Ah Ad] (One pair : Aces)
P3 shows [Kh Qh] (One pair : Kings)
*** SUMMARY ***
Total pot 0.26€ | No rake
Board: [2c 7d 9h 4s Ks]
Seat 2: P2 (big blind) won 0.26€
`;

function url(): string {
  return 'synthetic-player-stats.txt';
}

let hands: readonly Hand[];

beforeAll(() => {
  const text = [HAND_1, HAND_2, HAND_3, HAND_4].join('\n\n');
  const result = registry.parseFile(text, 'winamax', url());
  expect(result.failures).toHaveLength(0);
  hands = result.hands;
  expect(hands).toHaveLength(4);
});

describe('playerHandFacts', () => {
  it('records VPIP/PFR for a hand nobody but the raiser and 3bettor voluntarily entered', () => {
    const facts = playerHandFacts(hands[0]!);
    const p3 = facts.find((f) => f.name === 'P3')!;
    const p4 = facts.find((f) => f.name === 'P4')!;
    const p1 = facts.find((f) => f.name === 'P1')!;

    expect(p3.vpip).toEqual({ hits: 1, opportunities: 1 });
    expect(p3.pfr).toEqual({ hits: 1, opportunities: 1 });
    expect(p4.vpip).toEqual({ hits: 1, opportunities: 1 });
    expect(p4.pfr).toEqual({ hits: 1, opportunities: 1 });
    // P1 folded the blind without ever putting in a voluntary call/bet/raise.
    expect(p1.vpip).toEqual({ hits: 0, opportunities: 1 });
    expect(p1.pfr).toEqual({ hits: 0, opportunities: 1 });
  });

  it('counts a 3bet opportunity and hit for the player who re-raises an open, and a fold-to-3bet hit for the opener', () => {
    const facts = playerHandFacts(hands[0]!);
    const p3 = facts.find((f) => f.name === 'P3')!; // opens, faces the 3bet, folds
    const p4 = facts.find((f) => f.name === 'P4')!; // 3bets

    // P4's first preflop action faces exactly one prior raise (P3's open) — a
    // 3bet opportunity — and P4 takes it.
    expect(p4.threeBet).toEqual({ hits: 1, opportunities: 1 });
    // P3's first action faced zero prior raises, so no 3bet opportunity for P3.
    expect(p3.threeBet).toEqual({ hits: 0, opportunities: 0 });

    // P3 opened with zero priors, was re-raised, and folded when facing it.
    expect(p3.foldToThreeBet).toEqual({ hits: 1, opportunities: 1 });
    // P4 never opened, so no fold-to-3bet opportunity for P4.
    expect(p4.foldToThreeBet).toEqual({ hits: 0, opportunities: 0 });

    // P5/P1/P2 folded before ever facing the 3bet as a first action following
    // their own open — none of them opened, so no fold-to-3bet opportunity.
    const p1 = facts.find((f) => f.name === 'P1')!;
    expect(p1.foldToThreeBet).toEqual({ hits: 0, opportunities: 0 });
  });

  it('scores a first-in raise from CO as a steal attempt, and blinds facing it as fold-to-steal opportunities', () => {
    const facts = playerHandFacts(hands[1]!);
    const p4 = facts.find((f) => f.name === 'P4')!; // CO, first in, raises
    const p1 = facts.find((f) => f.name === 'P1')!; // SB, folds to the steal
    const p2 = facts.find((f) => f.name === 'P2')!; // BB, folds to the steal
    const p3 = facts.find((f) => f.name === 'P3')!; // UTG, folds before the steal even happens
    const p5 = facts.find((f) => f.name === 'P5')!; // BTN, folds after the steal — not a blind

    expect(p4.steal).toEqual({ hits: 1, opportunities: 1 });
    expect(p1.foldToSteal).toEqual({ hits: 1, opportunities: 1 });
    expect(p2.foldToSteal).toEqual({ hits: 1, opportunities: 1 });
    // P3 acted before the steal raise existed, so it can't have faced it.
    expect(p3.foldToSteal).toEqual({ hits: 0, opportunities: 0 });
    // P5 is BTN, not a blind — only a blind can be "stolen from", so BTN
    // folding after the steal raise is not a fold-to-steal opportunity.
    expect(p5.foldToSteal).toEqual({ hits: 0, opportunities: 0 });
  });

  it('does not count a steal attempt from a non-steal position', () => {
    const facts = playerHandFacts(hands[3]!);
    const p3 = facts.find((f) => f.name === 'P3')!; // UTG open — not a steal position
    expect(p3.steal).toEqual({ hits: 0, opportunities: 0 });
  });

  it('scores a flop cbet for the preflop aggressor and a fold-to-cbet opportunity for whoever calls it', () => {
    const facts = playerHandFacts(hands[2]!);
    const p5 = facts.find((f) => f.name === 'P5')!; // raises preflop, bets flop
    const p1 = facts.find((f) => f.name === 'P1')!; // calls preflop, checks then calls the cbet

    expect(p5.flopCbet).toEqual({ hits: 1, opportunities: 1 });
    // P1 called the cbet rather than folding — an opportunity, not a hit.
    expect(p1.foldToFlopCbet).toEqual({ hits: 0, opportunities: 1 });
  });

  it('counts WTSD only for players who saw the flop, and WSD only for showdowns reached', () => {
    const facts = playerHandFacts(hands[3]!);
    const p2 = facts.find((f) => f.name === 'P2')!; // calls, checks to showdown, wins
    const p3 = facts.find((f) => f.name === 'P3')!; // raises, checks to showdown, loses
    const p1 = facts.find((f) => f.name === 'P1')!; // folds preflop — never saw a flop

    expect(p2.wtsd).toEqual({ hits: 1, opportunities: 1 });
    expect(p2.wsd).toEqual({ hits: 1, opportunities: 1 });
    expect(p3.wtsd).toEqual({ hits: 1, opportunities: 1 });
    expect(p3.wsd).toEqual({ hits: 0, opportunities: 1 });
    // P1 folded preflop: no flop seen, so no WTSD opportunity at all.
    expect(p1.wtsd).toEqual({ hits: 0, opportunities: 0 });
    expect(p1.wsd).toEqual({ hits: 0, opportunities: 0 });
  });

  it('computes postflop aggression per street with zero calls reading as an unbounded AF', () => {
    const facts = playerHandFacts(hands[2]!);
    const p5 = facts.find((f) => f.name === 'P5')!;
    // P5 bets the flop (1 bet, 0 calls) then checks turn and river.
    expect(p5.byStreet.flop).toEqual({ betsRaises: 1, calls: 0 });
    expect(aggressionFactor(p5.byStreet.flop)).toBe(Infinity);
    expect(p5.byStreet.turn).toEqual({ betsRaises: 0, calls: 0 });
    expect(aggressionFactor(p5.byStreet.turn)).toBeNull();
  });

  it('computes each seat\'s net result in BB and classifies win/loss/tie', () => {
    // Hand 1: pot 0.67 (0.02 SB + 0.05 BB + 0.15 P3 + 0.45 P4). P4 wins it
    // having paid 0.45 (net +0.22 = +4.4bb); P3 paid 0.15 and won nothing
    // (net -3bb); the blinds forfeit what they posted; P5 never paid in.
    const facts = playerHandFacts(hands[0]!);
    const p4 = facts.find((f) => f.name === 'P4')!;
    const p3 = facts.find((f) => f.name === 'P3')!;
    const p1 = facts.find((f) => f.name === 'P1')!;
    const p2 = facts.find((f) => f.name === 'P2')!;
    const p5 = facts.find((f) => f.name === 'P5')!;

    expect(p4.netBB).toBeCloseTo(4.4, 5);
    expect(p4.winLoss).toEqual({ wins: 1, losses: 0, ties: 0 });

    expect(p3.netBB).toBeCloseTo(-3.0, 5);
    expect(p3.winLoss).toEqual({ wins: 0, losses: 1, ties: 0 });

    expect(p1.netBB).toBeCloseTo(-0.4, 5);
    expect(p1.winLoss).toEqual({ wins: 0, losses: 1, ties: 0 });

    expect(p2.netBB).toBeCloseTo(-1.0, 5);
    expect(p2.winLoss).toEqual({ wins: 0, losses: 1, ties: 0 });

    // P5 folded before ever putting a chip in and won nothing — net exactly
    // zero counts as a tie, not a loss.
    expect(p5.netBB).toBe(0);
    expect(p5.winLoss).toEqual({ wins: 0, losses: 0, ties: 1 });
  });
});

describe('aggregatePlayers', () => {
  it('sums per-hand facts across the filtered set and keys players per room', () => {
    const facts = hands.map(playerHandFacts);
    const pool = aggregatePlayers(facts);

    const key = playerKey('winamax', 'p4');
    const p4 = pool.get(key)!;
    expect(p4).toBeDefined();
    expect(p4.name).toBe('P4');
    expect(p4.hands).toBe(4); // P4 is seated (dealt in) across all four hands

    // P4's VPIP across all four hands: a hit in hand 1 (3bets) and hand 2
    // (steal raise); a fold with no voluntary money in hand 3 (CO folds
    // preflop to the BTN steal path — never P4's action there) and hand 4
    // (folds UTG's open outright).
    expect(p4.vpip).toEqual({ hits: 2, opportunities: 4 });
    expect(pct(p4.vpip)).toBeCloseTo((2 / 4) * 100, 5);
  });

  it('returns null pct for a player with zero opportunities on a stat', () => {
    const facts = hands.map(playerHandFacts);
    const pool = aggregatePlayers(facts);
    const p4 = pool.get(playerKey('winamax', 'p4'))!;
    expect(p4.foldToThreeBet.opportunities).toBe(0);
    expect(pct(p4.foldToThreeBet)).toBeNull();
  });

  it('sums net BB and win/loss across hands, and averages win/loss size separately', () => {
    const facts = hands.map(playerHandFacts);
    const pool = aggregatePlayers(facts);

    // P2 loses hands 1-3 (-1.0bb each, forfeiting the BB or folding to the
    // steal) and wins hand 4 (+2.8bb) — one win, three losses, net -0.2bb.
    const p2 = pool.get(playerKey('winamax', 'p2'))!;
    expect(p2.winLoss).toEqual({ wins: 1, losses: 3, ties: 0 });
    expect(p2.netBB).toBeCloseTo(-0.2, 5);
    expect(averageWinBB(p2)).toBeCloseTo(2.8, 5);
    expect(averageLossBB(p2)).toBeCloseTo(-1.0, 5);

    // P4 wins hands 1-2 and ties (never contests) hands 3-4 — no losses at
    // all, so average loss must be null rather than 0 or NaN.
    const p4 = pool.get(playerKey('winamax', 'p4'))!;
    expect(p4.winLoss).toEqual({ wins: 2, losses: 0, ties: 2 });
    expect(p4.netBB).toBeCloseTo(5.8, 5);
    expect(averageWinBB(p4)).toBeCloseTo(2.9, 5);
    expect(averageLossBB(p4)).toBeNull();
  });

  it('returns null average win for a player with no wins', () => {
    const facts = hands.map(playerHandFacts);
    const pool = aggregatePlayers(facts);
    // P1 folds preflop or to a cbet in every hand and never wins one.
    const p1 = pool.get(playerKey('winamax', 'p1'))!;
    expect(p1.winLoss.wins).toBe(0);
    expect(averageWinBB(p1)).toBeNull();
  });
});

describe('chip totals', () => {
  it('sums raw net amounts when every hand agrees on currency', () => {
    const facts = hands.map(playerHandFacts);
    const pool = aggregatePlayers(facts);

    // P4 wins hand 1 (+22c: paid 45c of a 67c pot) and hand 2 (+7c: paid 12c
    // of a 19c pot), and never puts a chip in on hands 3-4 — 29c total, all
    // EUR cash, so chips must be a real (non-null) EUR total.
    const p4 = pool.get(playerKey('winamax', 'p4'))!;
    expect(p4.chips).not.toBeNull();
    expect(p4.chips!.currency).toBe('EUR');
    expect(p4.chips!.exponent).toBe(2);
    expect(p4.chips!.net).toBe(29);
    expect(p4.chips!.sumWin).toBe(29); // both contributing hands are wins
    expect(p4.chips!.sumLoss).toBe(0);
  });

  it('falls back to null once one hand disagrees on currency', () => {
    // Same player (by playerId), but one hand is a Winamax tournament (chip
    // currency) instead of cash (EUR) — realistic for a player who plays both
    // formats on the same site, and exactly the case a raw sum must not paper
    // over: chips and cents are not the same unit.
    const tourneyHand = `Winamax Poker - Tournament "Synthetic MTT"(5€ + 0.50€) - HandId: #99-1-1 - Holdem no limit (level1, 10/20) - 2024/10/08 18:00:00 UTC
Table: 'Synthetic MTT(999)#1' 3-max Seat #1 is the button
Seat 1: P1 (2000)
Seat 2: P2 (1500)
Seat 3: P3 (1000)
*** ANTE/BLINDS ***
P2 posts small blind 10
P3 posts big blind 20
Dealt to P1 [Ah Kh]
*** PRE-FLOP ***
P1 raises 480 to 500 and is all-in
P2 folds
P3 calls 480 and is all-in
*** FLOP *** [2c 7d 9h]
*** TURN *** [2c 7d 9h][Jd]
*** RIVER *** [2c 7d 9h Jd][3s]
*** SHOW DOWN ***
P1 shows [Ah Kh] (High Card : Ace)
P3 shows [Ks Qs] (High Card : King)
P1 collected 1010 from pot
*** SUMMARY ***
Total pot 1010 | Rake 0
Board: [2c 7d 9h Jd 3s]
Seat 1: P1 (button) showed [Ah Kh] and won 1010 with High Card : Ace
Seat 3: P3 (big blind) showed [Ks Qs] and lost with High Card : King
`;

    const parsed = registry.parseFile(tourneyHand, 'winamax', 'synthetic-tourney.txt');
    expect(parsed.failures).toHaveLength(0);

    const facts = [...hands, ...parsed.hands].map(playerHandFacts);
    const pool = aggregatePlayers(facts);

    const p1 = pool.get(playerKey('winamax', 'p1'))!;
    expect(p1.chips).toBeNull();
    // BB is unaffected by the currency mismatch — it stays a valid total
    // across every hand regardless of which currency each one was in.
    expect(typeof p1.netBB).toBe('number');
    expect(Number.isFinite(p1.netBB)).toBe(true);
  });
});
