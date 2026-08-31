import type { Hand } from '@/domain/hand';
import type { HandAnalysis } from './types';

export interface EngineCapabilities {
  readonly preflop: boolean;
  readonly postflop: boolean;
  readonly quantifiesEV: boolean;
  readonly requiresNetwork: boolean;
}

export interface AnalysisEngine {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly capabilities: EngineCapabilities;

  /**
   * Async even though the local engine is synchronous. That is deliberate and is
   * the whole point of this boundary: a server solver can be dropped in later
   * with zero changes to call sites or UI. Cost today is one `async` keyword.
   *
   * Takes a Hand and nothing else — no file text, no site id, no parser types —
   * so the same value can be JSON-serialized straight to a remote solver.
   */
  analyze(hand: Hand, signal?: AbortSignal): Promise<HandAnalysis>;
}
