import type { Hand } from '@/domain/hand.js';
import type { Action } from '@/domain/action.js';
import type { HandAnalysis, DecisionVerdict } from '@/analysis/types.js';
import { formatUnit } from '@/lib/format.js';
import { useDisplayStore } from '@/state/display-store.js';
import { VerdictIcon } from '@/components/analysis/VerdictBadge.js';
import { ScrollArea } from '@/components/ui/ScrollArea.js';
import { CardView } from '@/components/replay/CardView.js';

interface Props {
  hand: Hand;
  actionIndex: number;
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

interface AntePoster {
  readonly name: string;
  readonly isHero: boolean;
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
      return { name: seat?.name ?? `seat ${a.seat}`, isHero: seat?.isHero ?? false };
    });
  return [...posters].sort((a, b) => Number(b.isHero) - Number(a.isHero));
}

export function ActionLog({ hand, actionIndex, analysis, pending, onSelect }: Props) {
  const unit = useDisplayStore((s) => s.unit);
  const verdicts = analysis?.verdicts ?? [];
  const verdictByIndex = new Map(verdicts.map((v) => [v.actionIndex, v]));

  const renderVerdictRow = (a: Action, verdict: DecisionVerdict, seatName: string, position: string) => {
    const isCurrent = a.index === actionIndex;
    return (
      <button
        key={a.index}
        onClick={() => onSelect(a.index)}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 border-2 rounded-lg transition hover:bg-slate-800/50 ${
          isCurrent ? 'border-slate-300' : 'border-transparent'
        }`}
      >
        <span className="w-9 shrink-0 flex justify-center">
          <span className="w-9 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 text-slate-300">
            {position}
          </span>
        </span>
        <span className="truncate text-slate-300">{seatName}</span>
        <span className="ml-auto shrink-0 text-slate-400">
          {a.isAllIn
            ? `all-in${a.amount > 0 ? ` ${formatUnit(a.amount, hand.money, unit)}` : ''}`
            : `${a.kind.replace('post-', '')}${a.amount > 0 ? ` ${formatUnit(a.amount, hand.money, unit)}` : ''}`}
        </span>
        <span className="w-[18px] shrink-0 flex justify-center">
          <VerdictIcon severity={verdict.severity} />
        </span>
      </button>
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
                return renderVerdictRow(a, verdict, seat.name, seat.position);
              }
              const isCurrent = a.index === actionIndex;
              return (
                <button
                  key={a.index}
                  onClick={() => a.seat !== -1 && onSelect(a.index)}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 border-2 rounded-lg transition hover:bg-slate-800/50 ${
                    isCurrent ? 'border-slate-300' : 'border-transparent'
                  }`}
                >
                  <span className="w-9 shrink-0 flex justify-center">
                    {seat && (
                      <span className={`w-9 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 ${seat.isHero ? 'text-slate-100' : 'text-slate-300'}`}>
                        {seat.position}
                      </span>
                    )}
                  </span>
                  <span
                    title={posters ? posters.map((p) => p.name).join(', ') : undefined}
                    className={`truncate ${seat?.isHero ? 'text-slate-300' : 'text-slate-400'}`}
                  >
                    {posters
                      ? posters.map((p, i) => (
                          <span key={p.name} className={p.isHero ? 'text-slate-300' : undefined}>
                            {i > 0 && <span className="text-slate-400">, </span>}
                            {p.name}
                          </span>
                        ))
                      : seat?.name}
                  </span>
                  <span className={`ml-auto shrink-0 ${a.kind === 'fold' ? 'text-slate-500' : 'text-slate-400'}`}>
                    {a.isAllIn
                      ? `all-in${a.amount > 0 ? ` ${formatUnit(a.amount, hand.money, unit)}` : ''}`
                      : `${a.kind.replace('post-', '')}${a.amount > 0 ? ` ${formatUnit(a.amount, hand.money, unit)}` : ''}`}
                  </span>
                  <span className="w-[18px] shrink-0" />
                </button>
              );
            })}
          </li>
        ))}

        {hand.awards.map((award, i) => {
          const seat = hand.seats.find((s) => s.seat === award.seat);
          return (
            <div
              key={`win-${award.seat}-${award.potLevel}-${i}`}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 border-2 border-transparent"
            >
              <span className="w-9 shrink-0 flex justify-center">
                {seat && (
                  <span className={`w-9 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 ${seat.isHero ? 'text-slate-100' : 'text-slate-300'}`}>
                    {seat.position}
                  </span>
                )}
              </span>
              <span className={`truncate ${seat?.isHero ? 'text-slate-300' : 'text-slate-400'}`}>
                {seat?.name ?? `seat ${award.seat}`}
              </span>
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
