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
      {/* From lg the panel fills the height left under the felt and shrinks
          when the felt needs the room, scrolling here instead. It is only
          ever as short as the room left after the felt, so it is never given
          less than a line or two to scroll through.
          Below lg the page itself scrolls, and a second scroller nested in it
          would only catch a phone user's swipes, so the body takes its full
          height. Its floor fits a typical verdict: the panel is last on the
          page, and if it shrank while stepping to a shorter one, the page
          would shorten under the replay controls and jump. */}
      <div className="px-3 py-2 min-h-32 lg:min-h-0 lg:flex-1 lg:overflow-y-auto scroll-thin">
        {!hand ? (
          <p className="text-sm text-slate-500">No hand selected.</p>
        ) : verdict ? (
          <VerdictDetail verdict={verdict} hand={hand} />
        ) : skipped ? (
          // One line from lg, where the panel is short on height; below lg it
          // has the height, and a phone's width would cut most of the reason.
          <p className="text-sm text-slate-500 flex items-start lg:items-center gap-2 min-w-0">
            {seat && <PositionBadge position={seat.position} isHero={seat.isHero} />}
            <span className="min-w-0 lg:truncate">{seat ? `${seat.name} — ` : ''}not judged: {skipped.reason}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Select an action to see its analysis.</p>
        )}
      </div>
    </div>
  );
}
