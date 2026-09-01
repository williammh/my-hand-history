import type { SiteId } from '@/domain/hand';

/**
 * Rooms known to emit the PokerStars text format verbatim under their own
 * brand word. CoinPoker and WPT Global are the confirmed clones; anything else
 * that writes this grammar is parsed too, but is filed under `pokerstars-like`
 * rather than being quietly credited to PokerStars.
 *
 * Keys are lowercased and stripped of spaces and punctuation, because the
 * brand word is written inconsistently across exports ("PokerStars",
 * "Poker Stars", "CoinPoker", "Coin Poker", "WPT Global", "WPTGlobal").
 */
const KNOWN_BRANDS: ReadonlyMap<string, { siteId: SiteId; displayName: string }> = new Map([
  ['pokerstars', { siteId: 'pokerstars' as const, displayName: 'PokerStars' }],
  ['coinpoker', { siteId: 'coinpoker' as const, displayName: 'CoinPoker' }],
  ['wptglobal', { siteId: 'wpt-global' as const, displayName: 'WPT Global' }],
  ['wpt', { siteId: 'wpt-global' as const, displayName: 'WPT Global' }],
]);

export interface BrandIdentity {
  readonly siteId: SiteId;
  readonly displayName: string;
  /** The brand word exactly as the file wrote it. */
  readonly raw: string;
  /** False when this room is being parsed on the PokerStars format's coat-tails. */
  readonly known: boolean;
}

export function normalizeBrand(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves the brand word at the head of a header line to a site identity.
 *
 * An unrecognized room is NOT rejected: the whole point of the fallback is
 * that a room using this format parses anyway. It keeps its own display name
 * (taken from the file) so the room filter still reads truthfully, under the
 * shared `pokerstars-like` id.
 */
export function identifyBrand(raw: string): BrandIdentity {
  const known = KNOWN_BRANDS.get(normalizeBrand(raw));
  if (known) return { ...known, raw, known: true };
  return {
    siteId: 'pokerstars-like',
    displayName: raw.trim(),
    raw,
    known: false,
  };
}

export function isKnownBrand(raw: string): boolean {
  return KNOWN_BRANDS.has(normalizeBrand(raw));
}
