import type { Hand, ParseWarning, SiteId } from '@/domain/hand';

export type { ParseWarning, SiteId };

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly ParseWarning[] }
  | { readonly ok: false; readonly errors: readonly ParseWarning[] };

export interface HandParseFailure {
  /** 1-based position of the hand within the uploaded file. */
  readonly ordinal: number;
  readonly source: string;
  readonly errors: readonly ParseWarning[];
}

export interface ParsedFile {
  /** Null when no registered parser could detect the room for this file. */
  readonly siteId: SiteId | null;
  readonly hands: readonly Hand[];
  /** Hands that failed hard, so the UI can say "3 of 50 hands failed". */
  readonly failures: readonly HandParseFailure[];
  readonly fileWarnings: readonly ParseWarning[];
}

export interface DetectionResult {
  /** 0 = definitely not mine, 1 = certain. The registry takes the argmax. */
  readonly confidence: number;
  readonly reason: string;
}

export interface ParseContext {
  readonly ordinal: number;
  readonly fileName: string | null;
  readonly now: () => Date;
}

export type ParserStatus = 'stable' | 'beta' | 'planned';

export interface SiteParser {
  readonly siteId: SiteId;
  readonly displayName: string;
  readonly status: ParserStatus;

  /**
   * Cheap sniff over the head of a file. Must not throw and must be free of side
   * effects. Returns a SCORE rather than a boolean so that similar formats
   * (PokerStars vs GGPoker) never need to know about each other — each parser
   * reasons only about itself and the registry arbitrates.
   */
  detect(sample: string): DetectionResult;

  /**
   * Splits a file into per-hand source chunks. Kept separate from parseHand so
   * chunking bugs are testable independently of field-parsing bugs.
   */
  splitHands(text: string): readonly string[];

  parseHand(source: string, ctx: ParseContext): ParseResult<Hand>;

  /** Site-specific text repair (mojibake, BOMs) — quarantined per site. */
  normalizeText?(raw: string): string;
}
