'use client';

import { useCallback, useRef, useState } from 'react';
import { IconUpload } from '@tabler/icons-react';

export interface UploadedFile {
  readonly text: string;
  readonly fileName: string;
}

interface Props {
  onFiles: (files: readonly UploadedFile[]) => void;
  busy: boolean;
}

export function FileDropzone({ onFiles, busy }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const read = useCallback(
    (files: FileList | null) => {
      const list = [...(files ?? [])];
      if (list.length === 0) return;
      // Read as UTF-8; the parser repairs the room's own mojibake afterwards.
      // Handed over as one batch so the store imports them in a single pass and
      // reports on them together, rather than once per file.
      void Promise.all(
        list.map(async (f) => ({ text: await f.text(), fileName: f.name })),
      ).then(onFiles);
    },
    [onFiles],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        read(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,text/plain"
        multiple
        className="hidden"
        onChange={(e) => {
          read(e.target.files);
          // Cleared so re-picking the same file still fires a change event.
          e.target.value = '';
        }}
      />
      {/* A button first; dropping files onto it still works, so the old
          dropzone's behaviour survives without its footprint. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`flex w-full items-center justify-center gap-2 px-2.5 py-1.5 rounded-sm border text-sm font-medium outline-none transition disabled:cursor-default disabled:opacity-60 ${
          dragging
            ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200'
            : 'border-emerald-500/50 bg-emerald-400/5 text-emerald-200 hover:bg-emerald-400/10'
        }`}
      >
        <IconUpload size={14} aria-hidden className="shrink-0" />
        <span className="min-w-0 truncate">{busy ? 'Parsing…' : 'Import hand history'}</span>
      </button>
    </div>
  );
}
