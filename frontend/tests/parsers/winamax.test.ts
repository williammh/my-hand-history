import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index';
import { validateHand } from '@/parsers/shared/validate';

const samplePath = fileURLToPath(new URL('../fixtures/winamax/alcacer-do-sal.txt', import.meta.url));
const sample = readFileSync(samplePath, 'utf8');
const parsed = registry.parseFile(sample, 'winamax', 'alcacer-do-sal.txt');

describe('Winamax parser — file level', () => {
  it('parses every hand in the sample with no failures', () => {
    expect(parsed.failures).toEqual([]);
    expect(parsed.hands).toHaveLength(43);
  });

  it('detects the site with high confidence', () => {
    expect(registry.detect(sample)?.siteId).toBe('winamax');
  });

  it('gives every hand a stable dedupe id', () => {
    expect(parsed.hands[0]!.id).toBe('winamax:20183568-872-1728408886');
    expect(new Set(parsed.hands.map((h) => h.id)).size).toBe(43);
  });
});

describe('pot checksums — the highest-value regression guard', () => {
  it('matches the site-reported total for every hand', () => {
    for (const h of parsed.hands) {
      expect(h.pots.total).toBe(h.reportedTotalPot);
    }
  });

  it('raises no issues beyond the known double-BB-post hand', () => {
    // Hand 20183568-874: a player re-entering the blinds posts a second,
    // independent "big blind ... out of position" — legitimate Winamax
    // behavior, not a parse bug. validateHand's generic "exactly 1 BB" check
    // correctly flags it as unusual; every other hand must be issue-free.
    for (const h of parsed.hands) {
      const issues = validateHand(h);
      if (h.meta.handId === '20183568-874-1728408941') {
        expect(issues).toEqual([expect.objectContaining({ code: 'BLIND_ANOMALY' })]);
      } else {
        expect(issues).toEqual([]);
      }
    }
  });
});

describe('hand 1 — a simple walk to showdown-free win', () => {
  const hand1 = parsed.hands[0]!;

  it('parses header fields', () => {
    expect(hand1.meta.gameMode).toBe('cash');
    expect(hand1.money.currency).toBe('EUR');
    expect(hand1.money.exponent).toBe(2);
    expect(hand1.money.smallBlind).toBe(2);
    expect(hand1.money.bigBlind).toBe(5);
    expect(hand1.meta.tableName).toBe('Alcácer do Sal 02');
    expect(hand1.meta.maxSeats).toBe(5);
    expect(hand1.buttonSeat).toBe(5);
  });

  it('parses seats and stacks in cents', () => {
    const seat1 = hand1.seats.find((s) => s.seat === 1)!;
    expect(seat1.name).toBe('20BJ');
    expect(seat1.startingStack).toBe(519);
  });

  it('identifies hero from the Dealt to line', () => {
    expect(hand1.heroSeat).toBe(3);
    const hero = hand1.seats.find((s) => s.isHero)!;
    expect(hero.name).toBe('6T3MAT1K');
    expect(hero.holeCards).toEqual(['Qd', '5h']);
  });

  it('never invents villain hole cards', () => {
    for (const s of hand1.seats) {
      if (!s.isHero) expect(s.holeCards).toBeNull();
    }
  });

  it('builds the full board through the turn', () => {
    expect(hand1.streets.map((s) => s.street)).toEqual(['preflop', 'flop', 'turn']);
    expect(hand1.finalBoard).toEqual(['Ks', 'Jd', 'Ad', '2c']);
    const flop = hand1.streets.find((s) => s.street === 'flop')!;
    expect(flop.newCards).toEqual(['Ks', 'Jd', 'Ad']);
    const turn = hand1.streets.find((s) => s.street === 'turn')!;
    expect(turn.newCards).toEqual(['2c']);
  });

  it('resolves the raise "to" amount as an absolute street total', () => {
    // 20BJ posted the 2-cent SB, then "raises 0.05€ to 0.10€" — the delta
    // added is 10 - 2 = 8 cents, not the printed "0.05€" (which Winamax
    // labels as the raise-over-the-prior-bet size, not a literal delta).
    const raise = hand1.actions.find((a) => a.kind === 'raise')!;
    expect(raise.amount).toBe(8);
    expect(raise.totalCommitted).toBe(10); // to 0.10€
  });

  it('reports the award and pot/rake', () => {
    // Winamax prints "Total pot" NET of rake (0.58€ pot | 0.02€ rake); the
    // domain model's reportedTotalPot is the GROSS figure (0.60€) so it lines
    // up with the chips actually moved in actions.
    expect(hand1.reportedTotalPot).toBe(60);
    expect(hand1.meta.rake).toBe(2);
    expect(hand1.awards).toEqual([{ potLevel: 0, seat: 1, amount: 58, handDescription: null }]);
  });
});

describe('showdown hand (hand 7, two showdowns)', () => {
  // HandId 20183568-878: 6T3MAT1K and ghoustryde both show at showdown.
  const hand = parsed.hands.find((h) => h.meta.handId === '20183568-878-1728409056')!;

  it('parses both showdown entries with hand descriptions', () => {
    expect(hand.showdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ holeCards: ['Js', 'Ks'], handDescription: 'One pair : Kings' }),
        expect.objectContaining({ holeCards: ['Kh', 'Qc'], handDescription: 'One pair : Kings' }),
      ]),
    );
  });

  it('builds the full board through the river', () => {
    expect(hand.finalBoard).toEqual(['6c', '2h', 'Kd', '4s', '3s']);
  });
});

describe('all-in raise (hand 3)', () => {
  const hand = parsed.hands.find((h) => h.meta.handId === '20183568-874-1728408941')!;

  it('flags the all-in raise', () => {
    const raise = hand.actions.find((a) => a.isAllIn)!;
    expect(raise.kind).toBe('raise');
    expect(raise.totalCommitted).toBe(500); // to 5€
  });
});

describe('no-rake summary line', () => {
  const hand = parsed.hands.find((h) => h.meta.handId === '20183568-873-1728408930')!;

  it('reads "No rake" as zero rake, not a parse failure', () => {
    expect(hand.meta.rake).toBe(0);
    expect(hand.reportedTotalPot).toBe(20);
    expect(hand.warnings).toEqual([]);
  });
});

describe('out of position big blind tag', () => {
  const hand = parsed.hands.find((h) => h.meta.handId === '20183568-874-1728408941')!;

  it('still parses the big blind post amount correctly despite the extra clause', () => {
    const bbPosts = hand.actions.filter((a) => a.kind === 'post-bb');
    expect(bbPosts).toHaveLength(2);
    expect(bbPosts.map((a) => a.amount)).toEqual([5, 5]);
  });
});

describe('resilience', () => {
  it('handles CRLF line endings', () => {
    const crlf = sample.replace(/\n/g, '\r\n');
    expect(registry.parseFile(crlf, 'winamax').hands).toHaveLength(43);
  });

  it('flags an unrecognized file rather than throwing', () => {
    const res = registry.parseFile('this is not a hand history', 'winamax');
    expect(res.hands).toHaveLength(0);
    expect(res.fileWarnings.length).toBeGreaterThan(0);
  });
});

describe('serialization', () => {
  it('round-trips through structuredClone', () => {
    for (const h of parsed.hands) {
      const clone = structuredClone(h);
      expect(clone.pots.total).toBe(h.pots.total);
    }
  });
});
