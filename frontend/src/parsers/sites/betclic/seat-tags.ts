import type { Position } from '@/domain/position';

export interface SeatTags {
  readonly declaredPosition: Position | null;
  readonly isHero: boolean;
  readonly sittingOut: boolean;
  readonly unknownTokens: readonly string[];
}

const POSITION_TOKENS: Record<string, Position> = {
  SB: 'SB', BB: 'BB', BTN: 'BTN', BU: 'BTN', D: 'BTN', DEALER: 'BTN',
  CO: 'CO', HJ: 'HJ', LJ: 'LJ', UTG: 'UTG',
};

/**
 * Position and hero are INDEPENDENT tokens sharing one bracket:
 *   "[BTN Hero]" -> position BTN, hero
 *   "[Hero]"     -> hero, position unknown (hand 1 seat 5 — hero is in a middle
 *                   seat Betclic does not label, so position must be derived)
 *   "[SB]"       -> position only
 *   absent       -> neither
 *
 * Unknown tokens are collected rather than dropped so a format change surfaces
 * as a visible warning instead of silently losing information.
 */
export function parseSeatTags(bracket: string | undefined): SeatTags {
  if (!bracket || !bracket.trim()) {
    return { declaredPosition: null, isHero: false, sittingOut: false, unknownTokens: [] };
  }

  let declaredPosition: Position | null = null;
  let isHero = false;
  let sittingOut = false;
  const unknownTokens: string[] = [];

  for (const token of bracket.trim().split(/\s+/)) {
    const key = token.toUpperCase();
    if (key === 'HERO') { isHero = true; continue; }
    if (key === 'SITTINGOUT' || key === 'SITTING' || key === 'OUT') { sittingOut = true; continue; }
    const pos = POSITION_TOKENS[key];
    // First position token wins: heads-up tags the button seat "[BTN SB]"
    // since it holds both roles, and BTN is the one ring math cannot infer.
    if (pos) { declaredPosition ??= pos; continue; }
    unknownTokens.push(token);
  }

  return { declaredPosition, isHero, sittingOut, unknownTokens };
}
