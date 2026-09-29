'use client';

import type { ReactNode } from 'react';
import type { Hand } from '@/domain/hand';
import { actionLabel, type Action } from '@/domain/action';
import type { HandAnalysis, DecisionVerdict } from '@/analysis/types';
import { formatUnit } from '@/lib/format';
import { useDisplayStore } from '@/state/display-store';
import { usePlayerDialogStore } from '@/state/player-dialog-store';
import { playerKey } from '@/stats/types';
import { VerdictIcon } from '@/components/analysis/VerdictBadge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { CardView } from '@/components/replay/CardView';

interface Props {
  hand: Hand | null;
  actionIndex: number;
  /** On the closing award step the win rows are current, not the last action. */
  awarding: boolean;
  analysis: HandAnalysis | undefined;
  pending: boolean;
  onSelect: (i: number) => void;
}

/**
 * Antes are six identical rows that push the actual decisions out of view, so
 * they collapse into a single summary row. Blinds stay: they set the action.
 *
 * The amount shown is the ante EACH player posted, not the sum: "ante 800" is
 * the number a player recognises from the table, whereas the 4,800 total reads
 * like a single enormous bet. The names carry the count instead.
 *
 * A mixed ante (different amounts per seat, e.g. a short stack posting less)
 * has no single per-player figure, so those rows are left uncollapsed.
 */
function collapseAntes(actions: readonly Action[], hand: Hand): Action[] {
  const antes = actions.filter((a) => a.kind === 'post-ante');
  if (antes.length < 2) return [...actions];
  const each = antes[0]!.amount;
  if (antes.some((a) => a.amount !== each)) return [...actions];

  const rest = actions.filter((a) => a.kind !== 'post-ante');
  const summary: Action = {
    ...antes[0]!,
    seat: -1,
    playerId: '',
    amount: each,
    kind: 'post-ante',
    raw: `${antes.length} antes`,
  };
  return [summary, ...rest];
}

/** "raise 2,400" / "all-in 916" / "uncalled bet 209,497". */
function describeAction(a: Action, hand: Hand, unit: 'chips' | 'bb'): string {
  const label = a.isAllIn ? 'all-in' : actionLabel(a.kind);
  return a.amount > 0 ? `${label} ${formatUnit(a.amount, hand.money, unit)}` : label;
}

interface AntePoster {
  readonly name: string;
  readonly isHero: boolean;
  readonly seat: number;
  /** The poster's own action index, so the summary row can follow the replay. */
  readonly index: number;
}

/**
 * Who posted the ante, hero first. Hero leads the list because this row is
 * otherwise the one place in the log where hero is buried among five villains,
 * and truncation at narrow widths would drop them entirely.
 */
function antePosters(actions: readonly Action[], hand: Hand): AntePoster[] {
  const posters = actions
    .filter((a) => a.kind === 'post-ante')
    .map((a) => {
      const seat = hand.seats.find((s) => s.seat === a.seat);
      return { name: seat?.name ?? `seat ${a.seat}`, isHero: seat?.isHero ?? false, seat: a.seat, index: a.index };
    });
  return [...posters].sort((a, b) => Number(b.isHero) - Number(a.isHero));
}

export function ActionLog({ hand, actionIndex, awarding, analysis, pending, onSelect }: Props) {
  const unit = useDisplayStore((s) => s.unit);
  const openPlayer = usePlayerDialogStore((s) => s.open);

  if (!hand) {
    return (
      <div className="rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden h-full flex flex-col">
        <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
          <span className="t-panel-title">Action</span>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <p className="text-sm text-slate-500 text-center">No hand selected.</p>
        </div>
      </div>
    );
  }

  const isCurrentAction = (index: number) => !awarding && index === actionIndex;

  const verdicts = analysis?.verdicts ?? [];
  const verdictByIndex = new Map(verdicts.map((v) => [v.actionIndex, v]));

  const openPlayerAt = (seat: number) => {
    const s = hand.seats.find((x) => x.seat === seat);
    if (s) openPlayer(playerKey(hand.meta.siteId, s.playerId));
  };

  /**
   * Name button sits over the row's own select-action button. Both are real
   * buttons rather than one nested in the other (invalid HTML) — the row
   * button is stretched to fill the row via absolute positioning, and the
   * name button sits above it with a higher stacking order and its own
   * click handler, so a click on the name opens the player and a click
   * anywhere else in the row selects the action.
   */
  const NameButton = ({ seat, children, className }: { seat: number; children: ReactNode; className?: string | undefined }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openPlayerAt(seat); }}
      className={`relative z-10 truncate text-left outline-none hover:text-white hover:underline ${className ?? ''}`}
    >
      {children}
    </button>
  );

  const renderVerdictRow = (a: Action, verdict: DecisionVerdict, seat: NonNullable<ReturnType<typeof hand.seats.find>>) => {
    const isCurrent = isCurrentAction(a.index);
    return (
      <div
        key={a.index}
        className={`relative w-full px-3 py-1.5 flex items-center gap-2 border-2 rounded-lg transition hover:bg-slate-800/50 ${
          isCurrent ? 'border-slate-300' : 'border-transparent'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(a.index)}
          className="absolute inset-0 rounded-lg outline-none"
          aria-label={`Select ${seat.name}'s ${a.kind} action`}
        />
        <span className="relative w-9 shrink-0 flex justify-center pointer-events-none">
          <span className="w-9 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 text-slate-300">
            {seat.position}
          </span>
        </span>
        <NameButton seat={seat.seat} className="text-slate-300">{seat.name}</NameButton>
        <span className="relative ml-auto shrink-0 text-slate-400 pointer-events-none">
          {describeAction(a, hand, unit)}
        </span>
        <span className="relative w-[18px] shrink-0 flex justify-center pointer-events-none">
          <VerdictIcon severity={verdict.severity} />
        </span>
      </div>
    );
  };

  return (
    <div className="rounded-sm border border-slate-800 bg-slate-900/60 overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
        <span className="t-panel-title">Action</span>
        {pending ? (
          <span className="t-micro text-slate-500">Analyzing…</span>
        ) : null}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <ol className="text-sm">
        {hand.streets.map((street) => (
          <li key={street.street}>
            <div className="px-3 py-1.5 bg-slate-800/60 t-label sticky top-0 flex items-center gap-2">
              {street.street}
              {street.newCards.length > 0 && (
                <span className="flex gap-1">
                  {street.newCards.map((card, i) => (
                    <CardView key={i} card={card} size="sm" />
                  ))}
                </span>
              )}
            </div>
            {collapseAntes(street.actions, hand).map((a) => {
              const posters = a.seat === -1 ? antePosters(street.actions, hand) : null;
              const seat = hand.seats.find((s) => s.seat === a.seat);
              const verdict = verdictByIndex.get(a.index);
              if (verdict && seat) {
                return renderVerdictRow(a, verdict, seat);
              }
              // The summary row stands in for every ante, so it stays lit while
              // the replay walks the table posting them one by one.
              const isCurrent = posters ? posters.some((p) => isCurrentAction(p.index)) : isCurrentAction(a.index);
              return (
                <div
                  key={a.index}
                  className={`relative w-full px-3 py-1.5 flex items-center gap-2 border-2 rounded-lg transition hover:bg-slate-800/50 ${
                    isCurrent ? 'border-slate-300' : 'border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => a.seat !== -1 && onSelect(a.index)}
                    className="absolute inset-0 rounded-lg outline-none"
                    aria-label={
                      posters
                        ? `Select ${posters.map((p) => p.name).join(', ')} ${a.kind}`
                        : seat
                          ? `Select ${seat.name}'s ${a.kind} action`
                          : `Select ${a.kind} action`
                    }
                  />
                  <span className="relative w-9 shrink-0 flex justify-center pointer-events-none">
                    {seat && (
                      <span className={`w-9 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 ${seat.isHero ? 'text-slate-100' : 'text-slate-300'}`}>
                        {seat.position}
                      </span>
                    )}
                  </span>
                  <span
                    title={posters ? posters.map((p) => p.name).join(', ') : undefined}
                    className={`truncate flex items-center gap-0 ${posters ? 'ante-posters' : ''} ${seat?.isHero ? 'text-slate-300' : 'text-slate-400'}`}
                  >
                    {posters
                      ? posters.map((p, i) => (
                          // Each name keeps its natural width and the ROW
                          // truncates: letting the names shrink instead
                          // divides the space six ways and reduces every one
                          // to an initial ("S…, B., M.") rather than dropping
                          // the ones that do not fit.
                          <span key={p.name} className="flex shrink-0 items-center">
                            {i > 0 && <span className="relative text-slate-400 pointer-events-none">,&nbsp;</span>}
                            <NameButton
                              seat={p.seat}
                              className={isCurrentAction(p.index) ? 'text-slate-50' : p.isHero ? 'text-slate-300' : undefined}
                            >
                              {p.name}
                            </NameButton>
                          </span>
                        ))
                      : seat
                        ? <NameButton seat={seat.seat}>{seat.name}</NameButton>
                        : null}
                  </span>
                  <span className={`relative ml-auto shrink-0 pointer-events-none ${a.kind === 'fold' ? 'text-slate-500' : 'text-slate-400'}`}>
                    {describeAction(a, hand, unit)}
                  </span>
                  <span className="relative w-[18px] shrink-0 pointer-events-none" />
                </div>
              );
            })}
          </li>
        ))}

        {hand.awards.map((award, i) => {
          const seat = hand.seats.find((s) => s.seat === award.seat);
          return (
            <div
              key={`win-${award.seat}-${award.potLevel}-${i}`}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 border-2 rounded-lg ${
                awarding ? 'border-slate-300' : 'border-transparent'
              }`}
            >
              <span className="w-9 shrink-0 flex justify-center">
                {seat && (
                  <span className={`w-9 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 ${seat.isHero ? 'text-slate-100' : 'text-slate-300'}`}>
                    {seat.position}
                  </span>
                )}
              </span>
              {seat ? (
                <NameButton seat={seat.seat} className={seat.isHero ? 'text-slate-300' : 'text-slate-400'}>
                  {seat.name}
                </NameButton>
              ) : (
                <span className="truncate text-slate-400">{`seat ${award.seat}`}</span>
              )}
              <span className="text-slate-400 ml-auto shrink-0">
                win {formatUnit(award.amount, hand.money, unit)}
                {award.potLevel > 0 && (
                  <span className="text-slate-500 ml-1">(side pot {award.potLevel})</span>
                )}
              </span>
              <span className="w-[18px] shrink-0" />
            </div>
          );
        })}
        </ol>
      </ScrollArea>
    </div>
  );
}
