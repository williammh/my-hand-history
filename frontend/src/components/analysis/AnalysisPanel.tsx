import type { Hand } from '@/domain/hand.js';
import type { HandAnalysis } from '@/analysis/types.js';
import { VerdictDetail } from '@/components/analysis/VerdictDetail.js';

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
    <div className="h-full rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-slate-800 t-panel-title shrink-0">
        Analysis
      </div>
      {/* flex-1 fills whatever height the panel is given (matching ActionLog);
          min-h keeps the floor at the tallest realistic content (hero row +
          GTO row + a wrapped explanation) so switching between verdicts of
          different lengths during replay never shrinks the panel below that. */}
      <div className="p-3 flex-1 min-h-[6.5rem]">
        {!hand ? (
          <p className="text-sm text-slate-500">No hand selected.</p>
        ) : verdict ? (
          <VerdictDetail verdict={verdict} hand={hand} />
        ) : skipped ? (
          <p className="text-sm text-slate-500">
            {seat ? `${seat.isHero ? 'Hero' : seat.position} — ` : ''}not judged: {skipped.reason}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Select an action to see its analysis.</p>
        )}
      </div>
    </div>
  );
}
