import { useEffect, useMemo } from 'react';
import { useHandsStore } from '@/state/hands-store.js';
import { useReplayStore } from '@/state/replay-store.js';
import { useAnalysisStore } from '@/state/analysis-store.js';
import { FileDropzone } from '@/components/upload/FileDropzone.js';
import { SiteRadioGroup } from '@/components/upload/SiteRadioGroup.js';
import { ParseReport } from '@/components/upload/ParseReport.js';
import { DisplaySettingsMenu } from '@/components/upload/DisplaySettingsMenu.js';
import { HandList } from '@/components/hands/HandList.js';
import { Table } from '@/components/replay/Table.js';
import { ReplayControls } from '@/components/replay/ReplayControls.js';
import { ActionLog } from '@/components/replay/ActionLog.js';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel.js';
import { FiltersPanel } from '@/components/filters/FiltersPanel.js';
import { ScrollArea } from '@/components/ui/ScrollArea.js';
import { replayTimeline } from '@/domain/stacks.js';
import { formatDateTime, formatGameMode } from '@/lib/format.js';
import { useDisplayStore } from '@/state/display-store.js';
import { useFiltersStore } from '@/state/filters-store.js';
import { deriveFacts } from '@/filters/facts.js';
import { matches } from '@/filters/match.js';

export function App() {
  const { hands, selectedId, siteId, importing, report, setSite, importFiles, select, hydrate, clearAll } =
    useHandsStore();
  const { stepIndex, playing, setIndex, reset, setPlaying } = useReplayStore();
  const { byHandId, pending, engineError, analyze } = useAnalysisStore();
  const timezone = useDisplayStore((s) => s.timezone);

  const criteria = useFiltersStore((s) => s.criteria);
  const pruneSourceFiles = useFiltersStore((s) => s.pruneSourceFiles);

  // Facts are derived per hand and memoised on the library, not on the
  // criteria: changing a filter must not re-walk every hand's action list.
  // Analysis is folded in per hand so a severity filter sees verdicts as they
  // arrive, without invalidating the facts of hands whose analysis is unchanged.
  const facts = useMemo(
    () => hands.map((h) => deriveFacts(h, byHandId[h.id])),
    [hands, byHandId],
  );

  const visibleHands = useMemo(
    () => hands.filter((_, i) => matches(facts[i]!, criteria)),
    [hands, facts, criteria],
  );

  const hand = useMemo(() => hands.find((h) => h.id === selectedId) ?? null, [hands, selectedId]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  // A source-file selection outlives the hands that justified it — clearing the
  // library, or importing a different set, would otherwise leave a filter
  // pinned to a name nothing matches. Pruned against the library as it changes.
  useEffect(() => {
    pruneSourceFiles(
      new Set(hands.map((h) => h.meta.sourceFile).filter((f): f is string => f !== null)),
    );
  }, [hands, pruneSourceFiles]);

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
  // deal step for the FOLLOWING street can share it too.
  const stepOfAction = useMemo(() => {
    const map = new Map<number, number>();
    timeline.forEach((s, i) => { if (s.dealt === null) map.set(s.actionIndex, i); });
    return map;
  }, [timeline]);
  const selectAction = (i: number) => setIndex(stepOfAction.get(i) ?? 0);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 shrink-0">
        <div className="mx-auto w-full max-w-[96rem] px-4 py-4 sm:px-6 md:px-8 md:py-5 flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-50">MyHandHistory</h1>
           
          </div>
          <div className="ml-auto shrink-0">
            <DisplaySettingsMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 lg:min-h-0 w-full max-w-[96rem] mx-auto px-4 py-4 sm:px-6 md:px-8 md:py-6 flex flex-col gap-4 md:gap-5">
        {hand && (
          <div className="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap shrink-0">
            <span className="text-base font-semibold uppercase tracking-[0.08em] text-slate-200">
              {formatGameMode(hand.meta.gameMode)}
            </span>
            <span className="text-slate-700" aria-hidden="true">/</span>
            <h2 className="text-base font-normal tracking-tight text-slate-300">
              {hand.meta.tournament?.name ?? hand.meta.tableName ?? 'Unnamed game'}
            </h2>
            <span className="t-micro text-slate-500">
              {formatDateTime(hand.meta.playedAt, timezone)} · blinds{' '}
              {hand.money.smallBlind.toLocaleString('en-US')}/
              {hand.money.bigBlind.toLocaleString('en-US')}
              {hand.money.ante > 0 && ` · ante ${hand.money.ante.toLocaleString('en-US')}`}
            </span>
            {hand.warnings.length > 0 && (
              <span
                className="t-micro font-medium text-amber-400"
                title={hand.warnings.map((w) => w.message).join('\n')}
              >
                {hand.warnings.length} parse warning(s)
              </span>
            )}
          </div>
        )}

        {hand && engineError && (
          <p className="t-micro text-amber-400 shrink-0">{engineError}</p>
        )}

        {/* Four columns — source, hands, action log, replay — but only at 2xl.
            Four needs 19rem + 19rem + 19rem + a felt wide enough to read,
            which does not fit until ~1536px; at xl the felt ends up narrower
            than its own contents. So xl keeps hands stacked under source in a
            three-column layout, and below lg everything is a single stack.

            The first three tracks are pinned to the same 19rem so source,
            hands, and action log line up as equal-width columns. The replay
            track is fit-content, so it takes only what the felt needs (the
            felt sizes itself from --seat-w) but is still capped by the space
            actually left over — a plain max-content track ignores the
            container and overflows it. */}
        <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[19rem_21rem_minmax(0,1fr)] 2xl:grid-rows-1 2xl:grid-cols-[19rem_19rem_19rem_fit-content(34rem)] gap-4 md:gap-5">
          <aside className="lg:min-h-0 flex flex-col gap-4 md:gap-5">
            <div className="shrink-0 rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 t-panel-title">
                Source
              </div>
              <div className="p-3 space-y-3.5">
                <SiteRadioGroup value={siteId} onChange={setSite} />
                <FileDropzone onFiles={(files) => void importFiles(files)} busy={importing} />
                <ParseReport
                  report={report}
                  onClear={hands.length > 0 ? () => void clearAll() : undefined}
                />
              </div>
            </div>

            {/* Filters panel is always visible, even with an empty library —
                its controls just have nothing to act on yet. The panel is
                tall — it scrolls within the column rather than pushing
                Source off the top. */}
            {/* The panel scrolls internally under its own pinned header, so
                it takes the column's leftover height rather than being wrapped
                in a scroller here. */}
            <div className="lg:min-h-0 lg:flex-1 h-[28rem] lg:h-auto">
              <FiltersPanel />
            </div>
          </aside>

          {/* Hands gets its own column at 2xl; below that it stacks under
              Source in the first column, where it needs an explicit height
              because the page is not a fixed-height grid there. */}
          <div className="lg:min-h-0 h-[22rem] lg:h-auto lg:col-start-1 lg:row-start-2 2xl:col-start-2 2xl:row-start-1">
            <HandList hands={visibleHands} selectedId={selectedId} onSelect={select} />
          </div>

          <div className="min-h-0 max-h-[24rem] lg:max-h-72 xl:max-h-none flex flex-col lg:col-start-2 lg:row-start-1 xl:col-start-2 xl:row-start-1 xl:row-span-2 2xl:col-start-3 2xl:row-span-1">
            <ActionLog
              hand={hand}
              actionIndex={actionIndex}
              analysis={analysis}
              pending={Boolean(hand && pending[hand.id])}
              onSelect={selectAction}
            />
          </div>
          {/* w-fit sizes this column to its widest child. Only the replay
              panel (itself sized to the felt) is allowed to be that child:
              the analysis panel is neutralised below so its prose cannot
              widen the column past the felt. */}
          <div className="w-fit max-w-full min-h-0 flex flex-col gap-4 md:gap-5 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1 xl:row-span-2 2xl:col-start-4 2xl:row-span-1">
            <ScrollArea className="flex shrink-0 lg:min-h-0" viewportClassName="[&>div]:!flex">
              <Table hand={hand} actionIndex={actionIndex} board={current?.board ?? []}>
                <ReplayControls
                  timeline={timeline}
                  stepIndex={stepIndex}
                  playing={playing}
                  onIndex={setIndex}
                  onPlaying={setPlaying}
                />
              </Table>
            </ScrollArea>
            {/* w-0 min-w-full: w-0 drops this out of the w-fit column's
                max-content sizing so a long explanation cannot stretch the
                column wider than the felt; min-w-full then pulls it back
                out to the column width the replay panel established.
                flex-1 lets it claim the vertical space the felt doesn't
                use, matching ActionLog's height in the column beside it. */}
            <div className="w-0 min-w-full flex-1 min-h-0">
              <AnalysisPanel hand={hand} actionIndex={actionIndex} analysis={analysis} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
