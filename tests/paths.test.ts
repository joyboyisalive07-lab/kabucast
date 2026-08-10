import { test } from "node:test";
import { ok, equal } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import { SELLING_SLOT_COUNT } from "../src/model/constants.ts";
import { buildPathSampler, firstUnrecordedSlot } from "../src/decide/paths.ts";
import { computePosterior } from "../src/infer/posterior.ts";
import type { PredictorInput } from "../src/infer/posterior.ts";
import { drawBasePrice, drawPrices, drawScenario, randint } from "../src/model/generator.ts";
import { createRng } from "../src/model/rng.ts";
import { PATTERNS } from "../src/model/types.ts";

function observationsFrom(prices: readonly number[], known: number): readonly (number | null)[] {
  return prices.map((price, slot) => (slot < known ? price : null));
}

function posteriorFor(input: PredictorInput) {
  const posterior = computePosterior(input);
  if (posterior === null) {
    throw new Error("expected a consistent posterior");
  }
  return posterior;
}

test("the first unrecorded slot is one past the last price entered", () => {
  equal(firstUnrecordedSlot(new Array<number | null>(SELLING_SLOT_COUNT).fill(null)), 0);
  const observations = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  observations[0] = 90;
  observations[3] = 80;
  equal(firstUnrecordedSlot(observations), 4);
});

/**
 * Anything the sampler produces has to be something the model could produce:
 * completing a week with a sampled tail must leave a consistent posterior.
 */
test("every sampled path is a week the generator could have produced", () => {
  const rng = createRng(4_040n);
  const sampleRng = createRng(5_050n);

  for (let week = 0; week < 60; week += 1) {
    const pattern = at(PATTERNS, randint(rng, 0, PATTERNS.length - 1));
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, pattern);
    const prices = drawPrices(rng, scenario, basePrice);

    for (const known of [1, 4, 8]) {
      const observations = observationsFrom(prices, known);
      const input: PredictorInput = {
        basePrice,
        observations,
        previousPattern: null,
        firstBuy: false,
      };
      const sampler = buildPathSampler(posteriorFor(input), observations);
      const buffer = new Array<number>(sampler.futureLength).fill(0);

      for (let draw = 0; draw < 5; draw += 1) {
        sampler.sample(sampleRng, buffer);
        const completed = observations.map((price, slot) =>
          slot < known ? price : at(buffer, slot - sampler.firstFutureSlot),
        );
        ok(
          computePosterior({ ...input, observations: completed }) !== null,
          `sampled week is impossible: ${completed.join(",")}`,
        );
      }
    }
  }
});

/**
 * The exact predictive probability of the next price is available without the
 * sampler: it is the ratio of the marginal likelihood with that price added to
 * the marginal likelihood without it. Comparing the sampler against that ratio
 * checks the conditioning, not just the support.
 */
test("the sampled next price follows the exact predictive distribution", () => {
  const basePrice = 100;
  const observations = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  observations[0] = 88;

  const input: PredictorInput = {
    basePrice,
    observations,
    previousPattern: null,
    firstBuy: false,
  };
  const posterior = posteriorFor(input);

  const exact = new Map<number, number>();
  let exactTotal = 0;
  for (let price = 1; price <= 260; price += 1) {
    const extended = [...observations];
    extended[1] = price;
    const withPrice = computePosterior({ ...input, observations: extended });
    if (withPrice === null) {
      continue;
    }
    const probability = withPrice.evidence / posterior.evidence;
    exact.set(price, probability);
    exactTotal += probability;
  }
  // Neighbouring buckets overlap by the float32 tolerance at each edge, so the
  // total exceeds one by about 2 * price * 2^-23. At the prices this input can
  // reach that is a few parts in a hundred thousand, and it can only be an
  // excess, never a shortfall.
  ok(exactTotal >= 1, `exact predictive sums to ${exactTotal}`);
  ok(exactTotal < 1.0001, `exact predictive sums to ${exactTotal}`);

  const sampler = buildPathSampler(posterior, observations);
  const buffer = new Array<number>(sampler.futureLength).fill(0);
  const rng = createRng(70_707n);
  const samples = 400_000;
  const counts = new Map<number, number>();
  for (let draw = 0; draw < samples; draw += 1) {
    sampler.sample(rng, buffer);
    const price = at(buffer, 0);
    counts.set(price, (counts.get(price) ?? 0) + 1);
  }

  for (const [price, probability] of exact) {
    if (probability < 1e-4) {
      continue;
    }
    const observed = (counts.get(price) ?? 0) / samples;
    const standardError = Math.sqrt((probability * (1 - probability)) / samples);
    ok(
      Math.abs(observed - probability) < 5 * standardError,
      `price ${price}: exact ${probability}, sampled ${observed} +- ${standardError}`,
    );
  }

  for (const price of counts.keys()) {
    ok(exact.has(price), `sampler produced price ${price} the model calls impossible`);
  }
});

test("path sampling is deterministic in its seed", () => {
  const observations = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  observations[0] = 91;
  observations[1] = 87;
  const posterior = posteriorFor({
    basePrice: 100,
    observations,
    previousPattern: null,
    firstBuy: false,
  });
  const sampler = buildPathSampler(posterior, observations);

  const run = (): number[][] => {
    const rng = createRng(808n);
    const buffer = new Array<number>(sampler.futureLength).fill(0);
    const paths: number[][] = [];
    for (let draw = 0; draw < 200; draw += 1) {
      sampler.sample(rng, buffer);
      paths.push([...buffer]);
    }
    return paths;
  };

  equal(JSON.stringify(run()), JSON.stringify(run()));
});

test("a fully recorded week leaves nothing to sample", () => {
  const rng = createRng(606_060n);
  const basePrice = drawBasePrice(rng);
  const scenario = drawScenario(rng, at(PATTERNS, 2));
  const prices = drawPrices(rng, scenario, basePrice);
  const posterior = posteriorFor({
    basePrice,
    observations: prices,
    previousPattern: null,
    firstBuy: false,
  });
  const sampler = buildPathSampler(posterior, prices);
  equal(sampler.futureLength, 0);
  equal(sampler.firstFutureSlot, SELLING_SLOT_COUNT);
});
