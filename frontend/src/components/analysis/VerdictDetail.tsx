'use client';

import type { Hand } from '@/domain/hand';
import type { Action } from '@/domain/action';
import type { MoneyContext } from '@/domain/money';
import type { DecisionVerdict } from '@/analysis/types';
import { formatUnit, formatBBNumber } from '@/lib/format';
import type { DisplayUnit } from '@/state/display-store';
import { useDisplayStore } from '@/state/display-store';

/** How the player's actual action reads on screen: "call 4,000", "shove", "fold". */
export function heroLine(action: Action, money: MoneyContext, unit: DisplayUnit): string {
  if (action.isAllIn) return 'shove';
  switch (action.kind) {
    case 'fold': return 'fold';
    case 'check': return 'check';
    case 'call': return `call ${formatUnit(action.amount, money, unit)}`;
    case 'bet': return `bet ${formatUnit(action.amount, money, unit)}`;
    case 'raise': return `raise to ${formatUnit(action.totalCommitted, money, unit)}`;
    default: return action.kind;
  }
}

function gtoLine(recommended: DecisionVerdict['recommended']): string {
  if (recommended.length === 0) return 'no reference line';
  return recommended.map((r) => (r.isAllIn ? 'shove' : r.kind)).join(' / ');
}

/**
 * The body of the analysis panel for whichever action is currently selected.
 */
export function VerdictDetail({ verdict, hand }: { verdict: DecisionVerdict; hand: Hand }) {
  const unit = useDisplayStore((s) => s.unit);
  const action = hand.actions[verdict.actionIndex]!;
  const correct = verdict.severity === 'ok';
  const seat = hand.seats.find((s) => s.seat === action.seat);
  const label = seat?.isHero ? 'Hero' : (seat?.position ?? 'Player');

  return (
    <div>
      <dl className="space-y-0.5">
        <div className="flex items-baseline gap-2">
          <dt className="t-label text-slate-500 w-11 shrink-0">{label}</dt>
          <dd
            className={`text-sm ${
              correct ? 'text-emerald-300' : 'text-rose-300 line-through decoration-rose-500/50'
            }`}
          >
            {heroLine(action, hand.money, unit)}
          </dd>
        </div>

        {!correct && (
          <div className="flex items-baseline gap-2">
            <dt className="t-label text-slate-500 w-11 shrink-0">GTO</dt>
            <dd className="text-sm text-emerald-300">
              {gtoLine(verdict.recommended)}
              {verdict.evLossBB ? (
                <span className="text-xs text-slate-500 ml-1.5">
                  (−{formatBBNumber(verdict.evLossBB)})
                </span>
              ) : null}
            </dd>
          </div>
        )}
      </dl>

      <p className="text-sm text-slate-400 mt-1.5 leading-snug">{verdict.explanation}</p>
    </div>
  );
}
