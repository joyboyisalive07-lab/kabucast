/**
 * The geometry of the three correlated slots of the small spike.
 *
 * A rate `R` is drawn once; the middle slot is `R` and the two flanking slots
 * are independent draws from `[floor, R)`. Writing `v = R - floor`, the chance a
 * flank satisfies its own constraint is `alpha + beta / v` on each of three
 * regions, so the joint probability is an integral of `a0 + a1/v + a2/v^2`.
 * That integrates to `a0 v + a1 ln v - a2 / v`.
 *
 * Both the likelihood and the path sampler need this decomposition, the first
 * to integrate it and the second to invert it, so it lives in one place.
 */

import { at } from "../model/array.ts";
import type { Interval } from "../model/rate.ts";

export interface PeakRegion {
  readonly from: number;
  readonly to: number;
  readonly a0: number;
  readonly a1: number;
  readonly a2: number;
}

interface FlankShape {
  /** Distance from the floor to the bottom of the constraint. */
  readonly offset: number;
  /** Width of the constraint above that. */
  readonly width: number;
}

interface FlankFactor {
  readonly alpha: number;
  readonly beta: number;
}

/** Forty halvings resolve a region to about 1e-12 of its width. */
const QUANTILE_BISECTION_STEPS = 40;

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

/** Empty when the observations rule the segment out entirely. */
export function peakRegions(
  peak: Interval,
  floor: number,
  firstFlank: Interval | null,
  middle: Interval | null,
  lastFlank: Interval | null,
): readonly PeakRegion[] {
  const lo = middle === null ? peak.lo : Math.max(peak.lo, middle.lo);
  const hi = middle === null ? peak.hi : Math.min(peak.hi, middle.hi);
  if (!(hi > lo)) {
    return [];
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

  const regions: PeakRegion[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const from = at(cuts, i);
    const to = at(cuts, i + 1);
    if (!(to > from)) {
      continue;
    }
    const middlePoint = (from + to) / 2;
    const a = flankFactor(first, middlePoint);
    const b = flankFactor(last, middlePoint);
    regions.push({
      from,
      to,
      a0: a.alpha * b.alpha,
      a1: a.alpha * b.beta + b.alpha * a.beta,
      a2: a.beta * b.beta,
    });
  }
  return regions;
}

/**
 * The `a1` and `a2` terms are non-zero only where the constraint that produced
 * them already keeps `v` above its own lower end, so the singularity at zero is
 * unreachable rather than merely improbable.
 */
function integrateRegion(region: PeakRegion, from: number, to: number): number {
  if (!(to > from)) {
    return 0;
  }
  let total = region.a0 * (to - from);
  if (region.a1 !== 0) {
    total += region.a1 * Math.log(to / from);
  }
  if (region.a2 !== 0) {
    total -= region.a2 * (1 / to - 1 / from);
  }
  return total;
}

export function integrateRegions(regions: readonly PeakRegion[]): number {
  let total = 0;
  for (const region of regions) {
    total += integrateRegion(region, region.from, region.to);
  }
  return total;
}

/**
 * The value of `v` below which the given fraction of the mass lies. Inverting
 * the closed form rather than sampling by rejection: when an observed flank
 * price sits just under an observed peak price the acceptance rate of a
 * rejection loop falls towards zero, and bisection does not care.
 */
export function peakQuantile(regions: readonly PeakRegion[], fraction: number): number {
  const total = integrateRegions(regions);
  if (regions.length === 0 || !(total > 0)) {
    return 0;
  }
  let target = Math.min(Math.max(fraction, 0), 1) * total;

  for (let i = 0; i < regions.length; i += 1) {
    const region = at(regions, i);
    const mass = integrateRegion(region, region.from, region.to);
    if (target > mass && i < regions.length - 1) {
      target -= mass;
      continue;
    }
    // With no constraint on either flank the region is flat, and the inverse
    // is a straight line. That is the common case: a peak entirely ahead of
    // the player carries no constraint at all.
    if (region.a1 === 0 && region.a2 === 0 && region.a0 > 0) {
      return region.from + target / region.a0;
    }

    let lo = region.from;
    let hi = region.to;
    for (let step = 0; step < QUANTILE_BISECTION_STEPS; step += 1) {
      const middle = (lo + hi) / 2;
      if (integrateRegion(region, region.from, middle) < target) {
        lo = middle;
      } else {
        hi = middle;
      }
    }
    return (lo + hi) / 2;
  }

  return at(regions, regions.length - 1).to;
}
