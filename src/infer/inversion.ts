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

const FLOAT32_MANTISSA_BITS = 23;
const FLOAT32_SMALLEST_SUBNORMAL = 2 ** -149;

/**
 * The game evaluates `rate * base` and then `+ 0.99999f` in 32-bit floating
 * point while this runs in doubles. Each of those two roundings moves the value
 * by at most half a unit in the last place at the magnitude of the price, so
 * two units in the last place covers both with a factor of two to spare.
 *
 * A tolerance is needed rather than optional: a rate landing within an ulp of a
 * bucket edge would otherwise reject the whole scenario, and that happens to
 * roughly one week in seven thousand across twelve observations. It is scaled
 * to the magnitude instead of being a flat constant because the ulp at a price
 * of 600 is sixteen times the ulp at a price of 40, and a constant wide enough
 * for the first would be needlessly wide for the second.
 *
 * The cost is that neighbouring price buckets overlap slightly, so the exact
 * predictive distribution over next prices sums to a little more than one. The
 * excess is `2 * TOLERANCE_ULPS * ulp32(price)` relative, that is four units in
 * the last place: 3.1e-5 at a price of 100 and 2.4e-4 at 600.
 * `tests/paths.test.ts` measures it. See DECISIONS.md D-009.
 */
const TOLERANCE_ULPS = 2;

function float32Ulp(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude === 0) {
    return FLOAT32_SMALLEST_SUBNORMAL;
  }
  return 2 ** (Math.floor(Math.log2(magnitude)) - FLOAT32_MANTISSA_BITS);
}

/** The half-width, in rate units, added at each end of an inverted interval. */
export function rateTolerance(price: number, basePrice: number): number {
  return (TOLERANCE_ULPS * float32Ulp(price)) / basePrice;
}

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
  const tolerance = rateTolerance(rounded, basePrice);
  return {
    lo: (rounded - ROUNDING_ADDEND) / basePrice - tolerance,
    hi: (rounded + (1 - ROUNDING_ADDEND)) / basePrice + tolerance,
  };
}

export function intersectionLength(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo));
}
