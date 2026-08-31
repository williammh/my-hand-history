'use client';

import type { PlayerKey, PlayerStats } from '@/stats/types';
import { pct, aggressionFactor } from '@/stats/types';
import { BENCHMARKS } from '@/stats/benchmarks';
import { registry } from '@/parsers/index';
import { usePlayerDialogStore } from '@/state/player-dialog-store';
import { Dialog } from '@/components/ui/Dialog';
import { StatBars, type StatBarRow } from '@/components/charts/StatBars';
import { PoolScatter } from '@/components/charts/PoolScatter';
import { StreetAggression } from '@/components/charts/StreetAggression';
import { BarTooltip, ChartTooltipProvider } from '@/components/charts/ChartTooltip';

interface Props {
  pool: ReadonlyMap<PlayerKey, PlayerStats>;
  totalFiltered: number;
}

/**
 * Every stat spelled out for its hover tooltip: what the acronym stands for,
 * then the exact numerator over denominator, since the denominator is the part
 * that is easy to guess wrong. Kept in sync with `seatFacts` in
 * `@/stats/player-facts`, which is where these counters are actually built.
 */
const STAT_FULL_LABEL: Record<string, string> = {
  VPIP:
    'Voluntarily Put money In Pot — hands where you called, bet, or raised preflop, '
    + 'out of every hand you were dealt in. Posting a blind is forced, so it does not count.',
  PFR:
    'PreFlop Raise — hands where you bet or raised preflop, out of every hand you were '
    + 'dealt in. Same denominator as VPIP, so PFR can never exceed it.',
  '3Bet':
    'Three-bet — you re-raised, out of the spots where your first preflop action faced '
    + 'exactly one raise. Facing two or more raises is a 4bet+ spot and is excluded entirely.',
  'Fold to 3Bet':
    'Folded to a three-bet — you folded, out of the spots where you open-raised (no raise '
    + 'before you), someone re-raised, and the action came back to you.',
  ATS:
    'Attempt To Steal — you raised, out of the hands where you were first in from the '
    + 'cutoff, button, or small blind. Any limp or raise ahead of you removes the spot; '
    + 'folding or limping the spot counts against you.',
  'Fold to Steal':
    'Folded to a steal — you folded, out of the hands where you were in a blind and faced '
    + 'a first-in raise from the cutoff, button, or small blind. Only the blinds are counted, '
    + 'since only a blind is what a steal is aiming at.',
  'Flop CBet':
    'Flop Continuation Bet — you bet the flop, out of the flops where you were the LAST '
    + 'preflop raiser and the action reached you unbet. Opening and then getting re-raised '
    + 'makes someone else the continuation bettor, so it is not counted here.',
  'Fold to Flop CBet':
    "Folded to a flop continuation bet — you folded, out of the flops where the last preflop "
    + 'raiser led out with a bet and you had a chance to respond.',
  WTSD:
    'Went To ShowDown — hands you reached a showdown in, out of the hands where you saw a '
    + 'flop. Folding preflop is not counted as declining a showdown.',
  WSD:
    'Won money at ShowDown — showdowns where you were awarded part of the pot, out of the '
    + 'showdowns you reached. A split pot counts as a win. A showdown is counted whenever '
    + 'you never folded and at least one other player was still live, even on an all-in '
    + 'run-out where the site printed no cards.',
  'Aggression factor':
    'Aggression Factor — postflop bets and raises divided by postflop calls, across the '
    + 'flop, turn, and river. Checks and folds are ignored, and preflop is excluded. '
    + 'Higher means more betting than calling; "\u221e" means aggression with no calls at all.',
};

function StatTile({ label, value, sample }: { label: string; value: string; sample: string }) {
  return (
    <BarTooltip label={STAT_FULL_LABEL[label] ?? label}>
      <div className="rounded-sm border border-slate-700 bg-slate-900/40 px-2.5 py-2 cursor-default">
        <div className="t-label text-slate-500">{label}</div>
        <div className="text-lg font-semibold tabular-nums text-slate-100">{value}</div>
        <div className="t-micro text-slate-500 tabular-nums">{sample}</div>
      </div>
    </BarTooltip>
  );
}

/**
 * Villain (or hero) stats over the currently filtered hand set. Rendered once
 * at the App level and driven entirely by `usePlayerDialogStore` — the click
 * that opens it happens deep inside ActionLog, several components away.
 */
export function PlayerStatsDialog({ pool, totalFiltered }: Props) {
  const openKey = usePlayerDialogStore((s) => s.openKey);
  const close = usePlayerDialogStore((s) => s.close);
  const stats = openKey ? pool.get(openKey) : undefined;

  if (!openKey) return null;

  const room = stats ? registry.get(stats.siteId)?.displayName ?? stats.siteId : null;

  return (
    <Dialog
      open={Boolean(openKey)}
      onOpenChange={(o) => { if (!o) close(); }}
      title={
        stats ? (
          <span className="flex items-center gap-2">
            <span>{stats.name}{stats.isHero ? ' (you)' : ''}</span>
            <span className="t-label px-1.5 py-0.5 rounded-sm bg-slate-700 text-slate-300">{room}</span>
          </span>
        ) : (
          'Player'
        )
      }
      description="Player statistics over the currently filtered hands"
    >
      {!stats ? (
        <p className="text-sm text-slate-400">
          This player has no hands in the current filter. Loosen the filters on the left to see them.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="t-micro text-slate-400">
              {stats.hands} hand{stats.hands === 1 ? '' : 's'} in this sample
              {totalFiltered > 0 && ` of ${totalFiltered} filtered`}
            </span>
          </div>

          <div>
            <div className="t-panel-title mb-2 text-slate-400">Stats</div>
            <ChartTooltipProvider>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatTile label="VPIP" value={fmtPct(pct(stats.vpip))} sample={sample(stats.vpip)} />
                <StatTile label="PFR" value={fmtPct(pct(stats.pfr))} sample={sample(stats.pfr)} />
                <StatTile label="3Bet" value={fmtPct(pct(stats.threeBet))} sample={sample(stats.threeBet)} />
                <StatTile label="Fold to 3Bet" value={fmtPct(pct(stats.foldToThreeBet))} sample={sample(stats.foldToThreeBet)} />
                <StatTile label="ATS" value={fmtPct(pct(stats.steal))} sample={sample(stats.steal)} />
                <StatTile label="Fold to Steal" value={fmtPct(pct(stats.foldToSteal))} sample={sample(stats.foldToSteal)} />
                <StatTile label="Flop CBet" value={fmtPct(pct(stats.flopCbet))} sample={sample(stats.flopCbet)} />
                <StatTile label="Fold to Flop CBet" value={fmtPct(pct(stats.foldToFlopCbet))} sample={sample(stats.foldToFlopCbet)} />
                <StatTile label="WTSD" value={fmtPct(pct(stats.wtsd))} sample={sample(stats.wtsd)} />
                <StatTile label="WSD" value={fmtPct(pct(stats.wsd))} sample={sample(stats.wsd)} />
                <StatTile label="Aggression factor" value={fmtAf(aggressionFactor(stats.aggression))} sample={`${stats.aggression.betsRaises} aggr / ${stats.aggression.calls} call`} />
              </div>
            </ChartTooltipProvider>
          </div>

          <div>
            <div className="t-panel-title mb-2 text-slate-400">Stat bars vs typical range</div>
            <StatBars rows={statBarRows(stats)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="t-panel-title mb-2 text-slate-400">VPIP / PFR — filtered pool</div>
              <PoolScatter pool={pool} highlightKey={openKey} />
            </div>
            <div>
              <div className="t-panel-title mb-2 text-slate-400">Postflop aggression</div>
              <StreetAggression byStreet={stats.byStreet} />
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function fmtPct(v: number | null): string {
  return v === null ? '–' : `${v.toFixed(1)}%`;
}

function fmtAf(v: number | null): string {
  if (v === null) return '–';
  return v === Infinity ? '∞' : v.toFixed(1);
}

function sample(c: { hits: number; opportunities: number }): string {
  return `${c.hits}/${c.opportunities}`;
}

function statBarRows(stats: PlayerStats): readonly StatBarRow[] {
  const row = (label: string, counter: StatBarRow['counter'], benchmark: StatBarRow['benchmark']): StatBarRow => ({
    label, fullLabel: STAT_FULL_LABEL[label] ?? label, counter, benchmark,
  });
  return [
    row('VPIP', stats.vpip, BENCHMARKS.vpip),
    row('PFR', stats.pfr, BENCHMARKS.pfr),
    row('3Bet', stats.threeBet, BENCHMARKS.threeBet),
    row('Fold to 3Bet', stats.foldToThreeBet, BENCHMARKS.foldToThreeBet),
    row('ATS', stats.steal, BENCHMARKS.steal),
    row('Fold to Steal', stats.foldToSteal, BENCHMARKS.foldToSteal),
    row('Flop CBet', stats.flopCbet, BENCHMARKS.flopCbet),
    row('Fold to Flop CBet', stats.foldToFlopCbet, BENCHMARKS.foldToFlopCbet),
    row('WTSD', stats.wtsd, BENCHMARKS.wtsd),
    row('WSD', stats.wsd, BENCHMARKS.wsd),
  ];
}
