import type { Hand } from '@/domain/hand.js';
import { heroNetResult } from '@/domain/stacks.js';
import { formatUnit, formatSignedUnit, formatDateTime } from '@/lib/format.js';
import { useDisplayStore } from '@/state/display-store.js';
import { CardView } from '@/components/replay/CardView.js';
import { ScrollArea } from '@/components/ui/ScrollArea.js';

interface Props {
  hands: readonly Hand[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HandList({ hands, selectedId, onSelect }: Props) {
  const unit = useDisplayStore((s) => s.unit);
  const timezone = useDisplayStore((s) => s.timezone);
  if (hands.length === 0) return null;

  return (
    <div className="rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 border-b border-slate-800 t-panel-title shrink-0">
        Hands ({hands.length})
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <ul className="divide-y divide-slate-800/70">
        {hands.map((h) => {
          const hero = h.seats.find((s) => s.isHero);
          const net = heroNetResult(h);
          return (
            <li key={h.id}>
              <button
                onClick={() => onSelect(h.id)}
                className={`w-full text-left px-3 py-2 border-2 rounded-lg transition hover:bg-slate-800/50 ${
                  h.id === selectedId ? 'border-slate-300' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <CardView card={hero?.holeCards?.[0] ?? null} size="sm" />
                    <CardView card={hero?.holeCards?.[1] ?? null} size="sm" />
                  </div>
                  <div className="flex flex-col items-start gap-0.5 leading-tight min-w-0">
                    <span className="w-9 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 text-slate-100">
                      {hero?.position}
                    </span>
                    <span className="text-sm font-medium text-slate-200 truncate max-w-full">{hero?.name}</span>
                  </div>
                  <div className="ml-auto flex flex-col items-end leading-tight">
                    <span className="text-sm tabular-nums text-slate-500" title="Total pot">
                      {formatUnit(h.pots.total, h.money, unit)}
                    </span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        net === null ? 'text-slate-600' : net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}
                      title="Hero's net result"
                    >
                      {net === null ? '—' : formatSignedUnit(net, h.money, unit)}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {formatDateTime(h.meta.playedAt, timezone)}
                </div>
              </button>
            </li>
          );
        })}
        </ul>
      </ScrollArea>
    </div>
  );
}
