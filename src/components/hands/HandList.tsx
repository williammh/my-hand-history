'use client';

import { memo, useCallback, useRef } from 'react';
import type { Hand } from '@/domain/hand';
import { heroNetResult } from '@/domain/stacks';
import { formatUnit, formatSignedUnit, formatDateTime } from '@/lib/format';
import { useDisplayStore } from '@/state/display-store';
import { CardView } from '@/components/replay/CardView';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { HandListSkeleton } from './HandListSkeleton';
import { registry } from '@/parsers/index';
import { GAME_MODE_LABELS } from '@/filters/options';
import type { GameMode } from '@/domain/hand';

/**
 * The list rows are narrow, so tournaments go by their short name here. The
 * filter menu has the room to spell it out and keeps GAME_MODE_LABELS.
 */
const HAND_LIST_GAME_MODE_LABELS: Readonly<Record<GameMode, string>> = {
  ...GAME_MODE_LABELS,
  tournament: 'MTT',
};

interface RowProps {
  hand: Hand;
  selected: boolean;
  unit: ReturnType<typeof useDisplayStore.getState>['unit'];
  timezone: ReturnType<typeof useDisplayStore.getState>['timezone'];
  onSelect: (id: string) => void;
}

/**
 * One list row, memoised on its OWN selected flag rather than on the list's
 * selectedId.
 *
 * Selecting a hand only ever changes two rows — the one losing the highlight
 * and the one gaining it — but the row markup is not cheap (two CardViews, a
 * net-result computation and three formatters each), so re-rendering all of
 * them on every click is what actually delayed the border. React has to finish
 * the whole list before it can commit and paint, so the highlight could not
 * appear until every other row had been rebuilt and thrown away.
 *
 * Row identity therefore has to stay stable across a selection change: `hand`
 * comes from a memoised array, and `onSelect` is a stable store action, so the
 * only prop that moves for a given row is `selected`.
 */
const HandRow = memo(function HandRow({ hand: h, selected, unit, timezone, onSelect }: RowProps) {
  const hero = h.seats.find((s) => s.isHero);
  const net = heroNetResult(h);
  return (
    <li>
      <button
        onClick={() => onSelect(h.id)}
        className={`w-full text-left px-3 py-2 border-2 rounded-lg transition hover:bg-slate-800/50 ${
          selected ? 'border-slate-300' : 'border-transparent'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm text-slate-500">
            {registry.get(h.meta.siteId)?.displayName ?? h.meta.siteId}
          </span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="truncate text-sm text-slate-500">{HAND_LIST_GAME_MODE_LABELS[h.meta.gameMode]}</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="truncate text-sm text-slate-500">
            {h.meta.tournament?.name ?? h.meta.tableName ?? 'Unnamed game'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
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
        <div className="text-sm text-slate-500 mt-1 flex items-center justify-end min-w-0">
          <span className="truncate">
            {formatDateTime(h.meta.playedAt, timezone)}
          </span>
        </div>
      </button>
    </li>
  );
});

interface Props {
  hands: readonly Hand[];
  selectedId: string | null;
  /** Library is still being read or imported — show placeholder rows. */
  loading?: boolean;
  onSelect: (id: string) => void;
}

export function HandList({ hands, selectedId, loading = false, onSelect }: Props) {
  const unit = useDisplayStore((s) => s.unit);
  const timezone = useDisplayStore((s) => s.timezone);

  // Kept in a ref so the callback handed to the memoised rows never changes
  // identity — an inline arrow here would be a new prop on every render and
  // would defeat HandRow's memo entirely, which is the whole point of it.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const select = useCallback((id: string) => onSelectRef.current(id), []);

  return (
    <div className="rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 border-b border-slate-800 t-panel-title shrink-0">
        {/* The count is unknown until the library has been read — "(0)" there
            would be a claim, not a placeholder. */}
        Hands {loading ? '' : `(${hands.length})`}
      </div>
      {loading ? (
        <ScrollArea className="flex-1 min-h-0">
          <HandListSkeleton />
        </ScrollArea>
      ) : hands.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <p className="text-sm text-slate-500 text-center">No hands loaded yet.</p>
        </div>
      ) : (
      <ScrollArea className="flex-1 min-h-0">
        <ul className="divide-y divide-slate-800/70">
        {hands.map((h) => (
          <HandRow
            key={h.id}
            hand={h}
            selected={h.id === selectedId}
            unit={unit}
            timezone={timezone}
            onSelect={select}
          />
        ))}
        </ul>
      </ScrollArea>
      )}
    </div>
  );
}
