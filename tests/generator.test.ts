import { test } from "node:test";
import { ok, equal, deepEqual } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import {
  BASE_PRICE_MAX,
  BASE_PRICE_MIN,
  RANDFLOAT_LATTICE,
  RATE_SPIKE_PEAK,
  SELLING_SLOT_COUNT,
  SMALL_PEAK_FLANK_PRICE_OFFSET,
} from "../src/model/constants.ts";
import {
  drawBasePrice,
  drawNextPattern,
  drawPrices,
  drawRate,
  drawScenario,
  drawWeek,
  intceil,
  priceFromRate,
  randbool,
  randint,
  randUnit,
} from "../src/model/generator.ts";
import { rateTolerance } from "../src/infer/inversion.ts";
import { TRANSITION_MATRIX } from "../src/model/prior.ts";
import { decayStepBounds, rateBounds } from "../src/model/rate.ts";
import { segmentLength } from "../src/model/scenario.ts";
import { createRng } from "../src/model/rng.ts";
import type { Rng } from "../src/model/rng.ts";
import {
  PATTERNS,
  PATTERN_DECREASING,
  PATTERN_SMALL_SPIKE,
  PATTERN_LARGE_SPIKE,
} from "../src/model/types.ts";
import type { Pattern, Scenario } from "../src/model/types.ts";

function fixedRng(words: readonly number[]): Rng {
  let index = 0;
  const next = (): number => at(words, index++ % words.length);
  return { nextUint32: next, nextFloat: () => next() / 2 ** 32 };
}

test("randbool reads the top bit", () => {
  equal(randbool(fixedRng([0x80000000])), true);
  equal(randbool(fixedRng([0xffffffff])), true);
  equal(randbool(fixedRng([0x7fffffff])), false);
  equal(randbool(fixedRng([0x00000000])), false);
});

test("randint spans its range inclusively", () => {
  equal(randint(fixedRng([0x00000000]), 90, 110), 90);
  equal(randint(fixedRng([0xffffffff]), 90, 110), 110);
  equal(randint(fixedRng([0x00000000]), 0, 99), 0);
  equal(randint(fixedRng([0xffffffff]), 0, 99), 99);
  equal(randint(fixedRng([0x80000000]), 0, 1), 1);
  equal(randint(fixedRng([0x7fffffff]), 0, 1), 0);
});

test("randUnit lands on the 2^-23 lattice of the source", () => {
  equal(randUnit(fixedRng([0x00000000])), 0);
  equal(randUnit(fixedRng([0xffffffff])), (RANDFLOAT_LATTICE - 1) / RANDFLOAT_LATTICE);
  // The low nine bits are discarded, so they cannot change the result.
  equal(randUnit(fixedRng([0x000001ff])), 0);
});

test("intceil is the source's rounding rule and not a ceiling", () => {
  equal(intceil(5), 5);
  equal(intceil(5.5), 6);
  equal(intceil(4.000001), 4);
  equal(intceil(4.00002), 5);
  // Where the two disagree: a ceiling would answer 5 here.
  equal(Math.ceil(4.000001), 5);
});

test("drawRate starts at the origin and stays inside its bounds", () => {
  const ascending = { origin: Math.fround(0.9), span: Math.fround(0.5) };
  const descending = { origin: Math.fround(0.8), span: Math.fround(-0.2) };

  equal(drawRate(fixedRng([0x00000000]), ascending), Math.fround(0.9));
  equal(drawRate(fixedRng([0x00000000]), descending), Math.fround(0.8));

  const rng = createRng(11n);
  for (let i = 0; i < 100_000; i += 1) {
    const up = drawRate(rng, ascending);
    ok(up >= 0.9 - 1e-7 && up < 1.4, `ascending out of bounds: ${up}`);
    const down = drawRate(rng, descending);
    ok(down > 0.6 && down <= 0.8 + 1e-7, `descending out of bounds: ${down}`);
  }
});

/**
 * The inversion in ALGORITHM.md maps a price back to a half-open rate interval
 * of width 1/base. The generator rounds `rate * base` through float32 while the
 * inversion works in doubles, so the true rate can fall outside. This measures
 * that excursion against the tolerance the likelihood actually applies, and
 * fails if the tolerance is ever not enough.
 */
test("the tolerance covers every excursion the float32 rounding can cause", () => {
  const rng = createRng(4242n);
  let worstFraction = 0;
  for (let i = 0; i < 500_000; i += 1) {
    const basePrice = randint(rng, BASE_PRICE_MIN, BASE_PRICE_MAX);
    const rate = Math.fround(0.4 + rng.nextFloat() * 5.6);
    const price = priceFromRate(rate, basePrice);
    const lo = (price - 0.99999) / basePrice;
    const hi = (price + 0.00001) / basePrice;
    const tolerance = rateTolerance(price, basePrice);
    worstFraction = Math.max(worstFraction, (lo - rate) / tolerance, (rate - hi) / tolerance);
  }
  ok(worstFraction < 1, `worst excursion used ${worstFraction} of the tolerance`);
});

test("drawBasePrice is uniform over 90 to 110", () => {
  const rng = createRng(5n);
  const counts = new Map<number, number>();
  const samples = 210_000;
  for (let i = 0; i < samples; i += 1) {
    const price = drawBasePrice(rng);
    ok(price >= BASE_PRICE_MIN && price <= BASE_PRICE_MAX, `out of range: ${price}`);
    counts.set(price, (counts.get(price) ?? 0) + 1);
  }
  const outcomes = BASE_PRICE_MAX - BASE_PRICE_MIN + 1;
  equal(counts.size, outcomes);
  const expected = samples / outcomes;
  const bound = 5 * Math.sqrt(expected * (1 - 1 / outcomes));
  for (const [price, count] of counts) {
    ok(Math.abs(count - expected) < bound, `base price ${price}: ${count} vs ${expected}`);
  }
});

test("drawNextPattern reproduces every row of the transition matrix", () => {
  const rng = createRng(777n);
  const samples = 200_000;
  for (const previous of PATTERNS) {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < samples; i += 1) {
      const drawn = drawNextPattern(rng, previous);
      counts[drawn] = at(counts, drawn) + 1;
    }
    const row = at(TRANSITION_MATRIX, previous);
    for (const pattern of PATTERNS) {
      const expected = at(row, pattern) * samples;
      const bound = 5 * Math.sqrt(samples * at(row, pattern) * (1 - at(row, pattern)));
      ok(
        Math.abs(at(counts, pattern) - expected) < bound,
        `from ${previous} to ${pattern}: ${at(counts, pattern)} vs ${expected}`,
      );
    }
  }
});

interface SlotBound {
  readonly lo: number;
  readonly hi: number;
  readonly priceOffset: number;
}

function slotBounds(scenario: Scenario): readonly SlotBound[] {
  const bounds: SlotBound[] = [];
  for (const segment of scenario.segments) {
    switch (segment.kind) {
      case "independent": {
        const range = rateBounds(segment.rate);
        for (let i = 0; i < segment.length; i += 1) {
          bounds.push({ lo: range.lo, hi: range.hi, priceOffset: 0 });
        }
        break;
      }
      case "decay": {
        const start = rateBounds(segment.start);
        const step = decayStepBounds(segment.step);
        for (let i = 0; i < segment.length; i += 1) {
          bounds.push({ lo: start.lo - i * step.hi, hi: start.hi - i * step.lo, priceOffset: 0 });
        }
        break;
      }
      case "peak": {
        const peak = rateBounds(segment.peak);
        const flank: SlotBound = {
          lo: segment.flankFloor,
          hi: peak.hi,
          priceOffset: SMALL_PEAK_FLANK_PRICE_OFFSET,
        };
        bounds.push(flank);
        bounds.push({ lo: peak.lo, hi: peak.hi, priceOffset: 0 });
        bounds.push(flank);
        break;
      }
    }
  }
  return bounds;
}

/** Twelve float32 subtractions accumulate; this covers the drift they cause. */
const RATE_SLACK = 1e-6;

test("every generated price lies inside the range its segment allows", () => {
  const rng = createRng(2026n);
  for (let week = 0; week < 20_000; week += 1) {
    const pattern = at(PATTERNS, randint(rng, 0, PATTERNS.length - 1));
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, pattern);
    const prices = drawPrices(rng, scenario, basePrice);
    const bounds = slotBounds(scenario);

    equal(prices.length, SELLING_SLOT_COUNT);
    equal(bounds.length, SELLING_SLOT_COUNT);

    for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
      const bound = at(bounds, slot);
      const low = priceFromRate(bound.lo - RATE_SLACK, basePrice) + bound.priceOffset;
      const high = priceFromRate(bound.hi + RATE_SLACK, basePrice) + bound.priceOffset;
      const price = at(prices, slot);
      ok(
        price >= low && price <= high,
        `pattern ${pattern} slot ${slot}: ${price} outside ${low}..${high}`,
      );
    }
  }
});

test("the decreasing pattern never rises", () => {
  const rng = createRng(31n);
  for (let week = 0; week < 20_000; week += 1) {
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, PATTERN_DECREASING);
    const prices = drawPrices(rng, scenario, basePrice);
    for (let slot = 1; slot < prices.length; slot += 1) {
      ok(at(prices, slot) <= at(prices, slot - 1), `rose at slot ${slot}: ${prices.join(",")}`);
    }
  }
});

test("the small spike flanks stay below its peak", () => {
  const rng = createRng(97n);
  for (let week = 0; week < 20_000; week += 1) {
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, PATTERN_SMALL_SPIKE);
    const prices = drawPrices(rng, scenario, basePrice);

    let slot = 0;
    for (const segment of scenario.segments) {
      if (segment.kind === "peak") {
        const before = at(prices, slot);
        const peak = at(prices, slot + 1);
        const after = at(prices, slot + 2);
        ok(before < peak, `flank ${before} not below peak ${peak}`);
        ok(after < peak, `flank ${after} not below peak ${peak}`);
        break;
      }
      slot += segmentLength(segment);
    }
  }
});

test("the large spike peak reaches at least twice the base price", () => {
  const rng = createRng(1234n);
  for (let week = 0; week < 5_000; week += 1) {
    const basePrice = drawBasePrice(rng);
    const scenario = drawScenario(rng, PATTERN_LARGE_SPIKE);
    const prices = drawPrices(rng, scenario, basePrice);

    let peakSlot = -1;
    let slot = 0;
    for (const segment of scenario.segments) {
      if (segment.kind === "independent" && segment.rate === RATE_SPIKE_PEAK) {
        peakSlot = slot;
        break;
      }
      slot += segmentLength(segment);
    }
    ok(peakSlot >= 0, "no peak slot found");
    ok(
      at(prices, peakSlot) >= priceFromRate(2 - RATE_SLACK, basePrice),
      `peak ${at(prices, peakSlot)} below twice base ${basePrice}`,
    );
  }
});

test("a first-time buyer always gets the small spike", () => {
  const rng = createRng(8n);
  for (const previous of PATTERNS) {
    for (let week = 0; week < 2_000; week += 1) {
      equal(drawWeek(rng, previous, true).pattern, PATTERN_SMALL_SPIKE);
    }
  }
});

test("drawWeek is deterministic in its seed", () => {
  const run = (): readonly (readonly number[])[] => {
    const rng = createRng(555n);
    const weeks: (readonly number[])[] = [];
    let previous: Pattern = PATTERN_DECREASING;
    for (let i = 0; i < 500; i += 1) {
      const week = drawWeek(rng, previous, false);
      weeks.push([week.pattern, week.basePrice, ...week.prices]);
      previous = week.pattern;
    }
    return weeks;
  };
  deepEqual(run(), run());
});
