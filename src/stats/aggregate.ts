import {
  type PlayerHandFacts, type PlayerKey, type PlayerStats, type PostflopStreet,
  EMPTY_COUNTER, EMPTY_AGGRESSION, POSTFLOP_STREETS, addCounter, addAggression,
} from './types';

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

  for (const handFacts of facts) {
    for (const f of handFacts) {
      const existing = out.get(f.key);
      const byStreet: Record<PostflopStreet, ReturnType<typeof addAggression>> = existing
        ? { ...existing.byStreet }
        : { flop: EMPTY_AGGRESSION, turn: EMPTY_AGGRESSION, river: EMPTY_AGGRESSION };
      for (const street of POSTFLOP_STREETS) {
        byStreet[street] = addAggression(byStreet[street], f.byStreet[street]);
      }

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
      });
    }
  }

  return out;
}
