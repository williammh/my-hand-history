import {
  type ChipTotals, type PlayerHandFacts, type PlayerKey, type PlayerStats, type PostflopStreet,
  EMPTY_COUNTER, EMPTY_AGGRESSION, EMPTY_WIN_LOSS, POSTFLOP_STREETS,
  addCounter, addAggression, addWinLoss,
} from './types';

/**
 * Extends a player's running chip total with one more hand, or drops it to
 * `'mixed'` for good once a currency mismatch shows up.
 *
 * `'mixed'` is a distinct state from `null`: `null` in `PlayerStats.chips`
 * means "don't render a chip number", but internally we still need to tell
 * "no hand seen yet" apart from "already gave up on this player" so a later
 * same-currency hand doesn't resurrect a total that mixed currencies broke.
 */
function extendChips(
  running: ChipTotals | 'mixed' | undefined,
  f: PlayerHandFacts,
): ChipTotals | 'mixed' {
  if (running === 'mixed') return 'mixed';
  if (running && (running.currency !== f.money.currency || running.exponent !== f.money.exponent)) {
    return 'mixed';
  }
  const base: ChipTotals = running ?? {
    currency: f.money.currency,
    exponent: f.money.exponent,
    net: 0 as PlayerHandFacts['netAmount'],
    sumWin: 0 as PlayerHandFacts['netAmount'],
    sumLoss: 0 as PlayerHandFacts['netAmount'],
  };
  return {
    currency: base.currency,
    exponent: base.exponent,
    net: (base.net + f.netAmount) as ChipTotals['net'],
    sumWin: (base.sumWin + (f.netAmount > 0 ? f.netAmount : 0)) as ChipTotals['sumWin'],
    sumLoss: (base.sumLoss + (f.netAmount < 0 ? f.netAmount : 0)) as ChipTotals['sumLoss'],
  };
}

/**
 * Sums per-hand player facts into cross-hand stats, one pass of integer adds.
 *
 * Takes the per-hand fact arrays for exactly the hands currently visible
 * (already filtered by the caller) — this function does no filtering of its
 * own, so a filter change only changes which arrays are passed in, never how
 * they're summed.
 */
export function aggregatePlayers(
  facts: readonly (readonly PlayerHandFacts[])[],
): Map<PlayerKey, PlayerStats> {
  const out = new Map<PlayerKey, PlayerStats>();
  const chipsByKey = new Map<PlayerKey, ChipTotals | 'mixed'>();

  for (const handFacts of facts) {
    for (const f of handFacts) {
      const existing = out.get(f.key);
      const byStreet: Record<PostflopStreet, ReturnType<typeof addAggression>> = existing
        ? { ...existing.byStreet }
        : { flop: EMPTY_AGGRESSION, turn: EMPTY_AGGRESSION, river: EMPTY_AGGRESSION };
      for (const street of POSTFLOP_STREETS) {
        byStreet[street] = addAggression(byStreet[street], f.byStreet[street]);
      }

      const chips = extendChips(chipsByKey.get(f.key), f);
      chipsByKey.set(f.key, chips);

      out.set(f.key, {
        key: f.key,
        name: f.name,
        siteId: f.siteId,
        isHero: f.isHero,
        hands: (existing?.hands ?? 0) + 1,
        vpip: addCounter(existing?.vpip ?? EMPTY_COUNTER, f.vpip),
        pfr: addCounter(existing?.pfr ?? EMPTY_COUNTER, f.pfr),
        threeBet: addCounter(existing?.threeBet ?? EMPTY_COUNTER, f.threeBet),
        foldToThreeBet: addCounter(existing?.foldToThreeBet ?? EMPTY_COUNTER, f.foldToThreeBet),
        steal: addCounter(existing?.steal ?? EMPTY_COUNTER, f.steal),
        foldToSteal: addCounter(existing?.foldToSteal ?? EMPTY_COUNTER, f.foldToSteal),
        flopCbet: addCounter(existing?.flopCbet ?? EMPTY_COUNTER, f.flopCbet),
        foldToFlopCbet: addCounter(existing?.foldToFlopCbet ?? EMPTY_COUNTER, f.foldToFlopCbet),
        wtsd: addCounter(existing?.wtsd ?? EMPTY_COUNTER, f.wtsd),
        wsd: addCounter(existing?.wsd ?? EMPTY_COUNTER, f.wsd),
        aggression: addAggression(existing?.aggression ?? EMPTY_AGGRESSION, f.aggression),
        byStreet,
        netBB: (existing?.netBB ?? 0) + f.netBB,
        winLoss: addWinLoss(existing?.winLoss ?? EMPTY_WIN_LOSS, f.winLoss),
        sumWinBB: (existing?.sumWinBB ?? 0) + (f.netBB > 0 ? f.netBB : 0),
        sumLossBB: (existing?.sumLossBB ?? 0) + (f.netBB < 0 ? f.netBB : 0),
        chips: chips === 'mixed' ? null : chips,
      });
    }
  }

  return out;
}
