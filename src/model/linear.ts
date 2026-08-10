/**
 * Gaussian elimination with partial pivoting, for the two small dense systems
 * this project solves: the stationary distribution of the pattern chain and
 * the least-squares fits of the stopping rule. Both are under ten unknowns, so
 * a direct solve costs nothing and leaves no convergence threshold to justify.
 */

import { at } from "./array.ts";

/** Null when the system is singular. `matrix` and `rhs` are not modified. */
export function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): readonly number[] | null {
  const size = matrix.length;
  const rows: number[][] = matrix.map((row, index) => [...row, at(rhs, index)]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let candidate = column + 1; candidate < size; candidate += 1) {
      if (Math.abs(at(at(rows, candidate), column)) > Math.abs(at(at(rows, pivot), column))) {
        pivot = candidate;
      }
    }

    const pivotRow = at(rows, pivot);
    const pivotValue = at(pivotRow, column);
    if (pivotValue === 0) {
      return null;
    }
    rows[pivot] = at(rows, column);
    rows[column] = pivotRow;

    for (let j = column; j <= size; j += 1) {
      pivotRow[j] = at(pivotRow, j) / pivotValue;
    }
    for (let r = 0; r < size; r += 1) {
      if (r === column) {
        continue;
      }
      const row = at(rows, r);
      const factor = at(row, column);
      if (factor === 0) {
        continue;
      }
      for (let j = column; j <= size; j += 1) {
        row[j] = at(row, j) - factor * at(pivotRow, j);
      }
    }
  }

  return rows.map((row) => at(row, size));
}
