import { create } from 'zustand';

interface ReplayState {
  /**
   * Index into the hand's replay timeline (see replayTimeline); -1 means
   * "before anything is dealt".
   *
   * Deliberately a STEP index rather than an index into Hand.actions: an all-in
   * run-out deals streets that carry no action, and those need their own stops
   * on the timeline. The action index the rest of the app consumes is read off
   * the step.
   */
  stepIndex: number;
  playing: boolean;
  setIndex: (i: number) => void;
  step: (delta: number, max: number) => void;
  reset: () => void;
  setPlaying: (p: boolean) => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  stepIndex: 0,
  playing: false,
  setIndex: (i) => set({ stepIndex: i }),
  step: (delta, max) =>
    set({ stepIndex: Math.max(0, Math.min(max, get().stepIndex + delta)) }),
  reset: () => set({ stepIndex: 0, playing: false }),
  setPlaying: (playing) => set({ playing }),
}));
