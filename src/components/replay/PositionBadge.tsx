/** The seat's position as a small badge — the same chip in the action strip and the analysis. */
export function PositionBadge({
  position, isHero, className = '',
}: {
  position: string | undefined;
  isHero: boolean;
  className?: string;
}) {
  return (
    <span className={`w-9 shrink-0 text-center t-chip border border-slate-600 rounded-sm bg-slate-700 px-1 py-0.5 ${isHero ? 'text-slate-100' : 'text-slate-300'} ${className}`}>
      {position}
    </span>
  );
}
