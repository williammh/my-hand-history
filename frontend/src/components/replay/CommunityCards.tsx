import type { Board } from '@/domain/cards.js';
import { CardView } from './CardView.js';

/**
 * "Turn" and "River" are each wider than the single 1.75rem card they label, so
 * at full t-label size they collide with one another. Dropping a step to 9px and
 * shedding t-label's 0.09em tracking buys back enough width for them to sit
 * side by side; "River" still overhangs its column by ~2px on each side, which
 * the board's padding absorbs without pushing past the border.
 */
const LABEL = 'text-center text-[9px] font-semibold uppercase leading-none tracking-tight text-slate-500';

/**
 * Board split into Flop / Turn / River groups, revealed as streets arrive.
 *
 * Both rows share ONE 5-column grid (one column per card slot, w-7 = 1.75rem)
 * with a single gap, so every card is equidistant from its neighbours no matter
 * which street it belongs to — the flop→turn and turn→river boundaries get the
 * same gap as any other pair. Each label spans the columns of its own street and
 * centres within them, so alignment holds without hard-coding label widths.
 *
 * The grid reserves all 5 columns AND both rows up front (the card row is
 * pinned to the sm CardView height, 2.5rem) so the panel doesn't jump as the
 * replay advances — undealt cards simply aren't rendered yet, leaving blank
 * space rather than a card-back placeholder, and the row doesn't collapse to
 * 0 height before any cards exist.
 */
export function CommunityCards({ board }: { board: Board }) {
  return (
    <div className="w-fit shrink-0 rounded border border-slate-700/60 bg-black/25 px-1.5 py-1">
      <div className="grid grid-cols-[repeat(5,1.75rem)] grid-rows-[auto_2.5rem] gap-x-1.5 gap-y-1">
        <div className={`col-span-3 ${LABEL}`}>Flop</div>
        <div className={`col-span-1 ${LABEL}`}>Turn</div>
        <div className={`col-span-1 ${LABEL}`}>River</div>

        {board.map((card, i) => (
          <CardView key={i} card={card} size="sm" />
        ))}
      </div>
    </div>
  );
}
