/**
 * The game's price generator, reimplemented from the specification in
 * docs/ALGORITHM.md.
 *
 * The arithmetic is deliberately faithful rather than merely distributionally
 * correct: the uniform draw sits on the same 2^-23 lattice, every rate
 * operation is rounded through float32, and the rounding rule is the game's
 * `(int)(v + 0.99999f)` rather than a ceiling. That makes the simulated corpus
 * of phase 6 a fair test of the inference, including its float32 tolerance.
 *
 * The pseudo-random source is kabucast's own, not the game's `sead::Random`.
 * The draw *order* matches the original so that each draw consumes what the
 * original consumed, but the bit stream does not and is not meant to: a
 * player cannot observe the game's seed, so reproducing it would buy nothing.
 */

import { at } from "./array.ts";
import {
  BASE_PRICE_MAX,
  BASE_PRICE_MIN,
  CHANCE_MAX,
  CHANCE_MIN,
  FLUCTUATING_DECAY_1_LENGTHS,
  FLUCTUATING_HIGH_1_MAX,
  FLUCTUATING_HIGH_TOTAL,
  LARGE_SPIKE_PEAK_START_MAX,
  LARGE_SPIKE_PEAK_START_MIN,
  RANDFLOAT_DISCARDED_BITS,
  RANDFLOAT_LATTICE,
  ROUNDING_ADDEND,
  SMALL_PEAK_FLANK_PRICE_OFFSET,
  SMALL_SPIKE_PEAK_START_MAX,
  SMALL_SPIKE_PEAK_START_MIN,
  TOP_BIT_MASK,
  TRANSITION_THRESHOLDS,
  UINT32_RANGE,
} from "./constants.ts";
import type { Rng } from "./rng.ts";
import { buildScenario } from "./scenario.ts";
import {
  PATTERNS,
  PATTERN_DECREASING,
  PATTERN_FLUCTUATING,
  PATTERN_LARGE_SPIKE,
  PATTERN_SMALL_SPIKE,
} from "./types.ts";
import type { Pattern, RateDraw, Scenario } from "./types.ts";

export function randbool(rng: Rng): boolean {
  return (rng.nextUint32() & TOP_BIT_MASK) !== 0;
}

export function randint(rng: Rng, min: number, max: number): number {
  return Math.floor((rng.nextUint32() * (max - min + 1)) / UINT32_RANGE) + min;
}

/** The `u` of `randfloat`: 23 kept bits, so a value of the form k / 2^23. */
export function randUnit(rng: Rng): number {
  return (rng.nextUint32() >>> RANDFLOAT_DISCARDED_BITS) / RANDFLOAT_LATTICE;
}

export function drawRate(rng: Rng, draw: RateDraw): number {
  return Math.fround(draw.origin + Math.fround(randUnit(rng) * draw.span));
}

export function intceil(value: number): number {
  return Math.trunc(Math.fround(value + ROUNDING_ADDEND));
}

export function priceFromRate(rate: number, basePrice: number): number {
  return intceil(Math.fround(rate * basePrice));
}

export function drawBasePrice(rng: Rng): number {
  return randint(rng, BASE_PRICE_MIN, BASE_PRICE_MAX);
}

export function drawNextPattern(rng: Rng, previousPattern: Pattern): Pattern {
  const chance = randint(rng, CHANCE_MIN, CHANCE_MAX);
  const thresholds = at(TRANSITION_THRESHOLDS, previousPattern);
  for (let index = 0; index < thresholds.length; index += 1) {
    if (chance < at(thresholds, index)) {
      return at(PATTERNS, index);
    }
  }
  return PATTERN_SMALL_SPIKE;
}

export function drawScenario(rng: Rng, pattern: Pattern): Scenario {
  switch (pattern) {
    case PATTERN_FLUCTUATING: {
      const decreasingPhase1Length = randbool(rng)
        ? at(FLUCTUATING_DECAY_1_LENGTHS, 0)
        : at(FLUCTUATING_DECAY_1_LENGTHS, 1);
      const highPhase1Length = randint(rng, 0, FLUCTUATING_HIGH_1_MAX);
      const highPhase3Length = randint(rng, 0, FLUCTUATING_HIGH_TOTAL - highPhase1Length - 1);
      return buildScenario({ pattern, decreasingPhase1Length, highPhase1Length, highPhase3Length });
    }
    case PATTERN_LARGE_SPIKE:
      return buildScenario({
        pattern,
        peakStart: randint(rng, LARGE_SPIKE_PEAK_START_MIN, LARGE_SPIKE_PEAK_START_MAX),
      });
    case PATTERN_DECREASING:
      return buildScenario({ pattern });
    case PATTERN_SMALL_SPIKE:
      return buildScenario({
        pattern,
        peakStart: randint(rng, SMALL_SPIKE_PEAK_START_MIN, SMALL_SPIKE_PEAK_START_MAX),
      });
  }
}

export function drawPrices(rng: Rng, scenario: Scenario, basePrice: number): readonly number[] {
  const prices: number[] = [];

  for (const segment of scenario.segments) {
    switch (segment.kind) {
      case "independent":
        for (let index = 0; index < segment.length; index += 1) {
          prices.push(priceFromRate(drawRate(rng, segment.rate), basePrice));
        }
        break;

      case "decay": {
        let rate = drawRate(rng, segment.start);
        for (let index = 0; index < segment.length; index += 1) {
          prices.push(priceFromRate(rate, basePrice));
          const afterFixed = Math.fround(rate - segment.step.fixed);
          rate = Math.fround(afterFixed - Math.fround(randUnit(rng) * segment.step.randomSpan));
        }
        break;
      }

      case "peak": {
        const peakRate = drawRate(rng, segment.peak);
        const flank: RateDraw = {
          origin: segment.flankFloor,
          span: Math.fround(peakRate - segment.flankFloor),
        };
        prices.push(
          priceFromRate(drawRate(rng, flank), basePrice) + SMALL_PEAK_FLANK_PRICE_OFFSET,
        );
        prices.push(priceFromRate(peakRate, basePrice));
        prices.push(
          priceFromRate(drawRate(rng, flank), basePrice) + SMALL_PEAK_FLANK_PRICE_OFFSET,
        );
        break;
      }
    }
  }

  return prices;
}

export interface WeekDraw {
  readonly pattern: Pattern;
  readonly scenario: Scenario;
  readonly basePrice: number;
  readonly prices: readonly number[];
}

/**
 * A first-time buyer is forced to the small spike, but the pattern draw still
 * happens first and still consumes its randomness, as in the original.
 */
export function drawWeek(rng: Rng, previousPattern: Pattern, firstBuy: boolean): WeekDraw {
  const basePrice = drawBasePrice(rng);
  const selected = drawNextPattern(rng, previousPattern);
  const pattern = firstBuy ? PATTERN_SMALL_SPIKE : selected;
  const scenario = drawScenario(rng, pattern);
  return { pattern, scenario, basePrice, prices: drawPrices(rng, scenario, basePrice) };
}
