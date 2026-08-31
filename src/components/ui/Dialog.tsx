'use client';

import type { ReactNode } from 'react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import { IconX } from '@tabler/icons-react';

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
 */
export function Dialog({ open, onOpenChange, title, description, children, className }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-slate-950/70" />
        <RadixDialog.Content
          className={`fixed left-1/2 top-1/2 z-50 w-[min(96vw,52rem)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border border-slate-700 bg-slate-800 text-slate-200 shadow-lg ${className ?? ''}`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-4 py-3">
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
          <div className="p-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
