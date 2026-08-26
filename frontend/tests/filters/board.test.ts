import { describe, it, expect } from 'vitest';
import { boardTexture } from '@/filters/board.js';
import { rankValue } from '@/domain/cards.js';
import type { Board } from '@/domain/cards.js';

const b = (s: string): Board => s.split(' ') as Board;

describe('connectedness', () => {
  it('classifies three-card runs as connected', () => {
    for (const f of ['Ah Kd Qs', 'Kh Qd Js', 'Qh Jd Ts', 'Jh Td 9s', 'Th 9d 8s']) {
      expect(boardTexture(b(f))!.connectedness, f).toBe('connected');
    }
  });
  it('gaps', () => {
    expect(boardTexture(b('Ah Kd Js'))!.connectedness).toBe('one-gap');
    expect(boardTexture(b('Ah Kd Ts'))!.connectedness).toBe('two-gap');
    expect(boardTexture(b('Ah 7d 2s'))!.connectedness).toBe('disconnected');
    expect(boardTexture(b('Ah 2d 3s'))!.connectedness).toBe('disconnected');
  });
  it('pairs never read as connected', () => {
    expect(boardTexture(b('9h 9d 2s'))!.connectedness).toBe('paired');
    expect(boardTexture(b('9h 9d 9s'))!.trips).toBe(true);
  });
});

describe('the users example: 3-card connected, high A, low 8', () => {
  const expected = ['Ah Kd Qs', 'Kh Qd Js', 'Qh Jd Ts', 'Jh Td 9s', 'Th 9d 8s'];
  const rejected = ['9h 8d 7s', 'Ah Kd Js', '5h 4d 3s'];
  it('accepts exactly the listed boards', () => {
    for (const f of expected) {
      const t = boardTexture(b(f))!;
      const ok = t.connectedness === 'connected'
        && t.highest <= rankValue('A') && t.lowest >= rankValue('8');
      expect(ok, f).toBe(true);
    }
    for (const f of rejected) {
      const t = boardTexture(b(f))!;
      const ok = t.connectedness === 'connected'
        && t.highest <= rankValue('A') && t.lowest >= rankValue('8');
      expect(ok, f).toBe(false);
    }
  });
});

describe('suits', () => {
  it('reads suit texture', () => {
    expect(boardTexture(b('Ah Kh Qh'))!.suits).toBe('monotone');
    expect(boardTexture(b('Ah Kh Qs'))!.suits).toBe('two-tone');
    expect(boardTexture(b('Ah Kd Qs'))!.suits).toBe('rainbow');
  });
});
