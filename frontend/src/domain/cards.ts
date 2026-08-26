export type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
export type Suit = 'c' | 'd' | 'h' | 's';

/** Normalized as uppercase rank + lowercase suit, e.g. "Th", "9s". */
export type Card = `${Rank}${Suit}`;
export type HoleCards = readonly [Card, Card];
/** Length 0, 3, 4, or 5. */
export type Board = readonly Card[];

export const RANKS: readonly Rank[] = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
export const SUITS: readonly Suit[] = ['c','d','h','s'];

/** 2 → 0 … A → 12. Higher is better. */
export function rankValue(r: Rank): number {
  return RANKS.indexOf(r);
}

export function cardRank(c: Card): Rank {
  return c[0] as Rank;
}

export function cardSuit(c: Card): Suit {
  return c[1] as Suit;
}

export function isCard(s: string): s is Card {
  return (
    s.length === 2 &&
    (RANKS as readonly string[]).includes(s[0]!) &&
    (SUITS as readonly string[]).includes(s[1]!)
  );
}

/**
 * Accepts the case variations rooms actually emit ("TH", "th", "10h") and
 * normalizes to canonical form. Returns null rather than throwing so parsers can
 * downgrade a bad card to a warning instead of losing the whole hand.
 */
export function parseCard(raw: string): Card | null {
  let s = raw.trim();
  if (s.length === 3 && s.startsWith('10')) s = `T${s[2]}`;
  if (s.length !== 2) return null;
  const normalized = `${s[0]!.toUpperCase()}${s[1]!.toLowerCase()}`;
  return isCard(normalized) ? normalized : null;
}

export function parseCardList(raw: string): Card[] | null {
  const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
  const out: Card[] = [];
  for (const p of parts) {
    const c = parseCard(p);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/** "As Kd" → "AKs"; "Jh Td" → "JTo"; "7s 7c" → "77". The key format charts use. */
export function handClass(cards: HoleCards): string {
  const [a, b] = cards;
  const ra = cardRank(a);
  const rb = cardRank(b);
  const [hi, lo] = rankValue(ra) >= rankValue(rb) ? [ra, rb] : [rb, ra];
  if (hi === lo) return `${hi}${lo}`;
  return `${hi}${lo}${cardSuit(a) === cardSuit(b) ? 's' : 'o'}`;
}
