import type { GameMode } from '@/domain/hand';
import type { Amount, MoneyContext } from '@/domain/money';
import { toBB } from '@/domain/money';
import { resolveTimezone, type DisplayTimezone } from '@/state/display-store';

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

/** "89,994" for chips; "5.00 €" for cash. */
export function formatAmount(a: Amount, ctx: MoneyContext): string {
  if (ctx.exponent === 0) return a.toLocaleString('en-US');
  const major = a / 100;
  const symbol = CURRENCY_SYMBOL[ctx.currency] ?? ctx.currency;
  return `${major.toFixed(2)} ${symbol}`;
}

/** "11.2bb" — one decimal, which is how players actually talk about stacks. */
export function formatBB(a: Amount, ctx: MoneyContext): string {
  return `${toBB(a, ctx).toFixed(1)}bb`;
}

export function formatBBNumber(n: number): string {
  return `${n.toFixed(1)}bb`;
}

export function formatCards(cards: readonly string[] | null): string {
  return cards && cards.length ? cards.join(' ') : '—';
}

/**
 * "2026-08-25 14:32 UTC" in whichever zone the user picked. Timestamps are
 * stored as UTC instants, so the zone only changes how they read, never which
 * moment they refer to. The abbreviation is always shown: without it two hands
 * from different sessions can look like they were played at the same time.
 */
export function formatDateTime(iso: string, timezone: DisplayTimezone = 'UTC'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown date';

  const zone = resolveTimezone(timezone);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).formatToParts(d);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    // 'en-CA' gives hour 24 for midnight where the rest of the app expects 00.
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')} ${get('timeZoneName')}`;
  } catch {
    // An unsupported zone should not blank out the timestamp.
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
}

export const SUIT_SYMBOL: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

/** Red for hearts/diamonds, matching how cards read on felt. */
export function suitColorClass(suit: string): string {
  return suit === 'h' || suit === 'd' ? 'text-rose-400' : 'text-slate-100';
}

/**
 * The one formatter every display surface should call, so a single toggle
 * switches all of them together. `formatAmount` and `formatBB` remain for the
 * few places that deliberately want one specific unit.
 */
export function formatUnit(a: Amount, ctx: MoneyContext, unit: 'chips' | 'bb'): string {
  return unit === 'bb' ? formatBB(a, ctx) : formatAmount(a, ctx);
}

/** Signed variant for results: "+12,000" / "−3.5bb" / "0". */
export function formatSignedUnit(n: number, ctx: MoneyContext, unit: 'chips' | 'bb'): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${formatUnit(Math.abs(n) as Amount, ctx, unit)}`;
}

/**
 * "Tournament" / "Cash game" / "Sit & Go" — shown next to the game name, which
 * on its own does not say which it is: Betclic names a tournament "Classic" as
 * readily as it names a cash table that.
 */
export function formatGameMode(mode: GameMode): string {
  switch (mode) {
    case 'tournament': return 'Tournament';
    case 'sit-n-go': return 'Sit & Go';
    case 'cash': return 'Cash game';
  }
}
