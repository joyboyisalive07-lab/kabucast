import { test } from "node:test";
import { ok, deepEqual, equal } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import { STATIONARY_PATTERN_PRIOR, TRANSITION_MATRIX, patternPrior } from "../src/model/prior.ts";
import { PATTERNS, PATTERN_LARGE_SPIKE, PATTERN_SMALL_SPIKE } from "../src/model/types.ts";

/** The table in ALGORITHM.md, "Pattern selection". */
const DOCUMENTED_MATRIX = [
  [0.2, 0.3, 0.15, 0.35],
  [0.5, 0.05, 0.2, 0.25],
  [0.25, 0.45, 0.05, 0.25],
  [0.45, 0.25, 0.15, 0.15],
];

/** Derived independently in exact rational arithmetic, ALGORITHM.md. */
const DOCUMENTED_STATIONARY = [4530 / 13082, 3236 / 13082, 1931 / 13082, 3385 / 13082];

test("the thresholds produce the documented transition matrix", () => {
  equal(TRANSITION_MATRIX.length, DOCUMENTED_MATRIX.length);
  for (const previous of PATTERNS) {
    const row = at(TRANSITION_MATRIX, previous);
    const documented = at(DOCUMENTED_MATRIX, previous);
    equal(row.length, documented.length);
    for (const pattern of PATTERNS) {
      ok(
        Math.abs(at(row, pattern) - at(documented, pattern)) < 1e-15,
        `row ${previous} column ${pattern}: ${at(row, pattern)} vs ${at(documented, pattern)}`,
      );
    }
  }
});

test("every row of the transition matrix sums to one", () => {
  for (const row of TRANSITION_MATRIX) {
    const total = row.reduce((sum, value) => sum + value, 0);
    ok(Math.abs(total - 1) < 1e-15, `row sums to ${total}`);
  }
});

test("the stationary distribution is a fixed point of the chain", () => {
  for (const pattern of PATTERNS) {
    let mapped = 0;
    for (const previous of PATTERNS) {
      mapped += at(STATIONARY_PATTERN_PRIOR, previous) * at(at(TRANSITION_MATRIX, previous), pattern);
    }
    ok(
      Math.abs(mapped - at(STATIONARY_PATTERN_PRIOR, pattern)) < 1e-14,
      `pattern ${pattern}: ${mapped} vs ${at(STATIONARY_PATTERN_PRIOR, pattern)}`,
    );
  }
});

test("the stationary distribution is a probability vector", () => {
  const total = STATIONARY_PATTERN_PRIOR.reduce((sum, value) => sum + value, 0);
  ok(Math.abs(total - 1) < 1e-14, `sums to ${total}`);
  for (const value of STATIONARY_PATTERN_PRIOR) {
    ok(value > 0, `non-positive entry ${value}`);
  }
});

test("the solved stationary distribution matches the derivation in ALGORITHM.md", () => {
  for (const pattern of PATTERNS) {
    ok(
      Math.abs(at(STATIONARY_PATTERN_PRIOR, pattern) - at(DOCUMENTED_STATIONARY, pattern)) < 1e-12,
      `pattern ${pattern}: ${at(STATIONARY_PATTERN_PRIOR, pattern)}`,
    );
  }
});

test("the prior marginalises an unknown previous week rather than guessing", () => {
  deepEqual([...patternPrior(null, false)], [...STATIONARY_PATTERN_PRIOR]);
  deepEqual([...patternPrior(PATTERN_LARGE_SPIKE, false)], [...at(TRANSITION_MATRIX, PATTERN_LARGE_SPIKE)]);
});

test("a first-time buyer puts all of the prior on the small spike", () => {
  for (const previous of [null, ...PATTERNS] as const) {
    const prior = patternPrior(previous, true);
    equal(at(prior, PATTERN_SMALL_SPIKE), 1);
    equal(
      prior.reduce((sum, value) => sum + value, 0),
      1,
    );
  }
});
