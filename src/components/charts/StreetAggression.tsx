'use client';

import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import type { StreetAggression as StreetAggressionCounts } from '@/stats/types';
import { aggressionFactor, POSTFLOP_STREETS } from '@/stats/types';
import { BarTooltip, ChartTooltipProvider } from './ChartTooltip';

const WIDTH = 320;
const HEIGHT = 200;
const MARGIN = { top: 10, right: 8, bottom: 34, left: 28 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const STREET_LABEL: Record<(typeof POSTFLOP_STREETS)[number], string> = {
  flop: 'Flop', turn: 'Turn', river: 'River',
};

/**
 * Bet/raise vs call counts per postflop street — the breakdown behind the
 * single aggression-factor number, since "AF 2.4" hides whether that comes
 * from a flop cbet habit or river overbetting.
 */
export function StreetAggression({
  byStreet,
}: {
  byStreet: Readonly<Record<(typeof POSTFLOP_STREETS)[number], StreetAggressionCounts>>;
}) {
  const streetScale = scaleBand()
    .domain(POSTFLOP_STREETS as unknown as string[])
    .range([0, PLOT_W])
    .paddingInner(0.35)
    .paddingOuter(0.2);
  const groupScale = scaleBand().domain(['betsRaises', 'calls']).range([0, streetScale.bandwidth()]).padding(0.15);

  const peak = max(POSTFLOP_STREETS, (s) => Math.max(byStreet[s].betsRaises, byStreet[s].calls)) ?? 0;
  const y = scaleLinear().domain([0, Math.max(peak, 1)]).range([PLOT_H, 0]).nice();

  const yTicks = y.ticks(4);

  return (
    <ChartTooltipProvider>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Bet or raise versus call counts per postflop street"
      >
        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={PLOT_W} y1={y(t)} y2={y(t)} className="stroke-slate-700/40" strokeWidth={1} />
              <text x={-6} y={y(t)} dominantBaseline="middle" textAnchor="end" className="fill-slate-500 text-[9px] tabular-nums">
                {t}
              </text>
            </g>
          ))}

          {POSTFLOP_STREETS.map((street) => {
            const counts = byStreet[street];
            const gx = streetScale(street) ?? 0;
            const af = aggressionFactor(counts);
            return (
              <g key={street} transform={`translate(${gx}, 0)`}>
                <BarTooltip label={`${STREET_LABEL[street]} bets/raises: ${counts.betsRaises}`}>
                  <rect
                    x={groupScale('betsRaises') ?? 0}
                    y={y(counts.betsRaises)}
                    width={groupScale.bandwidth()}
                    height={PLOT_H - y(counts.betsRaises)}
                    className="fill-emerald-400"
                  />
                </BarTooltip>
                <BarTooltip label={`${STREET_LABEL[street]} calls: ${counts.calls}`}>
                  <rect
                    x={groupScale('calls') ?? 0}
                    y={y(counts.calls)}
                    width={groupScale.bandwidth()}
                    height={PLOT_H - y(counts.calls)}
                    className="fill-slate-500"
                  />
                </BarTooltip>

                <text
                  x={streetScale.bandwidth() / 2}
                  y={PLOT_H + 14}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px]"
                >
                  {STREET_LABEL[street]}
                </text>
                <text
                  x={streetScale.bandwidth() / 2}
                  y={PLOT_H + 26}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px] tabular-nums"
                >
                  AF {af === null ? '–' : af === Infinity ? '∞' : af.toFixed(1)}
                </text>
              </g>
            );
          })}
        </g>

        <g transform={`translate(${WIDTH - 96}, 4)`}>
          <BarTooltip label="Bets and raises">
            <rect width={8} height={8} y={0} className="fill-emerald-400" />
          </BarTooltip>
          <text x={12} y={7} className="fill-slate-400 text-[9px]">bet/raise</text>
          <BarTooltip label="Calls">
            <rect width={8} height={8} y={12} className="fill-slate-500" />
          </BarTooltip>
          <text x={12} y={19} className="fill-slate-400 text-[9px]">call</text>
        </g>
      </svg>
    </ChartTooltipProvider>
  );
}
