import type { Position } from '@/domain/position.js';
import type { PreflopScenario } from '../types.js';
import type { PreflopChart } from './loader.js';

export interface ChartQuery {
  readonly tableSize: number;
  readonly position: Position;
  readonly stackBB: number;
  readonly scenario: PreflopScenario;
}

export interface ChartMatch {
  readonly chart: PreflopChart;
  /** How far the chart's stack depth is from the actual spot, in BB. */
  readonly stackDelta: number;
}

/**
 * Maximum distance between the real stack depth and a chart's depth before the
 * chart stops being applicable.
 *
 * This threshold is the difference between useful advice and confidently wrong
 * advice: silently bucketing an 11bb spot onto a 25bb chart would flag correct
 * jams as mistakes. When nothing is within range the engine SKIPS the decision
 * with a visible reason instead of guessing.
 */
export const MAX_STACK_DELTA_BB = 3;

export class ChartLookup {
  private readonly charts: PreflopChart[];

  constructor(charts: readonly PreflopChart[]) {
    this.charts = [...charts];
  }

  /** Nearest chart within MAX_STACK_DELTA_BB, or null. */
  find(q: ChartQuery): ChartMatch | null {
    let best: ChartMatch | null = null;
    for (const chart of this.charts) {
      if (chart.tableSize !== q.tableSize) continue;
      if (chart.position !== q.position) continue;
      if (chart.scenario !== q.scenario) continue;
      const delta = Math.abs(chart.stackBB - q.stackBB);
      if (delta > MAX_STACK_DELTA_BB) continue;
      if (!best || delta < best.stackDelta) best = { chart, stackDelta: delta };
    }
    return best;
  }

  get size(): number {
    return this.charts.length;
  }
}
