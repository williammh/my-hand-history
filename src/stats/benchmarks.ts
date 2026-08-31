/**
 * Rough 6-max reg ranges, for shading the stat bars. An orientation aid, not
 * an authority — these numbers are not cited from anywhere and exist only to
 * give the bar chart a band to draw a number against.
 */
export interface Benchmark {
  readonly low: number;
  readonly high: number;
}

export const BENCHMARKS = {
  vpip: { low: 20, high: 28 },
  pfr: { low: 16, high: 22 },
  threeBet: { low: 6, high: 10 },
  foldToThreeBet: { low: 45, high: 60 },
  steal: { low: 35, high: 50 },
  foldToSteal: { low: 55, high: 70 },
  flopCbet: { low: 55, high: 70 },
  foldToFlopCbet: { low: 40, high: 55 },
  wtsd: { low: 24, high: 30 },
  wsd: { low: 48, high: 54 },
} as const satisfies Record<string, Benchmark>;
