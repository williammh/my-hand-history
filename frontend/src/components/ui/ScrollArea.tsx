'use client';

import { ScrollArea as Primitive } from 'radix-ui';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Extra classes for the outer root (sizing lives here, not on the viewport). */
  className?: string;
  /** Extra classes for the scrolling viewport itself. */
  viewportClassName?: string;
  orientation?: 'vertical' | 'horizontal' | 'both';
}

/**
 * App-wide scroll container.
 *
 * Radix hides the native scrollbar and renders its own thumb, which is how we
 * avoid the platform default (a light chrome on Linux/Windows that clashed
 * with the dark UI). The track itself is transparent — only the thumb paints.
 *
 * The thumb is an overlay, so it does NOT take layout width — content keeps the
 * full panel width and nothing reflows when a list grows past its container.
 * `sticky` children still work: the viewport is a plain scrolling div, not the
 * `display:table` wrapper older Radix versions used.
 */
export function ScrollArea({
  children,
  className = '',
  viewportClassName = '',
  orientation = 'vertical',
}: Props) {
  return (
    <Primitive.Root className={`overflow-hidden ${className}`} scrollHideDelay={600}>
      <Primitive.Viewport
        // Radix sets `display:table` on the viewport's direct child in some
        // versions; forcing block keeps `h-full` children and sticky headers
        // behaving like normal flow.
        className={`h-full w-full [&>div]:!block ${viewportClassName}`}
      >
        {children}
      </Primitive.Viewport>

      {(orientation === 'vertical' || orientation === 'both') && <Bar orientation="vertical" />}
      {(orientation === 'horizontal' || orientation === 'both') && <Bar orientation="horizontal" />}
      <Primitive.Corner />
    </Primitive.Root>
  );
}

function Bar({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const vertical = orientation === 'vertical';
  return (
    <Primitive.Scrollbar
      orientation={orientation}
      // The track itself is transparent — only the thumb below is visible —
      // sized closer to a platform scrollbar rather than a thin overlay pill
      // that only shows on hover.
      className={`flex touch-none select-none transition-colors duration-150 data-[state=hidden]:opacity-0 ${
        vertical ? 'w-2.5 flex-col' : 'h-2.5 flex-row'
      }`}
    >
      {/*
        Radix sizes the thumb proportionally via inline width/height. `flex-1`
        would override that and stretch it to the full track, so the thumb is
        flex-none and instead grows on the cross axis only.
      */}
      <Primitive.Thumb
        className={`relative flex-none rounded-sm bg-slate-700 transition-colors hover:bg-slate-600 ${
          vertical ? 'w-full' : 'h-full'
        }`}
      />
    </Primitive.Scrollbar>
  );
}
