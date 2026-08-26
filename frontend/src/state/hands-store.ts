import { create } from 'zustand';
import type { Hand, SiteId } from '@/domain/hand.js';
import type { HandParseFailure, ParseWarning } from '@/parsers/types.js';
import { registry } from '@/parsers/index.js';
import { createRepository } from '@/storage/indexeddb-repository.js';

const repository = createRepository();

export interface ImportReport {
  readonly fileName: string;
  readonly siteId: SiteId;
  readonly parsed: number;
  readonly added: number;
  readonly failures: readonly HandParseFailure[];
  readonly fileWarnings: readonly ParseWarning[];
  readonly warnedHands: number;
}

interface HandsState {
  hands: Hand[];
  selectedId: string | null;
  siteId: SiteId;
  importing: boolean;
  report: ImportReport | null;

  setSite: (siteId: SiteId) => void;
  importFile: (text: string, fileName: string) => Promise<void>;
  select: (id: string | null) => void;
  clearAll: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useHandsStore = create<HandsState>((set, get) => ({
  hands: [],
  selectedId: null,
  siteId: 'betclic-fr',
  importing: false,
  report: null,

  setSite: (siteId) => set({ siteId }),

  importFile: async (text, fileName) => {
    set({ importing: true, report: null });
    try {
      const result = registry.parseFile(text, get().siteId, fileName);
      const added = await repository.saveHands(result.hands, fileName);

      // Merge with what is already loaded, deduping on hand id.
      const merged = new Map(get().hands.map((h) => [h.id, h]));
      for (const h of result.hands) merged.set(h.id, h);
      const hands = [...merged.values()].sort((a, b) =>
        b.meta.playedAt.localeCompare(a.meta.playedAt),
      );

      set({
        hands,
        selectedId: get().selectedId ?? result.hands[0]?.id ?? null,
        importing: false,
        report: {
          fileName,
          siteId: result.siteId,
          parsed: result.hands.length,
          added,
          failures: result.failures,
          fileWarnings: result.fileWarnings,
          warnedHands: result.hands.filter((h) => h.warnings.length > 0).length,
        },
      });
    } catch (e) {
      set({
        importing: false,
        report: {
          fileName, siteId: get().siteId, parsed: 0, added: 0, failures: [],
          fileWarnings: [{
            code: 'IMPORT_FAILED', message: String(e),
            lineNumber: null, rawLine: null, severity: 'error',
          }],
          warnedHands: 0,
        },
      });
    }
  },

  select: (id) => set({ selectedId: id }),

  clearAll: async () => {
    await repository.clear();
    set({ hands: [], selectedId: null, report: null });
  },

  hydrate: async () => {
    const summaries = await repository.listHands();
    const loaded = await Promise.all(summaries.map((s) => repository.getHand(s.id)));
    const hands = loaded.filter((h): h is Hand => Boolean(h));
    set({ hands, selectedId: hands[0]?.id ?? null });
  },
}));

export const selectedHand = (s: { hands: Hand[]; selectedId: string | null }): Hand | null =>
  s.hands.find((h) => h.id === s.selectedId) ?? null;
