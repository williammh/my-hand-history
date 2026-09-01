import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { playerKey } from '@/stats/types';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/**
 * A library is a merge of several files, which is the whole reason detection
 * has to be per file rather than chosen once by the player. These tests cover
 * the drop-several-at-once path across the newly supported rooms.
 */
describe('importing several rooms in one drop', () => {
  const files = [
    ['pokerstars', '../fixtures/pokerstars/mini-sunday-fenomeno.txt'],
    ['888poker', '../fixtures/pokr888/early-pko-rumble.txt'],
    ['ggpoker', '../fixtures/ggpoker/cash-rush-and-cash.txt'],
    ['ggpoker', '../fixtures/ggpoker/spin-and-gold.txt'],
    ['coinpoker', '../fixtures/pokerstars/coinpoker-cash.txt'],
    ['wpt-global', '../fixtures/pokerstars/wpt-global-cash.txt'],
    ['pokerstars-like', '../fixtures/pokerstars/unknown-room-cash.txt'],
    ['winamax', '../fixtures/winamax/alcacer-do-sal.txt'],
    ['betclic-fr', '../fixtures/betclic/sample.txt'],
  ] as const;

  it('routes each file to its own room with no cross-talk', () => {
    for (const [expected, path] of files) {
      // siteId is passed as null, exactly as the store does: the file itself
      // decides which parser handles it.
      const parsed = registry.parseFile(read(path), null, path);
      expect(parsed.siteId, path).toBe(expected);
      expect(parsed.hands.length, path).toBeGreaterThan(0);
      expect(parsed.failures, path).toEqual([]);
    }
  });

  it('produces globally unique hand ids across every room', () => {
    const ids = files.flatMap(([, path]) => registry.parseFile(read(path), null, path).hands.map((h) => h.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the same screen name on two rooms as two different players', () => {
    // Identity is `${siteId}:${playerId}`, so a name shared across rooms never
    // pools into one player's statistics.
    expect(playerKey('pokerstars', 'hero')).not.toBe(playerKey('coinpoker', 'hero'));
    expect(playerKey('pokerstars', 'hero')).not.toBe(playerKey('pokerstars-like', 'hero'));
    expect(playerKey('ggpoker', 'hero')).not.toBe(playerKey('pokerstars', 'hero'));
  });

  it('tags every hand with the file it came from', () => {
    const parsed = registry.parseFile(read(files[1]![1]), null, 'early-pko-rumble.txt');
    for (const h of parsed.hands) expect(h.meta.sourceFile).toBe('early-pko-rumble.txt');
  });
});
