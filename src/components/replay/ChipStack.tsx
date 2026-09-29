'use client';

import { MAX_CHIPS, chipBreakdown } from './chips';

const CHIP_PX = 16;
const OFFSET_PX = 3;

interface Props {
  amount: number;
  /** 1 for a tall, narrow stack (beside a seat); 2 for a short, wide one. */
  columns?: 1 | 2;
  className?: string;
}

/** Decorative chip stack for an amount; renders nothing for zero. */
export function ChipStack({ amount, columns = 2, className = '' }: Props) {
  const chips = chipBreakdown(amount);
  if (chips.length === 0) return null;
  const perColumn = Math.ceil(MAX_CHIPS / columns);
  const stacks = Array.from({ length: Math.ceil(chips.length / perColumn) }, (_, c) =>
    chips.slice(c * perColumn, (c + 1) * perColumn),
  );

  return (
    <div aria-hidden="true" className={`flex items-end gap-0.5 ${className}`}>
      {stacks.map((col, c) => (
        <div key={c} className="relative w-4" style={{ height: `${CHIP_PX + (col.length - 1) * OFFSET_PX}px` }}>
          {col.map((d, i) => (
            <div
              key={i}
              className={`absolute left-0 size-4 rounded-full border-[3px] border-dashed ring-1 ring-black/60 ${d.face} ${d.edge}`}
              style={{ bottom: `${i * OFFSET_PX}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
