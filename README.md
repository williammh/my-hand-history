# My Hand History

Upload a poker hand history, replay it visually, and see where hero deviated from GTO.

**Runs entirely in the browser.** No backend, no accounts, no upload — hand histories
are parsed locally and stored in IndexedDB on your own device.

```bash
npm install       # installs all workspaces
npm run dev       # http://localhost:5173
npm test          # 189 tests
npm run build     # static site in frontend/dist/
npm run deploy    # build + wrangler deploy (Cloudflare Workers)
```

## Layout

npm workspaces. Frontend-first — the app is complete without a server.

```
frontend/    The app. React + Vite, deployed to Cloudflare Workers static assets.
backend/     Stub. Nothing calls it yet; see backend/README.md.
samples/     Example hand history exports.
```

Target a single workspace with `--workspace @my-hand-history/frontend` (or `/backend`).

## What it does

- **Parses** Betclic.fr and Winamax tournament hand histories (multi-hand files).
  Drop in several files at once — hands accumulate into one library, deduped on
  hand id, so re-importing a file you already loaded changes nothing.
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
frontend/src/domain/     Pure types and math. Imports nothing from parsers or analysis.
frontend/src/parsers/    Site-specific text -> domain model. Only the registry is imported outward.
frontend/src/analysis/   Domain model -> verdicts. Takes a Hand and nothing else.
```

### Adding a poker room

Implement `SiteParser` (`frontend/src/parsers/types.ts`) and register it in
`frontend/src/parsers/index.ts`. Its radio button appears automatically. Shared helpers
handle the parts that are the same everywhere:

- `shared/text.ts` — encoding repair
- `shared/commitment-ledger.ts` — bet-amount reconciliation
- `shared/validate.ts` — pot checksums and sanity checks
- `domain/position.ts` — position derivation from the button

The registry owns error containment, so one malformed hand never costs the user
the rest of the file.

### Swapping in a real solver

`AnalysisEngine.analyze()` is async and takes a JSON-serializable `Hand`, so a
server-side solver drops in as a new implementation with no changes to the UI —
this is what `backend/` is reserved for:

```ts
export function createServerSolverEngine(opts: { baseUrl: string }): AnalysisEngine;
```

## Format notes

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
(453766 / 16800 / 108800).

## Limitations

- Preflop charts cover 6-max unopened pots from 5–25bb. Facing a raise, deeper
  stacks, and other table sizes are skipped with a stated reason.
- Postflop heuristics estimate equity against a *random* hand, which flatters
  hero versus a real betting range. They flag only large errors, and are labeled
  low-confidence throughout.
- Only calls are judged postflop. Bets and raises need fold-equity modeling that
  belongs in a solver.
