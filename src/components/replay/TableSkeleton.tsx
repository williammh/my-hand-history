'use client';

import { useCallback, useState } from 'react';
import { EmptySeat } from './Seat';
import { CommunityCards } from './CommunityCards';

/**
 * Placeholder felt.
 *
 * Built from the REAL components — EmptySeat and CommunityCards — on the same
 * grid Table uses, rather than from hand-measured Skeleton boxes. Those are
 * already "same footprint, no values" placeholders, and copying their metrics
 * by hand is what caused the felt to change height between the skeleton and
 * the loaded table: a seat's rows are 1.25rem each for the text-sm stack and
 * name, 0.825rem plus padding and border for the t-chip badge, and 2.5rem for
 * the cards — none of which is the h-4 a hand-built skeleton reaches for.
 *
 * Reusing them means the placeholder cannot drift from the thing it stands in
 * for. `animate-pulse` on the wrapper supplies the loading affordance, and the
 * empty board keeps the Flop/Turn/River boxes at their fixed size.
 *
 * ONLY THE HERO SEAT IS DRAWN. A full 6-max ring guesses at seats the hand may
 * not have, and every guess that misses pops out of existence when the hand
 * lands — a 3-handed hand would blank three cards. Hero is the one seat every
 * hand is guaranteed to have, and ringColumns puts a lone seat at `bottom`, so
 * this is exactly the shape the real table takes for a 1-seat ring.
 *
 * The side columns still have to reserve their height, though: they are
 * row-span-3 and are what makes the ring taller than the board cell, so
 * dropping them outright would make the skeleton shorter than the hand that
 * replaces it — the same layout shift, in the other direction. They therefore
 * keep two INVISIBLE seats each, which hold the height without drawing a seat
 * that might not exist.
 */
export function TableSkeleton() {
  // Measured exactly as Table measures it, off a real EmptySeat, so the oval
  // sits on the same line in both states instead of being derived from a
  // hand-computed constant that would drift with the seat's content.
  const [seatH, setSeatH] = useState(0);
  const measureSeat = useCallback((node: HTMLDivElement | null) => {
    if (node) setSeatH(node.getBoundingClientRect().height);
  }, []);

  return (
    <div className="w-full rounded-lg bg-black/40 p-1.5 sm:p-2" aria-hidden="true">
      <div className="relative mx-auto grid w-fit max-w-full [--seat-w:clamp(5rem,7vw,8.5rem)] grid-cols-[var(--seat-w)_auto_var(--seat-w)] items-stretch justify-center gap-x-1.5 sm:gap-x-2 gap-y-1.5">
        {/* The felt oval, so it doesn't vanish and reappear across the swap.
            Same inset rule as Table: half a seat card on the top and bottom,
            half the fixed track on the left and right. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 col-start-1 col-end-4 row-start-1 row-end-4"
        >
          {seatH > 0 && (
            <div
              className="absolute rounded-full border border-slate-700/60 bg-black/40"
              style={{
                left: 'calc(var(--seat-w) / 2)',
                right: 'calc(var(--seat-w) / 2)',
                top: `${seatH / 2}px`,
                bottom: `${seatH / 2}px`,
              }}
            />
          )}
        </div>

        {/* Top seat: height only. `invisible` keeps the box in flow so the
            grid row is the same height it will be once the hand loads. */}
        <div className="invisible relative z-10 col-start-2 row-start-1 flex justify-center">
          <div className="w-[var(--seat-w)]"><EmptySeat /></div>
        </div>

        <div className="invisible relative z-10 col-start-1 row-start-1 row-span-3 flex flex-col justify-around gap-1.5">
          <EmptySeat />
          <EmptySeat />
        </div>

        {/* Same padding as Table's board cell — it reserves the room the
            surrounding seats' bet stacks need. */}
        <div className="relative z-10 col-start-2 row-start-2 flex items-center justify-center px-4 py-6">
          <div className="flex min-w-0 flex-col items-center animate-pulse">
            {/* Matches the pot row: no gap on the column, mb-1 on the row. */}
            <div className="relative mb-1 flex items-baseline justify-center gap-1.5 text-center">
              <span className="t-label text-slate-400">Pot</span>
              <span className="text-sm font-bold tabular-nums text-slate-700">—</span>
            </div>
            <CommunityCards board={[]} />
          </div>
        </div>

        <div className="invisible relative z-10 col-start-3 row-start-1 row-span-3 flex flex-col justify-around gap-1.5">
          <EmptySeat />
          <EmptySeat />
        </div>

        {/* Hero: the one seat every hand has, and the only one drawn. */}
        <div className="relative z-10 col-start-2 row-start-3 flex justify-center">
          <div ref={measureSeat} className="w-[var(--seat-w)] animate-pulse"><EmptySeat /></div>
        </div>
      </div>
    </div>
  );
}
