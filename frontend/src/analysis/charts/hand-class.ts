import { RANKS, type HoleCards, type Rank } from '@/domain/cards';
import { handClass } from '@/domain/cards';

export { handClass };

/** All 169 starting-hand classes, strongest-first ordering not implied. */
export function allHandClasses(): string[] {
  const out: string[] = [];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    for (let j = RANKS.length - 1; j >= 0; j--) {
      const hi = RANKS[i]!;
      const lo = RANKS[j]!;
      if (i === j) out.push(`${hi}${lo}`);
      else if (i > j) out.push(`${hi}${lo}s`);
      else out.push(`${lo}${hi}o`);
    }
  }
  return [...new Set(out)];
}

/** Grid coordinates for the 13x13 range viewer: row/col 0 = aces. */
export function gridPosition(cls: string): { row: number; col: number } {
  const hi = cls[0] as Rank;
  const lo = cls[1] as Rank;
  const hiIdx = RANKS.length - 1 - RANKS.indexOf(hi);
  const loIdx = RANKS.length - 1 - RANKS.indexOf(lo);
  if (cls.length === 2) return { row: hiIdx, col: hiIdx };
  return cls.endsWith('s')
    ? { row: hiIdx, col: loIdx }
    : { row: loIdx, col: hiIdx };
}

/** Number of card combinations a class represents: 6 pairs, 4 suited, 12 offsuit. */
export function comboCount(cls: string): number {
  if (cls.length === 2) return 6;
  return cls.endsWith('s') ? 4 : 12;
}

export function classOf(cards: HoleCards): string {
  return handClass(cards);
}
