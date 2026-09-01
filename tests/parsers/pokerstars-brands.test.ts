import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { validateHand } from '@/parsers/shared/validate';
import { identifyBrand, isKnownBrand, normalizeBrand } from '@/parsers/sites/pokerstars/brands';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/**
 * Several rooms ship the PokerStars text format verbatim. The rule this file
 * pins down: a recognized clone keeps its own identity, and a room nobody has
 * heard of is still parsed — on the PokerStars format's coat-tails — rather
 * than being rejected or silently filed as PokerStars.
 */
describe('brand identity', () => {
  it('normalizes the spacing and case rooms are inconsistent about', () => {
    expect(normalizeBrand('PokerStars')).toBe('pokerstars');
    expect(normalizeBrand('Poker Stars')).toBe('pokerstars');
    expect(normalizeBrand('WPT Global')).toBe('wptglobal');
    expect(normalizeBrand('coin-poker')).toBe('coinpoker');
  });

  it('knows its clones', () => {
    expect(isKnownBrand('PokerStars')).toBe(true);
    expect(isKnownBrand('CoinPoker')).toBe(true);
    expect(isKnownBrand('WPT Global')).toBe(true);
    expect(isKnownBrand('BlitzPoker')).toBe(false);
  });

  it('falls back without losing the room\'s real name', () => {
    const id = identifyBrand('BlitzPoker');
    expect(id.known).toBe(false);
    expect(id.siteId).toBe('pokerstars-like');
    // The name the file gave is kept, so the room filter still reads truthfully.
    expect(id.displayName).toBe('BlitzPoker');
  });
});

describe('CoinPoker — a known clone of the PokerStars format', () => {
  const source = read('../fixtures/pokerstars/coinpoker-cash.txt');
  const parsed = registry.parseFile(source, null, 'coinpoker-cash.txt');

  it('is detected as CoinPoker, not as PokerStars', () => {
    expect(registry.detect(source)?.siteId).toBe('coinpoker');
    expect(parsed.siteId).toBe('coinpoker');
  });

  it('files its hands under their own room id', () => {
    // Player identity is scoped per room, so crediting these hands to
    // PokerStars would pool two different players sharing a screen name.
    expect(parsed.hands[0]!.id).toBe('coinpoker:550000000001');
    expect(parsed.hands[0]!.meta.siteId).toBe('coinpoker');
  });

  it('parses the body exactly as the PokerStars parser does', () => {
    const hand = parsed.hands[0]!;
    expect(validateHand(hand)).toEqual([]);
    expect(hand.warnings).toEqual([]);
    expect(hand.pots.total).toBe(6250);
    expect(hand.money.bigBlind).toBe(100);
  });
});

describe('WPT Global — a two-word brand name', () => {
  const source = read('../fixtures/pokerstars/wpt-global-cash.txt');
  const parsed = registry.parseFile(source, null, 'wpt-global-cash.txt');

  it('is detected despite the space in the brand word', () => {
    expect(registry.detect(source)?.siteId).toBe('wpt-global');
    expect(parsed.hands[0]!.meta.siteId).toBe('wpt-global');
  });

  it('parses cleanly', () => {
    const hand = parsed.hands[0]!;
    expect(validateHand(hand)).toEqual([]);
    expect(hand.warnings).toEqual([]);
    expect(hand.pots.total).toBe(6250);
  });

  it('appears in the room list the filter UI is built from', () => {
    const rooms = registry.list();
    expect(rooms.map((r) => r.siteId)).toContain('wpt-global');
    expect(rooms.find((r) => r.siteId === 'wpt-global')!.displayName).toBe('WPT Global');
  });
});

describe('an unrecognized room using the PokerStars format', () => {
  const source = read('../fixtures/pokerstars/unknown-room-cash.txt');
  const parsed = registry.parseFile(source, null, 'unknown-room-cash.txt');

  it('is parsed rather than rejected', () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.hands).toHaveLength(1);
    expect(parsed.fileWarnings).toEqual([]);
  });

  it('lands under the shared fallback id, not under PokerStars', () => {
    expect(parsed.siteId).toBe('pokerstars-like');
    expect(parsed.hands[0]!.id).toBe('pokerstars-like:770000000001');
  });

  it('says in a warning that it fell back, and names the room it saw', () => {
    // Silently parsing an unknown room as PokerStars would be a lie the user
    // could not detect; the warning is how the fallback stays honest.
    expect(parsed.hands[0]!.warnings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('BlitzPoker') }),
    ]);
  });

  it('still gets every field right, because the format is the same', () => {
    const hand = parsed.hands[0]!;
    expect(validateHand(hand)).toEqual([]);
    expect(hand.pots.total).toBe(6250);
    expect(hand.heroSeat).toBe(4);
    expect(hand.seats.find((s) => s.isHero)!.holeCards).toEqual(['Ah', 'Kd']);
  });
});

describe('the fallback never outranks a real parser', () => {
  it('loses to PokerStars on a PokerStars file', () => {
    const ps = read('../fixtures/pokerstars/mini-sunday-fenomeno.txt');
    expect(registry.detect(ps)?.siteId).toBe('pokerstars');
  });

  it('loses to 888poker, whose format it cannot read', () => {
    const p888 = read('../fixtures/pokr888/early-pko-rumble.txt');
    expect(registry.detect(p888)?.siteId).toBe('888poker');
  });

  it('loses to Winamax and Betclic on their own files', () => {
    expect(registry.detect(read('../fixtures/winamax/alcacer-do-sal.txt'))?.siteId).toBe('winamax');
    expect(registry.detect(read('../fixtures/betclic/sample.txt'))?.siteId).toBe('betclic-fr');
  });

  it('claims nothing at all from a file that is not a hand history', () => {
    expect(registry.detect('Dear diary, today I lost a big pot.\n\nThe end.')).toBeNull();
  });

  it('does not claim a file whose brand word appears without the format', () => {
    // A chat log mentioning a room is not a hand history from it.
    const chatter = 'SomeRoom Hand #1: chat log\nnothing else here\n';
    expect(registry.detect(chatter)).toBeNull();
  });
});

describe('the room filter picks up every registered room', () => {
  it('offers all five PokerStars-family rooms plus the two originals', () => {
    // The filter UI builds its room list from registry.list(), so registering
    // a parser is all it takes for the room to become a filter option.
    const ids = registry.list().map((p) => p.siteId);
    expect(ids).toEqual(expect.arrayContaining([
      'betclic-fr', 'winamax', 'pokerstars', 'coinpoker', 'wpt-global',
      'ggpoker', 'pokerstars-like', '888poker',
    ]));
  });

  it('gives each room a display name a player would recognize', () => {
    const names = new Map(registry.list().map((p) => [p.siteId, p.displayName]));
    expect(names.get('pokerstars')).toBe('PokerStars');
    expect(names.get('coinpoker')).toBe('CoinPoker');
    expect(names.get('wpt-global')).toBe('WPT Global');
    expect(names.get('888poker')).toBe('888poker');
    expect(names.get('ggpoker')).toBe('GGPoker');
    // The fallback names itself by what it is, since the actual room varies.
    expect(names.get('pokerstars-like')).toBe('Other');
  });
});
