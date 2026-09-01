import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { pokerstarsParser } from '@/parsers/sites/pokerstars/index';
import { pokr888Parser } from '@/parsers/sites/pokr888/index';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/**
 * One malformed hand must never cost the player the rest of the file, and a
 * `detect` that throws must never break detection for the other rooms.
 */
describe('error containment', () => {
  it('keeps the good hands when one hand in the middle is truncated', () => {
    const good = read('../fixtures/pokerstars/mini-sunday-fenomeno.txt');
    const hands = good.split(/\n\s*\n(?=PokerStars Hand)/);
    // Gut the third hand down to a header with no seats.
    hands[2] = 'PokerStars Hand #999: Tournament #1, $1+$0 USD Hold\'em No Limit - Level I (10/20) - 2026/08/02 17:00:00 ET';
    const parsed = registry.parseFile(hands.join('\n\n'), 'pokerstars', 'broken.txt');

    expect(parsed.hands).toHaveLength(9);
    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0]!.ordinal).toBe(3);
    expect(parsed.failures[0]!.errors[0]!.code).toBe('NO_PLAYERS');
  });

  it('reports a header-less chunk rather than throwing', () => {
    const res = pokerstarsParser.parseHand('not a hand history at all', {
      ordinal: 1, fileName: null, now: () => new Date(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.code).toBe('MISSING_HEADER');
  });

  it('reports an 888 chunk with no blinds line rather than throwing', () => {
    const res = pokr888Parser.parseHand('#Game No : 1\nnothing else', {
      ordinal: 1, fileName: null, now: () => new Date(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]!.code).toBe('MISSING_HEADER');
  });

  it('never throws from detect, whatever it is handed', () => {
    const nasty = ['', '\0\0\0', 'PokerStars Hand #', '#Game No :', 'x'.repeat(50000), '💥'];
    for (const s of nasty) {
      expect(() => registry.detect(s)).not.toThrow();
      expect(() => pokerstarsParser.detect(s)).not.toThrow();
      expect(() => pokr888Parser.detect(s)).not.toThrow();
    }
  });

  it('reports an empty file instead of pretending it parsed', () => {
    const parsed = registry.parseFile('', 'pokerstars', 'empty.txt');
    expect(parsed.hands).toEqual([]);
    expect(parsed.fileWarnings[0]!.severity).toBe('error');
  });

  it('keeps a GGPoker file parsing when one hand is truncated', () => {
    const src = read('../fixtures/ggpoker/edge-cases.txt');
    const hands = src.split(/\n\s*\n(?=Poker Hand)/);
    hands[1] = 'Poker Hand #TM1: Tournament #1, $1+$0 USD Hold\'em No Limit - Level I (10/20) - 2026/08/31 21:00:00';
    const parsed = registry.parseFile(hands.join('\n\n'), 'ggpoker', 'broken-gg.txt');
    expect(parsed.hands).toHaveLength(1);
    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0]!.errors[0]!.code).toBe('NO_PLAYERS');
  });

  it('handles CRLF line endings, which Windows exports use', () => {
    const crlf = read('../fixtures/pokr888/cash-6max.txt').replace(/\n/g, '\r\n');
    const parsed = registry.parseFile(crlf, null, 'crlf.txt');
    expect(parsed.siteId).toBe('888poker');
    expect(parsed.hands).toHaveLength(1);
    expect(parsed.hands[0]!.warnings).toEqual([]);
  });

  it('tolerates a trailing newline run at the end of a file', () => {
    const padded = `${read('../fixtures/pokerstars/cash-6max.txt')}\n\n\n`;
    const parsed = registry.parseFile(padded, null, 'padded.txt');
    expect(parsed.hands).toHaveLength(1);
    expect(parsed.failures).toEqual([]);
  });
});
