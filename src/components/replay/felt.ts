'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Width : height of the felt oval (the stadium through the seat centres). A
 * real table is about twice as long as it is deep; a little under that keeps
 * the side seats within reach of the board on narrower panels.
 */
export const FELT_RATIO = 1.8;

/**
 * The widest the seat ring should get: the oval's measured height times
 * FELT_RATIO, plus the seat width the oval is inset by. The ring's height comes
 * from its content (seat cards plus the viewport-scaled board padding), so a
 * taller felt is also a wider one, up to whatever the panel has room for.
 *
 * Width never feeds back into height here — widening the centre track only
 * moves the side seats apart — so observing the grid cannot loop.
 */
export function useFeltMaxWidth(
  grid: RefObject<HTMLElement | null>,
  seat: RefObject<HTMLElement | null>,
  seatH: number,
): number | undefined {
  const [maxWidth, setMaxWidth] = useState<number>();
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node || seatH <= 0) return;
    const update = () => {
      const h = node.getBoundingClientRect().height;
      const seatW = seat.current?.getBoundingClientRect().width ?? 0;
      if (h > 0) setMaxWidth(Math.round((h - seatH) * FELT_RATIO + seatW));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [grid, seat, seatH]);
  return maxWidth;
}

export type Point = { readonly x: number; readonly y: number };

/** Distance from a chip stack's centre to the seat card's edge. */
const CARD_CLEARANCE = 18;
/** Distance from a chip stack's centre to the oval's edge, inward. */
const OVAL_INSET = 20;

/** Inside the stadium `oval`, shrunk by `inset` on every side. */
function inStadium(p: Point, oval: DOMRect, inset: number): boolean {
  const w = oval.width;
  const h = oval.height;
  // The rounded ends are on the short axis: left/right for a wide oval,
  // top/bottom for a tall one.
  const r = Math.min(w, h) / 2;
  const cx = w >= h ? Math.min(Math.max(p.x, oval.left + r), oval.right - r) : oval.left + r;
  const cy = w >= h ? oval.top + r : Math.min(Math.max(p.y, oval.top + r), oval.bottom - r);
  return Math.hypot(p.x - cx, p.y - cy) <= r - inset;
}

function clearOf(p: Point, card: DOMRect, gap: number): boolean {
  return p.x < card.left - gap || p.x > card.right + gap || p.y < card.top - gap || p.y > card.bottom + gap;
}

/**
 * Where a seat's bet sits, as an offset from the centre of its card.
 *
 * Walked out from the card's centre towards the middle of the felt until the
 * spot is both clear of the card and inside the oval. A fixed "just inside the
 * card" slot is fine for seats on the oval's straight edges, but a seat in a
 * corner of the ring sits beyond the oval's rounded end, and a slot beside it
 * lands on the rail — worst at 9–10 handed, where the side columns hold more
 * seats and the outer ones sit further from the curve.
 *
 * Returns null if no point on the way satisfies both (a felt too small to have
 * one), so the caller can fall back to the fixed slot.
 */
export function betSpot(card: DOMRect, oval: DOMRect): Point | null {
  const from = { x: card.left + card.width / 2, y: card.top + card.height / 2 };
  const to = { x: oval.left + oval.width / 2, y: oval.top + oval.height / 2 };
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len < 1) return null;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  for (let t = 0; t <= len; t += 2) {
    const p = { x: from.x + ux * t, y: from.y + uy * t };
    if (clearOf(p, card, CARD_CLEARANCE) && inStadium(p, oval, OVAL_INSET)) {
      return { x: p.x - from.x, y: p.y - from.y };
    }
  }
  return null;
}
