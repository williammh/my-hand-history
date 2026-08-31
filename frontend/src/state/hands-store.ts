'use client';

import { create } from 'zustand';
import type { Hand, SiteId } from '@/domain/hand';
import type { HandParseFailure, ParseWarning } from '@/parsers/types';
import { registry } from '@/parsers/index';
import { createRepository } from '@/storage/indexeddb-repository';

const repository = createRepository();

/** Outcome of parsing one file. A multi-file import produces one per file. */
export interface FileReport {
  readonly fileName: string;
  /** Null when no registered parser could detect the room for this file. */
  readonly siteId: SiteId | null;
  readonly parsed: number;
  /** Hands new to the library — parsed minus the ones already stored. */
  readonly added: number;
  readonly failures: readonly HandParseFailure[];
  readonly fileWarnings: readonly ParseWarning[];
  readonly warnedHands: number;
}

/** The whole import, across every file dropped in one go. */
export interface ImportReport {
  readonly files: readonly FileReport[];
  readonly parsed: number;
  readonly added: number;
}

interface HandsState {
  hands: Hand[];
  selectedId: string | null;
  importing: boolean;
  report: ImportReport | null;

  importFiles: (files: readonly { text: string; fileName: string }[]) => Promise<void>;
  select: (id: string | null) => void;
  clearAll: () => Promise<void>;
  hydrate: () => Promise<void>;
}

/** Newest first — the order the hand list and every hydrate share. */
function byNewest(hands: readonly Hand[]): Hand[] {
  return [...hands].sort((a, b) => b.meta.playedAt.localeCompare(a.meta.playedAt));
}

export const useHandsStore = create<HandsState>((set, get) => ({
  hands: [],
  selectedId: null,
  importing: false,
  report: null,

  /**
   * Parses every file and MERGES the result into the library.
   *
   * Imports used to replace the library, so that statistics could never pool
   * hands the player never meant to pool. Filtering now carries that guarantee
   * instead: the room and source-file axes scope the library back down to a
   * single session on demand, which a replace-on-import could only ever do by
   * throwing the other sessions away. Accumulating is also the only thing that
   * makes dropping several files at once mean anything.
   *
   * The room is never chosen by the player — each file is sniffed by the
   * parser registry, which is the only thing that actually knows what a
   * Betclic vs. a Winamax export looks like.
   *
   * Files are parsed sequentially rather than in parallel: they are parsed on
   * the main thread, so racing them would not make them finish sooner, and
   * sequential keeps the per-file reports in the order they were dropped.
   */
  importFiles: async (files) => {
    if (files.length === 0) return;
    set({ importing: true, report: null });

    const reports: FileReport[] = [];
    const parsedHands: Hand[] = [];

    for (const { text, fileName } of files) {
      try {
        const result = registry.parseFile(text, null, fileName);
        const added = await repository.saveHands(result.hands, fileName);
        parsedHands.push(...result.hands);
        reports.push({
          fileName,
          siteId: result.siteId,
          parsed: result.hands.length,
          added,
          failures: result.failures,
          fileWarnings: result.fileWarnings,
          warnedHands: result.hands.filter((h) => h.warnings.length > 0).length,
        });
      } catch (e) {
        // One bad file must not cost the player the others in the same drop.
        reports.push({
          fileName,
          siteId: null,
          parsed: 0,
          added: 0,
          failures: [],
          fileWarnings: [{
            code: 'IMPORT_FAILED', message: String(e),
            lineNumber: null, rawLine: null, severity: 'error',
          }],
          warnedHands: 0,
        });
      }
    }

    // Re-imported hands replace their stored twin rather than duplicating it,
    // so the merge is keyed on Hand.id — the same key the repository dedupes on.
    const merged = new Map(get().hands.map((h) => [h.id, h]));
    for (const h of parsedHands) merged.set(h.id, h);
    const hands = byNewest([...merged.values()]);

    set({
      hands,
      // Keep the player where they were if their hand survived the import.
      selectedId:
        hands.some((h) => h.id === get().selectedId) ? get().selectedId : hands[0]?.id ?? null,
      importing: false,
      report: {
        files: reports,
        parsed: reports.reduce((n, r) => n + r.parsed, 0),
        added: reports.reduce((n, r) => n + r.added, 0),
      },
    });
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
