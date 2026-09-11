import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Extra classes for the scroller — sizing and padding live here. */
  className?: string;
  orientation?: 'vertical' | 'horizontal' | 'both';
}

const OVERFLOW: Record<NonNullable<Props['orientation']>, string> = {
  vertical: 'overflow-y-auto overflow-x-hidden scroll-gutter-stable',
  horizontal: 'overflow-x-auto overflow-y-hidden',
  both: 'overflow-auto',
};

/**
 * App-wide scroll container: a native scroller, dark-styled in CSS
 * (`.scroll-thin` in globals.css) so it doesn't show the light platform
 * chrome on Linux/Windows.
 *
 * This used to be Radix ScrollArea, which draws its own thumb in JavaScript.
 * That thumb can't keep up once the main thread is busy (a large hand library,
 * or analysis running after a hand is picked):
 *   - Every Radix scrollbar registers a NON-passive `wheel` listener on
 *     `document`, which stops the browser scrolling on the compositor. Every
 *     wheel tick on the page waits for JS, and a busy main thread drops it.
 *   - The thumb is moved by a requestAnimationFrame loop polling `scrollTop`,
 *     so it trails the content, and on a quick reversal it's still finishing
 *     the previous direction.
 * A native scrollbar is painted by the compositor in step with the content,
 * however busy the page is.
 *
 * Vertical scrollers reserve their gutter (`scrollbar-gutter: stable`) so the
 * content doesn't reflow sideways when a list grows past its container.
 */
export function ScrollArea({ children, className = '', orientation = 'vertical' }: Props) {
  return <div className={`scroll-thin ${OVERFLOW[orientation]} ${className}`}>{children}</div>;
}
