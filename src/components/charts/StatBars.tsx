'use client';

import { scaleLinear } from 'd3-scale';
import type { Counter } from '@/stats/types';
import { pct } from '@/stats/types';
import type { Benchmark } from '@/stats/benchmarks';
import { BarTooltip, ChartTooltipProvider } from './ChartTooltip';

export interface StatBarRow {
  readonly label: string;
  /** Spelled-out name shown on hover, since the row label itself is an acronym. */
  readonly fullLabel: string;
  readonly counter: Counter;
  readonly benchmark: Benchmark;
}

const WIDTH = 480;
const ROW_H = 34;
const LABEL_W = 132;
const VALUE_W = 108;
const TRACK_X = LABEL_W;
const TRACK_W = WIDTH - LABEL_W - VALUE_W;
const MAX_PCT = 100;
/** Below this many opportunities, a percentage is more noise than signal. */
const LOW_SAMPLE_THRESHOLD = 15;

/**
 * One horizontal bar per stat, drawn over a shaded reference band so an
 * out-of-line number is visible at a glance rather than requiring the reader
 * to know six benchmark numbers by heart.
 *
 * d3 supplies only the scale; every mark is a plain SVG element React owns,
 * so there is no d3-vs-React fight over the DOM.
 */
export function StatBars({ rows }: { rows: readonly StatBarRow[] }) {
  const height = rows.length * ROW_H + 8;
  const x = scaleLinear().domain([0, MAX_PCT]).range([0, TRACK_W]);

  return (
    <ChartTooltipProvider>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Stat bars against typical reg ranges"
      >
        {rows.map((row, i) => {
          const y = i * ROW_H + 4;
          const value = pct(row.counter);
          const lowSample = row.counter.opportunities < LOW_SAMPLE_THRESHOLD;
          const bandX0 = x(Math.min(row.benchmark.low, MAX_PCT));
          const bandX1 = x(Math.min(row.benchmark.high, MAX_PCT));

          return (
            <g key={row.label} transform={`translate(0, ${y})`}>
              <BarTooltip label={row.fullLabel}>
                <text
                  x={0}
                  y={ROW_H / 2 - 2}
                  dominantBaseline="middle"
                  className="fill-slate-400 text-[11px] cursor-default"
                >
                  {row.label}
                </text>
              </BarTooltip>

              <rect
                x={TRACK_X}
                y={4}
                width={TRACK_W}
                height={16}
                rx={2}
                className="fill-slate-700/40"
              />
              <BarTooltip
                label={`${row.fullLabel} — typical range: ${row.benchmark.low}–${row.benchmark.high}%`}
              >
                <rect
                  x={TRACK_X + bandX0}
                  y={4}
                  width={Math.max(bandX1 - bandX0, 1)}
                  height={16}
                  className="fill-slate-500/30"
                />
              </BarTooltip>
              {value !== null && (
                <BarTooltip
                  label={
                    lowSample
                      ? `${row.fullLabel}: ${value.toFixed(1)}% (small sample — ${row.counter.opportunities} opportunities)`
                      : `${row.fullLabel}: ${value.toFixed(1)}% (${row.counter.hits}/${row.counter.opportunities})`
                  }
                >
                  <rect
                    x={TRACK_X}
                    y={4}
                    width={Math.max(x(Math.min(value, MAX_PCT)), value > 0 ? 2 : 0)}
                    height={16}
                    rx={2}
                    className={lowSample ? 'fill-emerald-400/40' : 'fill-emerald-400'}
                  />
                </BarTooltip>
              )}

              <text
                x={WIDTH - 4}
                y={ROW_H / 2 - 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-200 text-[11px] tabular-nums"
              >
                {value === null ? '–' : `${value.toFixed(1)}%`}
              </text>
              <text
                x={WIDTH - 4}
                y={ROW_H / 2 + 10}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-500 text-[9px] tabular-nums"
              >
                {row.counter.hits}/{row.counter.opportunities}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartTooltipProvider>
  );
}
