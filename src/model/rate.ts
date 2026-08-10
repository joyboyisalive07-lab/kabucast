/**
 * The support of the generator's random draws.
 *
 * The generator needs the affine form (`origin + u * span`) to reproduce the
 * original's float32 arithmetic; the inference needs only the interval the
 * draw can land in. These two functions are the bridge, and they are the only
 * place that knows a negative span means a descending range.
 */

import type { DecayStep, RateDraw } from "./types.ts";

export interface Interval {
  readonly lo: number;
  readonly hi: number;
}

export function rateBounds(draw: RateDraw): Interval {
  const end = draw.origin + draw.span;
  return draw.span >= 0 ? { lo: draw.origin, hi: end } : { lo: end, hi: draw.origin };
}

/** The total subtracted from the rate at one step of a decreasing phase. */
export function decayStepBounds(step: DecayStep): Interval {
  return { lo: step.fixed, hi: step.fixed + step.randomSpan };
}
