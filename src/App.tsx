'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useHandsStore } from '@/state/hands-store';
import { useReplayStore } from '@/state/replay-store';
import { useAnalysisStore } from '@/state/analysis-store';
import { FileDropzone } from '@/components/upload/FileDropzone';
import { ParseReport } from '@/components/upload/ParseReport';
import { DisplaySettingsMenu } from '@/components/upload/DisplaySettingsMenu';
import { HandList } from '@/components/hands/HandList';
import { Table } from '@/components/replay/Table';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { ActionLog } from '@/components/replay/ActionLog';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { FiltersPanel } from '@/components/filters/FiltersPanel';
import { PlayerStatsDialog } from '@/components/players/PlayerStatsDialog';
import { replayTimeline } from '@/domain/stacks';
import type { Board } from '@/domain/cards';
import { useHandLoading } from '@/state/use-hand-loading';
import { useFiltersStore } from '@/state/filters-store';
import { deriveFacts } from '@/filters/facts';
import { matches } from '@/filters/match';
import { gameKey } from '@/domain/game';
import { playerHandFacts } from '@/stats/player-facts';
import { aggregatePlayers } from '@/stats/aggregate';
import { playerKey } from '@/stats/types';

/** Stable empty board, so Table's memo isn't defeated by a fresh [] each render. */
const NO_BOARD: Board = [];

export function App() {
  const { hands, selectedId, importing, hydrating, report, importFiles, select, hydrate, clearAll } =
    useHandsStore();
  const { stepIndex, playing, setIndex, reset, setPlaying } = useReplayStore();
  const { byHandId, pending, engineError, analyze } = useAnalysisStore();

  const criteria = useFiltersStore((s) => s.criteria);
  const pruneSourceFiles = useFiltersStore((s) => s.pruneSourceFiles);
  const prunePlayers = useFiltersStore((s) => s.prunePlayers);
  const pruneGames = useFiltersStore((s) => s.pruneGames);

  // Facts are derived per hand and memoised on the library, not on the
  // criteria: changing a filter must not re-walk every hand's action list.
  // Analysis is folded in per hand so a severity filter sees verdicts as they
  // arrive, without invalidating the facts of hands whose analysis is unchanged.
  const facts = useMemo(
    () => hands.map((h) => deriveFacts(h, byHandId[h.id])),
    [hands, byHandId],
  );

  // Player facts are similarly memoised on the library alone — a filter
  // change never re-walks a hand's actions, only re-selects which hands'
  // already-derived facts get summed by aggregatePlayers below.
  const playerFacts = useMemo(() => hands.map(playerHandFacts), [hands]);

  const visibleIndices = useMemo(
    () => hands.map((_, i) => i).filter((i) => matches(facts[i]!, criteria)),
    [hands, facts, criteria],
  );

  const visibleHands = useMemo(
    () => visibleIndices.map((i) => hands[i]!),
    [visibleIndices, hands],
  );

  const playerPool = useMemo(
    () => aggregatePlayers(visibleIndices.map((i) => playerFacts[i]!)),
    [visibleIndices, playerFacts],
  );

  const selectedHand = useMemo(
    () => hands.find((h) => h.id === selectedId) ?? null,
    [hands, selectedId],
  );

  // The list highlights `selectedId` the instant it changes; the replay panels
  // follow one transition later, showing skeletons until then. Rebuilding the
  // timeline, the seat ring and every action row in the same commit as the
  // click is what used to make the selection itself feel slow to appear.
  const { hand, loading: handLoading } = useHandLoading(selectedHand);

  // Hydration and import replace the library wholesale, so the replay is
  // between hands too, not just the list.
  const libraryLoading = hydrating || importing;
  const replayLoading = libraryLoading || handLoading;

  useEffect(() => { void hydrate(); }, [hydrate]);

  // A source-file selection outlives the hands that justified it — clearing the
  // library, or importing a different set, would otherwise leave a filter
  // pinned to a name nothing matches. Pruned against the library as it changes.
  useEffect(() => {
    pruneSourceFiles(
      new Set(hands.map((h) => h.meta.sourceFile).filter((f): f is string => f !== null)),
    );
  }, [hands, pruneSourceFiles]);

  useEffect(() => {
    pruneGames(new Set(hands.map(gameKey).filter((k): k is string => k !== null)));
  }, [hands, pruneGames]);

  // Same staleness problem as source files: a selected username can outlive
  // the hands that justified it. Pruned against the full library, not the
  // filtered pool, so a player merely filtered OUT isn't silently untoggled.
  useEffect(() => {
    prunePlayers(
      new Set(
        hands.flatMap((h) => h.seats.filter((s) => !s.sittingOut).map((s) => playerKey(h.meta.siteId, s.playerId))),
      ),
    );
  }, [hands, prunePlayers]);

  useEffect(() => { reset(); }, [selectedId, reset]);
  useEffect(() => { if (hand) void analyze(hand); }, [hand, analyze]);

  const analysis = hand ? byHandId[hand.id] : undefined;

  // The replay scrubs over timeline STEPS, which include the card-only steps of
  // an all-in run-out; everything downstream still speaks in action indices.
  const timeline = useMemo(() => (hand ? replayTimeline(hand) : []), [hand]);
  const current = timeline[Math.min(stepIndex, timeline.length - 1)] ?? null;
  const actionIndex = current?.actionIndex ?? -1;

  // ActionLog and AnalysisPanel select by ACTION index (they don't know about
  // run-out deal steps), so clicking a row needs to land on the timeline step
  // that plays that action — the last step carrying that actionIndex, since a
  // deal step for the FOLLOWING street (or the closing award step) can share it too.
  const stepOfAction = useMemo(() => {
    const map = new Map<number, number>();
    timeline.forEach((s, i) => { if (s.dealt === null && !s.award) map.set(s.actionIndex, i); });
    return map;
  }, [timeline]);
  // Stable identity so the memoised ActionLog isn't re-rendered by a new
  // callback on every App render.
  const selectAction = useCallback(
    (i: number) => setIndex(stepOfAction.get(i) ?? 0),
    [stepOfAction, setIndex],
  );

  // Table takes the controls as children, and a fresh element there would make
  // its memo a no-op — children is just another prop by identity.
  const replayControls = useMemo(
    () => (
      <ReplayControls
        timeline={timeline}
        stepIndex={stepIndex}
        playing={playing}
        onIndex={setIndex}
        onPlaying={setPlaying}
      />
    ),
    [timeline, stepIndex, playing, setIndex, setPlaying],
  );

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 shrink-0">
        <div className="mx-auto w-full max-w-[96rem] px-4 py-4 sm:px-6 md:px-8 md:py-5 flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-50">MyHandHistory.com</h1>
           
          </div>
          <div className="ml-auto shrink-0">
            <DisplaySettingsMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 lg:min-h-0 w-full max-w-[96rem] mx-auto px-4 py-4 sm:px-6 md:px-8 md:py-6 flex flex-col gap-4 md:gap-5">
        {hand && hand.warnings.length > 0 && (
          <div className="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap shrink-0">
            <span
              className="t-micro font-medium text-amber-400"
              title={hand.warnings.map((w) => w.message).join('\n')}
            >
              {hand.warnings.length} parse warning(s)
            </span>
          </div>
        )}

        {hand && engineError && (
          <p className="t-micro text-amber-400 shrink-0">{engineError}</p>
        )}

        {/* Source, filters and hands share one left column: only the scoping
            filters are inline (the rest are behind "All filters"), so the hands
            list takes the height that used to belong to the full filter panel.
            From xl the action log is a fixed 21rem and the replay takes all the
            remaining width; the felt centres itself in its column and scrolls
            horizontally rather than overflowing if the column is ever narrower
            than it.
            At lg the log sits above the replay in the second column, and below
            lg everything is a single stack. */}
        <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_21rem_minmax(0,1fr)] xl:grid-rows-1 gap-4 md:gap-5">
          <aside className="lg:min-h-0 lg:row-span-2 xl:row-span-1 flex flex-col gap-4 md:gap-5 lg:overflow-y-auto scroll-thin">
            <div className="shrink-0 rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 t-panel-title">
                Source
              </div>
              <div className="p-3 space-y-3.5">
                <FileDropzone onFiles={(files) => void importFiles(files)} busy={importing} />
                <ParseReport
                  report={report}
                  onClear={hands.length > 0 ? () => void clearAll() : undefined}
                />
              </div>
            </div>

            {/* Always visible, even with an empty library — its controls just
                have nothing to act on yet. */}
            <div className="shrink-0">
              <FiltersPanel />
            </div>

            {/* Below lg the page is not a fixed-height grid, so the list needs
                an explicit height; from lg it takes whatever the column has
                left, with a floor so a short window scrolls the column instead
                of squeezing the list to nothing. */}
            <div className="h-[22rem] lg:h-auto lg:flex-1 lg:min-h-[14rem]">
              <HandList
                hands={visibleHands}
                selectedId={selectedId}
                loading={libraryLoading}
                onSelect={select}
              />
            </div>
          </aside>

          <div className="min-h-0 max-h-[24rem] lg:max-h-72 xl:max-h-none flex flex-col lg:col-start-2 lg:row-start-1 xl:col-start-2">
            <ActionLog
              hand={hand}
              actionIndex={actionIndex}
              awarding={current?.award ?? false}
              analysis={analysis}
              pending={Boolean(hand && pending[hand.id])}
              loading={replayLoading}
              onSelect={selectAction}
            />
          </div>
          <div className="w-full max-w-full min-h-0 lg:overflow-y-auto scroll-thin flex flex-col gap-4 md:gap-5 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1">
            <div className="flex shrink-0 lg:min-h-0 overflow-hidden">
              <Table hand={hand} actionIndex={actionIndex} board={current?.board ?? NO_BOARD} awarding={current?.award ?? false} antes={current?.antes ?? false} loading={replayLoading}>
                {replayControls}
              </Table>
            </div>
            {/* flex-1 lets it claim the vertical space the felt doesn't use,
                matching ActionLog's height in the column beside it. */}
            <div className="w-full flex-1 min-h-0">
              <AnalysisPanel hand={hand} actionIndex={actionIndex} analysis={analysis} />
            </div>
          </div>
        </div>
      </main>

      <PlayerStatsDialog pool={playerPool} totalFiltered={visibleHands.length} />
    </div>
  );
}
