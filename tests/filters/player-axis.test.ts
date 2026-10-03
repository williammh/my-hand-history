import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import type { Hand, SiteId } from '@/domain/hand';
import { deriveFacts } from '@/filters/facts';
import { matches, activeCount, isActive } from '@/filters/match';
import { EMPTY_CRITERIA, type FilterCriteria } from '@/filters/types';
import { playerOptions } from '@/filters/options';
import { useFiltersStore } from '@/state/filters-store';
import { playerKey } from '@/stats/types';

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const WINAMAX_FILE = 'winamax-session.txt';
const SITE_NAMES = new Map<SiteId, string>([
  ['betclic-fr', 'Betclic.fr'],
  ['winamax', 'Winamax'],
]);

let hands: readonly Hand[];

beforeAll(() => {
  const text = readFileSync(url('../fixtures/winamax/alcacer-do-sal.txt'), 'utf8');
  hands = registry.parseFile(text, 'winamax', WINAMAX_FILE).hands;
  expect(hands.length).toBeGreaterThan(0);
});

const crit = (overrides: Partial<FilterCriteria>): FilterCriteria => ({ ...EMPTY_CRITERIA, ...overrides });
const filtered = (c: FilterCriteria) => hands.filter((h) => matches(deriveFacts(h), c));

describe('the player filter axis', () => {
  it('is unconstrained by default', () => {
    expect(filtered(EMPTY_CRITERIA)).toHaveLength(hands.length);
  });

  it('keeps a hand where the selected player was dealt in, whether they folded preflop or not', () => {
    const key = playerKey('winamax', '20bj');
    const dealtIn = hands.filter((h) => h.seats.some((s) => s.playerId === '20bj'));
    expect(dealtIn.length).toBeGreaterThan(0);

    const result = filtered(crit({ players: new Set([key]) }));
    expect(result).toEqual(dealtIn);

    // At least one of those hands has the player folding preflop — the axis
    // must not silently narrow to "voluntarily played" hands only.
    const foldedPreflop = dealtIn.some((h) =>
      h.actions.some((a) => a.playerId === '20bj' && a.kind === 'fold' && a.street === 'preflop'),
    );
    expect(foldedPreflop).toBe(true);
  });

  it('OR-combines multiple selected players within the axis', () => {
    const a = playerKey('winamax', '20bj');
    const b = playerKey('winamax', 'ghoustryde');
    const union = hands.filter((h) =>
      h.seats.some((s) => s.playerId === '20bj' || s.playerId === 'ghoustryde'),
    );
    expect(filtered(crit({ players: new Set([a, b]) }))).toEqual(union);
  });

  it('excludes a hand nobody selected was dealt into', () => {
    const key = playerKey('winamax', 'nobody-by-this-name');
    expect(filtered(crit({ players: new Set([key]) }))).toHaveLength(0);
  });

  it('counts toward isActive and activeCount', () => {
    expect(isActive(EMPTY_CRITERIA)).toBe(false);
    const c = crit({ players: new Set([playerKey('winamax', '20bj')]) });
    expect(isActive(c)).toBe(true);
    expect(activeCount(c)).toBe(1);
    expect(activeCount(crit({ players: new Set([playerKey('winamax', '20bj')]), sites: new Set(['winamax']) }))).toBe(2);
  });
});

describe('the player count filter axis', () => {
  const dealtIn = (h: Hand) => h.seats.filter((s) => !s.sittingOut).length;
  const counts = () => [...new Set(hands.map(dealtIn))].sort((a, b) => a - b);

  it('derives the count from seats that were dealt in', () => {
    for (const h of hands) expect(deriveFacts(h).playerCount).toBe(dealtIn(h));
  });

  it('keeps only hands with the selected number of players', () => {
    const n = counts()[0]!;
    const result = filtered(crit({ playerCounts: new Set([n]) }));
    expect(result).toEqual(hands.filter((h) => dealtIn(h) === n));
    expect(result.length).toBeGreaterThan(0);
  });

  it('OR-combines multiple selected counts within the axis', () => {
    const [a, b] = counts();
    // Skip silently-vacuous coverage: the fixture must hold two table sizes.
    expect(b).toBeDefined();
    const result = filtered(crit({ playerCounts: new Set([a!, b!]) }));
    expect(result).toEqual(hands.filter((h) => [a, b].includes(dealtIn(h))));
  });

  it('excludes every hand when no hand has the selected count', () => {
    expect(filtered(crit({ playerCounts: new Set([99]) }))).toHaveLength(0);
  });

  it('counts toward isActive and activeCount', () => {
    const c = crit({ playerCounts: new Set([6]) });
    expect(isActive(c)).toBe(true);
    expect(activeCount(c)).toBe(1);
  });

  it('toggles and clears through the store', () => {
    const { toggle, clearAxis, clearAll } = useFiltersStore.getState();
    clearAll();
    toggle('playerCounts', 6);
    expect([...useFiltersStore.getState().criteria.playerCounts]).toEqual([6]);
    clearAxis('playerCounts');
    expect(useFiltersStore.getState().criteria.playerCounts.size).toBe(0);
  });
});

describe('playerOptions', () => {
  it('derives a per-room key, counts, and a room hint', () => {
    const options = playerOptions(hands, SITE_NAMES);
    const opt = options.find((o) => o.name === '20BJ');
    expect(opt).toBeDefined();
    expect(opt!.siteId).toBe('winamax');
    expect(opt!.hint).toBe('Winamax');
    expect(opt!.count).toBe(hands.filter((h) => h.seats.some((s) => s.playerId === '20bj')).length);
  });

  it('disambiguates the same username across two rooms with a room-qualified label', () => {
    const betclicText = readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8');
    const betclicHands = registry.parseFile(betclicText, 'betclic-fr', 'b.txt').hands;
    // Rename a betclic seat to collide with a winamax username so the
    // ambiguity path is exercised deterministically.
    const collided = betclicHands.map((h) => ({
      ...h,
      seats: h.seats.map((s, i) => (i === 0 ? { ...s, name: '20BJ', playerId: '20bj' } : s)),
    }));

    const options = playerOptions([...hands, ...collided], SITE_NAMES);
    const labels = options.filter((o) => o.name === '20BJ').map((o) => o.label);
    expect(labels).toContain('20BJ (Winamax)');
    expect(labels).toContain('20BJ (Betclic.fr)');
  });
});

describe('pruning a stale player selection', () => {
  beforeEach(() => useFiltersStore.getState().clearAll());

  it('drops a key the library no longer holds', () => {
    const { toggle, prunePlayers } = useFiltersStore.getState();
    const kept = playerKey('winamax', '20bj');
    const stale = playerKey('winamax', 'deleted-user');
    toggle('players', kept);
    toggle('players', stale);

    prunePlayers(new Set([kept]));

    expect([...useFiltersStore.getState().criteria.players]).toEqual([kept]);
  });

  it('leaves the criteria object identical when nothing is stale', () => {
    const { toggle, prunePlayers } = useFiltersStore.getState();
    const kept = playerKey('winamax', '20bj');
    toggle('players', kept);
    const before = useFiltersStore.getState().criteria;

    prunePlayers(new Set([kept, playerKey('winamax', 'someone-else')]));

    // Identity matters: App memoises the filtered pool on the criteria object.
    expect(useFiltersStore.getState().criteria).toBe(before);
  });
});
