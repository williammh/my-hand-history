import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { useHandsStore } from '@/state/hands-store.js';

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(url(p), 'utf8');

const SESSION_A = { text: read('../fixtures/betclic/sample.txt'), fileName: 'session-a.txt' };
const SESSION_B = { text: read('../fixtures/betclic/deep-3bet.txt'), fileName: 'session-b.txt' };

const store = () => useHandsStore.getState();

beforeEach(async () => {
  await store().clearAll();
  useHandsStore.setState({ siteId: 'betclic-fr' });
});

describe('importing several files at once', () => {
  it('keeps the hands from every file in one import', async () => {
    await store().importFiles([SESSION_A, SESSION_B]);

    const files = new Set(store().hands.map((h) => h.meta.sourceFile));
    expect(files).toEqual(new Set(['session-a.txt', 'session-b.txt']));
  });

  it('reports on each file separately as well as in total', async () => {
    await store().importFiles([SESSION_A, SESSION_B]);
    const report = store().report!;

    expect(report.files.map((f) => f.fileName)).toEqual(['session-a.txt', 'session-b.txt']);
    expect(report.parsed).toBe(report.files.reduce((n, f) => n + f.parsed, 0));
    expect(report.parsed).toBe(store().hands.length);
    expect(report.added).toBe(report.parsed);
  });

  it('MERGES into the library rather than replacing it', async () => {
    await store().importFiles([SESSION_A]);
    const first = store().hands.length;

    await store().importFiles([SESSION_B]);

    expect(store().hands.length).toBeGreaterThan(first);
    expect(new Set(store().hands.map((h) => h.meta.sourceFile)))
      .toEqual(new Set(['session-a.txt', 'session-b.txt']));
  });

  it('sorts the merged library newest first', async () => {
    await store().importFiles([SESSION_A, SESSION_B]);
    const dates = store().hands.map((h) => h.meta.playedAt);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it('does not duplicate a file imported twice', async () => {
    await store().importFiles([SESSION_A]);
    const after = store().hands.length;

    await store().importFiles([SESSION_A]);

    expect(store().hands.length).toBe(after);
    // Nothing was new the second time round, and the report says so.
    expect(store().report!.added).toBe(0);
    expect(store().report!.parsed).toBe(after);
  });

  it('keeps the current selection across an import that preserves it', async () => {
    await store().importFiles([SESSION_A]);
    const pinned = store().hands.at(-1)!.id;
    store().select(pinned);

    await store().importFiles([SESSION_B]);

    expect(store().selectedId).toBe(pinned);
  });

  it('selects the newest hand when there was no prior selection', async () => {
    await store().importFiles([SESSION_A]);
    expect(store().selectedId).toBe(store().hands[0]!.id);
  });

  it('survives a file that parses to nothing, keeping the others', async () => {
    await store().importFiles([
      SESSION_A,
      { text: 'not a hand history at all', fileName: 'junk.txt' },
    ]);

    const report = store().report!;
    expect(report.files).toHaveLength(2);
    expect(report.files[1]!.parsed).toBe(0);
    expect(report.files[1]!.fileWarnings.length).toBeGreaterThan(0);
    // The good file still landed.
    expect(store().hands.length).toBe(report.files[0]!.parsed);
    expect(store().hands.length).toBeGreaterThan(0);
  });

  it('ignores an empty drop', async () => {
    await store().importFiles([SESSION_A]);
    const before = store().hands.length;

    await store().importFiles([]);

    expect(store().hands.length).toBe(before);
    // An empty drop is a no-op, not a fresh report.
    expect(store().report!.files).toHaveLength(1);
  });

  it('clears the whole library', async () => {
    await store().importFiles([SESSION_A, SESSION_B]);
    await store().clearAll();

    expect(store().hands).toEqual([]);
    expect(store().selectedId).toBeNull();
    expect(store().report).toBeNull();
  });
});
