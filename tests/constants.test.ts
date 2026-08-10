/**
 * The constant tables of docs/ALGORITHM.md, restated as assertions.
 *
 * The values checked here are derived ones — the interval a draw can land in,
 * the interval a decrement can take, the probability a threshold implies — so
 * these exercise the conversion from the source's literal arguments rather
 * than comparing a constant to itself.
 */

import { test } from "node:test";
import { ok, deepEqual, equal } from "node:assert/strict";
import {
  BASE_PRICE_MAX,
  BASE_PRICE_MIN,
  DECREASING_DECAY_START,
  FLUCTUATING_DECAY_1_LENGTHS,
  FLUCTUATING_DECAY_START,
  FLUCTUATING_DECAY_STEP,
  FLUCTUATING_DECAY_TOTAL,
  FLUCTUATING_HIGH_1_MAX,
  FLUCTUATING_HIGH_TOTAL,
  LARGE_SPIKE_DECAY_START,
  LARGE_SPIKE_PEAK_START_MAX,
  LARGE_SPIKE_PEAK_START_MIN,
  LARGE_SPIKE_RATES,
  RATE_HIGH,
  RATE_LOW_TAIL,
  RATE_SMALL_PEAK,
  RATE_SPIKE_PEAK,
  RATE_SPIKE_SHOULDER,
  SELLING_SLOT_COUNT,
  SLOW_DECAY_STEP,
  SMALL_PEAK_FLANK_FLOOR,
  SMALL_PEAK_FLANK_PRICE_OFFSET,
  SMALL_SPIKE_DECAY_START,
  SMALL_SPIKE_HIGH_LENGTH,
  SMALL_SPIKE_PEAK_LENGTH,
  SMALL_SPIKE_PEAK_START_MAX,
  SMALL_SPIKE_PEAK_START_MIN,
} from "../src/model/constants.ts";
import { decayStepBounds, rateBounds } from "../src/model/rate.ts";
import type { DecayStep, RateDraw } from "../src/model/types.ts";

/** float32 is the game's storage, so the documented decimals are compared there. */
const F32_TOLERANCE = 1e-7;

function assertBounds(draw: RateDraw, lo: number, hi: number, label: string): void {
  const bounds = rateBounds(draw);
  ok(Math.abs(bounds.lo - lo) < F32_TOLERANCE, `${label} low: ${bounds.lo} vs ${lo}`);
  ok(Math.abs(bounds.hi - hi) < F32_TOLERANCE, `${label} high: ${bounds.hi} vs ${hi}`);
}

function assertDecay(step: DecayStep, lo: number, hi: number, label: string): void {
  const bounds = decayStepBounds(step);
  ok(Math.abs(bounds.lo - lo) < F32_TOLERANCE, `${label} low: ${bounds.lo} vs ${lo}`);
  ok(Math.abs(bounds.hi - hi) < F32_TOLERANCE, `${label} high: ${bounds.hi} vs ${hi}`);
}

test("slot and base price constants match ALGORITHM.md", () => {
  equal(SELLING_SLOT_COUNT, 12);
  equal(BASE_PRICE_MIN, 90);
  equal(BASE_PRICE_MAX, 110);
});

test("rate ranges match ALGORITHM.md", () => {
  assertBounds(RATE_HIGH, 0.9, 1.4, "high phase");
  assertBounds(RATE_LOW_TAIL, 0.4, 0.9, "large spike tail");
  assertBounds(RATE_SPIKE_SHOULDER, 1.4, 2.0, "large spike shoulder");
  assertBounds(RATE_SPIKE_PEAK, 2.0, 6.0, "large spike peak");
  assertBounds(RATE_SMALL_PEAK, 1.4, 2.0, "small spike peak");
  equal(Math.fround(SMALL_PEAK_FLANK_FLOOR), Math.fround(1.4));
  equal(SMALL_PEAK_FLANK_PRICE_OFFSET, -1);
});

test("the five large spike slots are in the documented order", () => {
  equal(LARGE_SPIKE_RATES.length, 5);
  deepEqual(
    LARGE_SPIKE_RATES.map((rate) => {
      const bounds = rateBounds(rate);
      return [Math.round(bounds.lo * 10) / 10, Math.round(bounds.hi * 10) / 10];
    }),
    [
      [0.9, 1.4],
      [1.4, 2],
      [2, 6],
      [1.4, 2],
      [0.9, 1.4],
    ],
  );
});

test("decreasing phase start rates match ALGORITHM.md", () => {
  assertBounds(FLUCTUATING_DECAY_START, 0.6, 0.8, "fluctuating start");
  assertBounds(LARGE_SPIKE_DECAY_START, 0.85, 0.9, "large spike start");
  assertBounds(DECREASING_DECAY_START, 0.85, 0.9, "decreasing start");
  assertBounds(SMALL_SPIKE_DECAY_START, 0.4, 0.9, "small spike start");
});

test("the descending ranges keep the source's orientation", () => {
  ok(FLUCTUATING_DECAY_START.span < 0, "fluctuating start is drawn from the top down");
  ok(LARGE_SPIKE_DECAY_START.span < 0, "large spike start is drawn from the top down");
  ok(DECREASING_DECAY_START.span < 0, "decreasing start is written as a subtraction");
  ok(SMALL_SPIKE_DECAY_START.span < 0, "small spike start is drawn from the top down");
  ok(RATE_HIGH.span > 0, "ascending ranges stay ascending");
});

test("the two forms of the 0.85 to 0.9 start rate are not bit-identical", () => {
  // The large spike writes randfloat(0.9, 0.85) and the decreasing pattern
  // writes 0.9 - randfloat(0, 0.05). Same support, different float32 span.
  // ALGORITHM.md records that this is why RateDraw keeps the affine form.
  notEqualNumbers(LARGE_SPIKE_DECAY_START.span, DECREASING_DECAY_START.span);
  ok(Math.abs(LARGE_SPIKE_DECAY_START.span - DECREASING_DECAY_START.span) < 1e-6);
});

function notEqualNumbers(a: number, b: number): void {
  ok(a !== b, `expected different float32 values, both were ${a}`);
}

test("decay steps match ALGORITHM.md", () => {
  assertDecay(FLUCTUATING_DECAY_STEP, 0.04, 0.1, "fluctuating step");
  assertDecay(SLOW_DECAY_STEP, 0.03, 0.05, "slow step");
});

test("phase length constants match ALGORITHM.md", () => {
  deepEqual([...FLUCTUATING_DECAY_1_LENGTHS], [3, 2]);
  equal(FLUCTUATING_DECAY_TOTAL, 5);
  equal(FLUCTUATING_HIGH_1_MAX, 6);
  equal(FLUCTUATING_HIGH_TOTAL, 7);
  equal(LARGE_SPIKE_PEAK_START_MIN, 3);
  equal(LARGE_SPIKE_PEAK_START_MAX, 9);
  equal(SMALL_SPIKE_PEAK_START_MIN, 2);
  equal(SMALL_SPIKE_PEAK_START_MAX, 9);
  equal(SMALL_SPIKE_HIGH_LENGTH, 2);
  equal(SMALL_SPIKE_PEAK_LENGTH, 3);
});
