'use client';

import { useMemo, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import type { Option } from '@/filters/options';

interface Props<T extends string | number> {
  label: string;
  options: readonly Option<T>[];
  selected: ReadonlySet<T>;
  onToggle: (value: T) => void;
  onClear: () => void;
  /** Per-option tally, shown right-aligned. Only the library-derived axes pass it. */
  counts?: ReadonlyMap<T, number> | undefined;
  /** Replaces the trigger text when there is nothing to choose from. */
  emptyLabel?: string | undefined;
  /**
   * Adds a text filter above the option list. Meant for open-vocabulary axes
   * like usernames, where a library can hold hundreds of options a plain
   * scroll can't navigate.
   */
  searchable?: boolean | undefined;
}

/** Options shown at once when searching — a library can hold hundreds of names. */
const SEARCH_RESULT_CAP = 200;

/**
 * The indicator holds its own fixed-width column whether or not it is checked,
 * so a label never shifts sideways as options are ticked — the same treatment
 * the display-settings menu uses.
 */
function Indicator() {
  return (
    <span className="w-3 shrink-0 flex justify-center">
      <DropdownMenu.ItemIndicator>
        <span className="block size-1.5 rounded-full bg-emerald-300" />
      </DropdownMenu.ItemIndicator>
    </span>
  );
}

const ITEM_CLASS =
  'flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm cursor-pointer outline-none ' +
  'data-[highlighted]:bg-emerald-400/10 data-[highlighted]:text-emerald-200 ' +
  'data-[state=checked]:text-emerald-200';

/**
 * One filter axis as a multi-select dropdown.
 *
 * A dropdown rather than the reference screenshots' always-open columns: the
 * source column is 19rem wide, and seven open columns of checkboxes would not
 * fit it. The trigger carries the current selection so the panel still reads at
 * a glance with every menu closed.
 */
export function FilterMenu<T extends string | number>({
  label, options, selected, onToggle, onClear, counts, emptyLabel, searchable,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const chosen = options.filter((o) => selected.has(o.value));
  const empty = options.length === 0;
  const summary =
    empty ? emptyLabel ?? 'Any'
      : chosen.length === 0 ? 'Any'
      : chosen.length <= 2 ? chosen.map((o) => o.label).join(', ')
      : `${chosen.length} selected`;

  const filtered = useMemo(() => {
    if (!searchable || query.trim() === '') return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);
  const shown = searchable ? filtered.slice(0, SEARCH_RESULT_CAP) : filtered;
  const hiddenCount = filtered.length - shown.length;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="t-label">{label}</span>
        {chosen.length > 0 && (
          <button
            onClick={onClear}
            className="t-micro text-slate-500 hover:text-slate-300 transition"
          >
            Clear
          </button>
        )}
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          disabled={empty}
          className={`flex items-center justify-between gap-2 w-full px-2.5 py-1.5 rounded-sm border text-sm text-left outline-none transition disabled:cursor-default disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600 ${
            chosen.length > 0
              ? 'border-emerald-500/50 bg-emerald-400/5 text-emerald-200'
              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
          } data-[state=open]:border-slate-500`}
        >
          <span className="truncate">{summary}</span>
          <IconChevronDown size={14} className="shrink-0" />
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            // Capped as well as floored: file names are arbitrarily long, and an
            // uncapped menu would grow far past the panel it drops out of.
            className="z-50 min-w-[11rem] max-w-[min(22rem,calc(100vw-2rem))] max-h-[18rem] overflow-y-auto p-1 rounded-sm border border-slate-700 bg-slate-800 text-slate-200 shadow-lg"
          >
            {searchable && (
              <div className="sticky top-0 z-10 -m-1 mb-1 flex items-center gap-1.5 border-b border-slate-700 bg-slate-800 px-2 py-1.5">
                <IconSearch size={13} className="shrink-0 text-slate-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // Radix's typeahead would otherwise steal every keystroke
                  // meant for this input.
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search…"
                  className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                />
              </div>
            )}
            {shown.map((o) => (
              <DropdownMenu.CheckboxItem
                key={String(o.value)}
                checked={selected.has(o.value)}
                // Radix closes on select by default; a multi-select has to stay
                // open so several options can be ticked in one pass.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onToggle(o.value)}
                title={o.hint ?? (typeof o.value === 'string' ? o.value : undefined)}
                className={ITEM_CLASS}
              >
                <Indicator />
                {/* File names are long and arbitrary — the label truncates and
                    the count keeps its own column so it never gets pushed out. */}
                <span className="truncate">{o.label}</span>
                {counts && (
                  <span className="ml-auto shrink-0 t-micro tabular-nums text-slate-500">
                    {counts.get(o.value)}
                  </span>
                )}
              </DropdownMenu.CheckboxItem>
            ))}
            {searchable && shown.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">No matches</p>
            )}
            {searchable && hiddenCount > 0 && (
              <p className="px-3 py-1.5 t-micro text-slate-500">
                …and {hiddenCount} more, keep typing
              </p>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
