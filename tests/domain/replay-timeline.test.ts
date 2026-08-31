import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registry } from '@/parsers/index';
import { replayTimeline } from '@/domain/stacks';

/**
 * Regression fixture for the reported bug: an all-in preflop run-out never
 * showed the flop/turn/river in the replay panel. SIMBAROI shoves 52157
 * preflop, Kamaz calls, and every remaining street is dealt with no further
 * action — the exact shape that broke the old "board of the current action's
 * street" lookup.
 */
const samplePath = fileURLToPath(
  new URL('../../samples/55003941_ExportHH_2025-7-16.txt', import.meta.url),
);
const parsed = registry.parseFile(readFileSync(samplePath, 'utf8'), 'betclic-fr', 'sample.txt');
const hand = parsed.hands.find((h) => h.actions.some((a) => a.amount === 52157));

describe('replayTimeline — all-in preflop run-out', () => {
  it('finds the fixture hand', () => {
    expect(hand).toBeDefined();
  });

  it('parses flop, turn and river as actionless streets with the full board', () => {
    const flop = hand!.streets.find((s) => s.street === 'flop')!;
    const turn = hand!.streets.find((s) => s.street === 'turn')!;
    const river = hand!.streets.find((s) => s.street === 'river')!;
    expect(flop.actions).toHaveLength(0);
    expect(turn.actions).toHaveLength(0);
    expect(river.actions).toHaveLength(0);
    expect(flop.board).toEqual(['Ks', '7s', '8c']);
    expect(turn.board).toEqual(['Ks', '7s', '8c', 'Ts']);
    expect(river.board).toEqual(['Ks', '7s', '8c', 'Ts', 'Jh']);
  });

  it('adds a card-only step per run-out street instead of skipping straight to the end', () => {
    const timeline = replayTimeline(hand!);
    const dealSteps = timeline.filter((s) => s.dealt !== null);
    expect(dealSteps.map((s) => s.dealt)).toEqual(['flop', 'turn', 'river']);
    // Each deal step reuses the last action's index — no chips moved since.
    const lastActionIndex = hand!.actions[hand!.actions.length - 1]!.index;
    for (const step of dealSteps) expect(step.actionIndex).toBe(lastActionIndex);
  });

  it('reveals the board progressively across those steps, ending at the full board', () => {
    const timeline = replayTimeline(hand!);
    const boards = timeline.filter((s) => s.dealt !== null).map((s) => s.board);
    expect(boards).toEqual([
      ['Ks', '7s', '8c'],
      ['Ks', '7s', '8c', 'Ts'],
      ['Ks', '7s', '8c', 'Ts', 'Jh'],
    ]);
    expect(timeline[timeline.length - 1]!.board).toEqual(['Ks', '7s', '8c', 'Ts', 'Jh']);
  });

  it('keeps a live-action hand on one step per action with no extra deal steps', () => {
    // Sanity check the same fixture file's ordinary (non-all-in) hands aren't
    // regressed: a hand where every dealt street also has action shouldn't
    // grow any card-only steps.
    const ordinary = parsed.hands.find((h) =>
      h.streets.every((s) => s.newCards.length === 0 || s.actions.length > 0),
    );
    expect(ordinary).toBeDefined();
    const timeline = replayTimeline(ordinary!);
    expect(timeline.filter((s) => s.dealt !== null)).toHaveLength(0);
    expect(timeline).toHaveLength(ordinary!.actions.length + 1);
  });
});
