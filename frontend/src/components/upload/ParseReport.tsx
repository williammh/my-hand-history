import type { ImportReport } from '@/state/hands-store.js';

interface Props {
  report: ImportReport | null;
  /** Omitted when there is nothing stored to clear. */
  onClear?: (() => void) | undefined;
}

export function ParseReport({ report, onClear }: Props) {
  if (!report) return null;

  const hasErrors = report.fileWarnings.length > 0 || report.failures.length > 0;

  return (
    <div
      className={`rounded-sm border p-3 text-sm ${
        hasErrors ? 'border-amber-600/50 bg-amber-500/10' : 'border-emerald-600/40 bg-emerald-500/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <p className="text-slate-200 min-w-0">
          <span className="font-medium">{report.fileName}</span>: parsed {report.parsed}{' '}
          {report.parsed === 1 ? 'hand' : 'hands'}
          {report.failures.length > 0 && (
            <span className="text-amber-300">
              {' '}— {report.failures.length} of {report.parsed + report.failures.length} failed
            </span>
          )}
        </p>
        {onClear && (
          <button
            onClick={onClear}
            className="ml-auto shrink-0 text-xs text-slate-500 hover:text-rose-400 transition"
          >
            Clear
          </button>
        )}
      </div>

      {report.fileWarnings.map((w, i) => (
        <p key={i} className="text-amber-300 mt-1">{w.message}</p>
      ))}

      {report.failures.slice(0, 3).map((f) => (
        <p key={f.ordinal} className="text-amber-300/80 mt-1 text-xs">
          Hand #{f.ordinal}: {f.errors[0]?.message}
        </p>
      ))}

      {report.warnedHands > 0 && (
        <p className="text-amber-300/80 mt-1 text-xs">
          {report.warnedHands} hand(s) parsed with warnings.
        </p>
      )}
    </div>
  );
}
