import { test } from "node:test";
import { ok, equal } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import {
  mass,
  restrict,
  scale,
  shiftedByUniform,
  totalMass,
  uniformDensity,
} from "../src/infer/piecewise.ts";
import type { PiecewisePolynomial } from "../src/infer/piecewise.ts";
import { createRng } from "../src/model/rng.ts";

const EXACT = 1e-12;

test("a uniform density integrates to one and in proportion", () => {
  const density = uniformDensity(0.4, 0.9);
  ok(Math.abs(totalMass(density) - 1) < EXACT);
  ok(Math.abs(mass(density, 0.4, 0.65) - 0.5) < EXACT);
  ok(Math.abs(mass(density, 0.5, 0.6) - 0.2) < EXACT);
  equal(mass(density, 1, 2), 0);
});

test("subtracting a uniform from a uniform gives the triangular density", () => {
  // X and D both uniform on [0, 1], so Y = X - D is triangular on [-1, 1].
  const density = shiftedByUniform(uniformDensity(0, 1), 0, 1);
  ok(Math.abs(totalMass(density) - 1) < EXACT, `total ${totalMass(density)}`);
  ok(Math.abs(mass(density, 0, 1) - 0.5) < EXACT);
  // P(Y > 0.5) is the area of the triangle with legs 0.5.
  ok(Math.abs(mass(density, 0.5, 1) - 0.125) < EXACT);
  ok(Math.abs(mass(density, -1, -0.5) - 0.125) < EXACT);
});

test("a decrement with a floor shifts the support by both ends", () => {
  // The support runs from the lowest start minus the largest decrement to the
  // highest start minus the smallest one.
  const density = shiftedByUniform(uniformDensity(0.85, 0.9), 0.03, 0.05);
  ok(Math.abs(at(density.breaks, 0) - 0.8) < EXACT, `low end ${at(density.breaks, 0)}`);
  ok(Math.abs(at(density.breaks, density.breaks.length - 1) - 0.87) < EXACT);
  ok(Math.abs(totalMass(density) - 1) < EXACT);
});

test("convolution preserves total mass through a full week of steps", () => {
  let density = uniformDensity(0.85, 0.9);
  for (let step = 0; step < 11; step += 1) {
    density = shiftedByUniform(density, 0.03, 0.05);
    ok(Math.abs(totalMass(density) - 1) < 1e-10, `after ${step + 1} steps: ${totalMass(density)}`);
  }
});

test("the degree grows by one per step and the breakpoints stay linear", () => {
  let density = uniformDensity(0.85, 0.9);
  for (let step = 1; step <= 11; step += 1) {
    density = shiftedByUniform(density, 0.03, 0.05);
    const degree = Math.max(...density.pieces.map((piece) => piece.length - 1));
    equal(degree, step, `step ${step}`);
    // A fixed pair of decrements makes the translated breakpoints collide, so
    // the count grows linearly instead of doubling. See ALGORITHM.md.
    ok(
      density.breaks.length <= 2 * (step + 1),
      `step ${step} has ${density.breaks.length} breakpoints`,
    );
  }
});

test("restriction preserves the function on the interval it keeps", () => {
  let density: PiecewisePolynomial = uniformDensity(0.4, 0.9);
  for (let step = 0; step < 4; step += 1) {
    density = shiftedByUniform(density, 0.03, 0.05);
  }
  const restricted = restrict(density, 0.6, 0.7);
  if (restricted === null) {
    throw new Error("restriction removed the whole density");
  }
  const windows: readonly (readonly [number, number])[] = [
    [0.6, 0.62],
    [0.63, 0.68],
    [0.65, 0.7],
  ];
  for (const [lo, hi] of windows) {
    const before = mass(density, lo, hi);
    const after = mass(restricted, lo, hi);
    ok(Math.abs(before - after) < EXACT, `[${lo}, ${hi}]: ${before} vs ${after}`);
  }
  equal(mass(restricted, 0.4, 0.6), 0);
});

test("scaling multiplies the mass", () => {
  const density = scale(uniformDensity(0, 2), 3);
  ok(Math.abs(totalMass(density) - 3) < EXACT);
});

/**
 * The closed form is checked against sampling of the same chain. A piecewise
 * polynomial and a Monte Carlo estimator share no code and no failure mode, so
 * agreement inside the estimator's own confidence interval is real evidence.
 */
test("the exact density agrees with sampling of the same decay chain", () => {
  const startLo = 0.85;
  const startHi = 0.9;
  const decayLo = 0.03;
  const decayHi = 0.05;
  const steps = 6;
  const samples = 1_000_000;

  let density = uniformDensity(startLo, startHi);
  for (let step = 0; step < steps; step += 1) {
    density = shiftedByUniform(density, decayLo, decayHi);
  }

  const edges = [0.55, 0.6, 0.65, 0.7, 0.75];
  const counts = new Array<number>(edges.length - 1).fill(0);
  const rng = createRng(31337n);

  for (let i = 0; i < samples; i += 1) {
    let rate = startLo + rng.nextFloat() * (startHi - startLo);
    for (let step = 0; step < steps; step += 1) {
      rate -= decayLo + rng.nextFloat() * (decayHi - decayLo);
    }
    for (let bucket = 0; bucket < counts.length; bucket += 1) {
      if (rate >= at(edges, bucket) && rate < at(edges, bucket + 1)) {
        counts[bucket] = at(counts, bucket) + 1;
        break;
      }
    }
  }

  for (let bucket = 0; bucket < counts.length; bucket += 1) {
    const exact = mass(density, at(edges, bucket), at(edges, bucket + 1));
    const estimate = at(counts, bucket) / samples;
    const standardError = Math.sqrt((estimate * (1 - estimate)) / samples);
    ok(
      Math.abs(exact - estimate) < 4 * standardError,
      `bucket ${bucket}: exact ${exact}, sampled ${estimate} +- ${standardError}`,
    );
  }
});
