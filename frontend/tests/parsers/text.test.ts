import { describe, it, expect } from 'vitest';
import { repairMojibake, normalizeLineEndings, normalizeSource } from '@/parsers/shared/text';

// The exact mojibake sequence in the real file: U+00E2 U+201A U+00AC.
const MOJI_EURO = 'â‚¬';

describe('repairMojibake', () => {
  it('repairs the euro sign from the Betclic sample', () => {
    expect(repairMojibake(`Buy In: 5.00${MOJI_EURO}`)).toBe('Buy In: 5.00€');
  });

  it('leaves correctly-encoded French names untouched', () => {
    for (const name of ['Sébastien', 'café', 'Zoë', 'Jérôme', 'François']) {
      expect(repairMojibake(name)).toBe(name);
    }
  });

  it('leaves plain ASCII untouched', () => {
    expect(repairMojibake('LaCigale')).toBe('LaCigale');
    expect(repairMojibake('DrFullHouse')).toBe('DrFullHouse');
    expect(repairMojibake('SIMBAROI')).toBe('SIMBAROI');
  });

  it('repairs common accented mojibake', () => {
    expect(repairMojibake('SÃ©bastien')).toBe('Sébastien');
    expect(repairMojibake('cafÃ©')).toBe('café');
  });

  it('is idempotent', () => {
    const once = repairMojibake(`5.00${MOJI_EURO}`);
    expect(repairMojibake(once)).toBe(once);
    expect(once).toBe('5.00€');
  });
});

describe('normalizeLineEndings', () => {
  it('normalizes CRLF and CR and strips the BOM', () => {
    expect(normalizeLineEndings('﻿a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('normalizeSource', () => {
  it('applies both repairs together', () => {
    expect(normalizeSource(`﻿Buy In: 5.00${MOJI_EURO}\r\n`)).toBe('Buy In: 5.00€\n');
  });
});
