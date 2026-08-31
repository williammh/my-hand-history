'use client';

import type { Severity } from '@/analysis/types';

/**
 * Tabler `check` and `x`, inlined as SVG rather than pulled from a package:
 * two icons is not worth a dependency, and inlining keeps the bundle free of
 * an icon font.
 */
export function VerdictIcon({ severity }: { severity: Severity }) {
  const correct = severity === 'ok';
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  return correct ? (
    <svg {...common} className="text-emerald-400 shrink-0">
      <path d="M5 12l5 5L20 7" />
    </svg>
  ) : (
    <svg {...common} className="text-rose-500 shrink-0">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
