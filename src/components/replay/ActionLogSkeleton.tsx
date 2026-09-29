'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * A street header plus its action rows.
 *
 * Every box here is sized by the same class the real row uses rather than by
 * an eyeballed h-*: a street header is t-label (or a size="sm" card when the
 * street deals one), and an action row's height comes from its text-sm spans
 * and its w-9 t-chip badge. Sizing the placeholders by hand made the rows
 * shorter than the real ones and shifted the log on every swap.
 */
function StreetBlock({ actions, cards }: { actions: number; cards: number }) {
  return (
    <li>
      <div className="px-3 py-1.5 bg-slate-800/60 t-label sticky top-0 flex items-center gap-2">
        {/* t-label's line box: 0.6875rem × 1.2 = 0.825rem. */}
        <Skeleton className="h-[0.825rem] w-14 rounded-sm" />
        {cards > 0 && (
          <span className="flex gap-1">
            {Array.from({ length: cards }, (_, i) => (
              // CardView size="sm".
              <Skeleton key={i} className="h-10 w-7 rounded-sm" />
            ))}
          </span>
        )}
      </div>
      {Array.from({ length: actions }, (_, i) => (
        <div
          key={i}
          className="px-3 py-1.5 flex items-center gap-2 border-2 border-transparent rounded-lg text-sm"
        >
          <span className="w-9 shrink-0 flex justify-center">
            {/* The position badge's box: t-chip line (0.6875rem × 1.2) plus
                py-0.5 and a 1px border on each side. */}
            <Skeleton className="w-9 h-[calc(0.825rem+0.25rem+2px)] rounded-sm" />
          </span>
          {/* text-sm's line box is 1.25rem — the height a real row's spans give it. */}
          <Skeleton className="h-5 w-20 rounded-sm" />
          <Skeleton className="ml-auto h-5 w-16 rounded-sm shrink-0" />
          {/* Reserves the verdict icon's column, as the real rows do. */}
          <span className="w-[18px] shrink-0" />
        </div>
      ))}
    </li>
  );
}

/**
 * Placeholder for the action log. Shows a plausible preflop/flop shape rather
 * than a flat list of bars, so the panel reads as an action log while the
 * hand's actions and analysis resolve.
 */
export function ActionLogSkeleton() {
  return (
    <ol className="text-sm" aria-hidden="true">
      <StreetBlock actions={4} cards={0} />
      <StreetBlock actions={3} cards={3} />
      <StreetBlock actions={2} cards={1} />
    </ol>
  );
}
