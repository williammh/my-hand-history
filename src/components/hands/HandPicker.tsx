'use client';

import { useCallback, useState } from 'react';
import { IconSelector } from '@tabler/icons-react';
import type { Hand } from '@/domain/hand';
import { useDisplayStore } from '@/state/display-store';
import { Dialog } from '@/components/ui/Dialog';
import { HandRows, HandSummary } from './HandList';
import { HandListSkeleton } from './HandListSkeleton';

interface Props {
  /** The hands on offer — the filtered library, as the list shows it. */
  hands: readonly Hand[];
  /**
   * The hand being replayed. Taken from the whole library rather than looked
   * up in `hands`, so it is still shown when a filter has since excluded it.
   */
  selected: Hand | null;
  /** Library is still being read or imported — show a placeholder row. */
  loading?: boolean;
  onSelect: (id: string) => void;
}

/**
 * The hands panel below lg, where the page is a single column and a list tall
 * enough to browse would push the replay off the screen. It shows only the
 * selected hand, as the list would draw its row, and the full list opens in a
 * dialog that covers the screen — on a phone that is the only way to give the
 * list enough height to be worth scrolling.
 */
export function HandPicker({ hands, selected, loading = false, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const unit = useDisplayStore((s) => s.unit);
  const timezone = useDisplayStore((s) => s.timezone);

  // Picking a hand is the dialog's only job, so it closes as soon as one is
  // picked. No memo needed: HandRows keeps its own stable handler for the rows.
  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  // The list opens on the hand being replayed rather than at the top, which in
  // a long session would leave it screens away. Stable, so it runs once as the
  // dialog's content mounts rather than again on every render while it is open.
  const revealSelected = useCallback((node: HTMLDivElement | null) => {
    node?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, []);

  // As in the list, the count is unknown until the library has been read.
  const title = `Hands ${loading ? '' : `(${hands.length})`}`;

  return (
    <div className="rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-slate-800 flex items-center gap-2">
        <span className="t-panel-title">{title}</span>
        <button
          onClick={() => setOpen(true)}
          disabled={loading || hands.length === 0}
          aria-haspopup="dialog"
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-slate-700 bg-slate-800/50 text-sm text-slate-300 outline-none transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-default disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600"
        >
          <IconSelector size={14} aria-hidden />
          Choose hand
        </button>
      </div>

      {loading ? (
        <HandListSkeleton rows={1} />
      ) : selected ? (
        // The same box as a list row's button, so the summary sits exactly
        // where the row's content would.
        <div className="px-3 py-2 border-2 border-transparent">
          <HandSummary hand={selected} unit={unit} timezone={timezone} />
        </div>
      ) : (
        <p className="px-3 py-4 text-sm text-slate-500 text-center">
          {hands.length === 0 ? 'No hands loaded yet.' : 'No hand selected.'}
        </p>
      )}

      {/* Full screen: Dialog's own centring, width cap and rounding are
          overridden rather than forked, the way the filters dialog narrows it. */}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description="Choose a hand to replay."
        className="inset-0! w-auto! max-h-none! translate-none! rounded-none! border-0!"
      >
        <div ref={revealSelected}>
          <HandRows hands={hands} selectedId={selected?.id ?? null} onSelect={choose} />
        </div>
      </Dialog>
    </div>
  );
}
