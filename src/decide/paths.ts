/**
 * Drawing price paths for the slots the player has not seen yet.
 *
 * A path is drawn by picking a posterior term in proportion to its
 * probability, then completing the week under that term conditioned on
 * everything already observed. Past slots are never redrawn: the decision only
 * involves what is still ahead.
 *
 * Conditioning is exact rather than by rejection. Inside a decreasing phase the
 * rate density is filtered forward through the observed slots with the same
 * machinery the likelihood uses, and the rate at the first unseen slot is drawn
 * from that filtered density by inverting its distribution function. From there
 * the chain runs forward with fresh decrements. The shared rate of a small
 * spike is drawn the same way, from the closed form in infer/peak.ts.
 *
 * A term is described by a flat list of instructions of one shape rather than
 * by a closure per segment. Thousands of distinct closures reaching one call
 * site made the dispatch megamorphic and cost more than the arithmetic did.
 */

import { at } from "../model/array.ts";
import { SELLING_SLOT_COUNT, SMALL_PEAK_FLANK_PRICE_OFFSET } from "../model/constants.ts";
import { priceFromRate } from "../model/generator.ts";
import { decayStepBounds, rateBounds } from "../model/rate.ts";
import type { Interval } from "../model/rate.ts";
import type { Rng } from "../model/rng.ts";
import { segmentLength } from "../model/scenario.ts";
import { rateIntervalForPrice } from "../infer/inversion.ts";
import type { Observations } from "../infer/likelihood.ts";
import { peakQuantile, peakRegions } from "../infer/peak.ts";
import type { PeakRegion } from "../infer/peak.ts";
import {
  mass,
  prepareQuantile,
  quantileFrom,
  restrict,
  scale,
  shiftedByUniform,
  uniformDensity,
} from "../infer/piecewise.ts";
import type { PiecewisePolynomial, PreparedQuantile } from "../infer/piecewise.ts";
import type { Posterior, PosteriorTerm } from "../infer/posterior.ts";

const KIND_UNIFORM = 0;
const KIND_DECAY_FRESH = 1;
const KIND_DECAY_CONTINUE = 2;
const KIND_PEAK = 3;

/** One shape for every instruction so that the interpreter stays monomorphic. */
interface Instruction {
  readonly kind: number;
  /** Half-open range of week slots this instruction fills. */
  readonly from: number;
  readonly to: number;
  /** Where the segment itself began, so the peak can find its middle slot. */
  readonly segmentStart: number;
  readonly lo: number;
  readonly hi: number;
  readonly stepLo: number;
  readonly stepHi: number;
  readonly floor: number;
  readonly prepared: PreparedQuantile | null;
  readonly regions: readonly PeakRegion[] | null;
}

export interface PathSampler {
  /** The first slot the player has not recorded; everything before it is past. */
  readonly firstFutureSlot: number;
  readonly futureLength: number;
  /** Fills `out[0 .. futureLength - 1]` with prices for the remaining slots. */
  sample(rng: Rng, out: number[]): void;
}

/** The rate density at `constraints.length` steps in, conditioned on each observed slot. */
function filterForward(
  start: Interval,
  step: Interval,
  constraints: readonly (Interval | null)[],
): PiecewisePolynomial | null {
  let density = uniformDensity(start.lo, start.hi);
  for (let i = 0; i < constraints.length; i += 1) {
    const constraint = at(constraints, i);
    if (constraint !== null) {
      const surviving = mass(density, constraint.lo, constraint.hi);
      if (!(surviving > 0)) {
        return null;
      }
      const restricted = restrict(density, constraint.lo, constraint.hi);
      if (restricted === null) {
        return null;
      }
      density = scale(restricted, 1 / surviving);
    }
    density = shiftedByUniform(density, step.lo, step.hi);
  }
  return density;
}

function instruction(fields: Partial<Instruction> & { kind: number; from: number; to: number }): Instruction {
  return {
    segmentStart: fields.from,
    lo: 0,
    hi: 0,
    stepLo: 0,
    stepHi: 0,
    floor: 0,
    prepared: null,
    regions: null,
    ...fields,
  };
}

function buildTermProgram(
  term: PosteriorTerm,
  observations: Observations,
  firstFutureSlot: number,
): readonly Instruction[] {
  const basePrice = term.basePrice;
  const program: Instruction[] = [];
  const constraintAt = (slot: number, priceOffset: number): Interval | null => {
    const price = at(observations, slot);
    return price === null ? null : rateIntervalForPrice(price, basePrice, priceOffset);
  };

  let slot = 0;
  for (const segment of term.scenario.segments) {
    const start = slot;
    const end = slot + segmentLength(segment);
    slot = end;
    if (end <= firstFutureSlot) {
      continue;
    }
    const from = Math.max(start, firstFutureSlot);

    switch (segment.kind) {
      case "independent": {
        const range = rateBounds(segment.rate);
        program.push(
          instruction({ kind: KIND_UNIFORM, from, to: end, lo: range.lo, hi: range.hi }),
        );
        break;
      }

      case "decay": {
        const startRange = rateBounds(segment.start);
        const stepRange = decayStepBounds(segment.step);
        if (start >= firstFutureSlot) {
          program.push(
            instruction({
              kind: KIND_DECAY_FRESH,
              from,
              to: end,
              lo: startRange.lo,
              hi: startRange.hi,
              stepLo: stepRange.lo,
              stepHi: stepRange.hi,
            }),
          );
          break;
        }
        const past: (Interval | null)[] = [];
        for (let i = start; i < firstFutureSlot; i += 1) {
          past.push(constraintAt(i, 0));
        }
        const filtered = filterForward(startRange, stepRange, past);
        if (filtered === null) {
          // The term reached the posterior with positive weight, so the same
          // masses that survived there cannot vanish here.
          throw new Error("a surviving posterior term has an empty rate density");
        }
        program.push(
          instruction({
            kind: KIND_DECAY_CONTINUE,
            from,
            to: end,
            prepared: prepareQuantile(filtered),
            stepLo: stepRange.lo,
            stepHi: stepRange.hi,
          }),
        );
        break;
      }

      case "peak": {
        const peakRange = rateBounds(segment.peak);
        const floor = segment.flankFloor;
        const observedFlank =
          start < firstFutureSlot ? constraintAt(start, SMALL_PEAK_FLANK_PRICE_OFFSET) : null;
        const observedMiddle = start + 1 < firstFutureSlot ? constraintAt(start + 1, 0) : null;
        program.push(
          instruction({
            kind: KIND_PEAK,
            from,
            to: end,
            segmentStart: start,
            floor,
            lo: peakRange.lo,
            hi: peakRange.hi,
            regions: peakRegions(peakRange, floor, observedFlank, observedMiddle, null),
          }),
        );
        break;
      }
    }
  }

  return program;
}

export function firstUnrecordedSlot(observations: Observations): number {
  let last = -1;
  for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
    if (at(observations, slot) !== null) {
      last = slot;
    }
  }
  return last + 1;
}

/**
 * Building a term's program means filtering a rate density through every
 * observed slot, which is the expensive part. Most of the posterior's terms
 * carry less probability than one path is worth and are never drawn, so the
 * work is deferred to a term's first use rather than done for all of them.
 * Nothing is dropped: a term that is never sampled still holds its weight in
 * the posterior, and would be built the moment it came up.
 */
export function buildPathSampler(posterior: Posterior, observations: Observations): PathSampler {
  const firstFutureSlot = firstUnrecordedSlot(observations);
  const futureLength = SELLING_SLOT_COUNT - firstFutureSlot;

  const terms = posterior.terms;
  const cumulative = new Float64Array(terms.length);
  const programs = new Array<readonly Instruction[] | undefined>(terms.length).fill(undefined);
  let running = 0;
  for (let index = 0; index < terms.length; index += 1) {
    running += at(terms, index).probability;
    cumulative[index] = running;
  }

  return {
    firstFutureSlot,
    futureLength,
    sample(rng: Rng, out: number[]): void {
      const draw = rng.nextFloat() * running;
      let low = 0;
      let high = terms.length - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        if ((cumulative[middle] ?? 0) < draw) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }

      let program = programs[low];
      if (program === undefined) {
        program = buildTermProgram(at(terms, low), observations, firstFutureSlot);
        programs[low] = program;
      }

      const basePrice = at(terms, low).basePrice;
      for (let index = 0; index < program.length; index += 1) {
        const step = program[index];
        if (step === undefined) {
          continue;
        }
        switch (step.kind) {
          case KIND_UNIFORM: {
            const span = step.hi - step.lo;
            for (let i = step.from; i < step.to; i += 1) {
              out[i - firstFutureSlot] = priceFromRate(step.lo + rng.nextFloat() * span, basePrice);
            }
            break;
          }
          case KIND_DECAY_FRESH:
          case KIND_DECAY_CONTINUE: {
            let rate =
              step.kind === KIND_DECAY_FRESH
                ? step.lo + rng.nextFloat() * (step.hi - step.lo)
                : quantileFrom(step.prepared as PreparedQuantile, rng.nextFloat());
            const decaySpan = step.stepHi - step.stepLo;
            for (let i = step.from; i < step.to; i += 1) {
              out[i - firstFutureSlot] = priceFromRate(rate, basePrice);
              rate -= step.stepLo + rng.nextFloat() * decaySpan;
            }
            break;
          }
          case KIND_PEAK: {
            const regions = step.regions;
            const rate =
              regions === null || regions.length === 0
                ? step.lo
                : step.floor + peakQuantile(regions, rng.nextFloat());
            const span = rate - step.floor;
            for (let i = step.from; i < step.to; i += 1) {
              out[i - firstFutureSlot] =
                i - step.segmentStart === 1
                  ? priceFromRate(rate, basePrice)
                  : priceFromRate(step.floor + rng.nextFloat() * span, basePrice) +
                    SMALL_PEAK_FLANK_PRICE_OFFSET;
            }
            break;
          }
          default:
            break;
        }
      }
    },
  };
}
