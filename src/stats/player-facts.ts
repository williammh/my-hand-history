import type { Hand } from '@/domain/hand';
import { isVoluntary } from '@/domain/action';
import type { Position } from '@/domain/position';
import { seatNetResult } from '@/domain/stacks';
import { toBB } from '@/domain/money';
import {
  type Counter, type PlayerHandFacts, type PostflopStreet, type StreetAggression, type WinLoss,
  EMPTY_COUNTER, EMPTY_AGGRESSION, playerKey, POSTFLOP_STREETS,
} from './types';

const AGGRESSIVE = new Set(['bet', 'raise']);

/** Positions a first-in raise counts as a steal attempt from. */
const STEAL_POSITIONS = new Set<Position>(['CO', 'BTN', 'SB']);

/** Only a blind can be stolen from, so only a blind gets a fold-to-steal opportunity. */
const BLIND_POSITIONS = new Set<Position>(['SB', 'BB']);

function hit(ok: boolean): Counter {
  return { hits: ok ? 1 : 0, opportunities: 1 };
}

function none(): Counter {
  return EMPTY_COUNTER;
}

/**
 * Went to showdown, defined structurally rather than from the parsed
 * `hand.showdown` section: that section is populated from the site's SHOW
 * DOWN text, which is absent on an all-in run-out where no cards are shown
 * because the hand is already decided. A player who never folded and was not
 * alone at the end saw a showdown regardless of whether the site printed one.
 */
function wentToShowdown(hand: Hand, seat: number): boolean {
  const folded = new Set(hand.actions.filter((a) => a.kind === 'fold').map((a) => a.seat));
  if (folded.has(seat)) return false;
  const liveSeats = hand.seats.filter((s) => !s.sittingOut && !folded.has(s.seat));
  return liveSeats.length >= 2;
}

/**
 * One seat's raw counts for one hand.
 *
 * Every counter here is hits-over-opportunities, computed only from actions
 * the file actually records — a villain's stats are exactly as complete as
 * the site's export, with no "hero-only" caveat the way HandFacts has one.
 */
function seatFacts(hand: Hand, seat: number): PlayerHandFacts {
  const player = hand.seats.find((s) => s.seat === seat)!;
  const preflop = hand.actions.filter((a) => a.street === 'preflop' && isVoluntary(a.kind));
  const seatPreflop = preflop.filter((a) => a.seat === seat);

  // VPIP / PFR — any voluntary preflop money in, and any preflop raise.
  const vpip = hit(seatPreflop.some((a) => a.kind === 'call' || AGGRESSIVE.has(a.kind)));
  const pfr = hit(seatPreflop.some((a) => AGGRESSIVE.has(a.kind)));

  // 3Bet — an opportunity exists the moment the player's first preflop action
  // faces exactly one prior raise; whether they take it (raise) is the hit.
  // A player who acted preflop only after two-plus raises had a 4bet+
  // opportunity instead, which is out of scope for this stat.
  let threeBet: Counter = none();
  let foldToThreeBet: Counter = none();
  const firstAction = seatPreflop[0];
  if (firstAction) {
    const before = preflop.slice(0, preflop.indexOf(firstAction));
    const priorRaises = before.filter((a) => AGGRESSIVE.has(a.kind));
    if (priorRaises.length === 1) {
      threeBet = hit(firstAction.kind === 'raise');
    }
  }

  // Fold to 3bet — the player opened (their first raise had zero priors),
  // someone else re-raised after that, and the player faced it (acted again).
  const seatRaises = seatPreflop.filter((a) => AGGRESSIVE.has(a.kind));
  const openRaise = seatRaises.find((r) => {
    const before = preflop.slice(0, preflop.indexOf(r));
    return before.filter((a) => AGGRESSIVE.has(a.kind)).length === 0;
  });
  if (openRaise) {
    const openIdx = preflop.indexOf(openRaise);
    const reRaise = preflop.slice(openIdx + 1).find((a) => a.seat !== seat && AGGRESSIVE.has(a.kind));
    if (reRaise) {
      const reRaiseIdx = preflop.indexOf(reRaise);
      const response = preflop.slice(reRaiseIdx + 1).find((a) => a.seat === seat);
      if (response) foldToThreeBet = hit(response.kind === 'fold');
    }
  }

  // ATS — the player is in CO/BTN/SB, first in (no call/raise precedes their
  // first preflop action), and acts. Hit is a raise (an open-raise steal
  // attempt); anything else (fold, limp) is a miss, not "no opportunity".
  let steal: Counter = none();
  if (firstAction && STEAL_POSITIONS.has(player.position)) {
    const before = preflop.slice(0, preflop.indexOf(firstAction));
    const firstIn = before.every((a) => a.kind !== 'call' && !AGGRESSIVE.has(a.kind));
    if (firstIn) steal = hit(firstAction.kind === 'raise');
  }

  // Fold to steal — someone else made a first-in steal raise from CO/BTN/SB,
  // and this seat is a BLIND acting behind it (only a blind can be stolen
  // from — a non-blind seat that happens to act after the raise, e.g. BTN
  // when SB raises, was never a steal target and gets no opportunity here).
  let foldToSteal: Counter = none();
  if (BLIND_POSITIONS.has(player.position)) {
    const stealRaise = preflop.find((a) => {
      if (a.seat === seat || !AGGRESSIVE.has(a.kind)) return false;
      const raiser = hand.seats.find((s) => s.seat === a.seat);
      if (!raiser || !STEAL_POSITIONS.has(raiser.position)) return false;
      const before = preflop.slice(0, preflop.indexOf(a));
      return before.every((b) => b.kind !== 'call' && !AGGRESSIVE.has(b.kind));
    });
    if (stealRaise) {
      const stealIdx = preflop.indexOf(stealRaise);
      const response = preflop.slice(stealIdx + 1).find((a) => a.seat === seat);
      if (response) foldToSteal = hit(response.kind === 'fold');
    }
  }

  // Flop cbet — this seat was the last preflop aggressor, the hand reached a
  // flop, and no one bet before this seat's first flop action.
  const lastPreflopAggressor = preflop.filter((a) => AGGRESSIVE.has(a.kind)).at(-1);
  const flopStreet = hand.streets.find((s) => s.street === 'flop');
  let flopCbet: Counter = none();
  let foldToFlopCbet: Counter = none();
  if (flopStreet && lastPreflopAggressor) {
    if (lastPreflopAggressor.seat === seat) {
      const seatFlopFirst = flopStreet.actions.find((a) => a.seat === seat && isVoluntary(a.kind));
      if (seatFlopFirst) {
        const before = flopStreet.actions.slice(0, flopStreet.actions.indexOf(seatFlopFirst));
        const betBefore = before.some((a) => a.kind === 'bet' || a.kind === 'raise');
        if (!betBefore) flopCbet = hit(seatFlopFirst.kind === 'bet');
      }
    } else {
      // Someone else was the aggressor: did THEY cbet, and did this seat face it?
      const aggressorFirst = flopStreet.actions.find(
        (a) => a.seat === lastPreflopAggressor.seat && isVoluntary(a.kind),
      );
      if (aggressorFirst && aggressorFirst.kind === 'bet') {
        const cbetIdx = flopStreet.actions.indexOf(aggressorFirst);
        const response = flopStreet.actions.slice(cbetIdx + 1).find((a) => a.seat === seat);
        if (response) foldToFlopCbet = hit(response.kind === 'fold');
      }
    }
  }

  // WTSD is scoped to hands the player saw a flop in (folding preflop is not
  // "declining to go to showdown" in the usual HUD sense).
  const sawFlop = seatPreflop.length === 0
    ? false
    : !hand.actions.some((a) => a.seat === seat && a.kind === 'fold' && a.street === 'preflop');
  const flopReached = Boolean(flopStreet);
  const wtsd = flopReached && sawFlop ? hit(wentToShowdown(hand, seat)) : none();
  const wsd = wentToShowdown(hand, seat)
    ? hit(hand.awards.some((a) => a.seat === seat && a.amount > 0))
    : none();

  // Aggression factor, overall and per postflop street.
  const byStreet: Record<PostflopStreet, StreetAggression> = {
    flop: { ...EMPTY_AGGRESSION },
    turn: { ...EMPTY_AGGRESSION },
    river: { ...EMPTY_AGGRESSION },
  };
  for (const street of POSTFLOP_STREETS) {
    const streetState = hand.streets.find((s) => s.street === street);
    if (!streetState) continue;
    const seatActions = streetState.actions.filter((a) => a.seat === seat && isVoluntary(a.kind));
    const betsRaises = seatActions.filter((a) => AGGRESSIVE.has(a.kind)).length;
    const calls = seatActions.filter((a) => a.kind === 'call').length;
    byStreet[street] = { betsRaises, calls };
  }
  const aggression = Object.values(byStreet).reduce(
    (acc, s) => ({ betsRaises: acc.betsRaises + s.betsRaises, calls: acc.calls + s.calls }),
    { ...EMPTY_AGGRESSION },
  );

  // Net result in BB is the always-valid cross-hand unit: hands come from
  // different currencies, buy-ins, and blind levels, so a raw chip or cent
  // total across hands can be meaningless. The raw amount is carried too
  // (netAmount/money) so the aggregator can sum it when a sample turns out to
  // share one currency — see ChipTotals.
  const netAmount = seatNetResult(hand, seat);
  const netBB = toBB(netAmount, hand.money);
  const winLoss: WinLoss =
    netBB > 0 ? { wins: 1, losses: 0, ties: 0 }
      : netBB < 0 ? { wins: 0, losses: 1, ties: 0 }
      : { wins: 0, losses: 0, ties: 1 };

  return {
    key: playerKey(hand.meta.siteId, player.playerId),
    name: player.name,
    siteId: hand.meta.siteId,
    isHero: player.isHero,
    vpip,
    pfr,
    threeBet,
    foldToThreeBet,
    steal,
    foldToSteal,
    flopCbet,
    foldToFlopCbet,
    wtsd,
    wsd,
    aggression,
    byStreet,
    netBB,
    winLoss,
    netAmount,
    money: hand.money,
  };
}

/** One record per seated, dealt-in player — hero included. */
export function playerHandFacts(hand: Hand): readonly PlayerHandFacts[] {
  return hand.seats.filter((s) => !s.sittingOut).map((s) => seatFacts(hand, s.seat));
}
