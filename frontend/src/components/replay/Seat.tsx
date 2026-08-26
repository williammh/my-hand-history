import type { Amount, MoneyContext } from '@/domain/money.js';
import type { PlayerSeat } from '@/domain/hand.js';
import { formatUnit } from '@/lib/format.js';
import { useDisplayStore } from '@/state/display-store.js';
import { CardView } from './CardView.js';

interface Props {
  seat: PlayerSeat;
  money: MoneyContext;
  stack: Amount;
  committed: Amount;
  folded: boolean;
  isActing: boolean;
  lastAction: string | null;
}

export function Seat({ seat, money, stack, committed, folded, isActing, lastAction }: Props) {
  const unit = useDisplayStore((s) => s.unit);

  return (
    <div className="relative min-w-0">
      <div
        className={`flex w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border-2 px-2 py-2 text-sm transition ${
          isActing ? 'border-slate-300' : 'border-transparent'
        }`}
      >
        <div className="flex min-w-0 items-center justify-center gap-1">
          <span
            className={`w-9 shrink-0 text-center t-chip border rounded-sm bg-slate-700 px-1 py-0.5 ${
              folded
                ? 'border-slate-800 text-slate-500'
                : seat.isHero
                  ? 'border-slate-600 text-slate-100'
                  : 'border-slate-600 text-slate-300'
            }`}
          >
            {seat.position}
          </span>
          {seat.sittingOut && (
            <span className="shrink-0 rounded bg-slate-500/20 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.05em] text-slate-400 ring-1 ring-slate-500/20">
              Out
            </span>
          )}
        </div>

        {/* Stack can be long (111,188) — let it shrink and ellipsize rather
            than overflow the card. */}
        <div className="flex min-w-0 items-center justify-center">
          <span className={`truncate text-sm font-bold tabular-nums ${folded ? 'text-slate-600' : 'text-slate-50'}`}>
            {formatUnit(stack, money, unit)}
          </span>
        </div>

        <div className="flex items-center justify-center">
          <div className="flex gap-1">
            {seat.holeCards ? (
              seat.holeCards.map((c, i) => <CardView key={i} card={c} size="sm" dim={folded} />)
            ) : (
              <>
                <CardView card={null} size="sm" hidden dim={folded} />
                <CardView card={null} size="sm" hidden dim={folded} />
              </>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center">
          <span className={`truncate text-sm font-medium ${folded ? 'text-slate-600' : 'text-slate-300'}`}>
            {seat.name}
          </span>
        </div>

        <div className="flex min-h-[1.15rem] flex-wrap items-center justify-center gap-x-1 text-center text-sm font-semibold">
          <span className={`tabular-nums ${folded ? 'text-slate-600' : 'text-slate-300'}`}>
            {lastAction ?? ''}
            {committed > 0 && ` ${formatUnit(committed, money, unit)}`}
          </span>
        </div>
      </div>
    </div>
  );
}
