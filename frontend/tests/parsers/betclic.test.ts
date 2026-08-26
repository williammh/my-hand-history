import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { registry } from '@/parsers/index.js';
import { stacksAtAction, heroStartingStackBB } from '@/domain/stacks.js';
import { validateHand } from '@/parsers/shared/validate.js';

const samplePath = fileURLToPath(new URL('../fixtures/betclic/sample.txt', import.meta.url));
const sample = readFileSync(samplePath, 'utf8');
const parsed = registry.parseFile(sample, 'betclic-fr', 'sample.txt');
const [hand1, hand2, hand3] = parsed.hands;

describe('Betclic parser — file level', () => {
  it('parses all three hands with no failures', () => {
    expect(parsed.hands).toHaveLength(3);
    expect(parsed.failures).toHaveLength(0);
    expect(parsed.fileWarnings).toHaveLength(0);
  });

  it('produces no warnings on a clean file', () => {
    for (const h of parsed.hands) expect(h.warnings).toEqual([]);
  });

  it('repairs the mojibake euro in the buy-in', () => {
    expect(hand1!.meta.tournament?.buyInCurrency).toBe('€');
  });

  it('detects the site with high confidence', () => {
    expect(registry.detect(sample)?.siteId).toBe('betclic-fr');
  });

  it('gives every hand a stable dedupe id', () => {
    expect(hand1!.id).toBe('betclic-fr:01K09RSX5A3Y6GWTPWQWM1WG1R');
    expect(new Set(parsed.hands.map((h) => h.id)).size).toBe(3);
  });
});

describe('pot checksums — the highest-value regression guard', () => {
  it('matches the site-reported total for every hand', () => {
    expect(hand1!.reportedTotalPot).toBe(453766);
    expect(hand2!.reportedTotalPot).toBe(16800);
    expect(hand3!.reportedTotalPot).toBe(108800);
    for (const h of parsed.hands) {
      expect(h.pots.total).toBe(h.reportedTotalPot);
      expect(validateHand(h)).toEqual([]);
    }
  });
});

describe('amount semantics — delta vs raise-to', () => {
  it('treats a preflop SB call as a delta on top of the blind', () => {
    // Hand 3: SB posts 4000, then "Calls 4000" -> street total 8000, not 4000.
    const call = hand3!.actions.find((a) => a.street === 'preflop' && a.kind === 'call')!;
    expect(call.amount).toBe(4000);
    expect(call.totalCommitted).toBe(8000);
  });

  it('resolves the turn bet / raise-to / call sequence', () => {
    const turn = hand3!.actions.filter((a) => a.street === 'turn');
    expect(turn.map((a) => [a.kind, a.amount, a.totalCommitted])).toEqual([
      ['bet', 8000, 8000],
      ['raise', 16000, 16000],
      ['call', 8000, 16000],
    ]);
    expect(turn.reduce((s, a) => s + a.amount, 0)).toBe(32000);
  });

  it('reconciles an all-in jam that is net of the ante', () => {
    // LaCigale: 441766 stack, posts 800 ante + 8000 BB, jams "Raises to 440966".
    const jam = hand1!.actions.find((a) => a.isAllIn)!;
    expect(jam.amount).toBe(432966);
    expect(jam.totalCommitted).toBe(440966);
    const snap = stacksAtAction(hand1!, jam.index);
    expect(snap.stacks.get(jam.seat)).toBe(0);
    expect(snap.committed.get(jam.seat)).toBe(441766);
  });

  it('records antes outside street commitment', () => {
    const ante = hand3!.actions.find((a) => a.kind === 'post-ante')!;
    expect(ante.amount).toBe(800);
    expect(ante.totalCommitted).toBe(0);
  });
});

describe('positions and hero', () => {
  it('derives a position for a seat tagged only [Hero]', () => {
    // Hand 1 seat 5 is "[Hero]" with no position token.
    const heroSeat = hand1!.seats.find((s) => s.seat === 5)!;
    expect(heroSeat.isHero).toBe(true);
    expect(heroSeat.declaredPosition).toBeNull();
    expect(heroSeat.position).toBe('CO');
    expect(hand1!.heroSeat).toBe(5);
  });

  it('reads position and hero as independent tokens in [BTN Hero]', () => {
    const heroSeat = hand2!.seats.find((s) => s.seat === 5)!;
    expect(heroSeat.isHero).toBe(true);
    expect(heroSeat.declaredPosition).toBe('BTN');
    expect(heroSeat.isButton).toBe(true);
  });

  it('locates the button in every hand', () => {
    expect([hand1!.buttonSeat, hand2!.buttonSeat, hand3!.buttonSeat]).toEqual([6, 5, 4]);
  });

  it('reads hero hole cards', () => {
    expect(hand1!.seats.find((s) => s.isHero)!.holeCards).toEqual(['9s', '2c']);
    expect(hand3!.seats.find((s) => s.isHero)!.holeCards).toEqual(['Jh', 'Td']);
  });

  it('never invents villain hole cards', () => {
    for (const h of parsed.hands) {
      for (const s of h.seats) {
        if (!s.isHero) expect(s.holeCards).toBeNull();
      }
      expect(h.showdown).toEqual([]);
    }
  });
});

describe('streets and board', () => {
  it('stops at preflop when everyone folds', () => {
    expect(hand1!.streets.map((s) => s.street)).toEqual(['preflop']);
    expect(hand1!.finalBoard).toEqual([]);
  });

  it('builds the full board through the river', () => {
    expect(hand3!.streets.map((s) => s.street)).toEqual(['preflop', 'flop', 'turn', 'river']);
    expect(hand3!.finalBoard).toEqual(['Qh', '9d', 'Qd', '5c', 'Ah']);
    const flop = hand3!.streets.find((s) => s.street === 'flop')!;
    expect(flop.board).toEqual(['Qh', '9d', 'Qd']);
    expect(flop.newCards).toEqual(['Qh', '9d', 'Qd']);
    const turn = hand3!.streets.find((s) => s.street === 'turn')!;
    expect(turn.newCards).toEqual(['5c']);
  });

  it('tracks the running pot across streets', () => {
    const flop = hand3!.streets.find((s) => s.street === 'flop')!;
    expect(flop.potAtStart).toBe(20800); // 6 antes + SB completing + BB
    expect(flop.potAtEnd).toBe(36800);
  });
});

describe('the walk (hand 2)', () => {
  it('keeps the folded small blind chips in the pot', () => {
    expect(hand2!.pots.total).toBe(16800);
    // Only the big blind can win, but the folded SB still funded the pot.
    expect(hand2!.pots.pots[0]!.eligibleSeats).toEqual([1]);
    expect(hand2!.awards[0]!.seat).toBe(1);
    expect(hand2!.awards[0]!.amount).toBe(16800);
  });
});

describe('serialization', () => {
  it('round-trips through structuredClone — wire-ready for a future solver', () => {
    for (const h of parsed.hands) {
      const clone = structuredClone(h);
      expect(clone.pots.total).toBe(h.pots.total);
      expect(JSON.parse(JSON.stringify(h)).id).toBe(h.id);
    }
  });
});

describe('resilience', () => {
  it('reports a failure for a malformed hand without losing the good ones', () => {
    const broken = sample + '\n------------\n*** HEADER ***\nSite: Betclic.fr\n';
    const res = registry.parseFile(broken, 'betclic-fr');
    expect(res.hands).toHaveLength(3);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]!.errors[0]!.code).toBe('MISSING_HAND_ID');
  });

  it('handles CRLF line endings', () => {
    const crlf = sample.replace(/\n/g, '\r\n');
    expect(registry.parseFile(crlf, 'betclic-fr').hands).toHaveLength(3);
  });

  it('flags an unrecognized file rather than throwing', () => {
    const res = registry.parseFile('this is not a hand history', 'betclic-fr');
    expect(res.hands).toHaveLength(0);
    expect(res.fileWarnings.length).toBeGreaterThan(0);
  });
});

describe('stack depth for chart lookup', () => {
  it('computes hero starting stack in BB before antes', () => {
    expect(heroStartingStackBB(hand3!)).toBeCloseTo(11.25, 2);
    expect(heroStartingStackBB(hand1!)).toBeCloseTo(7.05, 2);
  });
});

describe('Betclic parser — game mode', () => {
  /** Rewrites the Game Mode header on every hand in the sample file. */
  const withMode = (mode: string) =>
    registry.parseFile(sample.replaceAll(/^Game Mode: .*$/gm, `Game Mode: ${mode}`), 'betclic-fr', 's.txt');

  it('derives tournament from the header', () => {
    expect(hand1!.meta.gameMode).toBe('tournament');
  });

  it('derives sit-n-go, which the tournament test would otherwise swallow', () => {
    const h = withMode('Sit & Go').hands[0]!;
    expect(h.meta.gameMode).toBe('sit-n-go');
    // A SNG plays in chips, so it must not be formatted as euros.
    expect(h.money.currency).toBe('CHIPS');
    expect(h.money.exponent).toBe(0);
  });

  it('treats "SNG Tournament" as sit-n-go, not tournament', () => {
    expect(withMode('SNG Tournament').hands[0]!.meta.gameMode).toBe('sit-n-go');
  });

  it('derives cash and its currency when the header says so', () => {
    const h = withMode('Cash Game').hands[0]!;
    expect(h.meta.gameMode).toBe('cash');
    expect(h.money.currency).toBe('EUR');
    expect(h.money.exponent).toBe(2);
    expect(h.meta.tournament).toBeNull();
  });

  it('warns rather than silently assuming cash when the header is absent', () => {
    const h = registry.parseFile(
      sample.replaceAll(/^Game Mode: .*\n/gm, ''), 'betclic-fr', 's.txt',
    ).hands[0]!;
    expect(h.meta.gameMode).toBe('cash');
    expect(h.warnings.some((w) => w.message.includes('Game Mode'))).toBe(true);
  });
});
