import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index.js';
import { validateHand } from '@/parsers/shared/validate.js';

const samplePath = fileURLToPath(
  new URL('../fixtures/betclic/showdown-and-edge-cases.txt', import.meta.url),
);
const sample = readFileSync(samplePath, 'utf8');
const parsed = registry.parseFile(sample, 'betclic-fr', 'showdown-and-edge-cases.txt');
const [showdownHand, headsUpHand, uncalledHand, sidePotHand] = parsed.hands;

describe('Betclic parser — *** SHOWDOWN *** section', () => {
  it('parses hands with no failures or warnings', () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.fileWarnings).toEqual([]);
    for (const h of parsed.hands) expect(h.warnings).toEqual([]);
  });

  it('reads revealed hole cards and hand descriptions into showdown[]', () => {
    expect(showdownHand!.showdown).toEqual([
      {
        seat: 4, // Kamaz
        holeCards: ['Ah', 'Th'],
        mucked: false,
        handDescription: 'Three of a Kind',
      },
      {
        seat: 5, // SIMBAROI
        holeCards: ['4d', '9s'],
        mucked: false,
        handDescription: 'Pair',
      },
    ]);
  });

  it('does not require a showdown reveal to also appear under *** HOLE CARDS ***', () => {
    // Betclic lists every hand that reaches showdown under *** HOLE CARDS ***
    // too, but showdown[] must be populated from the *** SHOWDOWN *** section
    // itself rather than depending on that duplication.
    const villain = sidePotHand!.seats.find((s) => s.name === 'carréra63')!;
    expect(villain.holeCards).toEqual(['Qs', 'Ks']);
    expect(sidePotHand!.showdown.find((s) => s.seat === villain.seat)).toEqual({
      seat: villain.seat,
      holeCards: ['Qs', 'Ks'],
      mucked: false,
      handDescription: 'Straight',
    });
  });
});

describe('Betclic parser — table/session noise', () => {
  it('ignores "Sits out" lines without flagging them as unparsed', () => {
    // DrFullHouse sits out mid-hand in the fixture; that must not surface as a
    // parse warning or get treated as a game action.
    expect(showdownHand!.warnings).toEqual([]);
    expect(showdownHand!.actions.some((a) => a.raw.includes('Sits out'))).toBe(false);
  });
});

describe('Betclic parser — heads-up BTN/SB seat tag', () => {
  it('keeps BTN as the declared position when a seat is tagged "[BTN SB]"', () => {
    const btn = headsUpHand!.seats.find((s) => s.name === 'SIMBAROI')!;
    expect(btn.declaredPosition).toBe('BTN');
    expect(headsUpHand!.buttonSeat).toBe(btn.seat);
  });

  it('does not flag BTN-vs-SB as a position mismatch heads-up', () => {
    expect(headsUpHand!.warnings).toEqual([]);
  });
});

describe('Betclic parser — unprinted uncalled bet', () => {
  it('infers the missing uncalled-return when Betclic omits the line', () => {
    // SIMBAROI raises to 540 all-in; nezrouges can only call up to 530. Betclic
    // does not print a "Returns uncalled bet" line for the 10-chip excess.
    const ret = uncalledHand!.actions.find((a) => a.kind === 'uncalled-return');
    expect(ret).toBeTruthy();
    expect(ret!.seat).toBe(3); // SIMBAROI
    expect(ret!.amount).toBe(10);
  });

  it('reconciles the pot checksum after inferring the return', () => {
    expect(uncalledHand!.pots.total).toBe(uncalledHand!.reportedTotalPot);
    expect(validateHand(uncalledHand!)).toEqual([]);
  });
});

describe('Betclic parser — ordinal side-pot summary lines', () => {
  it('parses "wins 1st side pot of N" (ordinal before "side pot")', () => {
    const sidePotAward = sidePotHand!.awards.find((a) => a.potLevel === 1);
    expect(sidePotAward).toBeTruthy();
    expect(sidePotAward!.amount).toBe(260);
  });

  it('reconciles total awards against the pot for a 3-way all-in', () => {
    expect(validateHand(sidePotHand!)).toEqual([]);
  });
});
