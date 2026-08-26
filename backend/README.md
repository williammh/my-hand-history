# @my-hand-history/api

Stub. **Not deployed, and nothing in the app calls it.**

`my-hand-history` is frontend-first: hand histories are parsed locally and stored
in IndexedDB, so the product works with no backend at all. This package is a
placeholder so there is an obvious, conventional home for server code when a
feature actually needs one.

```bash
npm run dev  --workspace @my-hand-history/api   # wrangler dev
npm run deploy --workspace @my-hand-history/api # when it does something
```

Right now it serves a single `GET /health` route.

## What would land here first

- **`POST /analyze`** — a real solver. `AnalysisEngine.analyze()` in the web app is
  already async and takes a JSON-serializable `Hand`, so a server engine drops in
  as a new implementation with no UI changes:

  ```ts
  export function createServerSolverEngine(opts: { baseUrl: string }): AnalysisEngine;
  ```

- **Accounts and sync** — replacing (or backing) the IndexedDB repository behind
  the existing `HandRepository` interface.

Add bindings (D1, R2, KV) in `wrangler.jsonc` and type them on `Env` in
`src/index.ts` as they are introduced.

## Shared code

Nothing is shared with the frontend yet. If that need arises, add a
`packages/` workspace for it rather than importing directly between the two.
