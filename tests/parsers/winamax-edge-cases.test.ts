import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { validateHand } from '@/parsers/shared/validate';

const samplePath = fileURLToPath(new URL('../fixtures/winamax/synthetic-edge-cases.txt', import.meta.url));
const sample = readFileSync(samplePath, 'utf8');
const parsed = registry.parseFile(sample, 'winamax', 'synthetic-edge-cases.txt');
const [allInShowdown, uncalledBetHand] = parsed.hands;

describe('Winamax parser — tournament chip amounts', () => {
  it('parses with no failures', () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.hands).toHaveLength(2);
  });

  it('treats tournament amounts as whole chips, not cents', () => {
    expect(allInShowdown!.money.currency).toBe('CHIPS');
    expect(allInShowdown!.money.exponent).toBe(0);
    expect(allInShowdown!.money.smallBlind).toBe(10);
    expect(allInShowdown!.money.bigBlind).toBe(20);
    expect(allInShowdown!.seats.find((s) => s.name === 'Alice')!.startingStack).toBe(2000);
  });

  it('reads the tournament name and buy-in from the header', () => {
    expect(allInShowdown!.meta.tournament?.name).toBe('Kill The Fish');
    expect(allInShowdown!.meta.tournament?.buyIn).toBe(500);
    expect(allInShowdown!.meta.tournament?.fee).toBe(50);
  });

  it('reads both showdown hands', () => {
    expect(allInShowdown!.showdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ holeCards: ['Ah', 'Kh'], handDescription: 'High Card : Ace' }),
        expect.objectContaining({ holeCards: ['Ks', 'Qs'], handDescription: 'High Card : King' }),
      ]),
    );
  });

  it('reconciles the pot checksum for an all-in showdown', () => {
    expect(allInShowdown!.pots.total).toBe(allInShowdown!.reportedTotalPot);
    expect(validateHand(allInShowdown!)).toEqual([]);
  });
});

describe('Winamax parser — explicit uncalled bet return', () => {
  it('parses the "returned uncalled bet of N" line', () => {
    const ret = uncalledBetHand!.actions.find((a) => a.kind === 'uncalled-return');
    expect(ret).toBeTruthy();
    expect(ret!.amount).toBe(20);
    expect(ret!.playerId).toBe('alice');
  });

  it('reconciles the pot checksum with the uncalled return applied', () => {
    expect(uncalledBetHand!.pots.total).toBe(uncalledBetHand!.reportedTotalPot);
    expect(validateHand(uncalledBetHand!)).toEqual([]);
  });

  it('flags both players all-in', () => {
    const allInActions = uncalledBetHand!.actions.filter((a) => a.isAllIn);
    expect(allInActions.map((a) => a.playerId).sort()).toEqual(['alice', 'bob']);
  });
});
