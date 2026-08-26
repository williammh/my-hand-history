import { useCallback, useRef, useState } from 'react';
import { IconUpload } from '@tabler/icons-react';

interface Props {
  onFile: (text: string, fileName: string) => void;
  busy: boolean;
}

export function FileDropzone({ onFile, busy }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const read = useCallback(
    (file: File) => {
      // Read as UTF-8; the parser repairs the room's own mojibake afterwards.
      file.text().then((text) => onFile(text, file.name));
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) read(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`rounded-sm border-2 border-dashed p-8 text-center cursor-pointer transition ${
        dragging
          ? 'border-emerald-400 bg-emerald-400/10'
          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) read(file);
          e.target.value = '';
        }}
      />
      <IconUpload size={24} stroke={1.5} className="mx-auto mb-2 text-slate-500" aria-hidden />
      <p className="text-slate-200 font-medium">
        {busy ? 'Parsing…' : 'Drop a hand history .txt file'}
      </p>
      <p className="text-slate-500 text-sm mt-1">
        or click to choose
      </p>
    </div>
  );
}
