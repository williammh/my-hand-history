import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import type { Hand } from '@/domain/hand';
import { deriveFacts, stackBucket } from '@/filters/facts';
import { matches, activeCount, isActive } from '@/filters/match';
import { EMPTY_CRITERIA, type FilterCriteria } from '@/filters/types';

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));

let hands: Hand[];

beforeAll(() => {
  hands = [
    ...registry.parseFile(readFileSync(url('../fixtures/betclic/sample.txt'), 'utf8'), 'betclic-fr').hands,
    ...registry.parseFile(readFileSync(url('../fixtures/betclic/deep-3bet.txt'), 'utf8'), 'betclic-fr').hands,
    ...registry.parseFile(
      readFileSync(url('../fixtures/betclic/showdown-and-edge-cases.txt'), 'utf8'), 'betclic-fr').hands,
  ];
  expect(hands.length).toBeGreaterThan(0);
});

const crit = (over: Partial<FilterCriteria>): FilterCriteria => ({ ...EMPTY_CRITERIA, ...over });

describe('empty criteria', () => {
  it('is inactive and matches every hand', () => {
    expect(isActive(EMPTY_CRITERIA)).toBe(false);
    expect(activeCount(EMPTY_CRITERIA)).toBe(0);
    for (const h of hands) expect(matches(deriveFacts(h), EMPTY_CRITERIA)).toBe(true);
  });
});

describe('stack buckets', () => {
  it('floors to the rung at or below', () => {
    expect(stackBucket(19)).toBe(20);  // below the ladder pins to its floor
    expect(stackBucket(20)).toBe(20);
    expect(stackBucket(63)).toBe(50);
    expect(stackBucket(100)).toBe(100);
    expect(stackBucket(999)).toBe(200);
  });
});

describe('axes are AND-ed, values within an axis OR-ed', () => {
  it('a selected value keeps only hands holding it', () => {
    for (const h of hands) {
      const f = deriveFacts(h);
      if (!f.heroPosition) continue;
      expect(matches(f, crit({ heroPositions: new Set([f.heroPosition]) }))).toBe(true);
      // OR within the axis: adding another position cannot exclude it.
      expect(matches(f, crit({ heroPositions: new Set([f.heroPosition, 'BTN']) }))).toBe(true);
    }
  });

  it('an unmet axis excludes regardless of a met one', () => {
    const f = deriveFacts(hands[0]!);
    if (!f.heroPosition) return;
    const impossible = crit({
      heroPositions: new Set([f.heroPosition]),
      potTypes: new Set([f.potType === '5bet' ? 'limp' : '5bet']),
    });
    expect(matches(f, impossible)).toBe(false);
  });
});

describe('opponent position is an ANY-of match', () => {
  it('matches when any opponent in the pot held the position', () => {
    for (const h of hands) {
      const f = deriveFacts(h);
      for (const p of f.opponentPositions) {
        expect(matches(f, crit({ opponentPositions: new Set([p]) })), `${h.id} ${p}`).toBe(true);
      }
    }
  });
});

describe('severity filters need an analysis', () => {
  it('excludes hands with no verdicts rather than passing them through', () => {
    const f = deriveFacts(hands[0]!); // no analysis passed
    expect(matches(f, crit({ severities: new Set(['ok']) }))).toBe(false);
  });
});

describe('board bounds', () => {
  it('a board axis excludes hands that never saw a flop', () => {
    const noFlop = hands.map((h) => deriveFacts(h)).find((f) => f.board === null);
    if (noFlop) {
      expect(matches(noFlop, crit({ connectedness: new Set(['connected']) }))).toBe(false);
      expect(matches(noFlop, crit({ highestRank: 'A' }))).toBe(false);
    }
  });

  it('highest is a ceiling and lowest is a floor', () => {
    for (const h of hands) {
      const f = deriveFacts(h);
      if (!f.board) continue;
      // Its own bounds always pass; a ceiling below the board never does.
      expect(matches(f, crit({ highestRank: 'A', lowestRank: '2' }))).toBe(true);
    }
  });
});

describe('activeCount', () => {
  it('counts constrained axes, not selected values', () => {
    expect(activeCount(crit({ heroPositions: new Set(['BTN', 'CO', 'SB']) }))).toBe(1);
    expect(activeCount(crit({ heroPositions: new Set(['BTN']), sawFlopOnly: true }))).toBe(2);
    expect(activeCount(crit({ highestRank: 'A', lowestRank: '8' }))).toBe(2);
  });
});
