import type { DecisionPoint } from '../types';
import {
  type Range, openingRange, threeBetRange, fourBetRange, topRange,
} from './preflop-ranges';

/**
 * The range a BALANCED villain holds at this decision point.
 *
 * Every postflop verdict is only as good as this estimate, so it is built from
 * the two things the hand history actually tells us: how aggressive villain has
 * been, and from where. It deliberately does not adapt to a player's observed
 * tendencies — that would need a sample this engine does not have, and guessing
 * is what the skip path exists to avoid.
 */
export function villainRange(d: DecisionPoint): { range: Range; label: string } {
  if (d.street === 'preflop') return preflopRange(d);
  return postflopRange(d);
}

function preflopRange(d: DecisionPoint): { range: Range; label: string } {
  if (d.raisesBefore >= 2) {
    return { range: fourBetRange(), label: 'a balanced 4-betting range (top 3%)' };
  }
  if (d.raisesBefore === 1) {
    const pos = d.aggressorPosition;
    return pos
      ? { range: openingRange(pos), label: `a balanced ${pos} opening range` }
      : { range: topRange(0.20), label: 'a balanced opening range' };
  }
  // Unopened: the players still to act are the constraint, not a raiser.
  return { range: topRange(0.35), label: 'a balanced range' };
}

/**
 * Postflop, villain's range is their preflop range narrowed by the aggression
 * they have shown since.
 *
 * The tightening factors are coarse on purpose: a balanced player bets a mix of
 * value and bluffs, so a bet narrows their range far less than folding logic
 * would suggest. Over-tightening here would turn correct hero calls into
 * phantom mistakes.
 */
function postflopRange(d: DecisionPoint): { range: Range; label: string } {
  // The street-local aggressor is the better anchor when there is one, but a
  // street that opens with a check has none — fall back to who led preflop
  // rather than discarding what the hand already told us.
  const anchor = d.aggressorPosition ?? d.preflopAggressorPosition;

  // A pot that was 3-bet preflop is far tighter than any opening range.
  const base = d.preflopRaiseCount >= 2
    ? threeBetRange()
    : anchor ? openingRange(anchor) : topRange(0.30);
  const baseLabel = d.preflopRaiseCount >= 2
    ? `a balanced ${anchor ? `${anchor} ` : ''}3-bet range`
    : anchor ? `a balanced ${anchor} range` : 'a balanced range';

  if (d.raisesBefore >= 2) {
    return {
      range: threeBetRange(),
      label: `${baseLabel} narrowed to raises and re-raises`,
    };
  }
  if (d.raisesBefore === 1) {
    // A single bet on a later street means more than one on the flop.
    const tighten = d.street === 'river' ? 0.45 : d.street === 'turn' ? 0.6 : 0.75;
    return {
      range: narrow(base, tighten),
      label: `${baseLabel} narrowed to their ${d.street} betting range`,
    };
  }
  return { range: base, label: baseLabel };
}

/** Keeps the strongest `keep` fraction of a range, preserving weights. */
function narrow(range: Range, keep: number): Range {
  const total = [...range.values()].reduce((a, b) => a + b, 0);
  const target = total * keep;
  const tightened = topRange(1);
  const out = new Map<string, number>();
  let used = 0;
  // Walk the global strength order so the strongest members survive.
  for (const cls of tightened.keys()) {
    const w = range.get(cls);
    if (!w) continue;
    if (used >= target) break;
    const take = Math.min(w, target - used);
    out.set(cls, take);
    used += take;
  }
  return out;
}
