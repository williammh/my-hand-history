'use client';

import type { Hand } from '@/domain/hand';
import type { HandAnalysis } from '@/analysis/types';
import { PositionBadge } from '@/components/replay/PositionBadge';
import { VerdictDetail } from '@/components/analysis/VerdictDetail';

interface Props {
  hand: Hand | null;
  actionIndex: number;
  analysis: HandAnalysis | undefined;
}

/**
 * Shows the judgement for whichever action log row is currently selected.
 * Lives below the replay ring rather than inline in the log so selecting a
 * row does not reflow the list around it.
 */
export function AnalysisPanel({ hand, actionIndex, analysis }: Props) {
  const verdict = analysis?.verdicts.find((v) => v.actionIndex === actionIndex);
  const skipped = analysis?.skipped.find((s) => s.actionIndex === actionIndex);
  const action = hand?.actions[actionIndex];
  const seat = action ? hand?.seats.find((s) => s.seat === action.seat) : undefined;

  return (
    <div className="min-h-0 flex-1 rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 border-b border-slate-800 t-panel-title shrink-0">
        Analysis
      </div>
      {/* The panel fills the height left under the felt and shrinks when the
          felt needs the room, scrolling here instead. It is only ever as
          short as the room left after the felt, so it is never given less
          than a line or two to scroll through. */}
      <div className="px-3 py-2 flex-1 min-h-0 overflow-y-auto scroll-thin">
        {!hand ? (
          <p className="text-sm text-slate-500">No hand selected.</p>
        ) : verdict ? (
          <VerdictDetail verdict={verdict} hand={hand} />
        ) : skipped ? (
          <p className="text-sm text-slate-500 flex items-center gap-2 min-w-0">
            {seat && <PositionBadge position={seat.position} isHero={seat.isHero} />}
            <span className="truncate">{seat ? `${seat.name} — ` : ''}not judged: {skipped.reason}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Select an action to see its analysis.</p>
        )}
      </div>
    </div>
  );
}
