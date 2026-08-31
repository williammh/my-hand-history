import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import type { Hand, SiteId } from '@/domain/hand';
import { deriveFacts } from '@/filters/facts';
import { matches, activeCount, isActive } from '@/filters/match';
import { EMPTY_CRITERIA, type FilterCriteria } from '@/filters/types';
import { siteOptions, sourceFileOptions } from '@/filters/options';
import { useFiltersStore } from '@/state/filters-store';

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const BETCLIC_FILE = 'session-a.txt';
const BETCLIC_FILE_B = 'session-b.txt';
const WINAMAX_FILE = 'winamax-session.txt';

const SITE_NAMES = new Map<SiteId, string>([
  ['betclic-fr', 'Betclic.fr'],
  ['winamax', 'Winamax'],
]);

/** Same source parsed under two names, standing in for two separate imports. */
let betclicA: readonly Hand[];
let betclicB: readonly Hand[];
let winamax: readonly Hand[];
let all: readonly Hand[];

beforeAll(() => {
  const betclicText = readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8');
  const deepText = readFileSync(url('../fixtures/betclic/deep-3bet.txt'), 'utf8');
  const winamaxText = readFileSync(url('../fixtures/winamax/alcacer-do-sal.txt'), 'utf8');

  betclicA = registry.parseFile(betclicText, 'betclic-fr', BETCLIC_FILE).hands;
  betclicB = registry.parseFile(deepText, 'betclic-fr', BETCLIC_FILE_B).hands;
  winamax = registry.parseFile(winamaxText, 'winamax', WINAMAX_FILE).hands;
  all = [...betclicA, ...betclicB, ...winamax];

  expect(betclicA.length).toBeGreaterThan(0);
  expect(betclicB.length).toBeGreaterThan(0);
  expect(winamax.length).toBeGreaterThan(0);
});

const crit = (over: Partial<FilterCriteria>): FilterCriteria => ({ ...EMPTY_CRITERIA, ...over });
const keep = (hands: readonly Hand[], c: FilterCriteria) =>
  hands.filter((h) => matches(deriveFacts(h), c));

describe('sourceFile on the hand', () => {
  it('is stamped from the importing file name', () => {
    expect(betclicA.every((h) => h.meta.sourceFile === BETCLIC_FILE)).toBe(true);
    expect(winamax.every((h) => h.meta.sourceFile === WINAMAX_FILE)).toBe(true);
  });

  it('is null when a file was parsed without a name', () => {
    const text = readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8');
    const anonymous = registry.parseFile(text, 'betclic-fr').hands;
    expect(anonymous.every((h) => h.meta.sourceFile === null)).toBe(true);
  });
});

describe('derived source options', () => {
  it('lists every room present, counted and labelled', () => {
    const opts = siteOptions(all, SITE_NAMES);
    expect([...opts].map((o) => o.value).sort()).toEqual(['betclic-fr', 'winamax']);

    const byValue = new Map(opts.map((o) => [o.value, o]));
    expect(byValue.get('betclic-fr')!.label).toBe('Betclic.fr');
    expect(byValue.get('betclic-fr')!.count).toBe(betclicA.length + betclicB.length);
    expect(byValue.get('winamax')!.count).toBe(winamax.length);
  });

  it('orders rooms by hand count, descending', () => {
    const counts = siteOptions(all, SITE_NAMES).map((o) => o.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('falls back to the raw id for a room with no display name', () => {
    expect(siteOptions(winamax, new Map())[0]!.label).toBe('winamax');
  });

  it('lists every file present, counted, by name', () => {
    const opts = sourceFileOptions(all);
    expect(opts.map((o) => o.value)).toEqual([BETCLIC_FILE, BETCLIC_FILE_B, WINAMAX_FILE]);
    expect(opts[0]!.count).toBe(betclicA.length);
    expect(opts[2]!.count).toBe(winamax.length);
  });

  it('omits hands that carry no file name', () => {
    const text = readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8');
    const anonymous = registry.parseFile(text, 'betclic-fr').hands;
    expect(sourceFileOptions([...anonymous, ...winamax]).map((o) => o.value))
      .toEqual([WINAMAX_FILE]);
  });

  it('source files are empty for an empty library, but rooms are still offered', () => {
    expect(sourceFileOptions([])).toEqual([]);

    const opts = siteOptions([], SITE_NAMES);
    expect(opts.map((o) => o.value).sort()).toEqual(['betclic-fr', 'winamax']);
    expect(opts.every((o) => o.count === 0)).toBe(true);
  });
});

describe('matching on room and file', () => {
  it('keeps only the selected room', () => {
    expect(keep(all, crit({ sites: new Set(['winamax']) })).length).toBe(winamax.length);
  });

  it('ORs several rooms within the axis', () => {
    expect(keep(all, crit({ sites: new Set(['winamax', 'betclic-fr']) })).length).toBe(all.length);
  });

  it('keeps only the selected file', () => {
    const kept = keep(all, crit({ sourceFiles: new Set([BETCLIC_FILE]) }));
    expect(kept.length).toBe(betclicA.length);
    expect(kept.every((h) => h.meta.sourceFile === BETCLIC_FILE)).toBe(true);
  });

  it('separates two files from the same room', () => {
    expect(keep(all, crit({ sourceFiles: new Set([BETCLIC_FILE_B]) })).length)
      .toBe(betclicB.length);
  });

  it('ANDs room against file — a contradictory pair matches nothing', () => {
    expect(keep(all, crit({
      sites: new Set(['winamax']),
      sourceFiles: new Set([BETCLIC_FILE]),
    })).length).toBe(0);
  });

  it('excludes unnamed hands once a file filter is active', () => {
    const text = readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8');
    const anonymous = registry.parseFile(text, 'betclic-fr').hands;
    expect(keep(anonymous, crit({ sourceFiles: new Set([BETCLIC_FILE]) })).length).toBe(0);
  });

  it('matches nothing for a file name no longer in the library', () => {
    expect(keep(all, crit({ sourceFiles: new Set(['deleted.txt']) })).length).toBe(0);
  });

  it('leaves the library untouched when both axes are empty', () => {
    expect(keep(all, EMPTY_CRITERIA).length).toBe(all.length);
  });
});

describe('active-filter bookkeeping', () => {
  it('counts each source axis', () => {
    expect(activeCount(crit({ sites: new Set(['winamax']) }))).toBe(1);
    expect(activeCount(crit({
      sites: new Set(['winamax']),
      sourceFiles: new Set([WINAMAX_FILE]),
    }))).toBe(2);
  });

  it('reports the panel as active', () => {
    expect(isActive(EMPTY_CRITERIA)).toBe(false);
    expect(isActive(crit({ sourceFiles: new Set([WINAMAX_FILE]) }))).toBe(true);
  });
});

describe('pruning a stale source-file selection', () => {
  beforeEach(() => useFiltersStore.getState().clearAll());

  it('drops names the library no longer holds', () => {
    const { toggle, pruneSourceFiles } = useFiltersStore.getState();
    toggle('sourceFiles', BETCLIC_FILE);
    toggle('sourceFiles', 'deleted.txt');

    pruneSourceFiles(new Set([BETCLIC_FILE]));

    expect([...useFiltersStore.getState().criteria.sourceFiles]).toEqual([BETCLIC_FILE]);
  });

  it('clears the axis when the library is emptied', () => {
    const { toggle, pruneSourceFiles } = useFiltersStore.getState();
    toggle('sourceFiles', BETCLIC_FILE);

    pruneSourceFiles(new Set());

    expect(useFiltersStore.getState().criteria.sourceFiles.size).toBe(0);
  });

  it('leaves the criteria object identical when nothing is stale', () => {
    const { toggle, pruneSourceFiles } = useFiltersStore.getState();
    toggle('sourceFiles', BETCLIC_FILE);
    const before = useFiltersStore.getState().criteria;

    pruneSourceFiles(new Set([BETCLIC_FILE, WINAMAX_FILE]));

    // Identity matters: App memoises the filtered list on the criteria object,
    // so a new object here would re-filter the library on every import.
    expect(useFiltersStore.getState().criteria).toBe(before);
  });

  it('leaves rooms alone', () => {
    const { toggle, pruneSourceFiles } = useFiltersStore.getState();
    toggle('sites', 'winamax');

    pruneSourceFiles(new Set());

    expect([...useFiltersStore.getState().criteria.sites]).toEqual(['winamax']);
  });
});
