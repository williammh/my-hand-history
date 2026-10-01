'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Boxes are sized by the classes the real strip uses rather than eyeballed:
 * an action card is two h-5 lines with a gap-1 between them, inside py-1.5
 * and a 2px border. Matching them keeps the felt below from shifting when the
 * real strip swaps in.
 */
function ActionCard() {
  return (
    <li className="w-[7.5rem] shrink-0 px-2 py-1.5 flex flex-col gap-1 border-2 border-transparent rounded-lg">
      <div className="h-5 flex items-center gap-1.5">
        {/* The position badge: t-chip line plus py-0.5 and its border. */}
        <Skeleton className="w-9 h-[calc(0.825rem+0.25rem+2px)] rounded-sm" />
        <Skeleton className="h-4 w-14 rounded-sm" />
      </div>
      <div className="h-5 flex items-center">
        <Skeleton className="h-4 w-16 rounded-sm" />
      </div>
    </li>
  );
}

/** A board card: the street label above its size="sm" cards. */
function DealCard({ cards }: { cards: number }) {
  return (
    <li className="shrink-0 px-2 py-1.5 flex flex-col items-center justify-center gap-1 border-2 border-transparent rounded-lg bg-slate-800/60">
      {/* t-label's line box: 0.6875rem × 1.2 = 0.825rem. */}
      <Skeleton className="h-[0.825rem] w-8 rounded-sm" />
      <span className="flex gap-0.5">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-10 w-7 rounded-sm" />
        ))}
      </span>
    </li>
  );
}

/**
 * Placeholder for the action strip. Shows a plausible preflop/flop shape rather
 * than a flat row of bars, so the panel reads as an action log while the
 * hand's actions and analysis resolve.
 */
export function ActionLogSkeleton() {
  return (
    <ol className="flex w-max gap-1 p-1.5 text-sm" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => <ActionCard key={`p${i}`} />)}
      <DealCard cards={3} />
      {Array.from({ length: 3 }, (_, i) => <ActionCard key={`f${i}`} />)}
      <DealCard cards={1} />
      {Array.from({ length: 2 }, (_, i) => <ActionCard key={`t${i}`} />)}
    </ol>
  );
}
