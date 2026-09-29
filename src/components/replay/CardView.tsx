'use client';

import { SUIT_SYMBOL } from '@/lib/format';

interface Props {
  card: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  hidden?: boolean;
  /** Darkened palette for a folded player's cards — solid color swap, not opacity. */
  dim?: boolean;
}

const SIZES = {
  xs: 'w-5 h-7 text-[11px]',
  sm: 'w-7 h-10 text-sm',
  md: 'w-10 h-14 text-lg',
  lg: 'w-12 h-16 text-xl',
} as const;

export function CardView({ card, size = 'md', hidden = false, dim = false }: Props) {
  const box = `${SIZES[size]} rounded-sm flex flex-col items-center justify-center font-semibold shadow-md select-none`;

  // A folded player's hole cards are just an outline — no fill, no rank/suit,
  // even if the card value is known (e.g. hero's own folded hand) — the fold
  // already communicates there's nothing left to reveal.
  if (dim) {
    return <div className={`${box} border border-slate-700`} />;
  }

  if (hidden || !card) {
    return (
      <div className={`${box} border bg-gradient-to-br from-rose-900 to-red-950 border-red-800`}>
        <span className="text-red-300 text-xs">?</span>
      </div>
    );
  }

  const rank = card[0]!;
  const suit = card[1]!;
  const red = suit === 'h' || suit === 'd';

  return (
    <div className={`${box} bg-slate-50 border border-slate-300 ${red ? 'text-rose-600' : 'text-slate-900'}`}>
      <span className="leading-none">{rank}</span>
      <span className="leading-none text-[1.3em]">{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}
