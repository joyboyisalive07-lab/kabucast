/**
 * The posterior over (pattern, phase assignment, base price).
 *
 * The prior comes from the transition matrix, the likelihood from the measures
 * in likelihood.ts, and nothing else is added. An unknown previous week and an
 * unknown Sunday price are both marginalised inside the same sum, so their
 * posteriors fall out of one normalisation rather than being fixed in advance.
 */

import { at } from "../model/array.ts";
import { BASE_PRICE_MAX, BASE_PRICE_MIN } from "../model/constants.ts";
import { patternPrior } from "../model/prior.ts";
import { SCENARIOS_BY_PATTERN } from "../model/scenario.ts";
import { PATTERNS } from "../model/types.ts";
import type { Pattern, Scenario } from "../model/types.ts";
import { scenarioLikelihood } from "./likelihood.ts";
import type { Observations } from "./likelihood.ts";

export interface PredictorInput {
  /** The Sunday buy price, or null when the player did not record it. */
  readonly basePrice: number | null;
  readonly observations: Observations;
  /** Null means unknown, which is marginalised rather than guessed. */
  readonly previousPattern: Pattern | null;
  readonly firstBuy: boolean;
}

export interface PosteriorTerm {
  readonly scenario: Scenario;
  readonly basePrice: number;
  readonly probability: number;
}

export interface ScenarioProbability {
  readonly scenario: Scenario;
  readonly probability: number;
}

export interface BasePriceProbability {
  readonly basePrice: number;
  readonly probability: number;
}

export interface Posterior {
  /** Every surviving (scenario, base price) pair; the probabilities sum to one. */
  readonly terms: readonly PosteriorTerm[];
  /** Indexed by pattern; sums to one. */
  readonly patterns: readonly number[];
  /** Base price marginalised out; sums to one. */
  readonly scenarios: readonly ScenarioProbability[];
  /** Scenario marginalised out; sums to one. */
  readonly basePrices: readonly BasePriceProbability[];
  /**
   * The marginal likelihood of the observations under this input, before
   * normalisation. Two inputs that differ only in their prior can be combined
   * through this number, which is what makes marginalising over the previous
   * week checkable against doing it by hand.
   */
  readonly evidence: number;
}

function candidateBasePrices(basePrice: number | null): readonly number[] | null {
  if (basePrice === null) {
    const candidates: number[] = [];
    for (let price = BASE_PRICE_MIN; price <= BASE_PRICE_MAX; price += 1) {
      candidates.push(price);
    }
    return candidates;
  }
  if (!Number.isInteger(basePrice) || basePrice < BASE_PRICE_MIN || basePrice > BASE_PRICE_MAX) {
    return null;
  }
  return [basePrice];
}

/**
 * Null means no scenario survives: the prices cannot come from the generator,
 * with the tolerance of inversion.ts already allowed for. kabucast reports that
 * rather than widening the data until something matches.
 */
export function computePosterior(input: PredictorInput): Posterior | null {
  const bases = candidateBasePrices(input.basePrice);
  if (bases === null) {
    return null;
  }

  const priorOverPatterns = patternPrior(input.previousPattern, input.firstBuy);
  const basePriorWeight = 1 / bases.length;

  const terms: PosteriorTerm[] = [];
  let evidence = 0;

  for (const pattern of PATTERNS) {
    const prior = at(priorOverPatterns, pattern);
    if (prior === 0) {
      continue;
    }
    for (const scenario of at(SCENARIOS_BY_PATTERN, pattern)) {
      const scenarioPrior = prior * scenario.probability * basePriorWeight;
      for (const basePrice of bases) {
        const likelihood = scenarioLikelihood(scenario, basePrice, input.observations);
        if (likelihood <= 0) {
          continue;
        }
        const weight = scenarioPrior * likelihood;
        if (weight <= 0) {
          continue;
        }
        terms.push({ scenario, basePrice, probability: weight });
        evidence += weight;
      }
    }
  }

  if (terms.length === 0 || !(evidence > 0)) {
    return null;
  }

  const normalised = terms.map(
    (term): PosteriorTerm => ({ ...term, probability: term.probability / evidence }),
  );

  const patterns = PATTERNS.map(() => 0);
  const byScenario = new Map<Scenario, number>();
  const byBasePrice = new Map<number, number>();

  for (const term of normalised) {
    patterns[term.scenario.pattern] = at(patterns, term.scenario.pattern) + term.probability;
    byScenario.set(term.scenario, (byScenario.get(term.scenario) ?? 0) + term.probability);
    byBasePrice.set(term.basePrice, (byBasePrice.get(term.basePrice) ?? 0) + term.probability);
  }

  const scenarios: ScenarioProbability[] = [];
  for (const [scenario, probability] of byScenario) {
    scenarios.push({ scenario, probability });
  }

  const basePrices: BasePriceProbability[] = [];
  for (const basePrice of bases) {
    const probability = byBasePrice.get(basePrice);
    if (probability !== undefined) {
      basePrices.push({ basePrice, probability });
    }
  }

  return { terms: normalised, patterns, scenarios, basePrices, evidence };
}
