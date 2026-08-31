import { RANKS, SUITS, handClass, type Board, type Card, type HoleCards } from '@/domain/cards';
import { evaluate } from './evaluator';
import type { Range } from '../ranges/preflop-ranges';

const FULL_DECK: Card[] = [];
for (const r of RANKS) for (const s of SUITS) FULL_DECK.push(`${r}${s}` as Card);

/** Deterministic PRNG so verdicts are reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EquityResult {
  readonly equity: number;   // win + half of ties, 0..1
  readonly win: number;
  readonly tie: number;
  readonly trials: number;
}

/**
 * Hero equity against `opponents` random hands, given the known board.
 *
 * Against a RANDOM range, which overstates hero's equity versus the tighter
 * range a real opponent bets and raises with. That bias is exactly why verdicts
 * built on this are reported at 'low' confidence.
 */
export function equityVsRandom(
  hero: HoleCards,
  board: Board,
  opponents: number,
  trials = 4000,
  seed = 0x5eed,
): EquityResult {
  const known = new Set<string>([...hero, ...board]);
  const deck = FULL_DECK.filter((c) => !known.has(c));
  const rng = mulberry32(seed);
  const needBoard = 5 - board.length;

  let win = 0;
  let tie = 0;

  for (let t = 0; t < trials; t++) {
    // Partial Fisher-Yates: only draw as many cards as the trial needs.
    const pool = deck.slice();
    const draw = (): Card => {
      const i = Math.floor(rng() * pool.length);
      const c = pool[i]!;
      pool[i] = pool[pool.length - 1]!;
      pool.pop();
      return c;
    };

    const runout: Card[] = [];
    for (let i = 0; i < needBoard; i++) runout.push(draw());
    const fullBoard = [...board, ...runout];

    const heroScore = evaluate([...hero, ...fullBoard]);
    let best = heroScore;
    let tied = 0;

    for (let o = 0; o < opponents; o++) {
      const oppScore = evaluate([draw(), draw(), ...fullBoard]);
      if (oppScore > best) { best = oppScore; tied = 0; }
      else if (oppScore === best) tied++;
    }

    if (best === heroScore) {
      if (tied === 0) win++;
      else tie++;
    }
  }

  return { equity: (win + tie / 2) / trials, win: win / trials, tie: tie / trials, trials };
}

/** Chips hero must call as a fraction of the pot he'd be playing for. */
export function potOdds(toCall: number, potBefore: number): number {
  const total = potBefore + toCall;
  return total <= 0 ? 0 : toCall / total;
}

/**
 * Hero equity against opponents drawn from a RANGE rather than at random.
 *
 * This is the function that unlocks judging bets, raises and checks: a pot-odds
 * check only needs hero's own equity, but deciding whether a bet is value or a
 * bluff requires knowing what it is betting against. Assuming villains are
 * balanced makes that range knowable.
 *
 * Cards already visible (hero's hand, the board) are removed from the deck
 * before sampling, so blockers are respected — holding AA genuinely does make
 * villain's AA less likely here.
 */
export function equityVsRange(
  hero: HoleCards,
  board: Board,
  range: Range,
  opponents: number,
  trials = 3000,
  seed = 0x5eed,
): EquityResult {
  const known = new Set<string>([...hero, ...board]);
  const deck = FULL_DECK.filter((c) => !known.has(c));
  const rng = mulberry32(seed);
  const needBoard = 5 - board.length;

  // Every specific two-card combo the range allows, with its weight. Built once
  // and reused across trials — rebuilding it per trial dominated the runtime.
  const combos: { cards: [Card, Card]; weight: number }[] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const a = deck[i]!;
      const b = deck[j]!;
      const weight = range.get(handClass([a, b])) ?? 0;
      if (weight > 0) combos.push({ cards: [a, b], weight });
    }
  }
  // An empty range cannot be sampled; fall back rather than divide by zero.
  if (combos.length === 0) {
    return equityVsRandom(hero, board, opponents, trials, seed);
  }

  const cumulative: number[] = [];
  let running = 0;
  for (const c of combos) {
    running += c.weight;
    cumulative.push(running);
  }

  const pickCombo = (): [Card, Card] => {
    const target = rng() * running;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    return combos[lo]!.cards;
  };

  let win = 0;
  let tie = 0;

  for (let t = 0; t < trials; t++) {
    const used = new Set<string>(known);
    const oppHands: [Card, Card][] = [];
    let ok = true;

    for (let o = 0; o < opponents; o++) {
      // Rejection sampling: villains cannot share cards with each other.
      let attempts = 0;
      let picked: [Card, Card] | null = null;
      while (attempts < 50) {
        const cand = pickCombo();
        if (!used.has(cand[0]) && !used.has(cand[1])) { picked = cand; break; }
        attempts++;
      }
      if (!picked) { ok = false; break; }
      used.add(picked[0]);
      used.add(picked[1]);
      oppHands.push(picked);
    }
    if (!ok) continue;

    const pool = deck.filter((c) => !used.has(c));
    const runout: Card[] = [];
    for (let i = 0; i < needBoard; i++) {
      const idx = Math.floor(rng() * pool.length);
      runout.push(pool[idx]!);
      pool[idx] = pool[pool.length - 1]!;
      pool.pop();
    }
    const fullBoard = [...board, ...runout];

    const heroScore = evaluate([...hero, ...fullBoard]);
    let best = heroScore;
    let tied = 0;
    for (const oh of oppHands) {
      const s = evaluate([...oh, ...fullBoard]);
      if (s > best) { best = s; tied = 0; }
      else if (s === best) tied++;
    }
    if (best === heroScore) {
      if (tied === 0) win++;
      else tie++;
    }
  }

  const done = win + tie + (trials - win - tie);
  return { equity: (win + tie / 2) / trials, win: win / trials, tie: tie / trials, trials: done };
}
