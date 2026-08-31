'use client';

import type { ReactNode } from 'react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import { IconX } from '@tabler/icons-react';
import { ScrollArea } from '@/components/ui/ScrollArea';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Rendered off-screen for assistive tech when the header has no room for prose. */
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * The app's first modal — everywhere else uses inline dropdowns because their
 * content fits a menu. A per-player stats breakdown does not, so this wraps
 * radix-ui's Dialog primitive with the surface styling FilterMenu established
 * (`border-slate-700 bg-slate-800 shadow-lg`), just larger and centered.
 *
 * The header sits OUTSIDE the scrolling region rather than being a sticky
 * child of it: a sticky header still shares its parent's scrollbar, so the
 * thumb would run the full content height and visually cross over the header.
 * Splitting them into a fixed header + a separately scrolled body (via the
 * app's ScrollArea) keeps the scrollbar confined to the body only.
 *
 * Grid rather than flex for that split: `grid-rows-[auto_minmax(0,1fr)]`
 * reliably clips the second row to whatever height `max-h-[90vh]` leaves once
 * the header is measured, which is exactly the "header + scrollable
 * remainder, capped total height" layout this needs — a flex column with
 * `flex-1 min-h-0` expresses the same intent but is easy to get wrong when
 * the container's own height comes from `max-height` rather than `height`,
 * since the child needs the parent's used height to already be resolved.
 */
export function Dialog({ open, onOpenChange, title, description, children, className }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-slate-950/70" />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 z-50 w-[min(96vw,52rem)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-sm border border-slate-700 bg-slate-800 text-slate-200 shadow-lg ${className ?? ''}`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-4 py-3">
            <RadixDialog.Title className="text-sm font-semibold tracking-tight text-slate-100">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close className="text-slate-400 transition hover:text-slate-100" aria-label="Close">
              <IconX size={16} />
            </RadixDialog.Close>
          </div>
          {description && (
            <VisuallyHidden.Root asChild>
              <RadixDialog.Description>{description}</RadixDialog.Description>
            </VisuallyHidden.Root>
          )}
          <ScrollArea className="min-h-0">
            <div className="p-4">{children}</div>
          </ScrollArea>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
