'use client';

import dynamic from 'next/dynamic';

/**
 * SSR is disabled rather than merely deferred. The display store reads
 * localStorage at module scope to seed its initial state, so a server render
 * would produce markup built from defaults and then disagree with the client's
 * first render — a hydration mismatch on every visit where a preference is set.
 * Skipping the server render entirely is correct here, not a workaround: there
 * is no meaningful pre-file-drop content to stream.
 */
const App = dynamic(() => import('@/App').then((m) => m.App), { ssr: false });

export function AppShell() {
  return <App />;
}
