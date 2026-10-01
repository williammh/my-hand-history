'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useHandsStore } from '@/state/hands-store';
import { useReplayStore } from '@/state/replay-store';
import { useAnalysisStore } from '@/state/analysis-store';
import { DisplaySettingsMenu } from '@/components/upload/DisplaySettingsMenu';
import { HandList } from '@/components/hands/HandList';
import { Table } from '@/components/replay/Table';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { ActionLog } from '@/components/replay/ActionLog';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { SourcePanel } from '@/components/filters/SourcePanel';
import { PlayerStatsDialog } from '@/components/players/PlayerStatsDialog';
import { replayTimeline, revealedSeats } from '@/domain/stacks';
import type { Board } from '@/domain/cards';
import type { Street } from '@/domain/position';
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
const NO_SEATS: ReadonlySet<number> = new Set();

export function App() {
  const { hands, selectedId, importing, hydrating, select, hydrate } =
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
  const showdownStep = current?.showdown ?? null;
  const showing = hand && showdownStep !== null ? hand.showdown[showdownStep]?.seat ?? null : null;
  const revealed = useMemo(
    () => (hand ? revealedSeats(hand, timeline, stepIndex) : NO_SEATS),
    [hand, timeline, stepIndex],
  );
  const dealtStreet = current?.dealt ?? null;
  // A street with actions has no card-only step: its board appears with its
  // first action, which is where selecting the board cards should land.
  const selectDeal = useCallback(
    (street: Street) => {
      let step = timeline.findIndex((s) => s.dealt === street);
      if (step < 0) {
        const first = hand?.streets.find((st) => st.street === street)?.actions[0];
        if (first) step = stepOfAction.get(first.index) ?? -1;
      }
      if (step >= 0) setIndex(step);
    },
    [timeline, hand, stepOfAction, setIndex],
  );
  const selectShowdown = useCallback(
    (i: number) => {
      const step = timeline.findIndex((s) => s.showdown === i);
      if (step >= 0) setIndex(step);
    },
    [timeline, setIndex],
  );
  // Stable identity so the memoised ActionLog isn't re-rendered by a new
  // callback on every App render.
  const selectAction = useCallback(
    (i: number) => setIndex(stepOfAction.get(i) ?? 0),
    [stepOfAction, setIndex],
  );

  // Same for the action strip, which Table renders above the felt.
  const awarding = current?.award ?? false;
  const actionStrip = useMemo(
    () => (
      <ActionLog
        hand={hand}
        actionIndex={actionIndex}
        awarding={awarding}
        showdownStep={showdownStep}
        dealtStreet={dealtStreet}
        analysis={analysis}
        loading={replayLoading}
        onSelect={selectAction}
        onSelectShowdown={selectShowdown}
        onSelectDeal={selectDeal}
      />
    ),
    [hand, actionIndex, awarding, showdownStep, dealtStreet, analysis, replayLoading, selectAction, selectShowdown, selectDeal],
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

        {/* The source panel (upload, report, scoping filters) and hands share one
            left column. Only the scoping filters are inline — the rest are
            behind "All filters" — so the hands list keeps the height.
            The second column takes all the remaining width and stacks the
            replay (with the action strip inside it) and the analysis;
            the felt centres itself in it and scrolls horizontally rather than
            overflowing if the column is ever narrower than it. Below lg
            everything is a single stack. */}
        <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)] gap-4 md:gap-5">
          <aside className="lg:min-h-0 flex flex-col gap-4 md:gap-5 lg:overflow-y-auto scroll-thin">
            {/* Always visible, even with an empty library — its controls just
                have nothing to act on yet. */}
            <div className="shrink-0">
              <SourcePanel />
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

          <div className="w-full max-w-full min-w-0 min-h-0 lg:overflow-y-auto scroll-thin flex flex-col gap-4 md:gap-5">
            <div className="flex shrink-0 lg:min-h-0 overflow-hidden">
              <Table
                hand={hand}
                actionIndex={actionIndex}
                board={current?.board ?? NO_BOARD}
                awarding={current?.award ?? false}
                antes={current?.antes ?? false}
                revealed={revealed}
                showing={showing}
                loading={replayLoading}
                top={actionStrip}
                status={hand && !replayLoading && pending[hand.id] ? 'Analyzing…' : null}
              >
                {replayControls}
              </Table>
            </div>
            {/* The felt gets first claim on the column's height; the analysis
                fills whatever is left, and on a short window gives up space
                (scrolling inside) before the column itself has to scroll. */}
            <div className="w-full flex-1 min-h-[2.25rem] flex flex-col">
              <AnalysisPanel hand={hand} actionIndex={actionIndex} analysis={analysis} />
            </div>
          </div>
        </div>
      </main>

      <PlayerStatsDialog pool={playerPool} totalFiltered={visibleHands.length} />
    </div>
  );
}
