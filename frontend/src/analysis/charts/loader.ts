import type { Position } from '@/domain/position.js';
import type { PreflopScenario } from '../types.js';

export interface PreflopChart {
  readonly id: string;
  readonly tableSize: number;
  readonly position: Position;
  readonly stackBB: number;
  readonly scenario: PreflopScenario;
  readonly source: string;
  /** Hand class -> action -> frequency, e.g. { "AKs": { "shove": 1 } }. */
  readonly ranges: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface ChartManifestEntry {
  readonly id: string;
  readonly tableSize: number;
  readonly position: Position;
  readonly stackBB: number;
  readonly scenario: PreflopScenario;
  readonly path: string;
}

export interface ChartManifest {
  readonly version: number;
  readonly charts: readonly ChartManifestEntry[];
}

/** Loads and caches chart JSON. Charts are static assets, not bundled code. */
export class ChartLoader {
  private manifest: ChartManifest | null = null;
  private readonly cache = new Map<string, PreflopChart>();

  constructor(private readonly baseUrl = '/charts') {}

  async loadManifest(): Promise<ChartManifest> {
    if (this.manifest) return this.manifest;
    const res = await fetch(`${this.baseUrl}/index.json`);
    if (!res.ok) throw new Error(`Chart manifest unavailable (${res.status})`);
    this.manifest = (await res.json()) as ChartManifest;
    return this.manifest;
  }

  async loadChart(entry: ChartManifestEntry): Promise<PreflopChart> {
    const hit = this.cache.get(entry.id);
    if (hit) return hit;
    const res = await fetch(`${this.baseUrl}/${entry.path}`);
    if (!res.ok) throw new Error(`Chart ${entry.id} unavailable (${res.status})`);
    const chart = (await res.json()) as PreflopChart;
    this.cache.set(entry.id, chart);
    return chart;
  }

  /** Eager load — small enough (49 files, a few KB each) to prefetch. */
  async loadAll(): Promise<PreflopChart[]> {
    const manifest = await this.loadManifest();
    return Promise.all(manifest.charts.map((e) => this.loadChart(e)));
  }
}
