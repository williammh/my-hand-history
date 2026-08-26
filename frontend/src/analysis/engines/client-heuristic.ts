import { toBB } from '@/domain/money.js';
import { handClass } from '@/domain/cards.js';
import type { Hand } from '@/domain/hand.js';
import type { AnalysisEngine, EngineCapabilities } from '../engine.js';
import type {
  DecisionPoint, DecisionVerdict, HandAnalysis, Severity, SkippedDecision, SuggestedAction,
} from '../types.js';
import { extractDecisions } from '../decision-points.js';
import type { ChartLookup } from '../charts/lookup.js';
import { MAX_STACK_DELTA_BB } from '../charts/lookup.js';
import { equityVsRange, potOdds } from '../equity/monte-carlo.js';
import { openingRange, threeBetRange } from '../ranges/preflop-ranges.js';
import { villainRange } from '../ranges/villain-range.js';
import { classifyMadeHand, type MadeHand } from '../postflop/made-hand.js';

const ENGINE_ID = 'client-heuristic';
const ENGINE_VERSION = '1.1.0';

/** Push/fold charts only apply while stacks are shallow enough to jam. */
const PUSH_FOLD_MAX_BB = 25;

export const VerdictCode = {
  PREFLOP_MISSED_JAM: 'PREFLOP_MISSED_JAM',
  PREFLOP_LOOSE_JAM: 'PREFLOP_LOOSE_JAM',
  PREFLOP_LIMP: 'PREFLOP_LIMP',
  PREFLOP_OK: 'PREFLOP_OK',
  POSTFLOP_BAD_CALL: 'POSTFLOP_BAD_CALL',
  POSTFLOP_OK: 'POSTFLOP_OK',
  PREFLOP_LOOSE_OPEN: 'PREFLOP_LOOSE_OPEN',
  PREFLOP_MISSED_OPEN: 'PREFLOP_MISSED_OPEN',
  PREFLOP_LOOSE_CALL: 'PREFLOP_LOOSE_CALL',
  PREFLOP_OVERFOLD: 'PREFLOP_OVERFOLD',
  PREFLOP_LOOSE_3BET: 'PREFLOP_LOOSE_3BET',
  POSTFLOP_MISSED_VALUE: 'POSTFLOP_MISSED_VALUE',
  POSTFLOP_SPEW_BET: 'POSTFLOP_SPEW_BET',
  POSTFLOP_THIN_BET: 'POSTFLOP_THIN_BET',
  POSTFLOP_BAD_RAISE: 'POSTFLOP_BAD_RAISE',
  POSTFLOP_OVERFOLD: 'POSTFLOP_OVERFOLD',
  NO_CHART: 'NO_CHART',
  NO_HERO_CARDS: 'NO_HERO_CARDS',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
} as const;

/**
 * Plain-language shape of hero's holding, for the explanation line.
 *
 * The user has to be able to check the verdict against what they remember
 * holding; "top pair, weak kicker" is auditable in a way that a bare equity
 * percentage is not.
 */
function describeShape(made: MadeHand): string {
  const base =
    made.tier === 'nuts' ? 'A very strong made hand'
    : made.tier === 'strong' ? 'A strong made hand'
    : made.tier === 'medium' ? 'A decent made hand'
    : made.tier === 'weak' ? 'A marginal made hand'
    : 'No made hand';

  const draws: string[] = [];
  if (made.hasFlushDraw) draws.push('a flush draw');
  if (made.hasOpenEnder) draws.push('an open-ended straight draw');
  else if (made.hasGutshot) draws.push('a gutshot');

  if (draws.length === 0) return base;
  return `${base} with ${draws.join(' and ')}`;
}

function severityFromEvLoss(evLossBB: number): Severity {
  if (evLossBB < 0.15) return 'ok';
  if (evLossBB < 0.75) return 'inaccuracy';
  if (evLossBB < 2) return 'mistake';
  return 'blunder';
}

/**
 * Severity for a path that has already decided the play is wrong.
 *
 * Estimated EV loss can round below the 'ok' threshold on a small pot, which
 * would emit a verdict whose code names a mistake while its severity says the
 * play was fine — the row would render green with a critical explanation. A
 * flagged decision is at minimum an inaccuracy.
 */
function severityOfMistake(evLossBB: number): Severity {
  const s = severityFromEvLoss(evLossBB);
  return s === 'ok' ? 'inaccuracy' : s;
}

/**
 * Judges every voluntary hero decision, at the best confidence the available
 * evidence supports:
 *
 *   high   — a push/fold chart covers the spot exactly.
 *   medium — no chart applies (deep stacks, or a raise in front of hero), so
 *            the decision is measured against a BALANCED opponent's range.
 *   low    — postflop, where equity versus an assumed range and a made-hand
 *            classification stand in for a solver.
 *
 * The balanced-villain assumption is what lets bets, checks and raises be
 * judged at all: without a model of what the opponent holds there is no way to
 * tell a value bet from a spew, which is why those spots were once skipped.
 * It is an assumption, not a read — the engine has no player sample — so every
 * verdict built on it is labeled and none claims solver-grade precision.
 *
 * What remains SKIPPED is only what cannot be judged at all: missing hole
 * cards, or a chart-scenario mismatch. A wrong verdict is worse than no verdict,
 * because the user will act on it.
 */
export function createClientHeuristicEngine(charts: ChartLookup): AnalysisEngine {
  const capabilities: EngineCapabilities = {
    preflop: true, postflop: true, quantifiesEV: false, requiresNetwork: false,
  };

  function judgePreflop(
    hand: Hand, d: DecisionPoint,
  ): DecisionVerdict | SkippedDecision {
    const action = hand.actions[d.actionIndex]!;
    if (!d.heroCards) {
      return { actionIndex: d.actionIndex, reason: 'Hole cards are not in this hand history' };
    }
    // Charts are the authority where one applies. Beyond their range — deep
    // stacks, or a raise already in front of hero — fall back to range-based
    // reasoning rather than skipping, at correspondingly lower confidence.
    if (d.scenario !== 'rfi' && d.scenario !== 'blind-vs-blind') {
      return judgePreflopFacingRaise(hand, d);
    }
    if (d.effectiveStackBB > PUSH_FOLD_MAX_BB) {
      return judgeDeepOpen(hand, d);
    }

    const match = charts.find({
      tableSize: 6,
      position: d.position,
      stackBB: d.effectiveStackBB,
      scenario: d.scenario,
    });

    if (!match) {
      return {
        actionIndex: d.actionIndex,
        reason: `No chart within ${MAX_STACK_DELTA_BB}bb of ${d.effectiveStackBB.toFixed(1)}bb for ${d.position}`,
      };
    }

    const cls = handClass(d.heroCards);
    const shouldJam = (match.chart.ranges[cls]?.['shove'] ?? 0) > 0.5;
    const jammed = action.kind === 'raise' || (action.isAllIn && action.amount > 0);
    const limped = action.kind === 'call' && d.potIsUnopened;

    const recommended: SuggestedAction[] = shouldJam
      ? [{ kind: 'raise', sizingPotFraction: null, frequency: 1, evLossBB: 0, isAllIn: true }]
      : [{ kind: 'fold', sizingPotFraction: null, frequency: 1, evLossBB: 0 }];

    const chartNote = `${match.chart.position} ${match.chart.stackBB}bb chart`;

    if (shouldJam && !jammed) {
      // Folding a jam is a real EV loss; limping one is usually smaller but still bad.
      const evLossBB = limped ? 0.6 : 0.9;
      return {
        actionIndex: d.actionIndex,
        severity: severityOfMistake(evLossBB),
        actualAction: action,
        recommended,
        evLossBB,
        explanation:
          `${cls} at ${d.effectiveStackBB.toFixed(1)}bb from ${d.position} is a shove in the ${chartNote}. ` +
          `Player ${limped ? 'limped' : 'folded'} instead.`,
        code: limped ? VerdictCode.PREFLOP_LIMP : VerdictCode.PREFLOP_MISSED_JAM,
        confidence: 'high',
      };
    }

    if (!shouldJam && jammed) {
      const evLossBB = 0.8;
      return {
        actionIndex: d.actionIndex,
        severity: severityOfMistake(evLossBB),
        actualAction: action,
        recommended,
        evLossBB,
        explanation:
          `${cls} at ${d.effectiveStackBB.toFixed(1)}bb from ${d.position} is outside the shoving range ` +
          `in the ${chartNote}. Folding is the higher-EV line.`,
        code: VerdictCode.PREFLOP_LOOSE_JAM,
        confidence: 'high',
      };
    }

    if (limped && !shouldJam) {
      return {
        actionIndex: d.actionIndex,
        severity: 'inaccuracy',
        actualAction: action,
        recommended,
        evLossBB: 0.25,
        explanation:
          `Limping at ${d.effectiveStackBB.toFixed(1)}bb invites a raise hero cannot profitably call. ` +
          `${cls} is not a shove in the ${chartNote}, so folding is cleaner.`,
        code: VerdictCode.PREFLOP_LIMP,
        confidence: 'medium',
      };
    }

    return {
      actionIndex: d.actionIndex,
      severity: 'ok',
      actualAction: action,
      recommended,
      evLossBB: 0,
      explanation: `${cls} ${shouldJam ? 'shove' : 'fold'} matches the ${chartNote}.`,
      code: VerdictCode.PREFLOP_OK,
      confidence: 'high',
    };
  }

  /**
   * Opening decisions deeper than the push/fold charts cover.
   *
   * Judged against a balanced positional opening range rather than a shove
   * range: at 40bb the question is whether to raise, not whether to jam, so
   * applying a 25bb chart here would flag standard opens as blunders.
   */
  function judgeDeepOpen(hand: Hand, d: DecisionPoint): DecisionVerdict | SkippedDecision {
    const action = hand.actions[d.actionIndex]!;
    const cls = handClass(d.heroCards!);
    const range = openingRange(d.position);
    const shouldOpen = (range.get(cls) ?? 0) > 0.5;
    const opened = action.kind === 'raise' || action.kind === 'bet';
    const limped = action.kind === 'call' && d.potIsUnopened;

    const recommended: SuggestedAction[] = shouldOpen
      ? [{ kind: 'raise', sizingPotFraction: 1, frequency: 1, evLossBB: 0 }]
      : [{ kind: 'fold', sizingPotFraction: null, frequency: 1, evLossBB: 0 }];
    const note = `a balanced ${d.position} opening range at ${d.effectiveStackBB.toFixed(0)}bb`;

    if (limped) {
      return {
        actionIndex: d.actionIndex, severity: 'inaccuracy', actualAction: action, recommended,
        evLossBB: 0.3,
        explanation:
          `Limping forfeits the chance to win the pot uncontested. ${cls} is ` +
          `${shouldOpen ? 'an open' : 'a fold'} in ${note}.`,
        code: VerdictCode.PREFLOP_LIMP, confidence: 'medium',
      };
    }
    if (shouldOpen && action.kind === 'fold') {
      return {
        actionIndex: d.actionIndex, severity: 'inaccuracy', actualAction: action, recommended,
        evLossBB: 0.35,
        explanation: `${cls} is inside ${note}. Folding it gives up a profitable open.`,
        code: VerdictCode.PREFLOP_MISSED_OPEN, confidence: 'medium',
      };
    }
    if (!shouldOpen && opened) {
      return {
        actionIndex: d.actionIndex, severity: 'inaccuracy', actualAction: action, recommended,
        evLossBB: 0.4,
        explanation: `${cls} is outside ${note}. Opening it plays a weak hand out of position too often.`,
        code: VerdictCode.PREFLOP_LOOSE_OPEN, confidence: 'medium',
      };
    }
    return {
      actionIndex: d.actionIndex, severity: 'ok', actualAction: action, recommended, evLossBB: 0,
      explanation: `${cls} ${shouldOpen ? 'open' : 'fold'} matches ${note}.`,
      code: VerdictCode.PREFLOP_OK, confidence: 'medium',
    };
  }

  /**
   * Hero facing a raise or a 3-bet — the spot the engine previously skipped
   * outright, and the most common one in a deep-stacked hand.
   *
   * Continuing is judged two ways that must agree: the hand has to beat the
   * price on offer against the raiser's assumed range, and it has to be strong
   * enough relative to that range to play a bloated pot.
   */
  function judgePreflopFacingRaise(hand: Hand, d: DecisionPoint): DecisionVerdict | SkippedDecision {
    const action = hand.actions[d.actionIndex]!;
    const cls = handClass(d.heroCards!);
    const { range, label } = villainRange(d);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

    const { equity } = equityVsRange(d.heroCards!, [], range, 1, 2000);
    const odds = potOdds(d.toCall, d.potBefore);
    const threeBet = threeBetRange();
    const isThreeBetHand = (threeBet.get(cls) ?? 0) > 0.5;
    const raised = action.kind === 'raise';

    // Facing a raise, calling needs more than raw pot odds: hero is out of
    // position often and the pot plays on. The cushion reflects that.
    const CONTINUE_CUSHION = 0.04;
    const profitable = equity > odds + CONTINUE_CUSHION;

    const recommended: SuggestedAction[] = isThreeBetHand
      ? [{ kind: 'raise', sizingPotFraction: 1, frequency: 1, evLossBB: 0 }]
      : profitable
        ? [{ kind: 'call', sizingPotFraction: null, frequency: 1, evLossBB: 0 }]
        : [{ kind: 'fold', sizingPotFraction: null, frequency: 1, evLossBB: 0 }];

    // The framing has to match the action: quoting a calling price at someone
    // who raised reads as a non-sequitur and undermines the whole verdict.
    const context = raised
      ? `${cls} has roughly ${pct(equity)} against ${label}.`
      : `${cls} has roughly ${pct(equity)} against ${label}, and calling needs ${pct(odds)}.`;

    if (raised && !isThreeBetHand && !profitable) {
      const evLossBB = 0.7;
      return {
        actionIndex: d.actionIndex, severity: severityOfMistake(evLossBB), actualAction: action,
        recommended, evLossBB,
        explanation: `${context} Re-raising turns a hand that cannot continue into a bigger loss.`,
        code: VerdictCode.PREFLOP_LOOSE_3BET, confidence: 'medium',
      };
    }
    if (action.kind === 'call' && !profitable) {
      const evLossBB = Math.min(1.5, (odds - equity) * toBB(d.potBefore, hand.money) * 0.4);
      return {
        actionIndex: d.actionIndex, severity: severityOfMistake(evLossBB), actualAction: action,
        recommended, evLossBB,
        explanation: `${context} Calling short of the price loses chips over time.`,
        code: VerdictCode.PREFLOP_LOOSE_CALL, confidence: 'medium',
      };
    }
    if (action.kind === 'fold' && isThreeBetHand) {
      return {
        actionIndex: d.actionIndex, severity: 'mistake', actualAction: action, recommended,
        evLossBB: 1.0,
        explanation: `${context} ${cls} is strong enough to re-raise for value here, not fold.`,
        code: VerdictCode.PREFLOP_OVERFOLD, confidence: 'medium',
      };
    }
    if (action.kind === 'fold' && profitable && equity > odds + 0.12) {
      return {
        actionIndex: d.actionIndex, severity: 'inaccuracy', actualAction: action, recommended,
        evLossBB: 0.3,
        explanation: `${context} Folding a hand with this much of an edge on the price gives up value.`,
        code: VerdictCode.PREFLOP_OVERFOLD, confidence: 'medium',
      };
    }

    const closing =
      raised && isThreeBetHand ? 'Re-raising for value is standard.'
      : raised ? 'Re-raising is defensible with this much equity.'
      : action.kind === 'fold' ? 'Folding is reasonable.'
      : 'Calling is reasonable.';

    return {
      actionIndex: d.actionIndex, severity: 'ok', actualAction: action, recommended, evLossBB: 0,
      explanation: `${context} ${closing}`,
      code: VerdictCode.PREFLOP_OK, confidence: 'medium',
    };
  }

  /**
   * Betting when checked to. Value, semi-bluff and give-up are three different
   * correct answers, and equity alone does not distinguish them — a hand's
   * SHAPE decides which one applies, so the made-hand tier drives this.
   */
  function judgeBet(hand: Hand, d: DecisionPoint): DecisionVerdict | SkippedDecision {
    const action = hand.actions[d.actionIndex]!;
    const made = classifyMadeHand(d.heroCards!, d.board);
    const opponents = Math.max(1, d.playersInHand - 1);
    const { range, label } = villainRange(d);
    const { equity } = equityVsRange(d.heroCards!, d.board, range, opponents, 2500);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const potBB = toBB(d.potBefore, hand.money);
    const sizing = d.potBefore > 0 ? action.amount / d.potBefore : 1;

    const check: SuggestedAction[] = [{ kind: 'check', sizingPotFraction: null, frequency: 1, evLossBB: 0 }];
    const bet: SuggestedAction[] = [{ kind: 'bet', sizingPotFraction: 0.66, frequency: 1, evLossBB: 0 }];
    const shape = describeShape(made);

    // Value: clearly ahead of the range, and worse hands can still call.
    if (equity > 0.62 || made.tier === 'nuts' || made.tier === 'strong') {
      return {
        actionIndex: d.actionIndex, severity: 'ok', actualAction: action, recommended: bet,
        evLossBB: 0,
        explanation:
          `${shape} with roughly ${pct(equity)} against ${label} — betting gets value from worse.`,
        code: VerdictCode.POSTFLOP_OK, confidence: 'low',
      };
    }

    // Semi-bluff: not ahead now, but a draw carries the fold equity to bet anyway.
    if (made.hasDraw) {
      return {
        actionIndex: d.actionIndex, severity: 'ok', actualAction: action, recommended: bet,
        evLossBB: 0,
        explanation:
          `${shape} — around ${pct(equity)} against ${label}, with outs to improve. ` +
          `Betting as a semi-bluff is standard.`,
        code: VerdictCode.POSTFLOP_OK, confidence: 'low',
      };
    }

    // Betting with no draw and well behind the range is a spew regardless of
    // whether a weak pair technically counts as "made": bottom pair barrelling
    // into a strong range is the same mistake as barrelling air.
    if ((made.tier === 'air' || made.tier === 'weak') && equity < 0.38) {
      const evLossBB = Math.min(2.5, sizing * potBB * 0.30);
      return {
        actionIndex: d.actionIndex, severity: severityOfMistake(evLossBB), actualAction: action,
        recommended: check, evLossBB,
        explanation:
          `${shape} with roughly ${pct(equity)} against ${label}. Betting here folds out only ` +
          `hands hero already beats and gets called by better.`,
        code: VerdictCode.POSTFLOP_SPEW_BET, confidence: 'low',
      };
    }

    // Marginal made hand: betting turns a showdown hand into a bluff-catcher target.
    if (made.tier === 'weak' || made.tier === 'medium') {
      const evLossBB = Math.min(1.2, sizing * potBB * 0.12);
      return {
        actionIndex: d.actionIndex, severity: severityOfMistake(evLossBB), actualAction: action,
        recommended: check, evLossBB,
        explanation:
          `${shape} at roughly ${pct(equity)} against ${label} — thin value at best. ` +
          `Checking realises the showdown value instead of folding out worse.`,
        code: VerdictCode.POSTFLOP_THIN_BET, confidence: 'low',
      };
    }

    return {
      actionIndex: d.actionIndex, severity: 'ok', actualAction: action, recommended: bet, evLossBB: 0,
      explanation: `${shape} with roughly ${pct(equity)} against ${label}.`,
      code: VerdictCode.POSTFLOP_OK, confidence: 'low',
    };
  }

  /**
   * Checking with the option to bet. The only clear error a checked-back strong
   * hand makes is failing to charge worse hands, so that is all this flags —
   * checking is rarely a blunder and over-flagging it would be noise.
   */
  function judgeCheck(hand: Hand, d: DecisionPoint): DecisionVerdict | SkippedDecision {
    const action = hand.actions[d.actionIndex]!;
    const made = classifyMadeHand(d.heroCards!, d.board);
    const opponents = Math.max(1, d.playersInHand - 1);
    const { range, label } = villainRange(d);
    const { equity } = equityVsRange(d.heroCards!, d.board, range, opponents, 2500);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const potBB = toBB(d.potBefore, hand.money);
    const shape = describeShape(made);

    const strongEnough =
      (made.tier === 'nuts' || made.tier === 'strong') && made.usesHoleCards && equity > 0.65;

    if (strongEnough) {
      const evLossBB = Math.min(2.0, potBB * 0.22);
      return {
        actionIndex: d.actionIndex,
        severity: severityOfMistake(evLossBB),
        actualAction: action,
        recommended: [{ kind: 'bet', sizingPotFraction: 0.66, frequency: 1, evLossBB: 0 }],
        evLossBB,
        explanation:
          `${shape} with roughly ${pct(equity)} against ${label}. Checking a hand this strong ` +
          `misses a street of value from worse hands that would call.`,
        code: VerdictCode.POSTFLOP_MISSED_VALUE, confidence: 'low',
      };
    }

    return {
      actionIndex: d.actionIndex, severity: 'ok', actualAction: action,
      recommended: [{ kind: 'check', sizingPotFraction: null, frequency: 1, evLossBB: 0 }],
      evLossBB: 0,
      explanation:
        `${shape} at roughly ${pct(equity)} against ${label}. Checking keeps the pot small ` +
        `with a hand that does not want to build one.`,
      code: VerdictCode.POSTFLOP_OK, confidence: 'low',
    };
  }

  /**
   * Raising a bet. The bar is higher than for calling: a raise only gets called
   * by hands that beat a marginal holding, so hero needs to be ahead of the
   * range that CONTINUES, not merely ahead of the range that bet.
   */
  function judgeRaise(hand: Hand, d: DecisionPoint): DecisionVerdict | SkippedDecision {
    const action = hand.actions[d.actionIndex]!;
    const made = classifyMadeHand(d.heroCards!, d.board);
    const opponents = Math.max(1, d.playersInHand - 1);
    const { range, label } = villainRange(d);
    const { equity } = equityVsRange(d.heroCards!, d.board, range, opponents, 2500);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const potBB = toBB(d.potBefore, hand.money);
    const shape = describeShape(made);

    const raise: SuggestedAction[] = [{ kind: 'raise', sizingPotFraction: 1, frequency: 1, evLossBB: 0 }];
    const call: SuggestedAction[] = [{ kind: 'call', sizingPotFraction: null, frequency: 1, evLossBB: 0 }];

    if (made.tier === 'nuts' || made.tier === 'strong' || equity > 0.66) {
      return {
        actionIndex: d.actionIndex, severity: 'ok', actualAction: action, recommended: raise,
        evLossBB: 0,
        explanation: `${shape} with roughly ${pct(equity)} against ${label} — strong enough to raise for value.`,
        code: VerdictCode.POSTFLOP_OK, confidence: 'low',
      };
    }
    if (made.hasDraw && equity > 0.35) {
      return {
        actionIndex: d.actionIndex, severity: 'ok', actualAction: action, recommended: raise,
        evLossBB: 0,
        explanation:
          `${shape} — roughly ${pct(equity)} against ${label}, with outs. A raise here works as a semi-bluff.`,
        code: VerdictCode.POSTFLOP_OK, confidence: 'low',
      };
    }

    const evLossBB = Math.min(2.5, potBB * 0.25);
    return {
      actionIndex: d.actionIndex, severity: severityOfMistake(evLossBB), actualAction: action,
      recommended: equity > 0.45 ? call : [{ kind: 'fold', sizingPotFraction: null, frequency: 1, evLossBB: 0 }],
      evLossBB,
      explanation:
        `${shape} at roughly ${pct(equity)} against ${label}. Raising is called mostly by better ` +
        `hands, so it turns a playable holding into a losing one.`,
      code: VerdictCode.POSTFLOP_BAD_RAISE, confidence: 'low',
    };
  }

  function judgePostflop(
    hand: Hand, d: DecisionPoint,
  ): DecisionVerdict | SkippedDecision {
    const action = hand.actions[d.actionIndex]!;
    if (!d.heroCards) {
      return { actionIndex: d.actionIndex, reason: 'Hole cards are not in this hand history' };
    }
    // Bets, checks and raises are judged against the assumed villain range
    // rather than skipped: with a balanced opponent, the range is knowable, and
    // that is what separates a value bet from a spew.
    if (d.toCall <= 0) {
      return action.kind === 'check'
        ? judgeCheck(hand, d)
        : judgeBet(hand, d);
    }
    if (action.kind === 'raise' || action.kind === 'bet') {
      return judgeRaise(hand, d);
    }
    if (action.kind !== 'call' && action.kind !== 'fold') {
      return {
        actionIndex: d.actionIndex,
        reason: `No model for a postflop ${action.kind} in this engine`,
      };
    }

    const opponents = Math.max(1, d.playersInHand - 1);
    const { range, label } = villainRange(d);
    const { equity } = equityVsRange(d.heroCards, d.board, range, opponents, 2500);
    const odds = potOdds(d.toCall, d.potBefore);
    const margin = equity - odds;
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

    // Equity now comes from a modeled betting range rather than a random hand,
    // so the cushion can be tighter than it was — but it stays non-zero, since
    // the range is an assumption about a balanced villain, not a read.
    const CALL_MARGIN = 0.04;

    if (action.kind === 'fold' && margin > 0.10) {
      const evLossBB = Math.min(1.5, margin * toBB(d.potBefore, hand.money) * 0.35);
      return {
        actionIndex: d.actionIndex,
        severity: severityOfMistake(evLossBB),
        actualAction: action,
        recommended: [{ kind: 'call', sizingPotFraction: null, frequency: 1, evLossBB: 0 }],
        evLossBB,
        explanation:
          `Calling needed ${pct(odds)} equity and this hand has roughly ${pct(equity)} against ` +
          `${label}. Folding gives up a clearly profitable call.`,
        code: VerdictCode.POSTFLOP_OVERFOLD,
        confidence: 'low',
      };
    }

    if (action.kind === 'call' && margin < -CALL_MARGIN) {
      const evLossBB = Math.abs(margin) * toBB(d.potBefore, hand.money) * 0.5;
      return {
        actionIndex: d.actionIndex,
        severity: severityOfMistake(evLossBB),
        actualAction: action,
        recommended: [{ kind: 'fold', sizingPotFraction: null, frequency: 1, evLossBB: 0 }],
        evLossBB,
        explanation:
          `Calling needs ${pct(odds)} equity but this hand has roughly ${pct(equity)} against ` +
          `${label}. Heuristic only — not a solver result.`,
        code: VerdictCode.POSTFLOP_BAD_CALL,
        confidence: 'low',
      };
    }

    return {
      actionIndex: d.actionIndex,
      severity: 'ok',
      actualAction: action,
      recommended: [],
      evLossBB: 0,
      explanation:
        action.kind === 'fold'
          ? `Folding needed ${pct(odds)} equity; roughly ${pct(equity)} against ${label}. Reasonable.`
          : `Calling needed ${pct(odds)} equity; roughly ${pct(equity)} against ${label}.`,
      code: VerdictCode.POSTFLOP_OK,
      confidence: 'low',
    };
  }

  return {
    id: ENGINE_ID,
    version: ENGINE_VERSION,
    displayName: 'Charts + heuristics (offline)',
    capabilities,

    async analyze(hand: Hand, signal?: AbortSignal): Promise<HandAnalysis> {
      const verdicts: DecisionVerdict[] = [];
      const skipped: SkippedDecision[] = [];

      for (const seat of hand.seats) {
        for (const d of extractDecisions(hand, seat.seat)) {
          if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
          const result = d.street === 'preflop' ? judgePreflop(hand, d) : judgePostflop(hand, d);
          if ('severity' in result) verdicts.push(result);
          else skipped.push(result);
        }
      }

      const totalEvLossBB = verdicts.reduce((acc, v) => acc + (v.evLossBB ?? 0), 0);

      return {
        handId: hand.id,
        engineId: ENGINE_ID,
        engineVersion: ENGINE_VERSION,
        verdicts,
        totalEvLossBB,
        skipped,
      };
    },
  };
}
