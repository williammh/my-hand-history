'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Hand } from '@/domain/hand';

export interface HandLoading {
  /**
   * The hand the replay panels should actually render. Lags `selectedId` by
   * one transition: null while a newly selected hand is still being prepared.
   */
  readonly hand: Hand | null;
  /** True while a newly selected hand is being prepared — drives the skeletons. */
  readonly loading: boolean;
}

/**
 * Splits "which hand is selected" from "which hand is rendered".
 *
 * Selecting a hand is a synchronous store write, so the list highlight is
 * available immediately — but committing it in the same render as the replay
 * meant React painted nothing until the whole tree (timeline, seat ring, every
 * action row, the felt remeasure) had been rebuilt. The highlight therefore
 * appeared to lag the click by exactly the cost of that work.
 *
 * The selection now commits on its own, and the expensive re-render is moved
 * into a transition. During it `loading` is true and the replay panels show
 * skeletons, so the click is acknowledged in the list on the very next frame
 * while the hand behind it is still being built.
 */
export function useHandLoading(selected: Hand | null): HandLoading {
  const [rendered, setRendered] = useState<Hand | null>(selected);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (rendered === selected) return;
    // Clearing first is what makes the panels flip to skeletons straight away
    // rather than holding the previous hand's felt until the new one is ready.
    setRendered(null);
    startTransition(() => setRendered(selected));
  }, [selected, rendered]);

  return { hand: rendered, loading: isPending || rendered !== selected };
}
