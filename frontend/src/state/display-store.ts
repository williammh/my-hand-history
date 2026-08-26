import { create } from 'zustand';

/**
 * Chips (or cash) versus big blinds. A single global preference rather than a
 * per-panel one: the point of the toggle is that every number on screen can be
 * compared against every other, which per-panel state would defeat.
 */
export type DisplayUnit = 'chips' | 'bb';

/**
 * An IANA zone name, or 'local' for whatever the browser reports. Hand
 * histories carry UTC timestamps, so the zone is purely a display choice —
 * players want to read session times in the zone they were playing in.
 */
export type DisplayTimezone = string;

const UNIT_KEY = 'my-hand-history:display-unit';
const TZ_KEY = 'my-hand-history:display-timezone';

/** Resolves 'local' to the browser zone; falls back to UTC where unavailable. */
export function resolveTimezone(tz: DisplayTimezone): string {
  if (tz !== 'local') return tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** A zone is only usable if Intl accepts it — a stale stored value may not be. */
function isSupported(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: resolveTimezone(tz) });
    return true;
  } catch {
    return false;
  }
}

function initialUnit(): DisplayUnit {
  try {
    return localStorage.getItem(UNIT_KEY) === 'bb' ? 'bb' : 'chips';
  } catch {
    // Private mode / blocked storage — the default is still correct.
    return 'chips';
  }
}

function initialTimezone(): DisplayTimezone {
  try {
    const stored = localStorage.getItem(TZ_KEY);
    if (stored && isSupported(stored)) return stored;
  } catch {
    // Fall through to the default.
  }
  return 'UTC';
}

interface DisplayState {
  unit: DisplayUnit;
  timezone: DisplayTimezone;
  setUnit: (u: DisplayUnit) => void;
  toggleUnit: () => void;
  setTimezone: (tz: DisplayTimezone) => void;
}

export const useDisplayStore = create<DisplayState>((set, get) => ({
  unit: initialUnit(),
  timezone: initialTimezone(),
  setUnit: (unit) => {
    try { localStorage.setItem(UNIT_KEY, unit); } catch { /* preference is not worth failing over */ }
    set({ unit });
  },
  toggleUnit: () => get().setUnit(get().unit === 'bb' ? 'chips' : 'bb'),
  setTimezone: (timezone) => {
    if (!isSupported(timezone)) return;
    try { localStorage.setItem(TZ_KEY, timezone); } catch { /* preference is not worth failing over */ }
    set({ timezone });
  },
}));
