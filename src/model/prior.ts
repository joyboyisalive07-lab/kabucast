/**
 * The prior over this week's pattern.
 *
 * The transition probabilities are derived from the thresholds the generator
 * compares against, so the sixteen numbers exist in exactly one place. The
 * prior for an unknown previous week is the chain's stationary distribution,
 * solved here rather than quoted: see docs/DECISIONS.md D-007.
 */

import { at } from "./array.ts";
import { CHANCE_MAX, CHANCE_MIN, TRANSITION_THRESHOLDS } from "./constants.ts";
import { PATTERNS, PATTERN_SMALL_SPIKE } from "./types.ts";
import type { Pattern } from "./types.ts";

const CHANCE_OUTCOMES = CHANCE_MAX - CHANCE_MIN + 1;

function rowFromThresholds(thresholds: readonly number[]): readonly number[] {
  const row: number[] = [];
  let previous = 0;
  for (const threshold of thresholds) {
    row.push((threshold - previous) / CHANCE_OUTCOMES);
    previous = threshold;
  }
  row.push((CHANCE_OUTCOMES - previous) / CHANCE_OUTCOMES);
  return row;
}

/** Rows are indexed by the previous pattern, columns by this week's. */
export const TRANSITION_MATRIX: readonly (readonly number[])[] =
  TRANSITION_THRESHOLDS.map(rowFromThresholds);

/**
 * Solves `pi = pi * P` with `sum(pi) = 1` by Gaussian elimination with partial
 * pivoting. Direct rather than iterated so that there is no convergence
 * threshold to justify, and the system is four by four.
 */
function solveStationary(matrix: readonly (readonly number[])[]): readonly number[] {
  const n = matrix.length;
  const rows: number[][] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < n; j += 1) {
      row.push(at(at(matrix, j), i) - (i === j ? 1 : 0));
    }
    row.push(0);
    rows.push(row);
  }
  rows.push([...new Array<number>(n).fill(1), 1]);

  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let candidate = column + 1; candidate < n; candidate += 1) {
      if (Math.abs(at(at(rows, candidate), column)) > Math.abs(at(at(rows, pivot), column))) {
        pivot = candidate;
      }
    }
    const swap = at(rows, column);
    rows[column] = at(rows, pivot);
    rows[pivot] = swap;

    const pivotRow = at(rows, column);
    const pivotValue = at(pivotRow, column);
    for (let j = column; j <= n; j += 1) {
      pivotRow[j] = at(pivotRow, j) / pivotValue;
    }
    for (let r = 0; r < n; r += 1) {
      if (r === column) {
        continue;
      }
      const row = at(rows, r);
      const factor = at(row, column);
      if (factor === 0) {
        continue;
      }
      for (let j = column; j <= n; j += 1) {
        row[j] = at(row, j) - factor * at(pivotRow, j);
      }
    }
  }

  return rows.map((row) => at(row, n));
}

export const STATIONARY_PATTERN_PRIOR: readonly number[] = solveStationary(TRANSITION_MATRIX);

/**
 * `previousPattern` of null means the player does not know last week's pattern,
 * which is marginalised rather than guessed. A first-time buyer is forced to
 * the small spike and the previous pattern becomes irrelevant.
 */
export function patternPrior(previousPattern: Pattern | null, firstBuy: boolean): readonly number[] {
  if (firstBuy) {
    return PATTERNS.map((pattern) => (pattern === PATTERN_SMALL_SPIKE ? 1 : 0));
  }
  return previousPattern === null
    ? STATIONARY_PATTERN_PRIOR
    : at(TRANSITION_MATRIX, previousPattern);
}
