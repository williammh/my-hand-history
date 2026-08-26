import type { ParseWarning, ParseSeverity } from '@/domain/hand.js';

export const WarningCode = {
  MALFORMED_CHUNK: 'MALFORMED_CHUNK',
  MISSING_HEADER: 'MISSING_HEADER',
  MISSING_HAND_ID: 'MISSING_HAND_ID',
  NO_PLAYERS: 'NO_PLAYERS',
  NO_BUTTON: 'NO_BUTTON',
  UNKNOWN_ACTION_VERB: 'UNKNOWN_ACTION_VERB',
  UNKNOWN_SEAT_TOKEN: 'UNKNOWN_SEAT_TOKEN',
  UNKNOWN_PLAYER: 'UNKNOWN_PLAYER',
  BAD_CARD: 'BAD_CARD',
  POT_MISMATCH: 'POT_MISMATCH',
  AWARD_MISMATCH: 'AWARD_MISMATCH',
  STACK_EXCEEDED: 'STACK_EXCEEDED',
  DUPLICATE_CARD: 'DUPLICATE_CARD',
  BOARD_LENGTH_MISMATCH: 'BOARD_LENGTH_MISMATCH',
  ACTION_AFTER_FOLD: 'ACTION_AFTER_FOLD',
  POSITION_MISMATCH: 'POSITION_MISMATCH',
  BLIND_ANOMALY: 'BLIND_ANOMALY',
  UNPARSED_LINE: 'UNPARSED_LINE',
} as const;

export type WarningCodeValue = (typeof WarningCode)[keyof typeof WarningCode];

export function warn(
  code: WarningCodeValue,
  message: string,
  opts: { lineNumber?: number | null; rawLine?: string | null; severity?: ParseSeverity } = {},
): ParseWarning {
  return {
    code,
    message,
    lineNumber: opts.lineNumber ?? null,
    rawLine: opts.rawLine ?? null,
    severity: opts.severity ?? 'warning',
  };
}

export function fail(
  code: WarningCodeValue,
  message: string,
  opts: { lineNumber?: number | null; rawLine?: string | null } = {},
): ParseWarning {
  return warn(code, message, { ...opts, severity: 'error' });
}
