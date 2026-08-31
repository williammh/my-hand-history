import type { HandFacts, FilterCriteria } from './types';
import { stackBucket } from './facts';
import { rankValue } from '@/domain/cards';

/**
 * Whether a hand passes the criteria.
 *
 * An empty set on an axis is "unconstrained", so the default criteria match
 * everything. Within an axis, values are OR'd; across axes, AND'ed.
 */
export function matches(facts: HandFacts, c: FilterCriteria): boolean {
  if (c.sites.size > 0 && !c.sites.has(facts.siteId)) return false;

  // A hand imported without a file name can never be attributed to one, so an
  // active source-file filter excludes it rather than letting it match every file.
  if (c.sourceFiles.size > 0) {
    if (facts.sourceFile === null || !c.sourceFiles.has(facts.sourceFile)) return false;
  }

  if (c.gameModes.size > 0 && !c.gameModes.has(facts.gameMode)) return false;

  // A hand matches if ANY selected player was dealt into it.
  if (c.players.size > 0) {
    if (![...c.players].some((p) => facts.playerKeys.has(p))) return false;
  }

  if (c.potTypes.size > 0 && !c.potTypes.has(facts.potType)) return false;

  if (c.relativePositions.size > 0) {
    if (facts.relativePosition === null || !c.relativePositions.has(facts.relativePosition)) {
      return false;
    }
  }

  if (c.heroPositions.size > 0) {
    if (facts.heroPosition === null || !c.heroPositions.has(facts.heroPosition)) return false;
  }

  // Opponent positions match if ANY opponent in the pot held a selected
  // position — a hand is "versus the BTN" when the BTN was one of the players,
  // not only when they were the sole opponent.
  if (c.opponentPositions.size > 0) {
    if (!facts.opponentPositions.some((p) => c.opponentPositions.has(p))) return false;
  }

  if (c.stacks.size > 0) {
    if (facts.effectiveStackBB === null) return false;
    if (!c.stacks.has(stackBucket(facts.effectiveStackBB))) return false;
  }

  if (c.preflopAggression.size > 0) {
    if (facts.preflopAggression === null || !c.preflopAggression.has(facts.preflopAggression)) {
      return false;
    }
  }

  if (c.sawFlopOnly && !facts.sawFlop) return false;

  // Board texture. Any board axis being active implies a flop, so a hand that
  // never saw one is out — there is no texture to match against.
  const boardConstrained =
    c.connectedness.size > 0 || c.suitTextures.size > 0 ||
    c.highestRank !== null || c.lowestRank !== null;
  if (boardConstrained) {
    const b = facts.board;
    if (!b) return false;
    if (c.connectedness.size > 0 && !c.connectedness.has(b.connectedness)) return false;
    if (c.suitTextures.size > 0 && !c.suitTextures.has(b.suits)) return false;
    // Bounds, not equality: highest is a ceiling, lowest is a floor.
    if (c.highestRank !== null && b.highest > rankValue(c.highestRank)) return false;
    if (c.lowestRank !== null && b.lowest < rankValue(c.lowestRank)) return false;
  }

  // The street-scoped axes below all describe the SAME street, so a hand hero
  // never acted on fails them as soon as any one is active.
  const street = c.street;

  if (c.heroStreetPosition !== 'any') {
    if (facts.relativeByStreet[street] !== c.heroStreetPosition) return false;
  }

  if (c.severities.size > 0) {
    const sev = facts.severityByStreet[street];
    if (sev === undefined || !c.severities.has(sev)) return false;
  }

  if (c.lines.size > 0) {
    const line = facts.lineByStreet[street];
    if (line === undefined || !c.lines.has(line)) return false;
  }

  return true;
}

/** Whether any axis constrains anything — drives the "clear" affordance. */
export function isActive(c: FilterCriteria): boolean {
  return (
    c.sites.size > 0 ||
    c.sourceFiles.size > 0 ||
    c.gameModes.size > 0 ||
    c.players.size > 0 ||
    c.potTypes.size > 0 ||
    c.relativePositions.size > 0 ||
    c.heroPositions.size > 0 ||
    c.opponentPositions.size > 0 ||
    c.stacks.size > 0 ||
    c.preflopAggression.size > 0 ||
    c.severities.size > 0 ||
    c.lines.size > 0 ||
    c.heroStreetPosition !== 'any' ||
    c.sawFlopOnly ||
    c.connectedness.size > 0 ||
    c.suitTextures.size > 0 ||
    c.highestRank !== null ||
    c.lowestRank !== null
  );
}

/** How many axes are constrained — a compact badge for the panel header. */
export function activeCount(c: FilterCriteria): number {
  let n = 0;
  if (c.sites.size > 0) n++;
  if (c.sourceFiles.size > 0) n++;
  if (c.gameModes.size > 0) n++;
  if (c.players.size > 0) n++;
  if (c.potTypes.size > 0) n++;
  if (c.relativePositions.size > 0) n++;
  if (c.heroPositions.size > 0) n++;
  if (c.opponentPositions.size > 0) n++;
  if (c.stacks.size > 0) n++;
  if (c.preflopAggression.size > 0) n++;
  if (c.severities.size > 0) n++;
  if (c.lines.size > 0) n++;
  if (c.heroStreetPosition !== 'any') n++;
  if (c.sawFlopOnly) n++;
  if (c.connectedness.size > 0) n++;
  if (c.suitTextures.size > 0) n++;
  if (c.highestRank !== null) n++;
  if (c.lowestRank !== null) n++;
  return n;
}
