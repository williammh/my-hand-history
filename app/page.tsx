import { AppShell } from './app-shell';

/**
 * The app is client-only by construction: hand histories live in IndexedDB and
 * display preferences in localStorage, neither of which exists on the server.
 * There is nothing to render before the user drops a file, so this page is a
 * thin server component whose only job is to mount the client shell.
 */
export default function Page() {
  return <AppShell />;
}
