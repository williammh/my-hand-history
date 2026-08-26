import { create } from 'zustand';
import type { Hand } from '@/domain/hand.js';
import type { HandAnalysis } from '@/analysis/types.js';
import type { AnalysisEngine } from '@/analysis/engine.js';
import { ChartLookup } from '@/analysis/charts/lookup.js';
import { ChartLoader } from '@/analysis/charts/loader.js';
import { createClientHeuristicEngine } from '@/analysis/engines/client-heuristic.js';

interface AnalysisState {
  engine: AnalysisEngine | null;
  engineError: string | null;
  byHandId: Record<string, HandAnalysis>;
  pending: Record<string, boolean>;

  initEngine: () => Promise<void>;
  analyze: (hand: Hand) => Promise<void>;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  engine: null,
  engineError: null,
  byHandId: {},
  pending: {},

  initEngine: async () => {
    if (get().engine) return;
    try {
      const charts = await new ChartLoader().loadAll();
      set({ engine: createClientHeuristicEngine(new ChartLookup(charts)), engineError: null });
    } catch (e) {
      // Charts are static assets; if they fail to load, say so rather than
      // silently downgrading to no preflop analysis.
      set({ engineError: `Could not load preflop charts: ${String(e)}` });
    }
  },

  analyze: async (hand) => {
    if (get().byHandId[hand.id] || get().pending[hand.id]) return;
    await get().initEngine();
    const engine = get().engine;
    if (!engine) return;

    set((s) => ({ pending: { ...s.pending, [hand.id]: true } }));
    try {
      const analysis = await engine.analyze(hand);
      set((s) => ({
        byHandId: { ...s.byHandId, [hand.id]: analysis },
        pending: { ...s.pending, [hand.id]: false },
      }));
    } catch {
      set((s) => ({ pending: { ...s.pending, [hand.id]: false } }));
    }
  },
}));
