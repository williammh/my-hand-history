import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { validateHand } from '@/parsers/shared/validate';

const samplePath = fileURLToPath(new URL('../fixtures/betclic/knockout.txt', import.meta.url));
const sample = readFileSync(samplePath, 'utf8');
const parsed = registry.parseFile(sample, 'betclic-fr', 'knockout.txt');
const [bountyHand, droppedBetHand, keptSidePotHand] = parsed.hands;

describe('Betclic parser — knockout (SKO) exports', () => {
  it('parses every hand with no failures or warnings', () => {
    expect(parsed.hands).toHaveLength(3);
    expect(parsed.failures).toEqual([]);
    for (const h of parsed.hands) expect(h.warnings).toEqual([]);
  });

  it('reads seats that carry a bounty: "Seat 1: SIMBAROI (40960, €5.00 bounty)"', () => {
    expect(bountyHand!.seats).toHaveLength(6);
    const hero = bountyHand!.seats.find((s) => s.isHero)!;
    expect(hero.name).toBe('SIMBAROI');
    expect(hero.startingStack).toBe(40960);
    expect(hero.declaredPosition).toBe('BTN');
  });

  it('ignores bounty summary lines without mistaking them for pot awards', () => {
    expect(bountyHand!.awards.map((a) => a.amount)).toEqual([5744, 6400]);
    expect(validateHand(bountyHand!)).toEqual([]);
  });
});

describe('Betclic parser — uncalled bets over an all-in', () => {
  it('returns a lone river bet over a flop all-in, as Betclic drops it from the pot', () => {
    // fredo47 is all-in on the flop; sakal bets 401700 on the river and
    // Saintpierrai folds. The reported total (173256) excludes the bet.
    const ret = droppedBetHand!.actions.find((a) => a.kind === 'uncalled-return');
    expect(ret?.seat).toBe(2); // sakal
    expect(ret?.amount).toBe(401700);
    expect(droppedBetHand!.pots.total).toBe(droppedBetHand!.reportedTotalPot);
    expect(validateHand(droppedBetHand!)).toEqual([]);
  });

  it('keeps the excess when folders also paid into that layer', () => {
    // just1fishou is all-in for 350; SIMBAROI raises to 11750 over two limpers
    // who fold. Betclic awards the excess as a 11700 side pot.
    expect(keptSidePotHand!.actions.some((a) => a.kind === 'uncalled-return')).toBe(false);
    expect(keptSidePotHand!.pots.total).toBe(13400);
    expect(validateHand(keptSidePotHand!)).toEqual([]);
  });
});
