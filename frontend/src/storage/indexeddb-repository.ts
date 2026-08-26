import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Hand } from '@/domain/hand.js';
import type { HandAnalysis } from '@/analysis/types.js';
import { type HandRepository, type StoredHandSummary, summarize } from './repository.js';

interface PokerDB extends DBSchema {
  hands: { key: string; value: { hand: Hand; summary: StoredHandSummary }; indexes: { playedAt: string } };
  analyses: { key: string; value: HandAnalysis & { key: string } };
}

const DB_NAME = 'poker-hand-analyzer';
const DB_VERSION = 1;

/**
 * Local-only storage. Hand histories never leave the machine, which is the whole
 * privacy story of the app — no accounts, no upload, no server.
 */
export class IndexedDbHandRepository implements HandRepository {
  private dbPromise: Promise<IDBPDatabase<PokerDB>> | null = null;

  private db(): Promise<IDBPDatabase<PokerDB>> {
    this.dbPromise ??= openDB<PokerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('hands')) {
          const store = db.createObjectStore('hands', { keyPath: 'summary.id' });
          store.createIndex('playedAt', 'summary.playedAt');
        }
        if (!db.objectStoreNames.contains('analyses')) {
          db.createObjectStore('analyses', { keyPath: 'key' });
        }
      },
    });
    return this.dbPromise;
  }

  async saveHands(hands: readonly Hand[], fileName?: string): Promise<number> {
    const db = await this.db();
    const tx = db.transaction('hands', 'readwrite');
    let added = 0;
    await Promise.all(
      hands.map(async (hand) => {
        // Re-importing the same file must not duplicate hands.
        const existing = await tx.store.get(hand.id);
        if (!existing) added++;
        await tx.store.put({ hand, summary: summarize(hand, fileName) });
      }),
    );
    await tx.done;
    return added;
  }

  async getHand(id: string): Promise<Hand | undefined> {
    return (await (await this.db()).get('hands', id))?.hand;
  }

  async listHands(): Promise<readonly StoredHandSummary[]> {
    const rows = await (await this.db()).getAll('hands');
    return rows
      .map((r) => r.summary)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  }

  async deleteHand(id: string): Promise<void> {
    await (await this.db()).delete('hands', id);
  }

  async clear(): Promise<void> {
    const db = await this.db();
    await Promise.all([db.clear('hands'), db.clear('analyses')]);
  }

  async saveAnalysis(analysis: HandAnalysis): Promise<void> {
    const key = `${analysis.handId}::${analysis.engineId}`;
    await (await this.db()).put('analyses', { ...analysis, key });
  }

  async getAnalysis(handId: string, engineId: string): Promise<HandAnalysis | undefined> {
    return (await this.db()).get('analyses', `${handId}::${engineId}`);
  }
}

/** In-memory fallback for private-mode browsers where IndexedDB is unavailable. */
export class MemoryHandRepository implements HandRepository {
  private readonly hands = new Map<string, { hand: Hand; summary: StoredHandSummary }>();
  private readonly analyses = new Map<string, HandAnalysis>();

  async saveHands(hands: readonly Hand[], fileName?: string): Promise<number> {
    let added = 0;
    for (const hand of hands) {
      if (!this.hands.has(hand.id)) added++;
      this.hands.set(hand.id, { hand, summary: summarize(hand, fileName) });
    }
    return added;
  }
  async getHand(id: string) { return this.hands.get(id)?.hand; }
  async listHands() {
    return [...this.hands.values()]
      .map((r) => r.summary)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  }
  async deleteHand(id: string) { this.hands.delete(id); }
  async clear() { this.hands.clear(); this.analyses.clear(); }
  async saveAnalysis(a: HandAnalysis) { this.analyses.set(`${a.handId}::${a.engineId}`, a); }
  async getAnalysis(handId: string, engineId: string) {
    return this.analyses.get(`${handId}::${engineId}`);
  }
}

/** Picks IndexedDB when the browser allows it, memory otherwise. */
export function createRepository(): HandRepository {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbHandRepository();
  } catch {
    // fall through
  }
  return new MemoryHandRepository();
}
