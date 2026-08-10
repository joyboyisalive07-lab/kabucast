/**
 * The exact range of prices each slot can still take.
 *
 * These are the guaranteed-minimum and possible-maximum lines of the chart, and
 * they are computed rather than sampled: a sampled minimum is only the lowest
 * price that happened to come up, which is not a guarantee of anything.
 *
 * Every observation the player has entered lies in the past, so propagating the
 * reachable rate interval forward through a phase and intersecting it with each
 * observation as it passes gives exactly the reachable set at every later slot.
 * No backward pass is needed, because there is nothing behind to constrain it.
 */

import { at } from "../model/array.ts";
import { SELLING_SLOT_COUNT, SMALL_PEAK_FLANK_PRICE_OFFSET } from "../model/constants.ts";
import { priceFromRate } from "../model/generator.ts";
import { decayStepBounds, rateBounds } from "../model/rate.ts";
import type { Interval } from "../model/rate.ts";
import { segmentLength } from "../model/scenario.ts";
import { rateIntervalForPrice } from "./inversion.ts";
import type { Observations } from "./likelihood.ts";
import type { Posterior } from "./posterior.ts";

export interface PriceBound {
  readonly min: number;
  readonly max: number;
}

function intersect(a: Interval, b: Interval | null): Interval {
  if (b === null) {
    return a;
  }
  return { lo: Math.max(a.lo, b.lo), hi: Math.min(a.hi, b.hi) };
}

function widen(bounds: (PriceBound | null)[], slot: number, min: number, max: number): void {
  const existing = at(bounds, slot);
  bounds[slot] =
    existing === null
      ? { min, max }
      : { min: Math.min(existing.min, min), max: Math.max(existing.max, max) };
}

export function priceBoundsPerSlot(
  posterior: Posterior,
  observations: Observations,
): readonly PriceBound[] {
  const bounds: (PriceBound | null)[] = new Array<PriceBound | null>(SELLING_SLOT_COUNT).fill(null);

  for (const term of posterior.terms) {
    const basePrice = term.basePrice;
    const constraintAt = (slot: number, priceOffset: number): Interval | null => {
      const price = at(observations, slot);
      return price === null ? null : rateIntervalForPrice(price, basePrice, priceOffset);
    };
    const record = (slot: number, rate: Interval, priceOffset: number): void => {
      widen(
        bounds,
        slot,
        priceFromRate(rate.lo, basePrice) + priceOffset,
        priceFromRate(rate.hi, basePrice) + priceOffset,
      );
    };

    let slot = 0;
    for (const segment of term.scenario.segments) {
      const start = slot;
      const end = slot + segmentLength(segment);
      slot = end;

      switch (segment.kind) {
        case "independent": {
          const range = rateBounds(segment.rate);
          for (let i = start; i < end; i += 1) {
            record(i, intersect(range, constraintAt(i, 0)), 0);
          }
          break;
        }

        case "decay": {
          const step = decayStepBounds(segment.step);
          let current = rateBounds(segment.start);
          for (let i = start; i < end; i += 1) {
            current = intersect(current, constraintAt(i, 0));
            record(i, current, 0);
            current = { lo: current.lo - step.hi, hi: current.hi - step.lo };
          }
          break;
        }

        case "peak": {
          const floor = segment.flankFloor;
          const observedFirstFlank = constraintAt(start, SMALL_PEAK_FLANK_PRICE_OFFSET);
          // A flank is drawn from below the shared rate, so an observed flank
          // raises the floor of what that rate can be.
          const peak = intersect(
            intersect(rateBounds(segment.peak), constraintAt(start + 1, 0)),
            observedFirstFlank === null ? null : { lo: observedFirstFlank.lo, hi: Infinity },
          );
          const flankRange: Interval = { lo: floor, hi: peak.hi };
          record(
            start,
            intersect(flankRange, observedFirstFlank),
            SMALL_PEAK_FLANK_PRICE_OFFSET,
          );
          record(start + 1, peak, 0);
          record(
            start + 2,
            intersect(flankRange, constraintAt(start + 2, SMALL_PEAK_FLANK_PRICE_OFFSET)),
            SMALL_PEAK_FLANK_PRICE_OFFSET,
          );
          break;
        }
      }
    }
  }

  return bounds.map((bound, slot) => {
    const observed = at(observations, slot);
    if (observed !== null) {
      return { min: observed, max: observed };
    }
    return bound ?? { min: 0, max: 0 };
  });
}
