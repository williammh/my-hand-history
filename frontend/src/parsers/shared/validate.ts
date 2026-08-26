import { CHIP_MOVING } from '@/domain/action.js';
import { STREET_BOARD_LENGTH } from '@/domain/position.js';
import type { Hand, ParseWarning } from '@/domain/hand.js';
import { WarningCode, warn } from './warnings.js';

/**
 * Post-parse sanity checks. Every issue is a warning, never a throw: one odd
 * hand must not cost the user the other 499 in their file.
 *
 * The pot checksum is the highest-value check in the project — it catches almost
 * every delta-versus-total mistake automatically. Verified against all three
 * sample hands: 453766, 16800, 108800.
 */
export function validateHand(hand: Hand): ParseWarning[] {
  const issues: ParseWarning[] = [];

  // 1. Pot checksum against what the site reported.
  const computed = hand.actions.reduce(
    (acc, a) => acc + (a.kind === 'uncalled-return' ? -a.amount : CHIP_MOVING.has(a.kind) ? a.amount : 0),
    0,
  );
  if (hand.reportedTotalPot !== null && computed !== hand.reportedTotalPot) {
    issues.push(warn(
      WarningCode.POT_MISMATCH,
      `Chips in actions (${computed}) do not match reported total pot (${hand.reportedTotalPot})`,
    ));
  }

  // 2. Awards should not exceed the pot.
  const awarded = hand.awards.reduce((a, w) => a + w.amount, 0);
  if (hand.awards.length > 0 && awarded !== computed - hand.meta.rake) {
    issues.push(warn(
      WarningCode.AWARD_MISMATCH,
      `Awards (${awarded}) do not match pot minus rake (${computed - hand.meta.rake})`,
    ));
  }

  // 3. Nobody may commit more than they brought.
  const committed = new Map<number, number>();
  for (const a of hand.actions) {
    if (CHIP_MOVING.has(a.kind)) committed.set(a.seat, (committed.get(a.seat) ?? 0) + a.amount);
  }
  for (const seat of hand.seats) {
    const c = committed.get(seat.seat) ?? 0;
    if (c > seat.startingStack) {
      issues.push(warn(
        WarningCode.STACK_EXCEEDED,
        `${seat.name} committed ${c} but started with ${seat.startingStack}`,
      ));
    }
  }

  // 4. Board length must match the deepest street reached.
  const deepest = hand.streets[hand.streets.length - 1];
  if (deepest) {
    const expected = STREET_BOARD_LENGTH[deepest.street];
    if (hand.finalBoard.length !== expected) {
      issues.push(warn(
        WarningCode.BOARD_LENGTH_MISMATCH,
        `Reached ${deepest.street} but board has ${hand.finalBoard.length} cards (expected ${expected})`,
      ));
    }
  }

  // 5. No duplicate cards across board and every revealed hand.
  const seen = new Map<string, string>();
  const note = (card: string, where: string) => {
    const prev = seen.get(card);
    if (prev) {
      issues.push(warn(WarningCode.DUPLICATE_CARD, `Card ${card} appears in both ${prev} and ${where}`));
    } else seen.set(card, where);
  };
  hand.finalBoard.forEach((c) => note(c, 'board'));
  for (const s of hand.seats) {
    if (s.holeCards) s.holeCards.forEach((c) => note(c, s.name));
  }

  // 6. Exactly one big blind; at most one small blind.
  const bbPosts = hand.actions.filter((a) => a.kind === 'post-bb').length;
  const sbPosts = hand.actions.filter((a) => a.kind === 'post-sb').length;
  if (bbPosts !== 1) issues.push(warn(WarningCode.BLIND_ANOMALY, `Expected 1 big blind post, found ${bbPosts}`));
  if (sbPosts > 1) issues.push(warn(WarningCode.BLIND_ANOMALY, `Found ${sbPosts} small blind posts`));

  return issues;
}
