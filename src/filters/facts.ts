import type { Hand } from '@/domain/hand';
import type { Position, Street } from '@/domain/position';
import { STREET_ORDER, postflopOrder } from '@/domain/position';
import { isVoluntary } from '@/domain/action';
import type { Action } from '@/domain/action';
import { heroEffectiveStackBB } from '@/domain/stacks';
import type { HandAnalysis, Severity } from '@/analysis/types';
import { playerKey } from '@/stats/types';
import { boardTexture } from './board';
import type {
  HandFacts, LineToken, PotType, PreflopAggression, RelativePosition, StackBucket,
} from './types';

/** The ladder the stack filter offers. A hand snaps to the nearest rung at or below it. */
export const STACK_BUCKETS: readonly StackBucket[] = [20, 40, 50, 75, 100, 150, 200];

/**
 * Snaps an effective stack to the bucket it belongs to.
 *
 * Rungs are floors, not midpoints: 63bb is "50", not "75". A player filtering
 * for 75bb spots means "around 75 and up", and rounding 63 up into that bucket
 * would put a clearly-50bb hand in it.
 */
export function stackBucket(bb: number): StackBucket {
  let out: StackBucket = STACK_BUCKETS[0]!;
  for (const b of STACK_BUCKETS) if (bb >= b) out = b;
  return out;
}

const AGGRESSIVE = new Set(['bet', 'raise']);

/** Classifies the preflop betting shape hero was part of. */
function derivePotType(hand: Hand, heroSeat: number | null): PotType {
  const preflop = hand.actions.filter((a) => a.street === 'preflop' && isVoluntary(a.kind));
  const raises = preflop.filter((a) => AGGRESSIVE.has(a.kind));
  const limps = preflop.filter((a) => a.kind === 'call' && raises.length === 0);

  if (raises.length === 0) return limps.length > 0 ? 'limp' : 'preflop';

  // A raise with limpers already in front of it is an isolation raise, not an open.
  const firstRaiseIdx = preflop.indexOf(raises[0]!);
  const limpsBeforeFirstRaise = preflop
    .slice(0, firstRaiseIdx)
    .filter((a) => a.kind === 'call').length;

  if (raises.length === 1) return limpsBeforeFirstRaise > 0 ? 'iso' : 'srp';

  if (raises.length === 2) {
    // A 3bet over a raise that already had at least one caller is a squeeze.
    const secondRaiseIdx = preflop.indexOf(raises[1]!);
    const callersBetween = preflop
      .slice(firstRaiseIdx + 1, secondRaiseIdx)
      .filter((a) => a.kind === 'call').length;
    if (callersBetween > 0) {
      // Only call it a squeeze when it is hero's own squeeze or hero faced one;
      // either way the pot's shape is what the filter names.
      void heroSeat;
      return 'squeeze';
    }
    return '3bet';
  }
  if (raises.length === 3) return '4bet';
  return '5bet';
}

/**
 * Hero's line on one street, as a token.
 *
 * Hero's own voluntary actions only — the opponents' actions define the
 * scenario, not the line. Capped at two actions, see {@link LineToken}.
 */
function lineToken(actions: readonly Action[]): LineToken | null {
  const kinds = actions
    .filter((a) => isVoluntary(a.kind))
    .map((a) => a.kind)
    .filter((k): k is 'fold' | 'check' | 'call' | 'bet' | 'raise' =>
      k === 'fold' || k === 'check' || k === 'call' || k === 'bet' || k === 'raise');

  if (kinds.length === 0) return null;
  const token = kinds.slice(0, 2).join('-');
  // A lone fold has no second half; everything else is first-second.
  return (kinds.length === 1 ? kinds[0]! : token) as LineToken;
}

/**
 * Whether hero acts after the last preflop aggressor on postflop streets.
 *
 * Position is a property of the seat order, not of who happened to act first on
 * a given street: a checked-through flop must not flip hero from IP to OOP. So
 * this reads the postflop seat rotation directly.
 */
function relativeTo(hand: Hand, heroSeat: number, villainSeat: number): RelativePosition {
  const order = postflopOrder({
    seats: hand.seats.map((s) => s.seat),
    buttonSeat: hand.buttonSeat,
  });
  return order.indexOf(heroSeat) > order.indexOf(villainSeat) ? 'ip' : 'oop';
}

/** Worst (most severe) verdict hero got on each street. */
function severityByStreet(
  hand: Hand,
  heroSeat: number | null,
  analysis: HandAnalysis | undefined,
): Partial<Record<Street, Severity>> {
  const out: Partial<Record<Street, Severity>> = {};
  if (!analysis || heroSeat === null) return out;

  const RANK: Record<Severity, number> = { ok: 0, inaccuracy: 1, mistake: 2, blunder: 3 };
  for (const v of analysis.verdicts) {
    const action = hand.actions[v.actionIndex];
    if (!action || action.seat !== heroSeat) continue;
    const prev = out[action.street];
    if (prev === undefined || RANK[v.severity] > RANK[prev]) out[action.street] = v.severity;
  }
  return out;
}

/**
 * Derives everything the filters match on, for one hand.
 *
 * `analysis` is optional because it arrives asynchronously per hand — a hand
 * with no analysis yet simply carries no severity facts and is therefore
 * excluded only by an active severity filter, never by the others.
 */
export function deriveFacts(hand: Hand, analysis?: HandAnalysis): HandFacts {
  const heroSeat = hand.heroSeat;
  const heroPlayer = heroSeat === null ? undefined : hand.seats.find((s) => s.seat === heroSeat);

  const preflop = hand.actions.filter((a) => a.street === 'preflop' && isVoluntary(a.kind));
  const heroPreflop = preflop.filter((a) => a.seat === heroSeat);

  // Opponents who voluntarily put money in preflop — the players hero was
  // actually in a pot with, not everyone dealt in.
  const opponentPositions = [
    ...new Set(
      preflop
        .filter((a) => a.seat !== heroSeat && (a.kind === 'call' || AGGRESSIVE.has(a.kind)))
        .map((a) => hand.seats.find((s) => s.seat === a.seat)?.position)
        .filter((p): p is Position => Boolean(p)),
    ),
  ];

  const heroRaised = heroPreflop.some((a) => AGGRESSIVE.has(a.kind));
  const heroCalled = heroPreflop.some((a) => a.kind === 'call');
  const preflopAggression: PreflopAggression | null =
    heroRaised ? 'raiser' : heroCalled ? 'caller' : null;

  // The last opponent to raise preflop anchors hero's relative position.
  const lastVillainAggressor = preflop
    .filter((a) => a.seat !== heroSeat && AGGRESSIVE.has(a.kind))
    .at(-1);
  const relativePosition =
    heroSeat === null || !lastVillainAggressor
      ? null
      : relativeTo(hand, heroSeat, lastVillainAggressor.seat);

  const streetsPlayed = new Set<Street>();
  const lineByStreet: Partial<Record<Street, LineToken>> = {};
  const relativeByStreet: Partial<Record<Street, RelativePosition>> = {};

  for (const street of STREET_ORDER) {
    const streetActions = hand.actions.filter((a) => a.street === street);
    if (streetActions.length === 0) continue;
    const heroActions = streetActions.filter((a) => a.seat === heroSeat && isVoluntary(a.kind));
    if (heroActions.length > 0) streetsPlayed.add(street);

    const token = lineToken(heroActions);
    if (token) lineByStreet[street] = token;

    if (heroSeat !== null) {
      // Postflop, position is versus whoever is still driving the pot — the
      // preflop aggressor if nobody has taken over on this street.
      const villain =
        streetActions.filter((a) => a.seat !== heroSeat && AGGRESSIVE.has(a.kind)).at(-1) ??
        lastVillainAggressor;
      if (villain) relativeByStreet[street] = relativeTo(hand, heroSeat, villain.seat);
    }
  }

  const effBB = heroEffectiveStackBB(hand, -1);

  return {
    handId: hand.id,
    siteId: hand.meta.siteId,
    sourceFile: hand.meta.sourceFile,
    playerKeys: new Set(
      hand.seats.filter((s) => !s.sittingOut).map((s) => playerKey(hand.meta.siteId, s.playerId)),
    ),
    potType: derivePotType(hand, heroSeat),
    heroPosition: heroPlayer?.position ?? null,
    opponentPositions,
    relativePosition,
    preflopAggression,
    effectiveStackBB: effBB,
    streetsPlayed,
    sawFlop: hand.streets.some((s) => s.street === 'flop' && streetsPlayed.has('flop')),
    lineByStreet,
    relativeByStreet,
    severityByStreet: severityByStreet(hand, heroSeat, analysis),
    board: boardTexture(hand.finalBoard),
  };
}
