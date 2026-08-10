import { test } from "node:test";
import { ok, equal } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import { SELLING_SLOT_COUNT } from "../src/model/constants.ts";
import {
  decayRunProbability,
  independentProbability,
  peakProbability,
  scenarioLikelihood,
} from "../src/infer/likelihood.ts";
import { rateIntervalForPrice, rateTolerance } from "../src/infer/inversion.ts";
import { drawBasePrice, drawScenario, drawPrices } from "../src/model/generator.ts";
import { createRng } from "../src/model/rng.ts";
import type { Rng } from "../src/model/rng.ts";
import type { Interval } from "../src/model/rate.ts";
import { PATTERNS } from "../src/model/types.ts";
import { randint } from "../src/model/generator.ts";

const EXACT = 1e-12;

interface Estimate {
  readonly value: number;
  readonly standardError: number;
}

function estimate(hits: number, samples: number): Estimate {
  const value = hits / samples;
  return { value, standardError: Math.sqrt((value * (1 - value)) / samples) };
}

function inside(interval: Interval | null, value: number): boolean {
  return interval === null || (value >= interval.lo && value < interval.hi);
}

function sampleDecay(
  rng: Rng,
  start: Interval,
  step: Interval,
  constraints: readonly (Interval | null)[],
  samples: number,
): Estimate {
  let hits = 0;
  for (let i = 0; i < samples; i += 1) {
    let rate = start.lo + rng.nextFloat() * (start.hi - start.lo);
    let held = true;
    for (let slot = 0; slot < constraints.length; slot += 1) {
      if (!inside(at(constraints, slot), rate)) {
        held = false;
        break;
      }
      rate -= step.lo + rng.nextFloat() * (step.hi - step.lo);
    }
    if (held) {
      hits += 1;
    }
  }
  return estimate(hits, samples);
}

function samplePeak(
  rng: Rng,
  peak: Interval,
  floor: number,
  first: Interval | null,
  middle: Interval | null,
  last: Interval | null,
  samples: number,
): Estimate {
  let hits = 0;
  for (let i = 0; i < samples; i += 1) {
    const rate = peak.lo + rng.nextFloat() * (peak.hi - peak.lo);
    const span = rate - floor;
    const before = floor + rng.nextFloat() * span;
    const after = floor + rng.nextFloat() * span;
    if (inside(middle, rate) && inside(first, before) && inside(last, after)) {
      hits += 1;
    }
  }
  return estimate(hits, samples);
}

test("an unconstrained slot contributes nothing", () => {
  equal(independentProbability({ lo: 0.9, hi: 1.4 }, null), 1);
  equal(decayRunProbability({ lo: 0.85, hi: 0.9 }, { lo: 0.03, hi: 0.05 }, [null, null, null]), 1);
  equal(peakProbability({ lo: 1.4, hi: 2 }, 1.4, null, null, null), 1);
});

test("an independent slot contributes the fraction of its range", () => {
  ok(Math.abs(independentProbability({ lo: 0.9, hi: 1.4 }, { lo: 1, hi: 1.1 }) - 0.2) < EXACT);
  ok(Math.abs(independentProbability({ lo: 0.9, hi: 1.4 }, { lo: 0.5, hi: 1.4 }) - 1) < EXACT);
  equal(independentProbability({ lo: 0.9, hi: 1.4 }, { lo: 1.5, hi: 1.6 }), 0);
});

test("a single constraint on a decay run is the measure of its start rate", () => {
  const start = { lo: 0.85, hi: 0.9 };
  const step = { lo: 0.03, hi: 0.05 };
  const constraint = { lo: 0.86, hi: 0.88 };
  const single = decayRunProbability(start, step, [constraint, null, null, null]);
  ok(Math.abs(single - 0.4) < EXACT, `got ${single}`);
});

test("an impossible constraint gives exactly zero", () => {
  equal(decayRunProbability({ lo: 0.85, hi: 0.9 }, { lo: 0.03, hi: 0.05 }, [{ lo: 1, hi: 2 }]), 0);
  equal(
    decayRunProbability({ lo: 0.85, hi: 0.9 }, { lo: 0.03, hi: 0.05 }, [
      { lo: 0.86, hi: 0.88 },
      { lo: 0.86, hi: 0.88 },
    ]),
    0,
  );
  equal(peakProbability({ lo: 1.4, hi: 2 }, 1.4, null, { lo: 2.5, hi: 3 }, null), 0);
});

/**
 * The polytope volume against sampling of the same chain. The two share no
 * code: one integrates a piecewise polynomial, the other counts hits. Each
 * case is checked inside four standard errors of the estimate.
 */
test("the decay polytope volume agrees with a sampled estimate", () => {
  const samples = 2_000_000;
  const rng = createRng(20260810n);

  const cases: {
    readonly label: string;
    readonly start: Interval;
    readonly step: Interval;
    readonly constraints: readonly (Interval | null)[];
  }[] = [
    {
      label: "two constraints, one gap",
      start: { lo: 0.85, hi: 0.9 },
      step: { lo: 0.03, hi: 0.05 },
      constraints: [{ lo: 0.86, hi: 0.88 }, null, { lo: 0.79, hi: 0.83 }],
    },
    {
      label: "adjacent constraints",
      start: { lo: 0.85, hi: 0.9 },
      step: { lo: 0.03, hi: 0.05 },
      constraints: [
        { lo: 0.86, hi: 0.89 },
        { lo: 0.82, hi: 0.85 },
      ],
    },
    {
      label: "wide start, four constraints over eight slots",
      start: { lo: 0.4, hi: 0.9 },
      step: { lo: 0.03, hi: 0.05 },
      constraints: [
        { lo: 0.7, hi: 0.8 },
        null,
        { lo: 0.63, hi: 0.72 },
        null,
        null,
        { lo: 0.5, hi: 0.62 },
        null,
        { lo: 0.42, hi: 0.55 },
      ],
    },
    {
      label: "fluctuating decrements",
      start: { lo: 0.6, hi: 0.8 },
      step: { lo: 0.04, hi: 0.1 },
      constraints: [
        { lo: 0.65, hi: 0.75 },
        { lo: 0.58, hi: 0.68 },
        { lo: 0.5, hi: 0.62 },
      ],
    },
    {
      label: "a constraint only at the end of a long run",
      start: { lo: 0.85, hi: 0.9 },
      step: { lo: 0.03, hi: 0.05 },
      constraints: [null, null, null, null, null, null, null, { lo: 0.6, hi: 0.66 }],
    },
  ];

  for (const testCase of cases) {
    const exact = decayRunProbability(testCase.start, testCase.step, testCase.constraints);
    const sampled = sampleDecay(
      rng,
      testCase.start,
      testCase.step,
      testCase.constraints,
      samples,
    );
    ok(
      Math.abs(exact - sampled.value) < 4 * sampled.standardError,
      `${testCase.label}: exact ${exact}, sampled ${sampled.value} +- ${sampled.standardError}`,
    );
  }
});

test("the small spike peak volume agrees with a sampled estimate", () => {
  const samples = 2_000_000;
  const rng = createRng(555_000n);
  const peak = { lo: 1.4, hi: 2 };
  const floor = 1.4;

  const cases: {
    readonly label: string;
    readonly first: Interval | null;
    readonly middle: Interval | null;
    readonly last: Interval | null;
  }[] = [
    { label: "middle only", first: null, middle: { lo: 1.7, hi: 1.8 }, last: null },
    { label: "one flank only", first: { lo: 1.5, hi: 1.6 }, middle: null, last: null },
    {
      label: "both flanks",
      first: { lo: 1.5, hi: 1.6 },
      middle: null,
      last: { lo: 1.45, hi: 1.7 },
    },
    {
      label: "all three",
      first: { lo: 1.5, hi: 1.65 },
      middle: { lo: 1.7, hi: 1.9 },
      last: { lo: 1.45, hi: 1.75 },
    },
    {
      label: "flank reaching the floor",
      first: { lo: 1.3, hi: 1.55 },
      middle: { lo: 1.6, hi: 2 },
      last: null,
    },
    {
      label: "flank above most peaks",
      first: { lo: 1.85, hi: 1.95 },
      middle: null,
      last: null,
    },
  ];

  for (const testCase of cases) {
    const exact = peakProbability(peak, floor, testCase.first, testCase.middle, testCase.last);
    const sampled = samplePeak(
      rng,
      peak,
      floor,
      testCase.first,
      testCase.middle,
      testCase.last,
      samples,
    );
    ok(
      Math.abs(exact - sampled.value) < 4 * sampled.standardError,
      `${testCase.label}: exact ${exact}, sampled ${sampled.value} +- ${sampled.standardError}`,
    );
  }
});

test("the inverted interval has the width of one bell plus the tolerance", () => {
  for (const basePrice of [90, 100, 110]) {
    for (const price of [40, 87, 100, 250, 600]) {
      const interval = rateIntervalForPrice(price, basePrice, 0);
      const width = interval.hi - interval.lo;
      const expected = 1 / basePrice + 2 * rateTolerance(price, basePrice);
      ok(Math.abs(width - expected) < 1e-14, `base ${basePrice} price ${price}: width ${width}`);
      // The tolerance stays far below the bucket it widens: four units in the
      // last place of a float32 at the price, so 3.1e-5 at 100 and 2.4e-4 at
      // 600 relative to the bucket.
      const overlap = 2 * rateTolerance(price, basePrice) * basePrice;
      ok(overlap < 3e-4, `price ${price} widens its bucket by ${overlap}`);
    }
  }
});

test("the flanking slots of the small spike invert one bell higher", () => {
  const flank = rateIntervalForPrice(200, 100, -1);
  const plain = rateIntervalForPrice(201, 100, 0);
  ok(Math.abs(flank.lo - plain.lo) < EXACT);
  ok(Math.abs(flank.hi - plain.hi) < EXACT);
});

/**
 * The end-to-end check that the inversion, the tolerance and every segment
 * rule line up with the generator: a fully observed week must leave the
 * scenario that produced it with a positive likelihood.
 */
test("the scenario that generated a week survives its own prices", () => {
  const rng = createRng(9_000_001n);
  for (let week = 0; week < 5_000; week += 1) {
    const pattern = at(PATTERNS, randint(rng, 0, PATTERNS.length - 1));
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, pattern);
    const prices = drawPrices(rng, scenario, basePrice);
    const observations = [...prices];
    equal(observations.length, SELLING_SLOT_COUNT);

    const likelihood = scenarioLikelihood(scenario, basePrice, observations);
    ok(
      likelihood > 0,
      `pattern ${pattern}, base ${basePrice}, prices ${prices.join(",")} gave ${likelihood}`,
    );
  }
});

test("scenario likelihood is one when nothing has been observed", () => {
  const rng = createRng(17n);
  const empty = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  for (const pattern of PATTERNS) {
    const scenario = drawScenario(rng, pattern);
    ok(Math.abs(scenarioLikelihood(scenario, 100, empty) - 1) < EXACT, `pattern ${pattern}`);
  }
});
