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
import { solveLinearSystem } from "./linear.ts";
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
 * Solves `pi = pi * P` with `sum(pi) = 1`. The last balance equation is
 * redundant with the others and is replaced by the normalisation, which is what
 * makes the four by four system non-singular.
 */
function solveStationary(matrix: readonly (readonly number[])[]): readonly number[] {
  const size = matrix.length;
  const rows: number[][] = [];
  for (let i = 0; i < size - 1; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < size; j += 1) {
      row.push(at(at(matrix, j), i) - (i === j ? 1 : 0));
    }
    rows.push(row);
  }
  rows.push(new Array<number>(size).fill(1));

  const rhs = new Array<number>(size).fill(0);
  rhs[size - 1] = 1;

  const solution = solveLinearSystem(rows, rhs);
  if (solution === null) {
    throw new Error("the transition matrix has no stationary distribution");
  }
  return solution;
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
