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
 * A flank of the small spike is uniform on `[floor, x]` once the peak rate `x`
 * is fixed, so with `v = x - floor` the probability it satisfies its
 * constraint is `alpha + beta / v` on each of three regions. Returning the two
 * coefficients lets the peak integral stay a closed form.
 */
interface FlankFactor {
  readonly alpha: number;
  readonly beta: number;
}

interface FlankShape {
  /** Distance from the floor to the bottom of the constraint. */
  readonly offset: number;
  /** Width of the constraint above that. */
  readonly width: number;
}

function flankShape(constraint: Interval | null, floor: number): FlankShape | null {
  if (constraint === null) {
    return null;
  }
  const bottom = Math.max(constraint.lo, floor);
  return { offset: bottom - floor, width: Math.max(0, constraint.hi - bottom) };
}

function flankFactor(shape: FlankShape | null, v: number): FlankFactor {
  if (shape === null) {
    return { alpha: 1, beta: 0 };
  }
  if (v < shape.offset) {
    return { alpha: 0, beta: 0 };
  }
  if (v <= shape.offset + shape.width) {
    return { alpha: 1, beta: -shape.offset };
  }
  return { alpha: 0, beta: shape.width };
}

/**
 * The three correlated slots of the small spike.
 *
 * Conditional on the shared rate `x`, the two flanks are independent and
 * uniform on `[floor, x]`, so the joint probability is a one-dimensional
 * integral whose integrand is a quadratic over `(x - floor)^2`. Substituting
 * `v = x - floor` reduces every piece to `A0 + A1 / v + A2 / v^2`, which
 * integrates to `A0 v + A1 ln v - A2 / v`. See docs/ALGORITHM.md, "The
 * small-spike peak".
 */
export function peakProbability(
  peak: Interval,
  floor: number,
  firstFlank: Interval | null,
  middle: Interval | null,
  lastFlank: Interval | null,
): number {
  const lo = middle === null ? peak.lo : Math.max(peak.lo, middle.lo);
  const hi = middle === null ? peak.hi : Math.min(peak.hi, middle.hi);
  if (!(hi > lo)) {
    return 0;
  }

  const first = flankShape(firstFlank, floor);
  const last = flankShape(lastFlank, floor);
  const vLo = lo - floor;
  const vHi = hi - floor;

  const cuts = [vLo, vHi];
  for (const shape of [first, last]) {
    if (shape === null) {
      continue;
    }
    for (const cut of [shape.offset, shape.offset + shape.width]) {
      if (cut > vLo && cut < vHi) {
        cuts.push(cut);
      }
    }
  }
  cuts.sort((a, b) => a - b);

  let integral = 0;
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const from = at(cuts, i);
    const to = at(cuts, i + 1);
    if (!(to > from)) {
      continue;
    }
    const middlePoint = (from + to) / 2;
    const a = flankFactor(first, middlePoint);
    const b = flankFactor(last, middlePoint);

    integral += a.alpha * b.alpha * (to - from);

    const reciprocal = a.alpha * b.beta + b.alpha * a.beta;
    if (reciprocal !== 0) {
      integral += reciprocal * Math.log(to / from);
    }

    const squared = a.beta * b.beta;
    if (squared !== 0) {
      integral -= squared * (1 / to - 1 / from);
    }
  }

  return integral / (peak.hi - peak.lo);
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
