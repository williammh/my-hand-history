'use client';

import { create } from 'zustand';
import type { Position, Street } from '@/domain/position';
import type { Severity } from '@/analysis/types';
import type { Rank } from '@/domain/cards';
import {
  EMPTY_CRITERIA,
  type FilterCriteria,
  type LineToken,
  type PotType,
  type PreflopAggression,
  type RelativePosition,
  type StackBucket,
} from '@/filters/types';

/** Set-valued axes, i.e. everything `toggle` can operate on. */
type SetAxis = {
  [K in keyof FilterCriteria]: FilterCriteria[K] extends ReadonlySet<unknown> ? K : never;
}[keyof FilterCriteria];

/** The value type held by a given set-valued axis. */
type AxisValue<K extends SetAxis> =
  FilterCriteria[K] extends ReadonlySet<infer V> ? V : never;

interface FiltersState {
  criteria: FilterCriteria;

  toggle: <K extends SetAxis>(axis: K, value: AxisValue<K>) => void;
  clearAxis: (axis: SetAxis) => void;
  setStreet: (street: Street) => void;
  setHeroStreetPosition: (p: RelativePosition | 'any') => void;
  setSawFlopOnly: (v: boolean) => void;
  setHighestRank: (r: Rank | null) => void;
  setLowestRank: (r: Rank | null) => void;
  /**
   * Drops selected source files that the library no longer holds.
   *
   * The source-file axis is the only one whose vocabulary can disappear under
   * it — clearing the library or importing a different set leaves names that
   * match nothing, which would silently show an empty hand list with a filter
   * the player cannot see the point of. Called when the library changes.
   */
  pruneSourceFiles: (present: ReadonlySet<string>) => void;
  clearAll: () => void;
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  criteria: EMPTY_CRITERIA,

  toggle: (axis, value) =>
    set((s) => ({
      criteria: {
        ...s.criteria,
        [axis]: toggled(s.criteria[axis] as ReadonlySet<typeof value>, value),
      },
    })),

  clearAxis: (axis) =>
    set((s) => ({ criteria: { ...s.criteria, [axis]: new Set() } })),

  setStreet: (street) => set((s) => ({ criteria: { ...s.criteria, street } })),

  setHeroStreetPosition: (heroStreetPosition) =>
    set((s) => ({ criteria: { ...s.criteria, heroStreetPosition } })),

  setSawFlopOnly: (sawFlopOnly) =>
    set((s) => ({ criteria: { ...s.criteria, sawFlopOnly } })),

  setHighestRank: (highestRank) =>
    set((s) => ({ criteria: { ...s.criteria, highestRank } })),

  setLowestRank: (lowestRank) =>
    set((s) => ({ criteria: { ...s.criteria, lowestRank } })),

  pruneSourceFiles: (present) =>
    set((s) => {
      const kept = [...s.criteria.sourceFiles].filter((f) => present.has(f));
      // Same-size means nothing was stale; returning the existing criteria keeps
      // the object identity that App's filtering memo depends on.
      if (kept.length === s.criteria.sourceFiles.size) return s;
      return { criteria: { ...s.criteria, sourceFiles: new Set(kept) } };
    }),

  clearAll: () => set({ criteria: EMPTY_CRITERIA }),
}));

// Re-exported so components import their option types from one place.
export type { Position, Severity, LineToken, PotType, PreflopAggression, RelativePosition, StackBucket };
