/**
 * Turning an observed integer price back into the interval of rates that could
 * have produced it.
 *
 * `intceil(v) = (int)(v + 0.99999f)`, so `intceil(rate * base) = q` holds
 * exactly when `rate * base` lies in `[q - 0.99999, q + 0.00001)`, an interval
 * of width one bell and therefore of width `1 / base` in rate units. The
 * derivation is in docs/ALGORITHM.md, "From a price to a rate interval".
 */

import { ROUNDING_ADDEND } from "../model/constants.ts";
import type { Interval } from "../model/rate.ts";

/**
 * The game rounds `rate * base` in float32 while this runs in doubles, so the
 * true rate can sit just outside the inverted interval. Left uncorrected that
 * rejects a whole scenario rather than perturbing a probability.
 * tests/generator.test.ts measures the excursion at under 1e-6 in rate units
 * over 200 000 draws. The same widened interval is used for the feasibility
 * test and for the measure, so a reported probability stays the measure of
 * what was actually accepted; it adds about 1e-5 relative. See DECISIONS.md
 * D-009.
 */
export const FLOAT32_RATE_TOLERANCE = 1e-6;

/**
 * `priceOffset` is what the generator added after rounding: zero everywhere
 * except the two flanking slots of the small spike, which subtract one.
 */
export function rateIntervalForPrice(
  price: number,
  basePrice: number,
  priceOffset: number,
): Interval {
  const rounded = price - priceOffset;
  return {
    lo: (rounded - ROUNDING_ADDEND) / basePrice - FLOAT32_RATE_TOLERANCE,
    hi: (rounded + (1 - ROUNDING_ADDEND)) / basePrice + FLOAT32_RATE_TOLERANCE,
  };
}

export function intersectionLength(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo));
}
