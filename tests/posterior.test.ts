import { test } from "node:test";
import { ok, equal, deepEqual } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import { BASE_PRICE_MAX, BASE_PRICE_MIN, SELLING_SLOT_COUNT } from "../src/model/constants.ts";
import { computePosterior } from "../src/infer/posterior.ts";
import type { Posterior, PredictorInput } from "../src/infer/posterior.ts";
import { drawBasePrice, drawPrices, drawScenario, randint } from "../src/model/generator.ts";
import { STATIONARY_PATTERN_PRIOR, TRANSITION_MATRIX, patternPrior } from "../src/model/prior.ts";
import { createRng } from "../src/model/rng.ts";
import { PATTERNS, PATTERN_LARGE_SPIKE, PATTERN_SMALL_SPIKE } from "../src/model/types.ts";
import type { Pattern } from "../src/model/types.ts";

const EXACT = 1e-12;

const NOTHING_OBSERVED: readonly (number | null)[] = new Array<number | null>(
  SELLING_SLOT_COUNT,
).fill(null);

function withObservations(
  values: readonly (readonly [number, number])[],
): readonly (number | null)[] {
  const observations = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  for (const [slot, price] of values) {
    observations[slot] = price;
  }
  return observations;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function baseInput(overrides: Partial<PredictorInput>): PredictorInput {
  return {
    basePrice: 100,
    observations: NOTHING_OBSERVED,
    previousPattern: null,
    firstBuy: false,
    ...overrides,
  };
}

function required(input: PredictorInput): Posterior {
  const posterior = computePosterior(input);
  if (posterior === null) {
    throw new Error("expected a consistent posterior");
  }
  return posterior;
}

test("every marginal of the posterior sums to one", () => {
  const posterior = required(
    baseInput({ observations: withObservations([[0, 91], [1, 87]]) }),
  );
  ok(Math.abs(sum(posterior.patterns) - 1) < EXACT, `patterns ${sum(posterior.patterns)}`);
  ok(
    Math.abs(sum(posterior.scenarios.map((entry) => entry.probability)) - 1) < EXACT,
    "scenarios",
  );
  ok(
    Math.abs(sum(posterior.basePrices.map((entry) => entry.probability)) - 1) < EXACT,
    "base prices",
  );
  ok(Math.abs(sum(posterior.terms.map((term) => term.probability)) - 1) < EXACT, "terms");
});

test("with nothing observed the pattern posterior is the prior", () => {
  for (const previous of [null, ...PATTERNS] as const) {
    const posterior = required(baseInput({ previousPattern: previous }));
    const prior = patternPrior(previous, false);
    for (const pattern of PATTERNS) {
      ok(
        Math.abs(at(posterior.patterns, pattern) - at(prior, pattern)) < EXACT,
        `previous ${String(previous)}, pattern ${pattern}`,
      );
    }
  }
});

test("with nothing observed and no Sunday price the base price stays uniform", () => {
  const posterior = required(baseInput({ basePrice: null }));
  const outcomes = BASE_PRICE_MAX - BASE_PRICE_MIN + 1;
  equal(posterior.basePrices.length, outcomes);
  for (const entry of posterior.basePrices) {
    ok(Math.abs(entry.probability - 1 / outcomes) < EXACT, `base ${entry.basePrice}`);
  }
});

test("a first-time buyer puts the whole posterior on the small spike", () => {
  const posterior = required(baseInput({ firstBuy: true, previousPattern: PATTERN_LARGE_SPIKE }));
  ok(Math.abs(at(posterior.patterns, PATTERN_SMALL_SPIKE) - 1) < EXACT);
  for (const term of posterior.terms) {
    equal(term.scenario.pattern, PATTERN_SMALL_SPIKE);
  }
});

/**
 * Marginalising an unknown previous week has to agree with doing it by hand:
 * the mixture of the four conditional posteriors, weighted by the stationary
 * prior times the evidence each one carries.
 */
test("an unknown previous week is a genuine marginalisation", () => {
  const observations = withObservations([
    [0, 88],
    [1, 84],
    [2, 79],
  ]);
  const combined = required(baseInput({ observations, previousPattern: null }));

  const weights: number[] = [];
  const conditionals: (readonly number[])[] = [];
  for (const previous of PATTERNS) {
    const posterior = required(baseInput({ observations, previousPattern: previous }));
    weights.push(at(STATIONARY_PATTERN_PRIOR, previous) * posterior.evidence);
    conditionals.push(posterior.patterns);
  }
  const totalWeight = sum(weights);

  for (const pattern of PATTERNS) {
    let mixed = 0;
    for (let previous = 0; previous < PATTERNS.length; previous += 1) {
      mixed += (at(weights, previous) / totalWeight) * at(at(conditionals, previous), pattern);
    }
    ok(
      Math.abs(mixed - at(combined.patterns, pattern)) < 1e-12,
      `pattern ${pattern}: ${mixed} vs ${at(combined.patterns, pattern)}`,
    );
  }
});

test("the evidence of a known previous week is the row of the transition matrix applied", () => {
  const observations = withObservations([[0, 91]]);
  for (const previous of PATTERNS) {
    const posterior = required(baseInput({ observations, previousPattern: previous }));
    const row = at(TRANSITION_MATRIX, previous);
    for (const pattern of PATTERNS) {
      if (at(row, pattern) === 0) {
        equal(at(posterior.patterns, pattern), 0, `pattern ${pattern} should be impossible`);
      }
    }
  }
});

test("prices that no scenario can produce are reported as inconsistent", () => {
  // A price far above the largest rate the generator can reach.
  equal(computePosterior(baseInput({ observations: withObservations([[0, 900]]) })), null);
  // Two adjacent slots cannot both sit at the top of the large spike.
  equal(
    computePosterior(
      baseInput({
        observations: withObservations([
          [5, 600],
          [6, 600],
        ]),
      }),
    ),
    null,
  );
  equal(computePosterior(baseInput({ basePrice: 200 })), null);
  equal(computePosterior(baseInput({ basePrice: 89 })), null);
});

test("the week that generated the prices keeps a positive posterior", () => {
  const rng = createRng(24_680n);
  for (let week = 0; week < 2_000; week += 1) {
    const pattern = at(PATTERNS, randint(rng, 0, PATTERNS.length - 1));
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, pattern);
    const prices = drawPrices(rng, scenario, basePrice);

    const posterior = computePosterior({
      basePrice,
      observations: prices,
      previousPattern: null,
      firstBuy: false,
    });
    if (posterior === null) {
      throw new Error(`no posterior for ${prices.join(",")}`);
    }
    ok(
      at(posterior.patterns, pattern) > 0,
      `pattern ${pattern} eliminated by its own prices ${prices.join(",")}`,
    );
    // The posterior draws its scenarios from the enumerated table while the
    // generator built its own, so these are compared by structure.
    const generated = JSON.stringify(scenario.segments);
    ok(
      posterior.terms.some((term) => JSON.stringify(term.scenario.segments) === generated),
      `scenario eliminated by its own prices ${prices.join(",")}`,
    );
  }
});

test("observing more of the week never leaves the truth with zero probability", () => {
  const rng = createRng(13_579n);
  for (let week = 0; week < 500; week += 1) {
    const pattern = at(PATTERNS, randint(rng, 0, PATTERNS.length - 1));
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, pattern);
    const prices = drawPrices(rng, scenario, basePrice);

    for (let known = 1; known <= SELLING_SLOT_COUNT; known += 1) {
      const observations = prices.map((price, slot) => (slot < known ? price : null));
      const posterior = computePosterior({
        basePrice: null,
        observations,
        previousPattern: null,
        firstBuy: false,
      });
      if (posterior === null) {
        throw new Error(`week ${week} died after ${known} observations`);
      }
      ok(at(posterior.patterns, pattern) > 0, `week ${week} lost its pattern after ${known}`);
      ok(
        posterior.basePrices.some((entry) => entry.basePrice === basePrice),
        `week ${week} lost its base price after ${known}`,
      );
    }
  }
});

test("the posterior is identical for identical input", () => {
  const input = baseInput({
    basePrice: null,
    observations: withObservations([
      [0, 95],
      [1, 90],
      [3, 82],
    ]),
    previousPattern: PATTERN_LARGE_SPIKE,
  });
  deepEqual(computePosterior(input), computePosterior(input));
});

test("a full recompute stays inside the hundred millisecond budget", () => {
  const inputs: PredictorInput[] = [
    baseInput({ basePrice: null, observations: NOTHING_OBSERVED }),
    baseInput({
      basePrice: null,
      observations: withObservations([
        [0, 95],
        [1, 90],
        [2, 85],
      ]),
    }),
    baseInput({
      basePrice: 100,
      observations: withObservations([
        [0, 95],
        [1, 90],
        [2, 85],
        [3, 80],
        [4, 120],
        [5, 200],
      ]),
    }),
  ];

  // Warm the just-in-time compiler so the measurement is of steady state.
  for (const input of inputs) {
    computePosterior(input);
  }

  for (const input of inputs) {
    const started = performance.now();
    computePosterior(input);
    const elapsed = performance.now() - started;
    ok(elapsed < 100, `recompute took ${elapsed} ms`);
  }
});

test("a previous pattern of every kind produces a usable posterior", () => {
  const observations = withObservations([
    [0, 88],
    [1, 84],
  ]);
  for (const previous of PATTERNS) {
    const posterior = required(baseInput({ observations, previousPattern: previous as Pattern }));
    ok(posterior.terms.length > 0);
    ok(Math.abs(sum(posterior.patterns) - 1) < EXACT);
  }
});
