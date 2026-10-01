'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder rows for the hands list.
 *
 * The box structure follows the real row exactly — the li is bare and the
 * padding, border and rounding live on the button inside it — and every
 * placeholder is sized by the line box of the class it stands in for
 * (text-sm's 1.25rem, t-chip's 0.825rem) rather than by an eyeballed h-4.
 * Getting either wrong makes the list a different height while it loads,
 * which shifts everything below it when the hands arrive.
 */
export function HandListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-slate-800/70" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <div className="w-full px-3 py-2 border-2 border-transparent rounded-lg">
            <div className="flex items-center gap-1.5 min-w-0">
              <Skeleton className="h-5 w-14 rounded-sm" />
              <Skeleton className="h-5 w-10 rounded-sm" />
              <Skeleton className="h-5 w-24 rounded-sm" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex gap-0.5">
                {/* CardView size="sm". */}
                <Skeleton className="h-10 w-7 rounded-sm" />
                <Skeleton className="h-10 w-7 rounded-sm" />
              </div>
              <div className="flex flex-col items-start gap-0.5 leading-tight min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* Position badge: t-chip line + py-0.5 + 1px border each side. */}
                  <Skeleton className="w-9 h-[calc(0.825rem+0.25rem+2px)] rounded-sm" />
                  {/* text-sm with leading-tight: 0.875rem × 1.25. */}
                  <Skeleton className="h-[1.09375rem] w-16 rounded-sm" />
                </div>
                <Skeleton className="h-[1.09375rem] w-28 rounded-sm" />
              </div>
              <div className="ml-auto flex flex-col items-end leading-tight">
                <Skeleton className="h-[1.09375rem] w-12 rounded-sm" />
                <Skeleton className="h-[1.09375rem] w-14 rounded-sm" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
