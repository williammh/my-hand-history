/**
 * my-hand-history API — stub.
 *
 * The product is frontend-first: hand histories are parsed and stored entirely
 * in the browser, and nothing here is required for the app to work today.
 * This Worker exists so the backend has a home when it is needed.
 *
 * Likely first responsibilities (see README):
 *   - POST /analyze  — server-side solver behind the existing AnalysisEngine
 *                      interface (frontend/src/analysis/engine.ts)
 *   - accounts / cross-device sync of the IndexedDB store
 */

export interface Env {
  // Bindings are declared in wrangler.jsonc and typed here as they are added.
  // DB: D1Database;
  // HAND_FILES: R2Bucket;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      return json({ status: 'ok', service: 'my-hand-history-api' });
    }

    return json({ error: 'Not found', path: pathname }, 404);
  },
} satisfies ExportedHandler<Env>;
