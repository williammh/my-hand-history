import type { Hand } from '@/domain/hand.js';
import type { HandAnalysis } from '@/analysis/types.js';
import { VerdictDetail } from '@/components/analysis/VerdictDetail.js';

interface Props {
  hand: Hand;
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
  const action = hand.actions[actionIndex];
  const seat = action ? hand.seats.find((s) => s.seat === action.seat) : undefined;

  return (
    <div className="rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden shrink-0">
      <div className="px-3 py-2 border-b border-slate-800 t-panel-title">
        Analysis
      </div>
      <div className="p-3">
        {verdict ? (
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
