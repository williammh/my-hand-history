'use client';

import { useEffect } from 'react';
import {
  IconPlayerTrackPrevFilled,
  IconPlayerSkipBackFilled,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerTrackNextFilled,
} from '@tabler/icons-react';
import type { ReplayStep } from '@/domain/stacks';

interface Props {
  /** Full replay timeline (see replayTimeline) — one entry per scrubbable stop,
   *  including the card-only steps of an all-in run-out. */
  timeline: readonly ReplayStep[];
  stepIndex: number;
  playing: boolean;
  onIndex: (i: number) => void;
  onPlaying: (p: boolean) => void;
  /** Selects the previous / next hand in the filtered list; absent when there
   *  is none. The first / last buttons fall through to these once the replay
   *  is already at that end. */
  onPrevHand?: (() => void) | undefined;
  onNextHand?: (() => void) | undefined;
}

export function ReplayControls({ timeline, stepIndex, playing, onIndex, onPlaying, onPrevHand, onNextHand }: Props) {
  const empty = timeline.length === 0;
  const max = empty ? 0 : timeline.length - 1;
  const atStart = empty || stepIndex <= 0;
  const atEnd = empty || stepIndex >= max;

  // Auto-advance while playing; stop at the end.
  useEffect(() => {
    if (!playing || empty) return;
    if (stepIndex >= max) { onPlaying(false); return; }
    const t = setTimeout(() => onIndex(stepIndex + 1), 700);
    return () => clearTimeout(t);
  }, [playing, empty, stepIndex, max, onIndex, onPlaying]);

  // Arrow keys scrub the replay — the fastest way to review a hand.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (empty) return;
      if (e.key === 'ArrowRight') onIndex(Math.min(max, stepIndex + 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, stepIndex - 1));
      if (e.key === ' ') { e.preventDefault(); onPlaying(!playing); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [empty, stepIndex, max, playing, onIndex, onPlaying]);

  const btn = 'px-3 py-1.5 rounded-sm border border-slate-700 bg-slate-800 text-slate-200 text-sm hover:border-slate-500 disabled:opacity-40 disabled:hover:border-slate-700';

  return (
    <div className="mt-3 grid grid-cols-5 gap-2">
      <button
        className={btn}
        aria-label={atStart ? 'Previous hand' : 'First step'}
        onClick={atStart ? onPrevHand : () => onIndex(0)}
        disabled={atStart && !onPrevHand}
      >
        <IconPlayerTrackPrevFilled size={16} className="mx-auto" />
      </button>
      <button className={btn} aria-label="Previous step" onClick={() => onIndex(Math.max(0, stepIndex - 1))} disabled={empty || stepIndex <= 0}>
        <IconPlayerSkipBackFilled size={16} className="mx-auto" />
      </button>
      <button
        className={btn}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => onPlaying(!playing)}
        disabled={empty || stepIndex >= max}
      >
        {playing ? (
          <IconPlayerPauseFilled size={16} className="mx-auto" />
        ) : (
          <IconPlayerPlayFilled size={16} className="mx-auto" />
        )}
      </button>
      <button className={btn} aria-label="Next step" onClick={() => onIndex(Math.min(max, stepIndex + 1))} disabled={empty || stepIndex >= max}>
        <IconPlayerSkipForwardFilled size={16} className="mx-auto" />
      </button>
      <button
        className={btn}
        aria-label={atEnd ? 'Next hand' : 'Last step'}
        onClick={atEnd ? onNextHand : () => onIndex(max)}
        disabled={atEnd && !onNextHand}
      >
        <IconPlayerTrackNextFilled size={16} className="mx-auto" />
      </button>
    </div>
  );
}
