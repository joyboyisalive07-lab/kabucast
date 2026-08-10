import { test } from "node:test";
import { ok, equal } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import { SELLING_SLOT_COUNT } from "../src/model/constants.ts";
import { buildPathSampler } from "../src/decide/paths.ts";
import { recommend } from "../src/decide/stopping.ts";
import { computePosterior } from "../src/infer/posterior.ts";
import type { PredictorInput } from "../src/infer/posterior.ts";
import { drawBasePrice, drawPrices, drawScenario, randint } from "../src/model/generator.ts";
import { createRng } from "../src/model/rng.ts";
import { PATTERNS, PATTERN_DECREASING, PATTERN_LARGE_SPIKE } from "../src/model/types.ts";

function posteriorFor(input: PredictorInput) {
  const posterior = computePosterior(input);
  if (posterior === null) {
    throw new Error("expected a consistent posterior");
  }
  return posterior;
}

function inputWith(
  observations: readonly (number | null)[],
  basePrice: number | null = 100,
): PredictorInput {
  return { basePrice, observations, previousPattern: null, firstBuy: false };
}

function observationsFrom(prices: readonly number[], known: number): readonly (number | null)[] {
  return prices.map((price, slot) => (slot < known ? price : null));
}

/**
 * The policy has to sit between the two things it is meant to beat and the
 * thing no policy can reach: never worse in expectation than committing to the
 * first or the last remaining slot, and never better than perfect foresight.
 */
test("the stopping rule beats both fixed policies and stays under perfect foresight", () => {
  const rng = createRng(9_119n);
  const sampleRng = createRng(3_113n);
  let checked = 0;

  for (let week = 0; week < 12; week += 1) {
    const pattern = at(PATTERNS, randint(rng, 0, PATTERNS.length - 1));
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, pattern);
    const prices = drawPrices(rng, scenario, basePrice);

    for (const known of [1, 3, 6]) {
      const observations = observationsFrom(prices, known);
      const posterior = posteriorFor(inputWith(observations, basePrice));
      const advice = recommend(posterior, observations);

      const sampler = buildPathSampler(posterior, observations);
      const buffer = new Array<number>(sampler.futureLength).fill(0);
      let firstSlotTotal = 0;
      let lastSlotTotal = 0;
      let foresightTotal = 0;
      const paths = 4_000;
      for (let draw = 0; draw < paths; draw += 1) {
        sampler.sample(sampleRng, buffer);
        firstSlotTotal += at(buffer, 0);
        lastSlotTotal += at(buffer, buffer.length - 1);
        foresightTotal += Math.max(...buffer);
      }

      const value = advice.expectedBellsIfWaiting;
      const slack = 4 * advice.expectedBellsStandardError;
      ok(value + slack >= firstSlotTotal / paths, `week ${week}/${known}: worse than selling first`);
      ok(value + slack >= lastSlotTotal / paths, `week ${week}/${known}: worse than selling last`);
      ok(value <= foresightTotal / paths + slack, `week ${week}/${known}: beat perfect foresight`);
      checked += 1;
    }
  }
  ok(checked > 0);
});

test("the reported figures are ordered and normalised", () => {
  const rng = createRng(2_468n);
  for (let week = 0; week < 20; week += 1) {
    const pattern = at(PATTERNS, randint(rng, 0, PATTERNS.length - 1));
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, pattern);
    const prices = drawPrices(rng, scenario, basePrice);
    const known = 1 + randint(rng, 0, 8);
    const observations = observationsFrom(prices, known);
    const advice = recommend(posteriorFor(inputWith(observations, basePrice)), observations);

    ok(advice.tenthPercentileIfWaiting <= advice.expectedBellsIfWaiting, "percentile above mean");
    ok(advice.probabilityBetterByWaiting >= 0 && advice.probabilityBetterByWaiting <= 1);
    ok(advice.expectedBellsStandardError > 0);
    equal(advice.sellNowSlot, known - 1);
    equal(advice.sellNowPrice, at(prices, known - 1));
    equal(advice.outlook.length, SELLING_SLOT_COUNT - known);

    const sellShare = advice.outlook.reduce((total, slot) => total + slot.probabilitySellHere, 0);
    ok(Math.abs(sellShare - 1) < 1e-12, `sell shares sum to ${sellShare}`);
    for (let i = 0; i < advice.outlook.length; i += 1) {
      equal(at(advice.outlook, i).slot, known + i);
    }
  }
});

/**
 * Once the posterior has actually identified the decreasing pattern there is
 * never a reason to wait, because it only falls. The condition is checked
 * rather than assumed: three observations are not enough to tell a decreasing
 * week from the run-up to a spike, and the rule is right to wait there.
 */
test("a week identified as decreasing is told to sell", () => {
  const rng = createRng(555n);
  let identified = 0;

  for (let week = 0; week < 25; week += 1) {
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, PATTERN_DECREASING);
    const prices = drawPrices(rng, scenario, basePrice);
    const observations = observationsFrom(prices, 9);
    const posterior = posteriorFor({
      basePrice,
      observations,
      previousPattern: PATTERN_DECREASING,
      firstBuy: false,
    });
    if (at(posterior.patterns, PATTERN_DECREASING) < 0.99) {
      continue;
    }
    identified += 1;
    equal(recommend(posterior, observations).action, "sell", `week ${week} held a falling price`);
  }

  ok(identified >= 20, `only ${identified} of 25 decreasing weeks were identified by slot 9`);
});

test("an early week that could still spike is told to wait", () => {
  const rng = createRng(777_111n);
  let held = 0;

  for (let week = 0; week < 25; week += 1) {
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, PATTERN_LARGE_SPIKE);
    const prices = drawPrices(rng, scenario, basePrice);
    const observations = observationsFrom(prices, 2);
    const advice = recommend(
      posteriorFor({
        basePrice,
        observations,
        previousPattern: PATTERN_LARGE_SPIKE,
        firstBuy: false,
      }),
      observations,
    );
    if (advice.action === "hold") {
      held += 1;
    }
    ok(
      advice.expectedBellsIfWaiting > basePrice,
      `week ${week} valued waiting at ${advice.expectedBellsIfWaiting} against a base of ${basePrice}`,
    );
  }

  ok(held >= 24, `only ${held} of 25 early large spike weeks were told to wait`);
});

test("a fully recorded week has nothing left to decide", () => {
  const rng = createRng(31_415n);
  const basePrice = drawBasePrice(rng);
  const scenario = drawScenario(rng, PATTERN_DECREASING);
  const prices = drawPrices(rng, scenario, basePrice);
  const advice = recommend(posteriorFor(inputWith(prices, basePrice)), prices);
  equal(advice.action, "sell");
  equal(advice.outlook.length, 0);
  equal(advice.sellNowSlot, SELLING_SLOT_COUNT - 1);
});

test("the recommendation is identical for identical input", () => {
  const observations = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  observations[0] = 88;
  observations[1] = 84;
  const posterior = posteriorFor(inputWith(observations));
  equal(
    JSON.stringify(recommend(posterior, observations)),
    JSON.stringify(recommend(posterior, observations)),
  );
});

test("a whole recompute stays inside the hundred millisecond budget", () => {
  const rng = createRng(80_808n);
  const cases: (readonly (number | null)[])[] = [];
  for (const known of [0, 1, 3, 6, 9]) {
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, at(PATTERNS, randint(rng, 0, PATTERNS.length - 1)));
    cases.push(observationsFrom(drawPrices(rng, scenario, basePrice), known));
  }

  for (const observations of cases) {
    const warm = computePosterior(inputWith(observations, null));
    if (warm !== null) {
      recommend(warm, observations);
    }
  }

  for (const observations of cases) {
    const started = performance.now();
    const posterior = computePosterior(inputWith(observations, null));
    if (posterior === null) {
      continue;
    }
    recommend(posterior, observations);
    const elapsed = performance.now() - started;
    ok(elapsed < 100, `posterior plus recommendation took ${elapsed} ms`);
  }
});
