'use client';

import { Fragment, memo, useEffect, useRef, type ReactNode } from 'react';
import type { Hand } from '@/domain/hand';
import type { Street } from '@/domain/position';
import { actionLabel, type Action } from '@/domain/action';
import type { HandAnalysis } from '@/analysis/types';
import { formatUnit } from '@/lib/format';
import { useDisplayStore } from '@/state/display-store';
import { usePlayerDialogStore } from '@/state/player-dialog-store';
import { playerKey } from '@/stats/types';
import { VerdictIcon } from '@/components/analysis/VerdictBadge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { CardView } from '@/components/replay/CardView';
import { PositionBadge as BaseBadge } from '@/components/replay/PositionBadge';
import { ActionLogSkeleton } from './ActionLogSkeleton';

interface Props {
  hand: Hand | null;
  actionIndex: number;
  /** On the closing award step the win cards are current, not the last action. */
  awarding: boolean;
  /** Index into Hand.showdown of the current showdown step, or null. */
  showdownStep: number | null;
  /** The street whose cards were just dealt on a card-only step, or null. */
  dealtStreet: Street | null;
  analysis: HandAnalysis | undefined;
  /**
   * A newly selected hand is still being prepared. Takes precedence over the
   * empty state: the panel shows placeholder cards rather than "No hand
   * selected", which would otherwise flash between two hands.
   */
  loading?: boolean;
  onSelect: (i: number) => void;
  onSelectShowdown: (i: number) => void;
  /** Jump to the board reveal of a street. */
  onSelectDeal: (street: Street) => void;
}

/**
 * Antes are six identical cards that push the actual decisions out of view, so
 * they collapse into a single summary card. Blinds stay: they set the action.
 *
 * The amount shown is the ante EACH player posted, not the sum: "ante 800" is
 * the number a player recognises from the table, whereas the 4,800 total reads
 * like a single enormous bet. The names carry the count instead.
 *
 * A mixed ante (different amounts per seat, e.g. a short stack posting less)
 * has no single per-player figure, so those are left uncollapsed.
 */
function collapseAntes(actions: readonly Action[]): Action[] {
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
  /** The poster's own action index, so the summary card can follow the replay. */
  readonly index: number;
}

/**
 * Who posted the ante, hero first. Hero leads the list because this card is
 * otherwise the one place in the log where hero is buried among five villains,
 * and truncation would drop them entirely.
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

/**
 * One event's frame. Width is bounded both ways: a floor so short actions
 * ("fold") still read as a card, a cap so a long name or amount truncates
 * rather than stretching one card across the strip.
 */
const CARD =
  'relative shrink-0 min-w-[7.5rem] max-w-[11rem] px-2 py-1.5 flex flex-col gap-1 border-2 rounded-lg transition';

/** Shows and mucks are cards of their own (from hand.showdown), not action cards. */
const notShowdown = (a: Action) => a.kind !== 'show' && a.kind !== 'muck';

/**
 * The strip sits inside the replay panel, above the felt, the way the playback
 * controls sit below it — so it has no panel chrome of its own, just the rule
 * that separates it from the felt.
 */
/** Inside a card the badge must not catch clicks meant for the card's own button. */
function PositionBadge({ position, isHero }: { position: string | undefined; isHero: boolean }) {
  return <BaseBadge position={position} isHero={isHero} className="relative pointer-events-none" />;
}

function Strip({ children }: { children: ReactNode }) {
  return <div className="border-b border-slate-800">{children}</div>;
}

function ActionLogImpl({ hand, actionIndex, awarding, showdownStep, dealtStreet, analysis, loading = false, onSelect, onSelectShowdown, onSelectDeal }: Props) {
  const unit = useDisplayStore((s) => s.unit);
  const openPlayer = usePlayerDialogStore((s) => s.open);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keep the current step in view as the replay walks the hand. Scrolls the
  // strip itself rather than calling scrollIntoView, which would also scroll
  // the column (or the page) the strip sits in.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const current = scroller?.querySelector<HTMLElement>('[data-current]');
    if (!scroller || !current) return;
    const s = scroller.getBoundingClientRect();
    const c = current.getBoundingClientRect();
    // An action that opens a street has no step for its board cards, so they
    // come into view with it: keep the card just before it on screen too.
    const prev = current.closest('li')?.previousElementSibling;
    const left = prev?.hasAttribute('data-deal') ? prev.getBoundingClientRect().left : c.left;
    const margin = 32;
    if (left < s.left + margin) {
      scroller.scrollBy({ left: left - s.left - margin, behavior: 'smooth' });
    } else if (c.right > s.right - margin) {
      scroller.scrollBy({ left: c.right - s.right + margin, behavior: 'smooth' });
    }
  }, [actionIndex, awarding, showdownStep, dealtStreet, hand, loading]);

  // A vertical wheel scrolls the strip sideways — most mice have no horizontal
  // wheel. Once the strip is at the end it scrolls towards, the wheel is left
  // alone so the column or page carries on scrolling. Registered by hand
  // because React's onWheel is passive and can't preventDefault.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = scroller.scrollWidth - scroller.clientWidth;
      if (max <= 0) return;
      const atEnd = e.deltaY > 0 ? scroller.scrollLeft >= max - 1 : scroller.scrollLeft <= 0;
      if (atEnd) return;
      e.preventDefault();
      // deltaMode 1 is lines (Firefox); treat a line as ~16px.
      scroller.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [hand, loading]);

  if (loading) {
    return (
      <Strip>
        <ScrollArea orientation="horizontal">
          <ActionLogSkeleton />
        </ScrollArea>
      </Strip>
    );
  }

  if (!hand) {
    return (
      <Strip>
        {/* Kept at the height of a row of cards, so selecting a hand doesn't
            push the felt down. The felt itself says no hand is selected. */}
        <div className="h-[4.5rem]" />
      </Strip>
    );
  }

  // Showdown and deal steps repeat the last action's index, so that action is
  // only current until the next such step starts.
  const isCurrentAction = (index: number) => !awarding && showdownStep === null && dealtStreet === null && index === actionIndex;

  const verdicts = analysis?.verdicts ?? [];
  const verdictByIndex = new Map(verdicts.map((v) => [v.actionIndex, v]));

  const openPlayerAt = (seat: number) => {
    const s = hand.seats.find((x) => x.seat === seat);
    if (s) openPlayer(playerKey(hand.meta.siteId, s.playerId));
  };

  /**
   * Name button sits over the card's own select-action button. Both are real
   * buttons rather than one nested in the other (invalid HTML) — the card
   * button is stretched to fill the card via absolute positioning, and the
   * name button sits above it with a higher stacking order and its own
   * click handler, so a click on the name opens the player and a click
   * anywhere else on the card selects the action.
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

  const renderAction = (a: Action, streetActions: readonly Action[]) => {
    const posters = a.seat === -1 ? antePosters(streetActions, hand) : null;
    const seat = hand.seats.find((s) => s.seat === a.seat);
    const verdict = verdictByIndex.get(a.index);
    // The summary card stands in for every ante, so it stays lit while the
    // replay walks the table posting them one by one.
    const isCurrent = posters ? posters.some((p) => isCurrentAction(p.index)) : isCurrentAction(a.index);
    return (
      <div
        data-current={isCurrent || undefined}
        className={`${CARD} hover:bg-slate-800/50 ${isCurrent ? 'border-slate-300' : 'border-transparent'}`}
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
        <div className="h-5 flex items-center gap-1.5 min-w-0">
          {seat && <PositionBadge position={seat.position} isHero={seat.isHero} />}
          <span
            title={posters ? posters.map((p) => p.name).join(', ') : undefined}
            className={`truncate flex items-center min-w-0 ${posters ? 'ante-posters' : ''} ${seat?.isHero ? 'text-slate-300' : 'text-slate-400'}`}
          >
            {posters
              ? posters.map((p, i) => (
                  // Each name keeps its natural width and the CARD truncates:
                  // letting the names shrink instead divides the space six
                  // ways and reduces every one to an initial.
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
        </div>
        <div className="h-5 flex items-center gap-1.5 min-w-0 pointer-events-none">
          <span className={`relative truncate ${a.kind === 'fold' ? 'text-slate-500' : 'text-slate-300'}`}>
            {describeAction(a, hand, unit)}
          </span>
          {verdict && (
            <span className="relative ml-auto shrink-0 flex">
              <VerdictIcon severity={verdict.severity} />
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Strip>
      {/* One flat row in the order the hand was played: each street's board
          cards get their own card inline, just before the actions they open,
          so the strip scrolls sideways instead of down. */}
      <div ref={scrollerRef} className="scroll-thin overflow-x-auto overflow-y-hidden">
        <ol className="flex w-max gap-1 p-1.5 text-sm">
          {hand.streets.map((street) => (
            <Fragment key={street.street}>
              {street.newCards.length > 0 && (
                <li
                  data-deal=""
                  data-current={dealtStreet === street.street || undefined}
                  className={`${CARD} min-w-0 items-center justify-center gap-1 bg-slate-800/60 hover:bg-slate-800 ${
                    dealtStreet === street.street ? 'border-slate-300' : 'border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDeal(street.street)}
                    className="absolute inset-0 rounded-lg outline-none"
                    aria-label={`Select the ${street.street}`}
                  />
                  <span className="t-label pointer-events-none">{street.street}</span>
                  <span className="flex gap-0.5 pointer-events-none">
                    {street.newCards.map((card, i) => (
                      <CardView key={i} card={card} size="sm" />
                    ))}
                  </span>
                </li>
              )}
              {collapseAntes(street.actions.filter(notShowdown)).map((a) => (
                <li key={a.index} className="flex">{renderAction(a, street.actions)}</li>
              ))}
            </Fragment>
          ))}

          {hand.showdown.map((sd, i) => {
            const seat = hand.seats.find((x) => x.seat === sd.seat);
            const current = showdownStep === i;
            return (
              <li
                key={`sd-${sd.seat}`}
                data-current={current || undefined}
                title={sd.handDescription ?? undefined}
                className={`${CARD} hover:bg-slate-800/50 ${current ? 'border-slate-300' : 'border-transparent'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectShowdown(i)}
                  className="absolute inset-0 rounded-lg outline-none"
                  aria-label={`Select ${seat?.name ?? `seat ${sd.seat}`}'s ${sd.mucked ? 'muck' : 'show'}`}
                />
                <div className="h-5 flex items-center gap-1.5 min-w-0">
                  {seat && <PositionBadge position={seat.position} isHero={seat.isHero} />}
                  {seat ? (
                    <NameButton seat={seat.seat} className={seat.isHero ? 'text-slate-300' : 'text-slate-400'}>
                      {seat.name}
                    </NameButton>
                  ) : (
                    <span className="truncate text-slate-400">{`seat ${sd.seat}`}</span>
                  )}
                </div>
                <div className="h-10 flex items-center justify-center gap-2 min-w-0 pointer-events-none">
                  {sd.mucked && <span className="relative text-slate-500">muck</span>}
                  {!sd.mucked && sd.holeCards && (
                    <span className="relative flex gap-0.5">
                      {sd.holeCards.map((c, j) => <CardView key={j} card={c} size="sm" />)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}

          {hand.awards.map((award, i) => {
            const seat = hand.seats.find((s) => s.seat === award.seat);
            return (
              <li
                key={`win-${award.seat}-${award.potLevel}-${i}`}
                data-current={awarding || undefined}
                className={`${CARD} ${awarding ? 'border-slate-300' : 'border-transparent'}`}
              >
                <div className="h-5 flex items-center gap-1.5 min-w-0">
                  {seat && <PositionBadge position={seat.position} isHero={seat.isHero} />}
                  {seat ? (
                    <NameButton seat={seat.seat} className={seat.isHero ? 'text-slate-300' : 'text-slate-400'}>
                      {seat.name}
                    </NameButton>
                  ) : (
                    <span className="truncate text-slate-400">{`seat ${award.seat}`}</span>
                  )}
                </div>
                <span className="h-5 truncate text-slate-300">
                  win {formatUnit(award.amount, hand.money, unit)}
                  {award.potLevel > 0 && (
                    <span className="text-slate-500 ml-1">(side pot {award.potLevel})</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Strip>
  );
}

/**
 * Memoised: the log rebuilds a card per action with a verdict lookup each, and
 * App re-renders on every store change (filters, display settings, an analysis
 * landing for some other hand). Without this the strip was rebuilt on renders
 * that changed none of its inputs — including the selection click, which has
 * to commit before the new hand's skeletons can paint.
 */
export const ActionLog = memo(ActionLogImpl);
