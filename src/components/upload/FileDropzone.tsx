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
      onClick={() => inputRef.current?.click()}
      className={`rounded-sm border-2 border-dashed px-3 py-3 text-center cursor-pointer transition ${
        dragging
          ? 'border-emerald-400 bg-emerald-400/10'
          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
      }`}
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
      {/* Icon inline with the label rather than stacked above it — the tall
          stacked form cost vertical space the filters below now want. */}
      <div className="flex items-center justify-center gap-2">
        <IconUpload size={16} stroke={1.5} className="text-slate-500 shrink-0" aria-hidden />
        <span className="text-sm text-slate-200 font-medium">
          {busy ? 'Parsing…' : 'Drop hand history .txt files'}
        </span>
      </div>
      <p className="t-micro text-slate-500 mt-0.5">or click to choose — several at once is fine</p>
    </div>
  );
}
