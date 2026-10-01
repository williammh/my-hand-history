'use client';

import type { CSSProperties } from 'react';
import type { Amount, MoneyContext } from '@/domain/money';
import type { PlayerSeat } from '@/domain/hand';
import type { HoleCards } from '@/domain/cards';
import { formatUnit } from '@/lib/format';
import { useDisplayStore } from '@/state/display-store';
import { CardView } from './CardView';
import { ChipStack } from './ChipStack';

/** Which edge of the ring the seat sits on; its bet goes on the opposite, inward side. */
export type SeatSide = 'top' | 'bottom' | 'left' | 'right';

export type Vector = { readonly x: number; readonly y: number };

/**
 * Chips crossing the felt, drawn from the seat's bet spot:
 *  - sweep: a bet already in front of the seat, into the pot
 *  - ante:  out of the seat, then on into the pot
 *  - win:   out of the pot, into the seat
 */
export type GhostKind = 'sweep' | 'ante' | 'win';

export interface ChipGhost {
  readonly kind: GhostKind;
  readonly amount: number;
  /** Offsets from the bet spot to the pot and to the seat card, measured after the first render; null until then. */
  readonly path: { readonly toPot: Vector; readonly toSeat: Vector } | null;
}

const ghostStyle = ({ toPot, toSeat }: NonNullable<ChipGhost['path']>) => ({
  '--chip-pot-x': `${toPot.x}px`,
  '--chip-pot-y': `${toPot.y}px`,
  '--chip-seat-x': `${toSeat.x}px`,
  '--chip-seat-y': `${toSeat.y}px`,
}) as CSSProperties;

interface Props {
  seat: PlayerSeat;
  money: MoneyContext;
  stack: Amount;
  committed: Amount;
  folded: boolean;
  isActing: boolean;
  lastAction: string | null;
  side: SeatSide;
  /**
   * Where the bet sits, as an offset from the card's centre, measured by the
   * table against the oval. Null until measured: the side's fixed slot is used.
   */
  betAt: { readonly x: number; readonly y: number } | null;
  /** Chips in front of the seat on the current street. */
  bet: number;
  animateBet: boolean;
  ghosts: readonly ChipGhost[];
  /**
   * The cards to draw, null for face down. Decided by the table rather than
   * read off the seat: a villain's cards are only known from the showdown, and
   * stay face down until that seat shows.
   */
  holeCards: HoleCards | null;
}

/**
 * The action label row, empty until the player acts.
 *
 * Its height is FIXED at text-sm's 1.25rem line box, not a minimum: the seat
 * card sets the felt's measured size, so a label that wrapped to a second
 * line grew the card, the felt, and the whole panel mid-replay. A long label
 * therefore never wraps or truncates: it stays on one line and overflows the
 * card sideways, centred, rather than being cut short.
 */
const ACTION_ROW =
  'flex h-5 items-center justify-center text-center text-sm font-semibold whitespace-nowrap';

/** Bet slot placement plus the direction chips slide in from (the seat). */
const BET_SLOT: Record<SeatSide, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 mt-1 [--chip-from-y:-10px]',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 mb-1 [--chip-from-y:10px]',
  left: 'left-full top-1/2 -translate-y-1/2 ml-1 [--chip-from-x:-10px]',
  right: 'right-full top-1/2 -translate-y-1/2 mr-1 [--chip-from-x:10px]',
};

/**
 * A measured bet spot: the stack is centred on it, and chip-in slides it out
 * from the seat's direction, the same 10px the fixed slots use.
 */
function betSlotStyle({ x, y }: { readonly x: number; readonly y: number }): CSSProperties {
  const len = Math.hypot(x, y) || 1;
  return {
    left: `calc(50% + ${x}px)`,
    top: `calc(50% + ${y}px)`,
    transform: 'translate(-50%, -50%)',
    '--chip-from-x': `${(-x / len) * 10}px`,
    '--chip-from-y': `${(-y / len) * 10}px`,
  } as CSSProperties;
}

/**
 * Same footprint as a real Seat card — same rows, same padding — but with
 * every value blanked out. Used to hold the ring's shape (and thus the felt's
 * measured size) when no hand is loaded, so the table doesn't resize once one
 * is.
 */
export function EmptySeat() {
  return (
    <div className="relative min-w-0">
      <div className="flex w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border-2 border-transparent px-2 py-2 text-sm">
        <div className="flex min-w-0 items-center justify-center gap-1">
          <span className="w-9 shrink-0 text-center t-chip border border-slate-800 rounded-sm bg-slate-800/60 px-1 py-0.5 text-slate-700">
            —
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-center">
          <span className="truncate text-sm font-bold tabular-nums text-slate-700">—</span>
        </div>
        <div className="flex items-center justify-center">
          <div className="flex gap-1">
            <CardView card={null} size="sm" hidden dim />
            <CardView card={null} size="sm" hidden dim />
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-center">
          <span className="truncate text-sm font-medium text-slate-700">—</span>
        </div>
        <div className={ACTION_ROW}>
          <span className="tabular-nums text-slate-700" />
        </div>
      </div>
    </div>
  );
}

export function Seat({
  seat, money, stack, committed, folded, isActing, lastAction, side, betAt, bet, animateBet, ghosts, holeCards,
}: Props) {
  const unit = useDisplayStore((s) => s.unit);
  // Beside a side seat the gap to the board is narrow, so stack tall instead.
  const columns = side === 'left' || side === 'right' ? 1 : 2;

  return (
    <div data-seat={seat.seat} className="relative min-w-0">
      {(bet > 0 || ghosts.length > 0) && (
        // One grid cell holds every stack, so outgoing and incoming chips
        // share the same spot.
        <div
          className={`pointer-events-none absolute z-20 grid ${betAt ? '' : BET_SLOT[side]}`}
          style={betAt ? betSlotStyle(betAt) : undefined}
        >
          {ghosts.map((g) => (
            <div
              key={g.kind}
              data-chip-ghost={`${seat.seat}:${g.kind}`}
              className={`col-start-1 row-start-1 flex items-end justify-center ${g.path ? `chip-${g.kind}` : ''}`}
              style={g.path ? ghostStyle(g.path) : undefined}
            >
              <ChipStack amount={g.amount} columns={columns} />
            </div>
          ))}
          {bet > 0 && (
            <div className="col-start-1 row-start-1 flex items-end justify-center">
              <ChipStack key={bet} amount={bet} columns={columns} className={animateBet ? 'chip-in' : ''} />
            </div>
          )}
        </div>
      )}
      <div
        className={`flex w-full min-w-0 flex-col gap-1.5 rounded-lg border-2 px-2 py-2 text-sm transition ${
          isActing ? 'border-slate-300' : 'border-transparent'
        }`}
      >
        <div className="flex min-w-0 items-center justify-center gap-1">
          <span
            className={`w-9 shrink-0 text-center t-chip border rounded-sm bg-slate-700 px-1 py-0.5 ${
              folded
                ? 'border-slate-800 text-slate-500'
                : seat.isHero
                  ? 'border-slate-600 text-slate-100'
                  : 'border-slate-600 text-slate-300'
            }`}
          >
            {seat.position}
          </span>
          {seat.sittingOut && (
            <span className="shrink-0 rounded bg-slate-500/20 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.05em] text-slate-400 ring-1 ring-slate-500/20">
              Out
            </span>
          )}
        </div>

        {/* Stack can be long (111,188) — let it shrink and ellipsize rather
            than overflow the card. */}
        <div className="flex min-w-0 items-center justify-center">
          <span className={`truncate text-sm font-bold tabular-nums ${folded ? 'text-slate-600' : 'text-slate-50'}`}>
            {formatUnit(stack, money, unit)}
          </span>
        </div>

        <div className="flex items-center justify-center">
          <div className="flex gap-1">
            {holeCards ? (
              holeCards.map((c, i) => <CardView key={i} card={c} size="sm" dim={folded} />)
            ) : (
              <>
                <CardView card={null} size="sm" hidden dim={folded} />
                <CardView card={null} size="sm" hidden dim={folded} />
              </>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center">
          <span className={`shrink-0 whitespace-nowrap text-sm font-medium ${folded ? 'text-slate-600' : 'text-slate-300'}`}>
            {seat.name}
          </span>
        </div>

        <div className={ACTION_ROW}>
          <span className={`shrink-0 tabular-nums ${folded ? 'text-slate-600' : 'text-slate-300'}`}>
            {lastAction ?? ''}
            {committed > 0 && ` ${formatUnit(committed, money, unit)}`}
          </span>
        </div>
      </div>
    </div>
  );
}
