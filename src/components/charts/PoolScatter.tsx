'use client';

import { scaleLinear, scaleSqrt } from 'd3-scale';
import type { PlayerKey, PlayerStats } from '@/stats/types';
import { pct } from '@/stats/types';

const WIDTH = 320;
const HEIGHT = 240;
const MARGIN = { top: 10, right: 12, bottom: 26, left: 30 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const DOMAIN_MAX = 80;
/** Below this hand count a dot is dimmed — a 3-hand sample is not a peer. */
const MIN_HANDS_FOR_EMPHASIS = 15;

interface Props {
  pool: ReadonlyMap<PlayerKey, PlayerStats>;
  highlightKey: PlayerKey;
}

/**
 * VPIP (x) vs PFR (y) for every player in the currently filtered pool, with
 * the player the dialog is open for picked out — shows where they sit
 * relative to the whole library, not just their own numbers in isolation.
 */
export function PoolScatter({ pool, highlightKey }: Props) {
  const x = scaleLinear().domain([0, DOMAIN_MAX]).range([0, PLOT_W]).clamp(true);
  const y = scaleLinear().domain([0, DOMAIN_MAX]).range([PLOT_H, 0]).clamp(true);
  const radius = scaleSqrt().domain([0, 200]).range([2, 7]).clamp(true);

  const points = [...pool.values()]
    .map((p) => ({ p, vpip: pct(p.vpip), pfr: pct(p.pfr) }))
    .filter((d): d is { p: PlayerStats; vpip: number; pfr: number } => d.vpip !== null && d.pfr !== null);

  const ticks = [0, 20, 40, 60, 80];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
      role="img"
      aria-label="VPIP versus PFR for every player in the filtered pool"
    >
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
        {ticks.map((t) => (
          <line
            key={`gx-${t}`}
            x1={x(t)} x2={x(t)} y1={0} y2={PLOT_H}
            className="stroke-slate-700/40"
            strokeWidth={1}
          />
        ))}
        {ticks.map((t) => (
          <line
            key={`gy-${t}`}
            x1={0} x2={PLOT_W} y1={y(t)} y2={y(t)}
            className="stroke-slate-700/40"
            strokeWidth={1}
          />
        ))}

        {points.map(({ p, vpip, pfr }) => {
          const isHighlight = p.key === highlightKey;
          const dim = p.hands < MIN_HANDS_FOR_EMPHASIS && !isHighlight;
          return (
            <circle
              key={p.key}
              cx={x(vpip)}
              cy={y(pfr)}
              r={isHighlight ? Math.max(radius(p.hands), 5) : radius(p.hands)}
              className={
                isHighlight
                  ? 'fill-emerald-300 stroke-emerald-100'
                  : dim
                    ? 'fill-slate-500/30'
                    : 'fill-slate-400/60'
              }
              strokeWidth={isHighlight ? 1.5 : 0}
            >
              <title>{`${p.name} — VPIP ${vpip.toFixed(1)}% / PFR ${pfr.toFixed(1)}% (${p.hands} hands)`}</title>
            </circle>
          );
        })}

        {ticks.map((t) => (
          <text
            key={`tx-${t}`}
            x={x(t)}
            y={PLOT_H + 14}
            textAnchor="middle"
            className="fill-slate-500 text-[9px] tabular-nums"
          >
            {t}
          </text>
        ))}
        {ticks.map((t) => (
          <text
            key={`ty-${t}`}
            x={-6}
            y={y(t)}
            dominantBaseline="middle"
            textAnchor="end"
            className="fill-slate-500 text-[9px] tabular-nums"
          >
            {t}
          </text>
        ))}

        <text
          x={PLOT_W / 2}
          y={PLOT_H + 24}
          textAnchor="middle"
          className="fill-slate-500 text-[10px]"
        >
          VPIP %
        </text>
        <text
          x={-PLOT_H / 2}
          y={-20}
          textAnchor="middle"
          transform="rotate(-90)"
          className="fill-slate-500 text-[10px]"
        >
          PFR %
        </text>
      </g>
    </svg>
  );
}
