'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Hand, PlayerSeat } from '@/domain/hand';
import type { Board } from '@/domain/cards';
import { stacksAtAction } from '@/domain/stacks';
import { potAtAction } from '@/domain/pot';
import { CHIP_MOVING } from '@/domain/action';
import { asAmount } from '@/domain/money';
import { formatUnit } from '@/lib/format';
import { useDisplayStore } from '@/state/display-store';
import { CommunityCards } from './CommunityCards';
import { Seat, EmptySeat } from './Seat';
import { ScrollArea } from '@/components/ui/ScrollArea';

/** Ring shape to show when no hand is loaded — a plain 6-max layout of blanks. */
const EMPTY_RING = {
  bottom: 'bottom' as const,
  top: 'top' as const,
  left: ['left-0', 'left-1'] as const,
  right: ['right-0', 'right-1'] as const,
};

interface Props {
  hand: Hand | null;
  actionIndex: number;
  /**
   * Board for the CURRENT replay step, passed down from replayTimeline via
   * App. Not derived here: a run-out card-only step shares its actionIndex
   * with the action before it, so the board can't be recovered from
   * actionIndex alone — the step carries the information Table needs.
   */
  board: Board;
  /** Replay controls, rendered inside the panel below the board. */
  children?: ReactNode;
}

/** Human-readable label for the chip badge under a seat. */
function actionLabel(kind: string): string {
  switch (kind) {
    case 'fold': return 'fold';
    case 'check': return 'check';
    case 'call': return 'call';
    case 'bet': return 'bet';
    case 'raise': return 'raise';
    case 'post-sb': return 'small blind';
    case 'post-bb': return 'big blind';
    case 'post-ante': return 'ante';
    default: return kind;
  }
}

/**
 * Splits the seats into the three columns of the oval, walking CLOCKWISE from
 * the bottom-center anchor (the hero when there is one, else the button):
 *
 *   left   → up the left side (bottom-most first)
 *   center → anchor at the bottom, one seat at the top
 *   right  → down the right side (top-most first)
 *
 * The reference layout hard-codes the six 6-max slots; deriving the split
 * instead keeps the same oval working for 2- through 10-handed tables, which
 * this app has to render.
 */
function ringColumns(seats: readonly PlayerSeat[]): {
  bottom: PlayerSeat | null;
  top: PlayerSeat | null;
  left: PlayerSeat[];
  right: PlayerSeat[];
} {
  const empty = { bottom: null, top: null, left: [], right: [] };
  if (seats.length === 0) return empty;

  const anchorIdx = Math.max(
    seats.findIndex((s) => s.isHero),
    0,
  );
  // Clockwise from the anchor. Seats are already in seat-number order, which is
  // the physical clockwise order at the table.
  const ring = seats.map((_, i) => seats[(anchorIdx + i) % seats.length]!);

  const bottom = ring[0]!;
  const rest = ring.slice(1);
  if (rest.length === 0) return { bottom, top: null, left: [], right: [] };

  // Walking clockwise from bottom-center goes UP the left side, across the top,
  // then DOWN the right side. Give the left side the extra seat on odd counts so
  // the heavier column is the one the eye reads first.
  const leftCount = Math.ceil((rest.length - 1) / 2);
  const left = rest.slice(0, leftCount);
  const top = rest[leftCount] ?? null;
  const right = rest.slice(leftCount + 1);

  // `left` was collected bottom-to-top; render it top-to-bottom.
  return { bottom, top, left: left.reverse(), right };
}

export function Table({ hand, actionIndex, board, children }: Props) {
  const unit = useDisplayStore((s) => s.unit);
  const snapshot = useMemo(
    () => (hand ? stacksAtAction(hand, actionIndex) : { stacks: new Map(), folded: new Set<number>() }),
    [hand, actionIndex],
  );
  const pot = useMemo(() => (hand ? potAtAction(hand.actions, actionIndex) : asAmount(0)), [hand, actionIndex]);

  // Per-seat chip badge: the amount of the player's most recent bet/call/raise
  // on the current street, matching what the action log shows for that action
  // — not a running total of everything they've put in this street.
  const committed = useMemo(() => {
    const map = new Map<number, number>();
    if (!hand) return map;
    const currentStreet =
      actionIndex < 0 ? 'preflop' : hand.actions[Math.min(actionIndex, hand.actions.length - 1)]!.street;
    for (let i = 0; i <= actionIndex && i < hand.actions.length; i++) {
      const a = hand.actions[i]!;
      if (a.street !== currentStreet || a.kind === 'post-ante') continue;
      if (CHIP_MOVING.has(a.kind)) map.set(a.seat, a.amount);
    }
    return map;
  }, [hand, actionIndex]);

  const lastActionBySeat = useMemo(() => {
    const map = new Map<number, string>();
    if (!hand) return map;
    const currentStreet =
      actionIndex < 0 ? 'preflop' : hand.actions[Math.min(actionIndex, hand.actions.length - 1)]!.street;
    for (let i = 0; i <= actionIndex && i < hand.actions.length; i++) {
      const a = hand.actions[i]!;
      if (a.street !== currentStreet || a.kind.startsWith('post-')) continue;
      map.set(a.seat, actionLabel(a.kind));
    }
    return map;
  }, [hand, actionIndex]);

  const actingSeat = hand && actionIndex >= 0 && actionIndex < hand.actions.length
    ? hand.actions[actionIndex]!.seat
    : null;

  const ring = useMemo(() => ringColumns(hand?.seats ?? []), [hand]);

  // The felt ellipse must pass through the centre of the top/bottom seat cards,
  // so its vertical inset is half a card's height. Card height depends on
  // rendered content (names wrap, badges appear), so it has to be measured
  // rather than assumed — and re-measured when the viewport scales --seat-w.
  const [seatH, setSeatH] = useState(0);
  const seatProbe = useRef<HTMLDivElement | null>(null);
  const measureSeat = useCallback((node: HTMLDivElement | null) => {
    seatProbe.current = node;
    if (node) setSeatH(node.getBoundingClientRect().height);
  }, []);
  useEffect(() => {
    const node = seatProbe.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSeatH(entry.contentRect.height);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [ring.bottom, ring.top]);

  // Only ever invoked with seats drawn from `ring`, which is empty when there
  // is no hand — so `hand` is always present here despite the nullable prop.
  const renderSeat = (seat: PlayerSeat) => (
    <Seat
      seat={seat}
      money={hand!.money}
      stack={snapshot.stacks.get(seat.seat) ?? seat.startingStack}
      committed={asAmount(committed.get(seat.seat) ?? 0)}
      folded={snapshot.folded.has(seat.seat)}
      isActing={actingSeat === seat.seat}
      lastAction={lastActionBySeat.get(seat.seat) ?? null}
    />
  );

  return (
    // The panel is only as wide as the felt needs (w-fit): the ring's width is
    // set by --seat-w below, which scales with the viewport up to a ceiling, so
    // wide viewports get a bigger ring without the panel stretching past it.
    // It still cannot exceed the column it is placed in.
    <div className="w-fit max-w-full rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 t-panel-title">
        Replay
      </div>
      <ScrollArea orientation="horizontal" className="px-2.5 pt-2.5 sm:px-3 sm:pt-3">
        {/* Seat columns are a single tracked width (--seat-w), not fluid 1fr
            tracks, so the top/bottom cells in the auto-sized center column stay
            aligned with the side columns. It scales with the viewport and is
            clamped at both ends: never below 5rem (the seat card's text-sm
            content needs it), never above 8.5rem
            (very wide displays, where a larger ring stops being more readable).
            The 7vw slope keeps the felt inside its column at the narrow end of
            the four-column layout, where the other three columns are fixed.
            The felt is capped and centered so it grows into the panel without
            stretching edge to edge. */}
        <div className="relative mx-auto grid w-fit max-w-full [--seat-w:clamp(5rem,7vw,8.5rem)] grid-cols-[var(--seat-w)_auto_var(--seat-w)] items-stretch justify-center gap-x-1.5 sm:gap-x-2 gap-y-1.5 rounded-lg bg-black/40 p-1.5 sm:p-2">
          {/* Felt outline: a stadium shape (rectangle with fully-rounded short
              ends) whose border passes through the CENTRE of every seat card,
              not around their outer edges — the oval a real table forms
              through its seating ring.

              The inset on each side is therefore half a seat, measured from the
              grid's edge:
                - left/right: half the fixed --seat-w track, straight from CSS
                - top/bottom: half a card's rendered height (seatH), which has
                  to be measured since it depends on the card's content.
              Purely decorative: behind the seats, out of the tab order. */}
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

          {/* Row 1: top seat, centered above the felt. The explicit width
              matches the side columns' fixed track — this cell sits in the
              auto-sized center column, so without it the seat would shrink to
              its content instead of matching the others. */}
          <div className="relative z-10 col-start-2 row-start-1 flex justify-center">
            {hand
              ? ring.top && <div className="w-[var(--seat-w)]">{renderSeat(ring.top)}</div>
              : <div className="w-[var(--seat-w)]"><EmptySeat /></div>}
          </div>

          {/* Row 2: the side columns flank the board. Each side column spans the
              felt row so its seats distribute across the ring's full height. */}
          <div className="relative z-10 col-start-1 row-start-1 row-span-3 flex flex-col justify-around gap-1.5">
            {hand
              ? ring.left.map((seat) => <div key={seat.seat}>{renderSeat(seat)}</div>)
              : EMPTY_RING.left.map((k) => <EmptySeat key={k} />)}
          </div>

          <div className="relative z-10 col-start-2 row-start-2 flex items-center justify-center py-1">
            <div className="flex min-w-0 flex-col items-center">
              <div className="mb-1 flex items-baseline justify-center gap-1.5 text-center">
                <span className="t-label text-slate-400">Pot</span>
                <span className="text-sm font-bold tabular-nums text-amber-300">
                  {hand ? formatUnit(pot, hand.money, unit) : '—'}
                </span>
              </div>
              <CommunityCards board={board} />
              {!hand && <p className="mt-1 text-sm text-slate-500 text-center">No hand selected.</p>}
            </div>
          </div>

          <div className="relative z-10 col-start-3 row-start-1 row-span-3 flex flex-col justify-around gap-1.5">
            {hand
              ? ring.right.map((seat) => <div key={seat.seat}>{renderSeat(seat)}</div>)
              : EMPTY_RING.right.map((k) => <EmptySeat key={k} />)}
          </div>

          {/* Row 3: bottom seat (hero), centered below the felt. Same explicit
              width as the top seat, for the same reason. */}
          <div className="relative z-10 col-start-2 row-start-3 flex justify-center">
            {hand ? (
              ring.bottom && (
                <div ref={measureSeat} className="w-[var(--seat-w)]">
                  {renderSeat(ring.bottom)}
                </div>
              )
            ) : (
              <div ref={measureSeat} className="w-[var(--seat-w)]">
                <EmptySeat />
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">{children}</div>
    </div>
  );
}
