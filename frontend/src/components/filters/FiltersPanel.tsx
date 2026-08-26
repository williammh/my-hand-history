import { IconChevronDown, IconX } from '@tabler/icons-react';
import { Select } from 'radix-ui';
import type { Street } from '@/domain/position.js';
import type { Rank } from '@/domain/cards.js';
import { useFiltersStore } from '@/state/filters-store.js';
import { activeCount } from '@/filters/match.js';
import type { RelativePosition } from '@/filters/types.js';
import {
  CONNECTEDNESS, POT_TYPES, POSITIONS, PREFLOP_AGGRESSION, RELATIVE_POSITIONS, SEVERITIES,
  STACKS, STREETS, SUIT_TEXTURES, linesFor,
} from '@/filters/options.js';
import { RANK_OPTIONS } from '@/filters/board.js';
import { FilterMenu } from './FilterMenu.js';
import { ScrollArea } from '@/components/ui/ScrollArea.js';

const SEGMENT_BASE =
  'flex-1 px-2 py-1 text-center text-sm rounded-sm transition outline-none';

/** A one-of-N segmented control — used where an axis is single-valued. */
function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-sm border border-slate-700 bg-slate-800/50">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`${SEGMENT_BASE} ${
            value === o.value
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A rank bound for the flop. "Any" clears the bound, which is why the value is
 * nullable rather than defaulting to A/2 — an explicit A ceiling and no ceiling
 * at all mean the same thing today, but only one of them survives a future
 * board that runs higher than the flop.
 */
function RankSelect({
  label, value, onChange,
}: {
  label: string;
  value: Rank | null;
  onChange: (r: Rank | null) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <span className="t-label block mb-1">{label}</span>
      <Select.Root
        value={value ?? 'any'}
        onValueChange={(v) => onChange(v === 'any' ? null : (v as Rank))}
      >
        <Select.Trigger
          className={`flex items-center justify-between gap-1 w-full px-2.5 py-1.5 rounded-sm border text-sm outline-none transition ${
            value
              ? 'border-emerald-500/50 bg-emerald-400/5 text-emerald-200'
              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
          }`}
        >
          <Select.Value />
          <Select.Icon><IconChevronDown size={14} /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="z-50 overflow-hidden rounded-sm border border-slate-700 bg-slate-800 text-slate-200 text-sm shadow-lg">
            <Select.Viewport className="p-1 max-h-[16rem]">
              <Select.Item value="any" className={SELECT_ITEM}>
                <Select.ItemText>Any</Select.ItemText>
              </Select.Item>
              {RANK_OPTIONS.map((o) => (
                <Select.Item key={o.value} value={o.value} className={SELECT_ITEM}>
                  <Select.ItemText>{o.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

const SELECT_ITEM =
  'px-3 py-1.5 rounded-sm cursor-pointer outline-none ' +
  'data-[highlighted]:bg-emerald-400/10 data-[highlighted]:text-emerald-200 ' +
  'data-[state=checked]:text-emerald-200';

/**
 * Filters the hand list. Sits under Source because it acts on the same library
 * the source panel loads into.
 *
 * The reference design lays every axis out as an always-open column of
 * checkboxes; this column is 19rem wide, so each axis collapses into a
 * multi-select dropdown that reports its own selection on the trigger. The
 * filtering capability is the same.
 */
export function FiltersPanel() {
  const {
    criteria, toggle, clearAxis, setStreet, setHeroStreetPosition, setSawFlopOnly,
    setHighestRank, setLowestRank, clearAll,
  } = useFiltersStore();
  const active = activeCount(criteria);

  return (
    <div className="rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden h-full flex flex-col">
      {/* Pinned while the axes scroll beneath it, matching the hands panel —
          which matters most for "Clear all", the one control you want reachable
          without scrolling back up. */}
      <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <span className="t-panel-title">Filters</span>
        {active > 0 && (
          <span className="t-micro px-1.5 py-0.5 rounded-sm bg-emerald-400/10 text-emerald-300">
            {active}
          </span>
        )}
        {/* Always rendered, disabled when there is nothing to clear: a control
            that only appears once a filter is set is a control you cannot find
            when looking for it. */}
        <button
          onClick={clearAll}
          disabled={active === 0}
          className="ml-auto inline-flex items-center gap-1 t-label transition text-slate-500 hover:text-slate-200 disabled:text-slate-700 disabled:hover:text-slate-700 disabled:cursor-default"
        >
          <IconX size={12} />
          Clear all
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
      <div className="p-3 space-y-3">
        <FilterMenu
          label="Pot type"
          options={POT_TYPES}
          selected={criteria.potTypes}
          onToggle={(v) => toggle('potTypes', v)}
          onClear={() => clearAxis('potTypes')}
        />

        <FilterMenu
          label="Relative position"
          options={RELATIVE_POSITIONS}
          selected={criteria.relativePositions}
          onToggle={(v) => toggle('relativePositions', v)}
          onClear={() => clearAxis('relativePositions')}
        />

        <FilterMenu
          label="Player position"
          options={POSITIONS}
          selected={criteria.heroPositions}
          onToggle={(v) => toggle('heroPositions', v)}
          onClear={() => clearAxis('heroPositions')}
        />

        <FilterMenu
          label="Opponent position"
          options={POSITIONS}
          selected={criteria.opponentPositions}
          onToggle={(v) => toggle('opponentPositions', v)}
          onClear={() => clearAxis('opponentPositions')}
        />

        <FilterMenu
          label="Effective stack (BB)"
          options={STACKS}
          selected={criteria.stacks}
          onToggle={(v) => toggle('stacks', v)}
          onClear={() => clearAxis('stacks')}
        />

        <FilterMenu
          label="Preflop aggression"
          options={PREFLOP_AGGRESSION}
          selected={criteria.preflopAggression}
          onToggle={(v) => toggle('preflopAggression', v)}
          onClear={() => clearAxis('preflopAggression')}
        />

        <div className="pt-1 border-t border-slate-800 space-y-3">
          <div>
            <span className="t-label block mb-1">Street</span>
            <Segmented
              options={STREETS}
              value={criteria.street}
              onChange={(v) => setStreet(v as Street)}
            />
          </div>

          <div>
            <span className="t-label block mb-1">Hero position</span>
            <Segmented
              options={[
                { value: 'any' as const, label: 'Any' },
                { value: 'oop' as const, label: 'OOP' },
                { value: 'ip' as const, label: 'IP' },
              ]}
              value={criteria.heroStreetPosition}
              onChange={(v) => setHeroStreetPosition(v as RelativePosition | 'any')}
            />
          </div>

          <FilterMenu
            label="GTO result"
            options={SEVERITIES}
            selected={criteria.severities}
            onToggle={(v) => toggle('severities', v)}
            onClear={() => clearAxis('severities')}
          />

          {/* Line options change with the street, so the axis is cleared on a
              street switch by keying the menu — a stale "check raise" would
              otherwise silently filter a preflop street to nothing. */}
          <FilterMenu
            key={criteria.street}
            label={`Hero ${criteria.street} line`}
            options={linesFor(criteria.street)}
            selected={criteria.lines}
            onToggle={(v) => toggle('lines', v)}
            onClear={() => clearAxis('lines')}
          />

          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="t-label">Hero saw flop</span>
            <button
              role="switch"
              aria-checked={criteria.sawFlopOnly}
              onClick={() => setSawFlopOnly(!criteria.sawFlopOnly)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                criteria.sawFlopOnly ? 'bg-emerald-500/70' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-slate-100 transition-all ${
                  criteria.sawFlopOnly ? 'left-[1.125rem]' : 'left-0.5'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Board texture. The two rank selects are BOUNDS on the flop, so
            "3 card connected · highest A · lowest 8" reads as AKQ down to T98
            rather than as a single exact board. */}
        <div className="pt-1 border-t border-slate-800 space-y-3">
          <FilterMenu
            label="Board connectedness"
            options={CONNECTEDNESS}
            selected={criteria.connectedness}
            onToggle={(v) => toggle('connectedness', v)}
            onClear={() => clearAxis('connectedness')}
          />

          <FilterMenu
            label="Board suits"
            options={SUIT_TEXTURES}
            selected={criteria.suitTextures}
            onToggle={(v) => toggle('suitTextures', v)}
            onClear={() => clearAxis('suitTextures')}
          />

          <div className="flex gap-2">
            <RankSelect label="Highest card" value={criteria.highestRank} onChange={setHighestRank} />
            <RankSelect label="Lowest card" value={criteria.lowestRank} onChange={setLowestRank} />
          </div>
        </div>
      </div>
      </ScrollArea>
    </div>
  );
}
