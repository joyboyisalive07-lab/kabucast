/**
 * The probability of the observed prices given a scenario and a base price.
 *
 * Every factor here is a measure over continuous rates, never a count of
 * branches. The three primitives correspond to the three ways the generator
 * ties slots together: not at all, through a decreasing chain, and through the
 * shared peak rate of the small spike.
 */

import { at } from "../model/array.ts";
import { SMALL_PEAK_FLANK_PRICE_OFFSET, SMALL_SPIKE_PEAK_LENGTH } from "../model/constants.ts";
import { decayStepBounds, rateBounds } from "../model/rate.ts";
import type { Interval } from "../model/rate.ts";
import type { Scenario } from "../model/types.ts";
import { intersectionLength, rateIntervalForPrice } from "./inversion.ts";
import { integrateRegions, peakRegions } from "./peak.ts";
import { mass, restrict, scale, shiftedByUniform, uniformDensity } from "./piecewise.ts";

/** One entry per selling slot; null where the player has not typed a price. */
export type Observations = readonly (number | null)[];

/** A slot whose rate is one uniform draw that nothing else depends on. */
export function independentProbability(range: Interval, constraint: Interval | null): number {
  if (constraint === null) {
    return 1;
  }
  return intersectionLength(range, constraint) / (range.hi - range.lo);
}

/**
 * The volume of the polytope carved out of a decreasing phase.
 *
 * The rate density is carried forward exactly: conditioning on an observation
 * multiplies in the mass that survives and renormalises, and moving to the
 * next slot convolves with the decrement. The product of the surviving masses
 * is the chain-rule factorisation of the volume.
 */
export function decayRunProbability(
  start: Interval,
  step: Interval,
  constraints: readonly (Interval | null)[],
): number {
  let lastConstrained = -1;
  for (let i = 0; i < constraints.length; i += 1) {
    if (at(constraints, i) !== null) {
      lastConstrained = i;
    }
  }
  if (lastConstrained < 0) {
    return 1;
  }

  let density = uniformDensity(start.lo, start.hi);
  let probability = 1;

  for (let i = 0; i <= lastConstrained; i += 1) {
    const constraint = at(constraints, i);
    if (constraint !== null) {
      const surviving = mass(density, constraint.lo, constraint.hi);
      if (!(surviving > 0)) {
        return 0;
      }
      const restricted = restrict(density, constraint.lo, constraint.hi);
      if (restricted === null) {
        return 0;
      }
      probability *= surviving;
      density = scale(restricted, 1 / surviving);
    }
    if (i < lastConstrained) {
      density = shiftedByUniform(density, step.lo, step.hi);
    }
  }

  return probability;
}

/**
 * The three correlated slots of the small spike. The decomposition it
 * integrates lives in peak.ts, because the path sampler inverts the same
 * regions. See docs/ALGORITHM.md, "The small-spike peak".
 */
export function peakProbability(
  peak: Interval,
  floor: number,
  firstFlank: Interval | null,
  middle: Interval | null,
  lastFlank: Interval | null,
): number {
  const regions = peakRegions(peak, floor, firstFlank, middle, lastFlank);
  return integrateRegions(regions) / (peak.hi - peak.lo);
}

export function scenarioLikelihood(
  scenario: Scenario,
  basePrice: number,
  observations: Observations,
): number {
  let probability = 1;
  let slot = 0;

  const constraintAt = (offset: number, priceOffset: number): Interval | null => {
    const price = at(observations, offset);
    return price === null ? null : rateIntervalForPrice(price, basePrice, priceOffset);
  };

  for (const segment of scenario.segments) {
    switch (segment.kind) {
      case "independent": {
        const range = rateBounds(segment.rate);
        for (let i = 0; i < segment.length; i += 1) {
          probability *= independentProbability(range, constraintAt(slot + i, 0));
          if (probability === 0) {
            return 0;
          }
        }
        slot += segment.length;
        break;
      }

      case "decay": {
        const constraints: (Interval | null)[] = [];
        for (let i = 0; i < segment.length; i += 1) {
          constraints.push(constraintAt(slot + i, 0));
        }
        probability *= decayRunProbability(
          rateBounds(segment.start),
          decayStepBounds(segment.step),
          constraints,
        );
        if (probability === 0) {
          return 0;
        }
        slot += segment.length;
        break;
      }

      case "peak": {
        probability *= peakProbability(
          rateBounds(segment.peak),
          segment.flankFloor,
          constraintAt(slot, SMALL_PEAK_FLANK_PRICE_OFFSET),
          constraintAt(slot + 1, 0),
          constraintAt(slot + 2, SMALL_PEAK_FLANK_PRICE_OFFSET),
        );
        if (probability === 0) {
          return 0;
        }
        slot += SMALL_SPIKE_PEAK_LENGTH;
        break;
      }
    }
  }

  return probability;
}
