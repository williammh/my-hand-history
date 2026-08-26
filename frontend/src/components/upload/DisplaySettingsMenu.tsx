import { DropdownMenu } from 'radix-ui';
import { IconChevronDown } from '@tabler/icons-react';
import {
  useDisplayStore,
  resolveTimezone,
  type DisplayUnit,
  type DisplayTimezone,
} from '@/state/display-store.js';

const UNITS: readonly { value: DisplayUnit; label: string }[] = [
  { value: 'chips', label: 'Chips' },
  { value: 'bb', label: 'Big blinds' },
];

/**
 * The zones players actually run sessions in, plus 'local'. Deliberately short:
 * a full IANA list is hundreds of entries and unusable in a menu, and 'local'
 * already covers whoever is not in one of these.
 */
const TIMEZONES: readonly { value: DisplayTimezone; label: string }[] = [
  { value: 'local', label: 'Local time' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
];

const ITEM_CLASS =
  'flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm cursor-pointer outline-none ' +
  'data-[highlighted]:bg-emerald-400/10 data-[highlighted]:text-emerald-200 ' +
  'data-[state=checked]:text-emerald-200';

/** A dot rather than a tick: it holds its column when unchecked, so the labels stay aligned. */
function Indicator() {
  return (
    <span className="w-3 shrink-0 flex justify-center">
      <DropdownMenu.ItemIndicator>
        <span className="block size-1.5 rounded-full bg-emerald-300" />
      </DropdownMenu.ItemIndicator>
    </span>
  );
}

function shortLabel(unit: DisplayUnit, timezone: DisplayTimezone): string {
  const unitLabel = unit === 'bb' ? 'BB' : 'Chips';
  const zone = timezone === 'local' ? resolveTimezone(timezone) : timezone;
  // "Europe/Paris" reads as "Paris" in the trigger; the menu carries the detail.
  return `${unitLabel} · ${zone.split('/').pop()?.replace(/_/g, ' ') ?? zone}`;
}

/**
 * Display preferences for every amount and timestamp on screen. Global rather
 * than per-panel so the pot, the stacks, the action log and the hand list can
 * always be read against one another.
 */
export function DisplaySettingsMenu() {
  const { unit, setUnit, timezone, setTimezone } = useDisplayStore();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Display settings"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-slate-700 t-label text-slate-400 transition hover:border-slate-500 hover:text-slate-200 outline-none data-[state=open]:border-slate-500 data-[state=open]:text-slate-200"
      >
        {shortLabel(unit, timezone)}
        <IconChevronDown size={13} />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[13rem] p-1 rounded-sm border border-slate-700 bg-slate-800 text-slate-200 shadow-lg"
        >
          <DropdownMenu.Label className="px-3 py-1.5 t-label text-slate-500">
            Amounts
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={unit}
            onValueChange={(v) => setUnit(v as DisplayUnit)}
          >
            {UNITS.map((o) => (
              <DropdownMenu.RadioItem key={o.value} value={o.value} className={ITEM_CLASS}>
                <Indicator />
                {o.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>

          <DropdownMenu.Separator className="my-1 h-px bg-slate-700" />

          <DropdownMenu.Label className="px-3 py-1.5 t-label text-slate-500">
            Timezone
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={timezone}
            onValueChange={(v) => setTimezone(v as DisplayTimezone)}
          >
            {TIMEZONES.map((o) => (
              <DropdownMenu.RadioItem key={o.value} value={o.value} className={ITEM_CLASS}>
                <Indicator />
                {o.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
