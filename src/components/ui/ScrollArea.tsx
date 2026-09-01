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
 *
 * `type="auto"` rather than the default `"hover"`: a hover scrollbar does not
 * mount until the pointer enters the root, so its size measurement (`onResize`,
 * which is what gives the thumb its height and scroll range) had never run on a
 * panel scrolled by wheel without hovering it first — the thumb was missing, or
 * appeared frozen on stale sizes. `auto` instead mounts the bar whenever the
 * content actually overflows, measured off the viewport rather than the
 * pointer, so every panel behaves the same and nothing shows an empty track
 * when its content fits (which `always` would).
 */
export function ScrollArea({
  children,
  className = '',
  viewportClassName = '',
  orientation = 'vertical',
}: Props) {
  return (
    <Primitive.Root type="auto" className={`overflow-hidden ${className}`}>
      <Primitive.Viewport
        // Radix wraps the children in its own `display:table` div and observes
        // THAT div to recompute the thumb. Overriding it to `block` (as this
        // used to) breaks the measurement: a block wrapper's height can change
        // through margin-collapsing without the observer reporting a new box,
        // so the thumb kept a stale height and stopped tracking the scroll.
        // The table wrapper is left alone; `viewportClassName` can still opt a
        // specific panel out (the felt needs flex, and has no such children).
        className={`h-full w-full ${viewportClassName}`}
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
      className={`flex touch-none select-none ${
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
