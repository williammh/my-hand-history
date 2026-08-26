import { Select } from 'radix-ui';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import type { SiteId } from '@/domain/hand.js';
import { registry } from '@/parsers/index.js';

interface Props {
  value: SiteId;
  onChange: (siteId: SiteId) => void;
}

/**
 * Driven by the parser registry, so registering a new site parser makes its
 * option appear with no change here.
 */
export function SiteRadioGroup({ value, onChange }: Props) {
  const parsers = registry.list();
  const planned: { siteId: string; displayName: string }[] = [
    { siteId: 'pokerstars', displayName: 'PokerStars' },
    { siteId: 'ggpoker', displayName: 'GGPoker' },
    { siteId: 'winamax', displayName: 'Winamax' },
  ].filter((p) => !parsers.some((r) => r.siteId === p.siteId));

  return (
    <div>
      <Select.Root value={value} onValueChange={(v) => onChange(v as SiteId)}>
        <Select.Trigger className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-sm border border-slate-700 bg-slate-800/50 text-slate-200 text-sm hover:border-slate-500 data-[placeholder]:text-slate-500">
          <Select.Value />
          <Select.Icon>
            <IconChevronDown size={16} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="overflow-hidden rounded-sm border border-slate-700 bg-slate-800 text-slate-200 text-sm shadow-lg">
            <Select.Viewport className="p-1">
              {parsers.map((p) => (
                <Select.Item
                  key={p.siteId}
                  value={p.siteId}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm cursor-pointer outline-none data-[highlighted]:bg-emerald-400/10 data-[highlighted]:text-emerald-200 data-[state=checked]:text-emerald-200"
                >
                  {/* Fixed-width column so the checkmark doesn't push this
                      item's label out of line with the unchecked ones below. */}
                  <span className="w-3.5 shrink-0 flex justify-center">
                    <Select.ItemIndicator>
                      <IconCheck size={14} />
                    </Select.ItemIndicator>
                  </span>
                  <Select.ItemText>{p.displayName}</Select.ItemText>
                </Select.Item>
              ))}
              {planned.map((p) => (
                <Select.Item
                  key={p.siteId}
                  value={p.siteId}
                  disabled
                  className="flex items-center gap-2 px-3 py-2 rounded-sm text-slate-600 cursor-not-allowed"
                >
                  <span className="w-3.5 shrink-0" />
                  <Select.ItemText>{p.displayName}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
