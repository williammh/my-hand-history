/**
 * Encoding repair and whitespace normalization, shared by every site parser.
 */

/**
 * Characters that only appear when UTF-8 bytes were decoded as cp1252/latin-1.
 * Verified against the Betclic sample, where the euro sign arrives as three
 * characters: U+00E2 U+201A U+00AC.
 */
const MOJIBAKE_SIGNAL = /[ÂÃâã‚€¬ƒ]/;

/**
 * cp1252 code points that are NOT latin-1, mapped back to their single byte.
 * This is why a naive latin-1 round-trip fails on this file: U+201A is cp1252
 * 0x82 and has no latin-1 representation at all, so encoding throws outright.
 */
const CP1252_REVERSE = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const REPLACEMENT_CHAR = '�';

/**
 * Repairs UTF-8 that was decoded as cp1252 and re-encoded ("mojibake").
 *
 * The file arrives as VALID UTF-8 whose characters are already the mojibake
 * sequence - the double-encoding happened upstream at the poker room. So
 * swapping TextDecoder encodings cannot help; the repair has to happen at the
 * string level, mapping each character back to the cp1252 byte it came from and
 * re-decoding that byte run as UTF-8.
 *
 * Guarded on both ends: it only runs when a mojibake signal character is
 * present, and keeps the result only if every character maps to a byte AND the
 * bytes decode as strict UTF-8. Correctly-encoded text like "Sebastien" with an
 * accent - very much expected in French screen names - passes through untouched.
 */
export function repairMojibake(text: string): string {
  if (!MOJIBAKE_SIGNAL.test(text)) return text;

  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp > 0xffff) return text; // astral char: cannot be a cp1252 byte
    if (cp <= 0xff) {
      bytes[i] = cp;
      continue;
    }
    const mapped = CP1252_REVERSE.get(cp);
    if (mapped === undefined) return text; // not cp1252-representable: leave alone
    bytes[i] = mapped;
  }

  try {
    const decoded = utf8Decoder.decode(bytes);
    // A repair that produces replacement characters is not a repair.
    return decoded.includes(REPLACEMENT_CHAR) ? text : decoded;
  } catch {
    return text; // not valid UTF-8 underneath; the text was already correct
  }
}

/** Strips a BOM and normalizes CRLF/CR to LF. Applied for every site. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Full pre-parse text normalization. */
export function normalizeSource(text: string): string {
  return repairMojibake(normalizeLineEndings(text));
}
