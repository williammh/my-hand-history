'use client';

import type { Board } from '@/domain/cards';
import { CardView } from './CardView';

/**
 * "Turn" and "River" are each wider than the single 1.75rem card they label, so
 * at full t-label size they collide with one another. Dropping a step to 9px and
 * shedding t-label's 0.09em tracking buys back enough width for them to sit
 * side by side; "River" still overhangs its column by ~2px on each side, which
 * the board's padding absorbs without pushing past the border.
 */
const LABEL = 'text-center text-[9px] font-semibold uppercase leading-none tracking-tight text-slate-500';

/**
 * Board split into Flop / Turn / River groups, revealed as streets arrive.
 *
 * Each street gets its own bordered container with a fixed-width grid (one
 * column per card slot, w-7 = 1.75rem) so the panel doesn't jump as the
 * replay advances — undealt cards simply aren't rendered yet, leaving blank
 * space rather than a card-back placeholder, and the row doesn't collapse to
 * 0 height before any cards exist.
 */
const STREETS = [
  { label: 'Flop', start: 0, count: 3 },
  { label: 'Turn', start: 3, count: 1 },
  { label: 'River', start: 4, count: 1 },
] as const;

export function CommunityCards({ board }: { board: Board }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {STREETS.map(({ label, start, count }) => (
        <div
          key={label}
          className="w-fit rounded border border-slate-700/60 bg-black/25 px-1.5 py-1"
        >
          <div
            className="grid gap-x-1.5 gap-y-1 grid-rows-[auto_2.5rem]"
            style={{ gridTemplateColumns: `repeat(${count}, 1.75rem)` }}
          >
            <div className={`col-span-full ${LABEL}`}>{label}</div>
            {board.slice(start, start + count).map((card, i) => (
              <CardView key={start + i} card={card} size="sm" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
