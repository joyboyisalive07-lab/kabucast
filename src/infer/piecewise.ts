/**
 * Exact piecewise-polynomial densities.
 *
 * A decreasing phase makes the rate at each slot the previous rate minus an
 * independent uniform decrement. Conditioning on observed prices carves a
 * convex polytope out of the box of underlying draws, and the scenario's
 * probability is that polytope's volume. Carrying the density of the current
 * rate forward and conditioning slot by slot computes exactly that volume by
 * the chain rule, and every operation involved keeps a piecewise polynomial
 * piecewise polynomial: restriction cuts pieces, and convolution with a
 * uniform raises the degree by one. So the volume comes out in closed form,
 * with no grid and no sampling. See docs/ALGORITHM.md, "Correlated decay
 * phases".
 *
 * A piece is stored in a basis local to its own left breakpoint. Re-basing on
 * every cut keeps the argument of every polynomial inside one piece width,
 * which is what stops the degree-12 coefficients from losing precision.
 */

import { at } from "../model/array.ts";

/**
 * `breaks` are ascending and one longer than `pieces`. Piece `i` is
 * `sum coefficients[m] * (x - breaks[i])^m` on `[breaks[i], breaks[i + 1])`,
 * and the function is zero outside `[first break, last break]`.
 */
export interface PiecewisePolynomial {
  readonly breaks: readonly number[];
  readonly pieces: readonly (readonly number[])[];
}

/**
 * A decreasing phase runs at most twelve slots, so the density reaches degree
 * eleven and its antiderivative twelve. The headroom is for the assertion to
 * fire on a structural mistake rather than on a legitimate long phase.
 */
const MAX_DEGREE = 20;

/**
 * Breakpoints that should coincide are produced by different orders of the
 * same subtractions, so they can differ by a few units in the last place.
 * Genuine neighbours are at least a price bucket apart, which is above 1e-3
 * for any base price the game uses, so merging below 1e-12 cannot merge two
 * breakpoints that are really distinct.
 */
const BREAK_MERGE_TOLERANCE = 1e-12;

const BINOMIAL: readonly (readonly number[])[] = (() => {
  const rows: number[][] = [];
  for (let n = 0; n <= MAX_DEGREE; n += 1) {
    const row: number[] = [1];
    for (let k = 1; k <= n; k += 1) {
      row.push(at(at(rows, n - 1), k - 1) + (k < n ? at(at(rows, n - 1), k) : 0));
    }
    rows.push(row);
  }
  return rows;
})();

function assertDegree(coefficients: readonly number[]): void {
  if (coefficients.length - 1 > MAX_DEGREE) {
    throw new RangeError(`polynomial degree ${coefficients.length - 1} exceeds ${MAX_DEGREE}`);
  }
}

/** Coefficients of `Q(v) = P(v + delta)`. */
function shiftPolynomial(coefficients: readonly number[], delta: number): readonly number[] {
  if (delta === 0) {
    return coefficients;
  }
  assertDegree(coefficients);

  const degree = coefficients.length - 1;
  const powers: number[] = [1];
  for (let i = 1; i <= degree; i += 1) {
    powers.push(at(powers, i - 1) * delta);
  }

  const shifted = new Array<number>(coefficients.length).fill(0);
  for (let m = 0; m <= degree; m += 1) {
    const coefficient = at(coefficients, m);
    if (coefficient === 0) {
      continue;
    }
    const row = at(BINOMIAL, m);
    for (let j = 0; j <= m; j += 1) {
      shifted[j] = at(shifted, j) + coefficient * at(row, j) * at(powers, m - j);
    }
  }
  return shifted;
}

/**
 * `integral of P(u) du` from zero to `to`, in the piece's local basis. Horner
 * form on the antiderivative: this runs inside the bisection of every sampled
 * path, so the loop avoids both repeated powers and the checked accessor.
 */
function integralFromZero(coefficients: readonly number[], to: number): number {
  let accumulated = 0;
  for (let m = coefficients.length - 1; m >= 0; m -= 1) {
    accumulated = accumulated * to + (coefficients[m] ?? 0) / (m + 1);
  }
  return accumulated * to;
}

/** `integral of P(u) du` from `from` to `to`, both in the piece's local basis. */
function definiteIntegral(coefficients: readonly number[], from: number, to: number): number {
  return integralFromZero(coefficients, to) - integralFromZero(coefficients, from);
}

export function uniformDensity(lo: number, hi: number): PiecewisePolynomial {
  if (!(hi > lo)) {
    throw new RangeError(`uniform density needs a positive width, got [${lo}, ${hi}]`);
  }
  return { breaks: [lo, hi], pieces: [[1 / (hi - lo)]] };
}

function support(density: PiecewisePolynomial): { readonly lo: number; readonly hi: number } {
  return { lo: at(density.breaks, 0), hi: at(density.breaks, density.breaks.length - 1) };
}

export function mass(density: PiecewisePolynomial, lo: number, hi: number): number {
  let total = 0;
  for (let i = 0; i < density.pieces.length; i += 1) {
    const left = at(density.breaks, i);
    const right = at(density.breaks, i + 1);
    const from = Math.max(left, lo);
    const to = Math.min(right, hi);
    if (to <= from) {
      continue;
    }
    total += definiteIntegral(at(density.pieces, i), from - left, to - left);
  }
  return total;
}

export function totalMass(density: PiecewisePolynomial): number {
  const bounds = support(density);
  return mass(density, bounds.lo, bounds.hi);
}

/**
 * Forty halvings of a piece narrow the answer to about 1e-12 of its width,
 * which is far below the precision anything downstream reads back out.
 */
const QUANTILE_BISECTION_STEPS = 40;

/**
 * A density with its per-piece masses already accumulated, so that drawing a
 * value costs one search and one bisection instead of re-integrating every
 * piece. Path sampling calls this thousands of times per recompute against an
 * unchanging density, which is what makes the precomputation worth having.
 */
export interface PreparedQuantile {
  readonly density: PiecewisePolynomial;
  readonly cumulative: Float64Array;
}

export function prepareQuantile(density: PiecewisePolynomial): PreparedQuantile {
  const cumulative = new Float64Array(density.pieces.length);
  let running = 0;
  for (let i = 0; i < density.pieces.length; i += 1) {
    running += integralFromZero(
      at(density.pieces, i),
      at(density.breaks, i + 1) - at(density.breaks, i),
    );
    cumulative[i] = running;
  }
  return { density, cumulative };
}

/**
 * The point below which the given fraction of the mass lies.
 *
 * Bisection rather than Newton: the integral is monotone by construction but
 * cancellation in a degree-eleven piece can make it very slightly non-monotone
 * in the last place, which derails a derivative method and not this one.
 */
export function quantileFrom(prepared: PreparedQuantile, fraction: number): number {
  const { density, cumulative } = prepared;
  const pieces = density.pieces.length;
  const total = cumulative[pieces - 1] ?? 0;
  const target = Math.min(Math.max(fraction, 0), 1) * total;

  let index = 0;
  let high = pieces - 1;
  while (index < high) {
    const middle = (index + high) >> 1;
    if ((cumulative[middle] ?? 0) < target) {
      index = middle + 1;
    } else {
      high = middle;
    }
  }

  const left = at(density.breaks, index);
  const coefficients = at(density.pieces, index);
  const within = target - (index === 0 ? 0 : (cumulative[index - 1] ?? 0));

  let lo = 0;
  let hi = at(density.breaks, index + 1) - left;
  for (let step = 0; step < QUANTILE_BISECTION_STEPS; step += 1) {
    const middle = (lo + hi) / 2;
    if (integralFromZero(coefficients, middle) < within) {
      lo = middle;
    } else {
      hi = middle;
    }
  }
  return left + (lo + hi) / 2;
}

export function scale(density: PiecewisePolynomial, factor: number): PiecewisePolynomial {
  return {
    breaks: density.breaks,
    pieces: density.pieces.map((piece) => piece.map((coefficient) => coefficient * factor)),
  };
}

/** The same function restricted to `[lo, hi]`, or null if nothing survives. */
export function restrict(
  density: PiecewisePolynomial,
  lo: number,
  hi: number,
): PiecewisePolynomial | null {
  const breaks: number[] = [];
  const pieces: (readonly number[])[] = [];

  for (let i = 0; i < density.pieces.length; i += 1) {
    const left = at(density.breaks, i);
    const right = at(density.breaks, i + 1);
    const from = Math.max(left, lo);
    const to = Math.min(right, hi);
    if (to <= from) {
      continue;
    }
    if (breaks.length === 0) {
      breaks.push(from);
    }
    breaks.push(to);
    pieces.push(shiftPolynomial(at(density.pieces, i), from - left));
  }

  return pieces.length === 0 ? null : { breaks, pieces };
}

interface Cumulative {
  readonly breaks: readonly number[];
  readonly pieces: readonly (readonly number[])[];
  readonly total: number;
}

/** `F(x) = integral of the density up to x`, one degree higher. */
function cumulative(density: PiecewisePolynomial): Cumulative {
  const pieces: (readonly number[])[] = [];
  let running = 0;

  for (let i = 0; i < density.pieces.length; i += 1) {
    const coefficients = at(density.pieces, i);
    const antiderivative = [running];
    for (let m = 0; m < coefficients.length; m += 1) {
      antiderivative.push(at(coefficients, m) / (m + 1));
    }
    pieces.push(antiderivative);
    const width = at(density.breaks, i + 1) - at(density.breaks, i);
    running += definiteIntegral(coefficients, 0, width);
  }

  return { breaks: density.breaks, pieces, total: running };
}

/** `F(y + shift)` expressed in the basis `y - origin`, for `y` near `probe - shift`. */
function cumulativeAt(
  accumulated: Cumulative,
  origin: number,
  probe: number,
  shift: number,
): readonly number[] {
  const first = at(accumulated.breaks, 0);
  const last = at(accumulated.breaks, accumulated.breaks.length - 1);
  if (probe < first) {
    return [0];
  }
  if (probe >= last) {
    return [accumulated.total];
  }
  for (let i = 0; i < accumulated.pieces.length; i += 1) {
    if (probe < at(accumulated.breaks, i + 1)) {
      return shiftPolynomial(at(accumulated.pieces, i), origin + shift - at(accumulated.breaks, i));
    }
  }
  return [accumulated.total];
}

function mergeBreaks(values: readonly number[]): readonly number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const merged: number[] = [];
  for (const value of sorted) {
    if (merged.length === 0 || value - at(merged, merged.length - 1) > BREAK_MERGE_TOLERANCE) {
      merged.push(value);
    }
  }
  return merged;
}

/**
 * The density of `X - D` where `D` is uniform on `[decayLo, decayHi]`.
 *
 * `f(y) = (F(y + decayHi) - F(y + decayLo)) / (decayHi - decayLo)`, which is
 * why the antiderivative appears and why the degree rises by one. The result's
 * breakpoints are the old ones translated by each end of the decrement, so a
 * fixed pair of decrements keeps the count linear in the number of steps
 * rather than doubling it.
 */
export function shiftedByUniform(
  density: PiecewisePolynomial,
  decayLo: number,
  decayHi: number,
): PiecewisePolynomial {
  if (!(decayHi > decayLo)) {
    throw new RangeError(`decrement needs a positive width, got [${decayLo}, ${decayHi}]`);
  }

  const accumulated = cumulative(density);
  const width = decayHi - decayLo;
  const breaks = mergeBreaks([
    ...density.breaks.map((value) => value - decayHi),
    ...density.breaks.map((value) => value - decayLo),
  ]);

  const pieces: (readonly number[])[] = [];
  for (let i = 0; i < breaks.length - 1; i += 1) {
    const left = at(breaks, i);
    const middle = (left + at(breaks, i + 1)) / 2;
    const upper = cumulativeAt(accumulated, left, middle + decayHi, decayHi);
    const lower = cumulativeAt(accumulated, left, middle + decayLo, decayLo);

    const length = Math.max(upper.length, lower.length);
    const piece: number[] = [];
    for (let m = 0; m < length; m += 1) {
      piece.push(((upper[m] ?? 0) - (lower[m] ?? 0)) / width);
    }
    pieces.push(piece);
  }

  return { breaks, pieces };
}
