import { RANKS, cardRank, cardSuit, type Board, type Card, type HoleCards } from '@/domain/cards';
import { HandCategory, categoryOf, evaluate } from '../equity/evaluator';

/**
 * What hero actually holds right now, in the terms a bet decision turns on.
 *
 * Equity alone cannot separate a bet that should happen from one that should
 * not: a flush draw and a weak pair can share 35% equity while wanting opposite
 * lines. Betting is about which hands the range is ahead of, so the shape of the
 * hand matters as much as its share of the pot.
 */
export interface MadeHand {
  readonly category: number;
  /** Made-hand tier, ignoring draws. */
  readonly tier: 'nuts' | 'strong' | 'medium' | 'weak' | 'air';
  readonly hasFlushDraw: boolean;
  readonly hasOpenEnder: boolean;
  readonly hasGutshot: boolean;
  /** A draw worth semi-bluffing: it can improve to the best hand. */
  readonly hasDraw: boolean;
  /** True when hero's cards improve on what the board alone makes. */
  readonly usesHoleCards: boolean;
}

/** Four cards of one suit among hero + board. */
function flushDraw(cards: readonly Card[]): boolean {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(cardSuit(c), (counts.get(cardSuit(c)) ?? 0) + 1);
  return [...counts.values()].some((n) => n === 4);
}

/**
 * Straight-draw detection over the distinct ranks present.
 *
 * Aces play low for the wheel, so rank 12 is also counted as -1.
 */
function straightDraws(cards: readonly Card[]): { open: boolean; gutshot: boolean } {
  const present = new Set<number>();
  for (const c of cards) {
    const r = RANKS.indexOf(cardRank(c));
    present.add(r);
    if (r === 12) present.add(-1);
  }
  let open = false;
  let gutshot = false;

  // Slide a five-wide window; four of five present with the run incomplete is a draw.
  for (let lo = -1; lo <= 8; lo++) {
    const window = [lo, lo + 1, lo + 2, lo + 3, lo + 4];
    const have = window.filter((r) => present.has(r)).length;
    if (have === 5) return { open: false, gutshot: false }; // already a straight
    if (have === 4) {
      const consecutiveLow = [lo, lo + 1, lo + 2, lo + 3].every((r) => present.has(r));
      const consecutiveHigh = [lo + 1, lo + 2, lo + 3, lo + 4].every((r) => present.has(r));
      if ((consecutiveLow && lo > -1) || (consecutiveHigh && lo + 4 < 12)) open = true;
      else gutshot = true;
    }
  }
  return { open, gutshot };
}

/**
 * Whether hero's own cards improve on what the board alone makes.
 *
 * A board-played hand is worthless to bet: every opponent holds it too. Without
 * this check "two pair" on a double-paired board reads as strong when it is air.
 */
function usesHole(hero: HoleCards, board: Board): boolean {
  if (board.length < 5) return true;              // board alone is not yet five cards
  return evaluate([...hero, ...board]) > evaluate([...board]);
}

/**
 * A pair is not one thing: top pair good kicker plays like a value hand, a board
 * pair hero does not share plays like air.
 */
function pairTier(hero: HoleCards, board: Board): 'medium' | 'weak' | 'air' {
  const boardRanks = board.map((c) => RANKS.indexOf(cardRank(c))).sort((a, b) => b - a);
  const heroRanks = hero.map((c) => RANKS.indexOf(cardRank(c)));
  const top = boardRanks[0] ?? -1;

  // Pocket pair: an overpair is a value hand, an underpair is not.
  if (heroRanks[0] === heroRanks[1]) {
    return heroRanks[0]! > top ? 'medium' : 'weak';
  }

  const paired = heroRanks.filter((r) => boardRanks.includes(r));
  if (paired.length === 0) return 'air';           // the board is paired, not hero
  const best = Math.max(...paired);
  if (best === top) {
    const kicker = Math.max(...heroRanks.filter((r) => r !== best));
    return kicker >= RANKS.indexOf('T') ? 'medium' : 'weak';
  }
  return 'weak';
}

export function classifyMadeHand(hero: HoleCards, board: Board): MadeHand {
  const all = [...hero, ...board];
  const category = categoryOf(evaluate(all));

  // On the river there are no cards to come, so a "draw" is just a missed hand.
  // Reporting one would make the explanation contradict the board the user sees.
  const live = board.length < 5;
  const fd = live && flushDraw(all);
  const straight = live ? straightDraws(all) : { open: false, gutshot: false };
  const { open, gutshot } = straight;

  let tier: MadeHand['tier'];
  if (category >= HandCategory.FLUSH) tier = 'nuts';
  else if (category >= HandCategory.TWO_PAIR) tier = 'strong';
  else if (category === HandCategory.PAIR) tier = pairTier(hero, board);
  else tier = 'air';

  return {
    category,
    tier,
    hasFlushDraw: fd,
    hasOpenEnder: open,
    hasGutshot: gutshot,
    hasDraw: fd || open,
    usesHoleCards: usesHole(hero, board),
  };
}
