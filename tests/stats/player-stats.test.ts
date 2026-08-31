import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '@/parsers/index';
import type { Hand } from '@/domain/hand';
import { playerHandFacts } from '@/stats/player-facts';
import { aggregatePlayers } from '@/stats/aggregate';
import { pct, aggressionFactor, playerKey } from '@/stats/types';

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
P5 collected 0.54€ from pot
*** SUMMARY ***
Total pot 0.54€ | No rake
Seat 5: P5 (button) won 0.54€
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
Total pot 0.24€ | No rake
Board: [2c 7d 9h 4s Ks]
Seat 2: P2 (big blind) won 0.24€
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
});
