/**
 * Every constant of the game's price generator.
 *
 * Each one is traced in docs/ALGORITHM.md to the line of the decompiled source
 * it was read from. Nothing here was written from memory, and nothing here is
 * defined anywhere else in the codebase.
 */

import type { DecayStep, RateDraw } from "./types.ts";

/** The game stores these as 32-bit floats; the literals below are decimal. */
function f32(value: number): number {
  return Math.fround(value);
}

/** `randfloat(a, b)`, which the game calls with `a > b` for descending ranges. */
function randfloatRange(a: number, b: number): RateDraw {
  return { origin: f32(a), span: f32(f32(b) - f32(a)) };
}

/** `top - randfloat(0, spread)`, the form pattern 2 uses for its start rate. */
function subtractedRange(top: number, spread: number): RateDraw {
  return { origin: f32(top), span: -f32(spread) };
}

export const SELLING_SLOT_COUNT = 12;

/** Selling slots occupy entries 2..13 of the game's 14-entry array. */
export const GAME_SLOT_OFFSET = 2;

export const BASE_PRICE_MIN = 90;
export const BASE_PRICE_MAX = 110;

/** `intceil(v)` is `(int)(v + 0.99999f)`, which is not a ceiling. */
export const ROUNDING_ADDEND = f32(0.99999);

/** `randfloat` keeps 23 bits of the 32-bit draw. */
export const RANDFLOAT_DISCARDED_BITS = 9;
export const RANDFLOAT_LATTICE = 2 ** 23;

export const UINT32_RANGE = 2 ** 32;
export const TOP_BIT_MASK = 0x80000000;

export const CHANCE_MIN = 0;
export const CHANCE_MAX = 99;

/**
 * `chance < thresholds[k]` selects pattern `k`, falling through to the small
 * spike. Rows are indexed by the previous week's pattern. Probabilities are
 * derived from these in prior.ts rather than stated twice.
 */
export const TRANSITION_THRESHOLDS = [
  [20, 50, 65],
  [50, 55, 75],
  [25, 70, 75],
  [45, 70, 85],
] as const;

export const RATE_HIGH = randfloatRange(0.9, 1.4);
export const RATE_LOW_TAIL = randfloatRange(0.4, 0.9);
export const RATE_SPIKE_SHOULDER = randfloatRange(1.4, 2.0);
export const RATE_SPIKE_PEAK = randfloatRange(2.0, 6.0);

/** The five slots of the large spike, in the order the generator fills them. */
export const LARGE_SPIKE_RATES = [
  RATE_HIGH,
  RATE_SPIKE_SHOULDER,
  RATE_SPIKE_PEAK,
  RATE_SPIKE_SHOULDER,
  RATE_HIGH,
] as const;

export const RATE_SMALL_PEAK = randfloatRange(1.4, 2.0);
export const SMALL_PEAK_FLANK_FLOOR = f32(1.4);

/** The flanking slots of the small spike subtract one after rounding. */
export const SMALL_PEAK_FLANK_PRICE_OFFSET = -1;

export const FLUCTUATING_DECAY_START = randfloatRange(0.8, 0.6);
export const FLUCTUATING_DECAY_STEP: DecayStep = { fixed: f32(0.04), randomSpan: f32(0.06) };

export const LARGE_SPIKE_DECAY_START = randfloatRange(0.9, 0.85);
export const DECREASING_DECAY_START = subtractedRange(0.9, 0.05);
export const SMALL_SPIKE_DECAY_START = randfloatRange(0.9, 0.4);

/** Patterns 1, 2 and 3 share one decrement rule. */
export const SLOW_DECAY_STEP: DecayStep = { fixed: f32(0.03), randomSpan: f32(0.02) };

/** `randbool() ? 3 : 2`, so index 0 is the true branch. */
export const FLUCTUATING_DECAY_1_LENGTHS = [3, 2] as const;
export const FLUCTUATING_DECAY_TOTAL = 5;
export const FLUCTUATING_HIGH_1_MAX = 6;
export const FLUCTUATING_HIGH_TOTAL = 7;

export const LARGE_SPIKE_PEAK_START_MIN = 3;
export const LARGE_SPIKE_PEAK_START_MAX = 9;

export const SMALL_SPIKE_PEAK_START_MIN = 2;
export const SMALL_SPIKE_PEAK_START_MAX = 9;
export const SMALL_SPIKE_HIGH_LENGTH = 2;
export const SMALL_SPIKE_PEAK_LENGTH = 3;
