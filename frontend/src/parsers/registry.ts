import type { Hand } from '@/domain/hand.js';
import type {
  HandParseFailure, ParsedFile, ParserStatus, ParseWarning, SiteId, SiteParser,
} from './types.js';
import { normalizeSource } from './shared/text.js';
import { validateHand } from './shared/validate.js';
import { WarningCode, fail } from './shared/warnings.js';

export interface ParserSummary {
  readonly siteId: SiteId;
  readonly displayName: string;
  readonly status: ParserStatus;
}

/**
 * Owns everything that is the same for every site: orchestration, per-hand
 * error containment, and validation. That keeps each new site parser small —
 * a detect, a splitHands, and a parseHand.
 */
export class ParserRegistry {
  private readonly parsers = new Map<SiteId, SiteParser>();

  register(parser: SiteParser): void {
    this.parsers.set(parser.siteId, parser);
  }

  get(siteId: SiteId): SiteParser | undefined {
    return this.parsers.get(siteId);
  }

  /** Drives the radio-button group in the upload UI. */
  list(): readonly ParserSummary[] {
    return [...this.parsers.values()].map((p) => ({
      siteId: p.siteId, displayName: p.displayName, status: p.status,
    }));
  }

  /** Highest-confidence parser above the threshold, or null. */
  detect(text: string, minConfidence = 0.5): SiteParser | null {
    let best: SiteParser | null = null;
    let bestScore = 0;
    for (const p of this.parsers.values()) {
      let score = 0;
      try {
        score = p.detect(text).confidence;
      } catch {
        score = 0; // a throwing detect must never break detection for others
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return bestScore >= minConfidence ? best : null;
  }

  /**
   * The single entry point the UI calls. Never throws: a hand that fails is
   * collected into `failures` so the UI can report "3 of 50 hands failed" while
   * still showing the 47 that worked.
   */
  parseFile(text: string, siteId: SiteId | null, fileName?: string): ParsedFile {
    const fileWarnings: ParseWarning[] = [];
    const parser = siteId ? this.parsers.get(siteId) : this.detect(text);

    if (!parser) {
      return {
        siteId: siteId ?? ('betclic-fr' as SiteId),
        hands: [],
        failures: [],
        fileWarnings: [fail(
          WarningCode.MALFORMED_CHUNK,
          siteId ? `No parser registered for "${siteId}"` : 'Could not detect the poker room for this file',
        )],
      };
    }

    const normalized = parser.normalizeText
      ? parser.normalizeText(text)
      : normalizeSource(text);

    let chunks: readonly string[];
    try {
      chunks = parser.splitHands(normalized);
    } catch (e) {
      return {
        siteId: parser.siteId,
        hands: [],
        failures: [],
        fileWarnings: [fail(WarningCode.MALFORMED_CHUNK, `Could not split file: ${String(e)}`)],
      };
    }

    if (chunks.length === 0) {
      fileWarnings.push(fail(
        WarningCode.MALFORMED_CHUNK,
        `No ${parser.displayName} hands found in this file`,
      ));
    }

    const hands: Hand[] = [];
    const failures: HandParseFailure[] = [];

    chunks.forEach((source, i) => {
      const ordinal = i + 1;
      try {
        const result = parser.parseHand(source, {
          ordinal, fileName: fileName ?? null, now: () => new Date(),
        });
        if (!result.ok) {
          failures.push({ ordinal, source, errors: result.errors });
          return;
        }
        const issues = validateHand(result.value);
        hands.push(
          issues.length === 0
            ? result.value
            : { ...result.value, warnings: [...result.value.warnings, ...issues] },
        );
      } catch (e) {
        // A parser bug degrades to one skipped hand, never a blank screen.
        failures.push({
          ordinal,
          source,
          errors: [fail(WarningCode.MALFORMED_CHUNK, `Parser threw: ${String(e)}`)],
        });
      }
    });

    return { siteId: parser.siteId, hands, failures, fileWarnings };
  }
}
