'use client';

import type { FileReport, ImportReport } from '@/state/hands-store';
import { registry } from '@/parsers/index';

interface Props {
  report: ImportReport | null;
  /** Omitted when there is nothing stored to clear. */
  onClear?: (() => void) | undefined;
}

function hasErrors(f: FileReport): boolean {
  return f.fileWarnings.length > 0 || f.failures.length > 0;
}

/** The room name to show next to a file, or a fallback when detection failed. */
function roomLabel(siteId: FileReport['siteId']): string {
  if (siteId === null) return 'Unknown room';
  return registry.get(siteId)?.displayName ?? siteId;
}

/** One file's line in the report, with its own warnings nested under it. */
function FileRow({ file }: { file: FileReport }) {
  return (
    <div>
      <p className="text-slate-200 min-w-0">
        {/* The name wraps rather than truncates: with several files listed, the
            name is the only thing distinguishing one row's numbers from another's. */}
        <span className="font-medium break-all">{file.fileName}</span>{' '}
        <span className="text-slate-400">({roomLabel(file.siteId)})</span>: parsed {file.parsed}{' '}
        {file.parsed === 1 ? 'hand' : 'hands'}
        {file.added !== file.parsed && (
          <span className="text-slate-400">
            {' '}({file.parsed - file.added} already loaded)
          </span>
        )}
        {file.failures.length > 0 && (
          <span className="text-amber-300">
            {' '}— {file.failures.length} of {file.parsed + file.failures.length} failed
          </span>
        )}
      </p>

      {file.fileWarnings.map((w, i) => (
        <p key={i} className="text-amber-300 mt-1">{w.message}</p>
      ))}

      {file.failures.slice(0, 3).map((f) => (
        <p key={f.ordinal} className="text-amber-300/80 mt-1 text-xs">
          Hand #{f.ordinal}: {f.errors[0]?.message}
        </p>
      ))}

      {file.warnedHands > 0 && (
        <p className="text-amber-300/80 mt-1 text-xs">
          {file.warnedHands} hand(s) parsed with warnings.
        </p>
      )}
    </div>
  );
}

export function ParseReport({ report, onClear }: Props) {
  if (!report) return null;

  const errored = report.files.some(hasErrors);
  const multiple = report.files.length > 1;

  return (
    <div
      className={`rounded-sm border p-3 text-sm ${
        errored ? 'border-amber-600/50 bg-amber-500/10' : 'border-emerald-600/40 bg-emerald-500/10'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* A multi-file import leads with the total, because that is the number
            the player is checking; the per-file breakdown follows underneath.
            A single file has no total worth stating separately from its row. */}
        {multiple ? (
          <p className="text-slate-200 min-w-0">
            <span className="font-medium">{report.files.length} files</span>: parsed{' '}
            {report.parsed} {report.parsed === 1 ? 'hand' : 'hands'}
            {report.added !== report.parsed && (
              <span className="text-slate-400">
                {' '}({report.parsed - report.added} already loaded)
              </span>
            )}
          </p>
        ) : (
          <div className="min-w-0">
            {report.files[0] && <FileRow file={report.files[0]} />}
          </div>
        )}
        {onClear && (
          <button
            onClick={onClear}
            className="ml-auto shrink-0 text-xs text-slate-500 hover:text-rose-400 transition"
          >
            Clear
          </button>
        )}
      </div>

      {multiple && (
        <div className="mt-2 pt-2 border-t border-slate-100/10 space-y-2 max-h-48 overflow-y-auto scroll-thin">
          {report.files.map((f) => (
            <FileRow key={f.fileName} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}
