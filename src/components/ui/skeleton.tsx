import { cn } from "cn"

/**
 * The app renders on a fixed dark palette (slate-950 page, slate-900/60
 * panels) and never sets shadcn's `.dark` class, so `--muted` resolves to its
 * light `:root` value — the stock `bg-muted` skeleton would be near-white.
 * The default tone is a slate that sits just above the panel fill instead;
 * `cn` still lets a caller override it with their own `bg-*`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-slate-800/70", className)}
      {...props}
    />
  )
}

export { Skeleton }
