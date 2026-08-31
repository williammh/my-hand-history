import { asAmount, toBB } from '@/domain/money';
import { CHIP_MOVING, isVoluntary } from '@/domain/action';
import type { Hand } from '@/domain/hand';
import { stacksAtAction } from '@/domain/stacks';
import type { DecisionPoint, PreflopScenario } from './types';

/**
 * Extracts every voluntary decision made by the given seat, with the context
 * needed to judge it. Works identically for hero or any villain seat — the
 * only thing that varies is whose hole cards are known, which the caller
 * finds out via `DecisionPoint.heroCards` being null.
 *
 * Shared by all engines on purpose: the server solver's request payload gets
 * built by the same code path as the local heuristic's input, so the two can
 * never drift in how they read a spot.
 */
export function extractDecisions(hand: Hand, heroSeat: number): DecisionPoint[] {
  const heroPlayer = hand.seats.find((s) => s.seat === heroSeat);
  if (!heroPlayer) return [];

  const out: DecisionPoint[] = [];
  const startingStackBB = toBB(heroPlayer.startingStack, hand.money);

  for (let i = 0; i < hand.actions.length; i++) {
    const action = hand.actions[i]!;
    if (action.seat !== heroSeat || !isVoluntary(action.kind)) continue;

    // State immediately BEFORE hero acts.
    const before = stacksAtAction(hand, i - 1);

    let potBefore = 0;
    const streetCommitted = new Map<number, number>();
    let currentStreet = hand.actions[0]?.street ?? 'preflop';

    for (let j = 0; j < i; j++) {
      const a = hand.actions[j]!;
      if (a.street !== currentStreet) {
        currentStreet = a.street;
        streetCommitted.clear();
      }
      if (CHIP_MOVING.has(a.kind)) {
        potBefore += a.amount;
        if (a.kind !== 'post-ante') {
          streetCommitted.set(a.seat, (streetCommitted.get(a.seat) ?? 0) + a.amount);
        }
      } else if (a.kind === 'uncalled-return') {
        potBefore -= a.amount;
        streetCommitted.set(a.seat, (streetCommitted.get(a.seat) ?? 0) - a.amount);
      }
    }

    // Only commitments on hero's own street count toward what hero owes.
    const sameStreet = new Map<number, number>();
    for (let j = 0; j < i; j++) {
      const a = hand.actions[j]!;
      if (a.street !== action.street) continue;
      if (CHIP_MOVING.has(a.kind) && a.kind !== 'post-ante') {
        sameStreet.set(a.seat, (sameStreet.get(a.seat) ?? 0) + a.amount);
      }
    }
    const highest = Math.max(0, ...sameStreet.values());
    const heroCommitted = sameStreet.get(heroSeat) ?? 0;
    const heroStack = before.stacks.get(heroSeat) ?? 0;
    const toCall = Math.max(0, Math.min(highest - heroCommitted, heroStack));

    // Live opponents at this moment.
    const liveOpponents = hand.seats.filter(
      (s) => s.seat !== heroSeat && !before.folded.has(s.seat),
    );
    let effective = heroStack;
    for (const opp of liveOpponents) {
      const oppStack = before.stacks.get(opp.seat) ?? 0;
      effective = Math.min(effective, Math.max(oppStack, 0));
    }
    if (liveOpponents.length === 0) effective = heroStack;

    // Did anyone voluntarily put chips in before hero acted this street?
    const voluntaryBefore = hand.actions
      .slice(0, i)
      .filter((a) => a.street === action.street && isVoluntary(a.kind) && a.amount > 0);
    const raisesBefore = voluntaryBefore.filter((a) => a.kind === 'raise' || a.kind === 'bet');

    // Who last put in a bet or raise this street — their position sets the range
    // hero's decision is judged against.
    const lastAggressive = [...voluntaryBefore].reverse().find(
      (a) => a.kind === 'raise' || a.kind === 'bet',
    );
    const aggressorPosition =
      hand.seats.find((s) => s.seat === lastAggressive?.seat)?.position ?? null;

    // Preflop betting context, carried onto every later street.
    const preflopAggressive = hand.actions
      .slice(0, i)
      .filter((a) => a.street === 'preflop' && (a.kind === 'raise' || a.kind === 'bet'));
    const lastPreflopAggressor = preflopAggressive.filter((a) => a.seat !== heroSeat).at(-1);
    const preflopAggressorPosition =
      hand.seats.find((s) => s.seat === lastPreflopAggressor?.seat)?.position ?? null;

    let scenario: PreflopScenario | null = null;
    if (action.street === 'preflop') {
      const heroInBlinds = heroPlayer.position === 'SB' || heroPlayer.position === 'BB';
      const onlyBlindsLeft = liveOpponents.every(
        (o) => o.position === 'SB' || o.position === 'BB',
      );
      if (raisesBefore.length >= 2) scenario = 'vs-3bet';
      else if (raisesBefore.length === 1) scenario = 'vs-raise';
      else if (heroInBlinds && onlyBlindsLeft) scenario = 'blind-vs-blind';
      else scenario = 'rfi';
    }

    out.push({
      actionIndex: i,
      seat: heroSeat,
      street: action.street,
      position: heroPlayer.position,
      heroCards: heroPlayer.holeCards,
      board: hand.streets.find((s) => s.street === action.street)?.board ?? [],
      potBefore: asAmount(potBefore),
      toCall: asAmount(toCall),
      effectiveStackBB: toBB(asAmount(effective), hand.money),
      startingStackBB,
      playersInHand: liveOpponents.length + 1,
      facingRaise: raisesBefore.length > 0,
      scenario,
      potIsUnopened: voluntaryBefore.length === 0,
      aggressorPosition,
      raisesBefore: raisesBefore.length,
      preflopAggressorPosition,
      preflopRaiseCount: preflopAggressive.length,
      heroStackBB: toBB(asAmount(heroStack), hand.money),
    });
  }

  return out;
}

/** Hero's own decisions. Thin wrapper over {@link extractDecisions}. */
export function extractHeroDecisions(hand: Hand): DecisionPoint[] {
  if (hand.heroSeat === null) return [];
  return extractDecisions(hand, hand.heroSeat);
}
