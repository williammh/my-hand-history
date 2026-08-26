import { DropdownMenu } from 'radix-ui';
import { IconChevronDown } from '@tabler/icons-react';
import type { Option } from '@/filters/options.js';

interface Props<T extends string | number> {
  label: string;
  options: readonly Option<T>[];
  selected: ReadonlySet<T>;
  onToggle: (value: T) => void;
  onClear: () => void;
}

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
  label, options, selected, onToggle, onClear,
}: Props<T>) {
  const chosen = options.filter((o) => selected.has(o.value));
  const summary =
    chosen.length === 0 ? 'Any'
      : chosen.length <= 2 ? chosen.map((o) => o.label).join(', ')
      : `${chosen.length} selected`;

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
          className={`flex items-center justify-between gap-2 w-full px-2.5 py-1.5 rounded-sm border text-sm text-left outline-none transition ${
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
            className="z-50 min-w-[11rem] max-h-[18rem] overflow-y-auto p-1 rounded-sm border border-slate-700 bg-slate-800 text-slate-200 shadow-lg"
          >
            {options.map((o) => (
              <DropdownMenu.CheckboxItem
                key={String(o.value)}
                checked={selected.has(o.value)}
                // Radix closes on select by default; a multi-select has to stay
                // open so several options can be ticked in one pass.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onToggle(o.value)}
                title={o.hint}
                className={ITEM_CLASS}
              >
                <Indicator />
                {o.label}
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
