'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Hand, PlayerSeat } from '@/domain/hand';
import type { Board } from '@/domain/cards';
import { stacksAtAction } from '@/domain/stacks';
import { potAtAction } from '@/domain/pot';
import { CHIP_MOVING, shortActionLabel, type Action } from '@/domain/action';
import { asAmount } from '@/domain/money';
import { STREET_BOARD_LENGTH, STREET_ORDER } from '@/domain/position';
import { formatUnit } from '@/lib/format';
import { useDisplayStore } from '@/state/display-store';
import { CommunityCards } from './CommunityCards';
import { ChipStack } from './ChipStack';
import { Seat, EmptySeat, type ChipGhost, type GhostKind, type SeatSide, type Vector } from './Seat';
import { ScrollArea } from '@/components/ui/ScrollArea';

/** One seat's chips crossing the felt on this step. */
type Crossing = { readonly seat: number; readonly kind: GhostKind; readonly amount: number };

/**
 * How chips should move on this render. Only a single step forward animates;
 * scrubbing or stepping back snaps straight to the new state.
 */
type ChipMotion =
  | { readonly kind: 'none' }
  | { readonly kind: 'step' }
  | { readonly kind: 'cross'; readonly crossings: readonly Crossing[] };

const NO_MOTION: ChipMotion = { kind: 'none' };
const NO_GHOSTS: readonly ChipGhost[] = [];

const center = (r: DOMRect): Vector => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const offset = (to: Vector, from: Vector): Vector => ({ x: to.x - from.x, y: to.y - from.y });

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
  /** The closing step: the pot is pushed to the winners. */
  awarding: boolean;
  /** This step posts every ante of the street at once. */
  antes: boolean;
  /** Replay controls, rendered inside the panel below the board. */
  children?: ReactNode;
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

export function Table({ hand, actionIndex, board, awarding, antes, children }: Props) {
  const unit = useDisplayStore((s) => s.unit);
  const snapshot = useMemo(
    () => (hand ? stacksAtAction(hand, actionIndex) : { stacks: new Map(), folded: new Set<number>() }),
    [hand, actionIndex],
  );
  const pot = useMemo(() => (hand ? potAtAction(hand.actions, actionIndex) : asAmount(0)), [hand, actionIndex]);

  // Per-seat badge: the player's most recent action on the current street.
  // Label and amount come from that one action, so they always agree — an
  // ante reads "ante 80" until the blind post replaces it whole. The amount
  // is that action's own, matching the action log, not a street total.
  const lastActionBySeat = useMemo(() => {
    const map = new Map<number, Action>();
    if (!hand) return map;
    const currentStreet =
      actionIndex < 0 ? 'preflop' : hand.actions[Math.min(actionIndex, hand.actions.length - 1)]!.street;
    for (const a of hand.actions.slice(0, actionIndex + 1)) {
      if (a.street === currentStreet) map.set(a.seat, a);
    }
    return map;
  }, [hand, actionIndex]);

  const wonBySeat = useMemo(() => {
    const map = new Map<number, number>();
    for (const { seat, amount } of hand?.awards ?? []) map.set(seat, (map.get(seat) ?? 0) + amount);
    return map;
  }, [hand]);

  const actingAction = hand && actionIndex >= 0 && actionIndex < hand.actions.length
    ? hand.actions[actionIndex]!
    : null;
  const actingSeat = actingAction?.seat ?? null;

  // Street is read off the board rather than the action: an all-in run-out
  // deals streets with no actions, and the bets should still be swept then.
  const streetIdx = STREET_ORDER.filter((s) => STREET_BOARD_LENGTH[s] <= board.length).length - 1;

  // Chips physically in front of each seat: everything put in on this street,
  // net of an uncalled return. Antes go straight to the pot, and once the pot
  // is awarded nothing is left in front of anyone.
  const bets = useMemo(() => {
    const map = new Map<number, number>();
    if (!hand || awarding) return map;
    const street = STREET_ORDER[streetIdx];
    for (const a of hand.actions.slice(0, actionIndex + 1)) {
      if (a.street !== street || a.kind === 'post-ante') continue;
      if (CHIP_MOVING.has(a.kind)) map.set(a.seat, (map.get(a.seat) ?? 0) + a.amount);
      else if (a.kind === 'uncalled-return') map.set(a.seat, (map.get(a.seat) ?? 0) - a.amount);
    }
    return map;
  }, [hand, actionIndex, streetIdx, awarding]);

  // Chips sitting in the middle: once awarded, they have all gone to the winners.
  const collected = awarding ? 0 : pot - [...bets.values()].reduce((sum, b) => sum + b, 0);

  // Previous step, kept in state so the step change can be classified during
  // render (React's "adjust state on prop change" pattern) rather than in an
  // effect that would paint one un-animated frame first.
  const [track, setTrack] = useState({
    hand, actionIndex, streetIdx, awarding, bets, collected, prevCollected: collected, motion: NO_MOTION,
  });
  if (
    track.hand !== hand || track.actionIndex !== actionIndex
    || track.streetIdx !== streetIdx || track.awarding !== awarding
  ) {
    const newStreet = streetIdx === track.streetIdx + 1;
    const newAward = awarding && !track.awarding;
    // The antes of a street arrive on ONE step, so a forward move can cover
    // several action indices at once — hence a range rather than a +1.
    const advanced = actionIndex > track.actionIndex;
    const forward = track.hand === hand && (
      advanced
        ? streetIdx >= track.streetIdx && (antes || actionIndex === track.actionIndex + 1)
        : actionIndex === track.actionIndex && (newStreet || (streetIdx === track.streetIdx && newAward))
    );
    const crossings: Crossing[] = [];
    if (forward) {
      if (antes && advanced) {
        for (const a of hand?.actions.slice(track.actionIndex + 1, actionIndex + 1) ?? []) {
          if (a.kind === 'post-ante' && a.amount > 0) {
            crossings.push({ seat: a.seat, kind: 'ante', amount: a.amount });
          }
        }
      }
      // Whatever is left in front of the players goes in when the street
      // ends, or when the hand ends and the pot is pushed.
      if (newStreet || newAward) {
        for (const [seat, amount] of track.bets) if (amount > 0) crossings.push({ seat, kind: 'sweep', amount });
      }
      if (newAward) {
        for (const [seat, amount] of wonBySeat) crossings.push({ seat, kind: 'win', amount });
      }
    }
    const motion: ChipMotion = !forward
      ? NO_MOTION
      : crossings.length > 0 ? { kind: 'cross', crossings } : { kind: 'step' };
    setTrack({ hand, actionIndex, streetIdx, awarding, bets, collected, prevCollected: track.collected, motion });
  }
  const { motion } = track;

  // Travel offsets can only be measured once the crossing stacks are in the
  // DOM. Measuring in a layout effect and re-rendering before paint means the
  // first painted frame already has the animations running.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const potAnchorRef = useRef<HTMLDivElement | null>(null);
  const [ghostPaths, setGhostPaths] = useState<{
    motion: ChipMotion;
    paths: ReadonlyMap<string, NonNullable<ChipGhost['path']>>;
  } | null>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const anchor = potAnchorRef.current;
    if (motion.kind !== 'cross' || !grid || !anchor) return;
    const pot = center(anchor.getBoundingClientRect());
    const paths = new Map<string, NonNullable<ChipGhost['path']>>();
    for (const el of grid.querySelectorAll<HTMLElement>('[data-chip-ghost]')) {
      const from = center(el.getBoundingClientRect());
      const seatCard = el.closest('[data-seat]');
      const seat = seatCard ? center(seatCard.getBoundingClientRect()) : from;
      paths.set(el.dataset.chipGhost ?? '', { toPot: offset(pot, from), toSeat: offset(seat, from) });
    }
    setGhostPaths({ motion, paths });
  }, [motion]);
  const paths = ghostPaths?.motion === motion ? ghostPaths.paths : null;

  const crossings = motion.kind === 'cross' ? motion.crossings : [];
  const betMoved = motion.kind !== 'none' && actingAction !== null && CHIP_MOVING.has(actingAction.kind);
  // The new pot stack pops in as the incoming chips land; until then the
  // previous stack stays put, so the pot never blinks out mid-animation. On
  // the award step the outgoing win stack stands in for the pot instead.
  const potLand = crossings.some((c) => c.kind === 'ante')
    ? 'chip-land-ante'
    : crossings.some((c) => c.kind === 'sweep') ? 'chip-land-sweep' : '';
  const potChanging = motion.kind !== 'none' && track.prevCollected !== collected;
  const holdPrevPot = potChanging && !awarding;

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
  const renderSeat = (seat: PlayerSeat, side: SeatSide) => {
    const won = awarding ? wonBySeat.get(seat.seat) ?? 0 : 0;
    const last = lastActionBySeat.get(seat.seat);
    const mine = crossings.filter((c) => c.seat === seat.seat);
    const ghosts = mine.length === 0
      ? NO_GHOSTS
      : mine.map(({ kind, amount }) => ({ kind, amount, path: paths?.get(`${seat.seat}:${kind}`) ?? null }));
    return (
      <Seat
        seat={seat}
        money={hand!.money}
        stack={asAmount((snapshot.stacks.get(seat.seat) ?? seat.startingStack) + won)}
        committed={asAmount(won > 0 ? won : last?.amount ?? 0)}
        folded={snapshot.folded.has(seat.seat)}
        // Antes are posted by everyone at once, so no one seat is "acting" —
        // highlighting the last one to post would single it out arbitrarily.
        isActing={awarding ? won > 0 : !antes && actingSeat === seat.seat}
        lastAction={won > 0 ? 'win' : last ? shortActionLabel(last.kind) : null}
        side={side}
        bet={bets.get(seat.seat) ?? 0}
        animateBet={betMoved && actingSeat === seat.seat}
        ghosts={ghosts}
      />
    );
  };

  return (
    // Below 2xl the column itself is the width constraint (w-full fills it);
    // at 2xl the column is an auto track sized to the felt, so w-fit makes the
    // panel exactly that wide. Either way the felt's own ring
    // is capped by --seat-w and centred, so it never stretches edge to edge.
    <div className="w-full 2xl:w-fit max-w-full rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden">
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
            At 2xl the replay column is sized to fit the felt, so a wider ring
            takes space from the list columns rather than overflowing.
            The felt is capped and centered so it grows into the panel without
            stretching edge to edge. */}
        {/* Felt background fills the panel's full width; the ring grid inside
            it stays w-fit/mx-auto so the seats centre within that background
            instead of stretching apart with it. */}
        <div className="w-full rounded-lg bg-black/40 p-1.5 sm:p-2">
          <div ref={gridRef} className="relative mx-auto grid w-fit max-w-full [--seat-w:clamp(5rem,7vw,8.5rem)] grid-cols-[var(--seat-w)_auto_var(--seat-w)] items-stretch justify-center gap-x-1.5 sm:gap-x-2 gap-y-1.5">
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
                ? ring.top && <div className="w-[var(--seat-w)]">{renderSeat(ring.top, 'top')}</div>
                : <div className="w-[var(--seat-w)]"><EmptySeat /></div>}
            </div>

            {/* Row 2: the side columns flank the board. Each side column spans the
                felt row so its seats distribute across the ring's full height. */}
            <div className="relative z-10 col-start-1 row-start-1 row-span-3 flex flex-col justify-around gap-1.5">
              {hand
                ? ring.left.map((seat) => <div key={seat.seat}>{renderSeat(seat, 'left')}</div>)
                : EMPTY_RING.left.map((k) => <EmptySeat key={k} />)}
            </div>

            {/* Padding leaves room for the bet stacks of the seats around the board. */}
            <div className="relative z-10 col-start-2 row-start-2 flex items-center justify-center px-4 py-6">
              <div className="flex min-w-0 flex-col items-center">
                <div className="relative mb-1 flex items-baseline justify-center gap-1.5 text-center">
                  {/* Fixed-size and absolutely placed so the label never shifts
                      as chips come and go; also the sweep's target. */}
                  <div
                    ref={potAnchorRef}
                    className={`absolute bottom-0 right-full mr-1.5 grid h-7 w-9 items-end justify-items-end ${potLand}`}
                  >
                    {holdPrevPot && (
                      <ChipStack
                        key={`prev-${track.prevCollected}`}
                        amount={track.prevCollected}
                        className="col-start-1 row-start-1 chip-hide"
                      />
                    )}
                    <ChipStack
                      key={collected}
                      amount={collected}
                      className={`col-start-1 row-start-1 ${potChanging ? 'chip-pop' : ''}`}
                    />
                  </div>
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
                ? ring.right.map((seat) => <div key={seat.seat}>{renderSeat(seat, 'right')}</div>)
                : EMPTY_RING.right.map((k) => <EmptySeat key={k} />)}
            </div>

            {/* Row 3: bottom seat (hero), centered below the felt. Same explicit
                width as the top seat, for the same reason. */}
            <div className="relative z-10 col-start-2 row-start-3 flex justify-center">
              {hand ? (
                ring.bottom && (
                  <div ref={measureSeat} className="w-[var(--seat-w)]">
                    {renderSeat(ring.bottom, 'bottom')}
                  </div>
                )
              ) : (
                <div ref={measureSeat} className="w-[var(--seat-w)]">
                  <EmptySeat />
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">{children}</div>
    </div>
  );
}
