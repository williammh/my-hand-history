'use client';

import type { ReactNode } from 'react';
import { Tooltip } from 'radix-ui';

/**
 * One Provider for the whole dialog's charts, so each bar segment doesn't pay
 * for its own provider instance. Radix defaults to a 700ms hover delay before
 * the first tooltip in a group opens; skipDelayDuration keeps the group's
 * later tooltips instant once the pointer is already moving between bars.
 */
export function ChartTooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={100}>
      {children}
    </Tooltip.Provider>
  );
}

/**
 * Wraps one SVG mark (a `<rect>`, typically) so hovering or focusing it shows
 * what that color/segment represents. `asChild` puts Radix's listeners and
 * ref directly on the SVG element instead of wrapping it in an extra node,
 * which matters here since the parent is an SVG `<g>` that only accepts
 * SVG children.
 *
 * Capped in width and allowed to wrap, since the stat tooltips are full
 * sentences describing a numerator and denominator rather than short labels.
 */
export function BarTooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-[min(20rem,calc(100vw-1rem))] rounded-sm border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] leading-relaxed text-slate-200 shadow-lg"
        >
          {label}
          <Tooltip.Arrow className="fill-slate-700" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
