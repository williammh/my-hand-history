import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import type { Hand, SiteId } from '@/domain/hand';
import { gameKey } from '@/domain/game';
import { deriveFacts } from '@/filters/facts';
import { matches, activeCount } from '@/filters/match';
import { EMPTY_CRITERIA } from '@/filters/types';
import { gameOptions } from '@/filters/options';

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const NAMES = new Map<SiteId, string>([['betclic-fr', 'Betclic.fr'], ['winamax', 'Winamax']]);

let hands: readonly Hand[];

beforeAll(() => {
  const a = readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8');
  const w = readFileSync(url('../fixtures/winamax/alcacer-do-sal.txt'), 'utf8');
  hands = [
    ...registry.parseFile(a, 'betclic-fr', 'a.txt').hands,
    ...registry.parseFile(w, 'winamax', 'b.txt').hands,
  ];
  expect(hands.length).toBeGreaterThan(0);
});

describe('game filter', () => {
  it('keys a hand the same regardless of the file it came from', () => {
    const text = readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8');
    const x = registry.parseFile(text, 'betclic-fr', 'x.txt').hands;
    const y = registry.parseFile(text, 'betclic-fr', 'y.txt').hands;
    expect(x.map(gameKey)).toEqual(y.map(gameKey));
  });

  it('offers one option per game, counting every hand', () => {
    const opts = gameOptions(hands, NAMES);
    const keyed = hands.filter((h) => gameKey(h) !== null);
    expect(opts.reduce((n, o) => n + o.count, 0)).toBe(keyed.length);
    expect(new Set(opts.map((o) => o.value)).size).toBe(opts.length);
  });

  it('keeps only hands of the selected games, and counts as one active axis', () => {
    const first = gameOptions(hands, NAMES)[0]!;
    const c = { ...EMPTY_CRITERIA, games: new Set([first.value]) };
    const kept = hands.filter((h) => matches(deriveFacts(h), c));
    expect(kept.length).toBe(first.count);
    expect(kept.every((h) => gameKey(h) === first.value)).toBe(true);
    expect(activeCount(c)).toBe(1);
  });
});
