# My Hand History

Upload a poker hand history, replay it visually, and see where hero deviated from GTO.

**Parsing and storage happen entirely in the browser.** No accounts, no upload —
hand histories are parsed locally and stored in IndexedDB on your own device.
The Next.js server renders the page shell and nothing else; no hand history is
ever sent to it.

```bash
npm install       # installs dependencies
npm run dev       # http://localhost:3000
npm test          # 340 tests
npm run build     # next build
npm run start     # serve the production build locally
```

## Layout

A single Next.js app at the repo root — the standard `create-next-app` shape.

```
app/         Next App Router entry.
src/         Domain logic, parsers, analysis, UI components, state.
public/      Static assets (preflop charts).
samples/     Example hand history exports.
```

## What it does

- **Parses** Betclic.fr, Winamax, PokerStars, GGPoker, 888poker/PacificPoker,
  CoinPoker and WPT Global hand histories — cash games, tournaments and Spin &
  Gold sit & gos, multi-hand files.
  A room that ships the PokerStars format under a name this project has never
  heard of is parsed too, as a fallback. Drop in several files at once — each
  file is sniffed independently, and hands accumulate into one library, deduped
  on hand id, so re-importing a file you already loaded changes nothing.
- **Replays** each hand action by action — stacks, pot, board, and chips in front,
  scrubbable with the slider or arrow keys.
- **Analyzes** hero's decisions: preflop against Nash push/fold charts, postflop
  against pot-odds-versus-equity heuristics.
- **Filters** the library by spot — pot type, positions, stack depth, line, board
  texture — and by where the hands came from: poker room and source file. Since
  a library can now pool several sessions, those two axes are what scope it back
  down to one.

Every verdict is tagged with its confidence — `CHART` for chart lookups, `HEURISTIC`
for pot-odds estimates — so the two are never confused. Spots the engine cannot judge
well are listed as "not judged" with a reason rather than guessed at.

## Architecture

```
app/            Next App Router entry. Thin: a layout, a page, and the client shell.
src/domain/     Pure types and math. Imports nothing from parsers or analysis.
src/parsers/    Site-specific text -> domain model. Only the registry is imported outward.
src/analysis/   Domain model -> verdicts. Takes a Hand and nothing else.
```

### Why the app is client-rendered

`app/page.tsx` mounts `AppShell`, which imports the app with `ssr: false`. That is
deliberate, not a workaround. Hand histories live in IndexedDB and display
preferences in `localStorage`, neither of which exists on the server, and the
display store reads `localStorage` at module scope to seed its initial state — a
server render would build markup from defaults and then disagree with the client
on hydration. There is also nothing to render before the user drops a file.

`'use client'` is confined to `src/components/` and `src/state/`. The
domain, parser, analysis, and filter layers carry no directive and import no
browser API, so they can be imported from server components unchanged whenever
a server surface is added.

### Adding a poker room

Implement `SiteParser` (`src/parsers/types.ts`) and register it in
`src/parsers/index.ts`. Its radio button appears automatically. Shared helpers
handle the parts that are the same everywhere:

- `shared/text.ts` — encoding repair
- `shared/commitment-ledger.ts` — bet-amount reconciliation
- `shared/validate.ts` — pot checksums and sanity checks
- `domain/position.ts` — position derivation from the button

The registry owns error containment, so one malformed hand never costs the user
the rest of the file.

If the room emits a format an existing parser already reads, do not copy the
parser — there are two lighter options:

- **The room names itself in the header**, as CoinPoker and WPT Global do. Add
  the brand word to `sites/pokerstars/brands.ts` and register one more instance
  via `createPokerStarsFamilyParser`; the shared body stamps the right `SiteId`
  onto each hand from that hand's own header.
- **The room does not name itself**, as GGPoker does not. Register an instance
  with a `detectFile` hook that recognizes whatever does identify it, and a
  `FormatFamily` if the room needs the body to behave differently anywhere.

### Swapping in a real solver

`AnalysisEngine.analyze()` is async and takes a JSON-serializable `Hand`, so a
server-side solver drops in as a new implementation with no changes to the UI.
It lands as a Route Handler — `app/api/analyze/route.ts` — called from
a new `AnalysisEngine`:

```ts
export function createServerSolverEngine(opts: { baseUrl: string }): AnalysisEngine;
```

A solve is CPU-heavy, so the route should stay on the Node runtime (the
default) rather than edge; if a real solver ever needs more than a Vercel
function affords, that is a deploy-target change for that one route, not an
architecture change.

## Format notes

### Amount semantics differ by room — and getting them wrong is silent

Every room writes bet amounts in its own convention, and the difference never
shows up as a parse error: it shows up as wrong pot-odds verdicts. Each parser
reconciles its room's convention into `Action.amount` (always a delta) via
`CommitmentLedger`, and the pot checksum test is what proves it.

| Room | `raises` | `calls` / `bets` |
| --- | --- | --- |
| PokerStars family (incl. GGPoker) | `raises 5000 to 10000` — **10000 is the street total** | delta |
| Winamax | `raises 0.05€ to 0.10€` — total | delta |
| Betclic | `Raises to 16000` — total | delta |
| 888poker | `raises [550]` — **a delta**, added to what is already out | delta |

888 is the odd one out, and it is not a guess: all six readings of
(raise, call) x (delta, total) were replayed against the eight hands of the
Pacific sample and checked against each hand's printed `collected` figure.
Delta/delta is the only reading that reconciles all eight. The nearest rival
misses two hands by exactly one player's prior commitment — 1156 vs 1056 and
1389 vs 1289 — which is precisely the error that would flatter every
pot-odds call the analyzer judges.

### Other per-room quirks the parsers handle

- **888 prints no "uncalled bet returned" line**, though the chips are returned
  all the same. The parser synthesizes the return from the last street's
  commitments; without it every pot overstates by the excess.
- **888 has no "Total pot" line and no rake line**, so the awarded chips are
  used as the reported total — which works precisely because rake is absent.
- **888 dates are day-first** (`02 08 2026` is 2 August) and carry no timezone.
- **PokerStars stamps a timezone abbreviation** (`ET`) that is ambiguous by
  date. The wall-clock time is kept as printed and the zone recorded in
  `timezoneNote`, rather than converted with a guessed offset.
- **`Dealt to` moves**: tournament exports print it above `*** HOLE CARDS ***`,
  cash exports below. Both regions are scanned.
- **A declared button seat can be empty** when a player busted. The button
  falls back to the nearest occupied seat walking backwards, since falling back
  to the lowest seat would rotate every position on the table.

### Rooms that share the PokerStars format

CoinPoker, WPT Global and GGPoker emit the PokerStars hand body verbatim, and
other rooms license the same client. The brand word in the header is therefore
a capture group, not a literal, and `sites/pokerstars/brands.ts` maps it to a
room:

- A **recognized** clone keeps its own `SiteId` (`coinpoker`, `wpt-global`).
- An **unrecognized** room is still parsed, under the shared `pokerstars-like`
  id, keeping the display name the file gave — and each hand carries a warning
  saying the fallback was used and which room it saw.

**GGPoker is the exception that is not a brand entry.** Its header brand word
is the bare word `Poker`, which names no room at all, so it would otherwise be
read as a room literally called "Poker" and filed under the fallback. What
identifies it is the hand-id prefix — `RC` Rush & Cash, `SG` Spin & Gold, `TM`
tournament, `HD` cash — so it is registered as its own parser with a
`detectFile` hook, sharing the same body via `FormatFamily`.

Three GGPoker details the shared body handles for every room, since nothing
else in the family emits a line that collides with them:

- **`Spin & Gold $5.00 ($4.65+$0.35)`** must be matched *before* the generic
  cash header, which would otherwise read the buy-in split as the blinds — a
  parse that looks perfectly fine and is completely wrong. It is the only
  `sit-n-go` any parser here produces.
- **A Spin & Gold header carries no blinds**, so they are recovered from the
  posted small and big blind. Everything downstream is denominated in big
  blinds, so leaving them at zero would silently disable every stack-depth and
  sizing judgement on the hand.
- **The winner is announced only in the summary**, as `won ($23.50)`, where
  PokerStars writes `collected N` in the body. Both spellings are read, guarded
  so a room printing both does not record the award twice.

Filing an unknown room's hands under `pokerstars` would be worse than it looks:
player identity is `${siteId}:${playerId}`, so it would silently pool two
different players who happen to share a screen name. The fallback's detection
confidence (0.55) sits below every real parser's (0.99) so it can never win a
file another parser recognizes.

### Betclic

Two things about Betclic's format that the parser handles and that any new parser
should be checked against:

- **Encoding.** The file is valid UTF-8 whose characters are already mojibake
  (`5.00â‚¬`), double-encoded upstream. It is **cp1252**, not latin-1 — a latin-1
  round-trip throws, because `U+201A` has no latin-1 byte. Repair happens at the
  string level, guarded so correctly-encoded names like `Sébastien` pass through.
- **Amount semantics are mixed within a single street.** `Bets`/`Calls`/`Posts`
  are deltas; `Raises to N` is an absolute street total. On hand 3's turn:
  `Bets 8000` → `Raises to 16000` → `Calls 8000`, leaving hero at 16000 committed.
  Reading that last call as a total would make every pot-odds verdict wrong.

The pot checksum test guards both: all three sample hands reconcile exactly
(453766 / 16800 / 108800). Every room gets the same guard — the PokerStars
sample reconciles across all 10 hands, the 888 sample across all 8, and every
GGPoker fixture across cash, Spin & Gold and tournament.

On rake, the two families reach the same place by different routes, so neither
needs an adjustment before the checksum: PokerStars' printed `Total pot` is
already the contested chips, and GGPoker's satisfies
`Total pot = collected + rake` because its rake comes out of the winner's
collect. Winamax is the one room whose printed total is net, and its parser
adds the rake back.

## Limitations

- Preflop charts cover 6-max unopened pots from 5–25bb. Facing a raise, deeper
  stacks, and other table sizes are skipped with a stated reason.
- Postflop heuristics estimate equity against a *random* hand, which flatters
  hero versus a real betting range. They flag only large errors, and are labeled
  low-confidence throughout.
- Only calls are judged postflop. Bets and raises need fold-equity modeling that
  belongs in a solver.
