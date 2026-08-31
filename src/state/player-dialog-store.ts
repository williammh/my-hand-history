'use client';

import { create } from 'zustand';
import type { PlayerKey } from '@/stats/types';

interface PlayerDialogState {
  openKey: PlayerKey | null;
  open: (key: PlayerKey) => void;
  close: () => void;
}

/**
 * A store rather than props: the click that opens this dialog originates deep
 * inside ActionLog, and the dialog itself renders once at the App level — a
 * store avoids threading a callback down through every intermediate panel.
 */
export const usePlayerDialogStore = create<PlayerDialogState>((set) => ({
  openKey: null,
  open: (key) => set({ openKey: key }),
  close: () => set({ openKey: null }),
}));
