import type { Hand, SiteId } from '@/domain/hand';
import type { HandAnalysis } from '@/analysis/types';

export interface StoredHandSummary {
  readonly id: string;
  readonly siteId: SiteId;
  readonly playedAt: string;
  readonly heroCards: string | null;
  readonly heroPosition: string | null;
  readonly potTotal: number;
  readonly importedAt: string;
  readonly fileName: string | null;
}

/**
 * Persistence boundary. IndexedDB is the only implementation today, but every
 * consumer talks to this interface, so adding cloud sync later is a new class
 * rather than a change to the UI or the parser.
 */
export interface HandRepository {
  /** Inserts or replaces hands, deduped on Hand.id. Returns the count added. */
  saveHands(hands: readonly Hand[], fileName?: string): Promise<number>;
  getHand(id: string): Promise<Hand | undefined>;
  listHands(): Promise<readonly StoredHandSummary[]>;
  deleteHand(id: string): Promise<void>;
  clear(): Promise<void>;

  saveAnalysis(analysis: HandAnalysis): Promise<void>;
  getAnalysis(handId: string, engineId: string): Promise<HandAnalysis | undefined>;
}

export function summarize(hand: Hand, fileName?: string): StoredHandSummary {
  const hero = hand.seats.find((s) => s.isHero);
  return {
    id: hand.id,
    siteId: hand.meta.siteId,
    playedAt: hand.meta.playedAt,
    heroCards: hero?.holeCards?.join(' ') ?? null,
    heroPosition: hero?.position ?? null,
    potTotal: hand.pots.total,
    importedAt: new Date().toISOString(),
    fileName: fileName ?? null,
  };
}
