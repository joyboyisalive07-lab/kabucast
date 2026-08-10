import { test } from "node:test";
import { ok, equal, throws } from "node:assert/strict";
import { SELLING_SLOT_COUNT } from "../src/model/constants.ts";
import { drawScenario } from "../src/model/generator.ts";
import { buildScenario, enumerateScenarios, scenarioLength } from "../src/model/scenario.ts";
import { createRng } from "../src/model/rng.ts";
import {
  PATTERNS,
  PATTERN_DECREASING,
  PATTERN_FLUCTUATING,
  PATTERN_LARGE_SPIKE,
  PATTERN_SMALL_SPIKE,
} from "../src/model/types.ts";
import type { Scenario } from "../src/model/types.ts";

function key(scenario: Scenario): string {
  return JSON.stringify(scenario.segments);
}

test("the number of scenarios per pattern follows from the phase draws", () => {
  // Fluctuating: two decreasing splits times sum over the seven high-phase-1
  // lengths of the remaining choices, 2 * (7+6+5+4+3+2+1).
  equal(enumerateScenarios(PATTERN_FLUCTUATING).length, 56);
  equal(enumerateScenarios(PATTERN_LARGE_SPIKE).length, 7);
  equal(enumerateScenarios(PATTERN_DECREASING).length, 1);
  equal(enumerateScenarios(PATTERN_SMALL_SPIKE).length, 8);
});

test("every scenario covers exactly the twelve selling slots", () => {
  for (const pattern of PATTERNS) {
    for (const scenario of enumerateScenarios(pattern)) {
      equal(scenarioLength(scenario), SELLING_SLOT_COUNT, `pattern ${pattern}`);
    }
  }
});

test("no scenario carries an empty segment", () => {
  for (const pattern of PATTERNS) {
    for (const scenario of enumerateScenarios(pattern)) {
      for (const segment of scenario.segments) {
        ok(segment.kind === "peak" || segment.length > 0, `empty segment in pattern ${pattern}`);
      }
    }
  }
});

test("the phase assignment probabilities of a pattern sum to one", () => {
  for (const pattern of PATTERNS) {
    const total = enumerateScenarios(pattern).reduce(
      (sum, scenario) => sum + scenario.probability,
      0,
    );
    ok(Math.abs(total - 1) < 1e-12, `pattern ${pattern} sums to ${total}`);
  }
});

test("every enumerated scenario is distinct", () => {
  for (const pattern of PATTERNS) {
    const scenarios = enumerateScenarios(pattern);
    equal(new Set(scenarios.map(key)).size, scenarios.length, `pattern ${pattern}`);
  }
});

test("the sampler reproduces the enumerated phase assignment probabilities", () => {
  const rng = createRng(606n);
  const samples = 200_000;

  for (const pattern of PATTERNS) {
    const scenarios = enumerateScenarios(pattern);
    const expected = new Map(scenarios.map((scenario) => [key(scenario), scenario.probability]));
    const counts = new Map<string, number>();

    for (let i = 0; i < samples; i += 1) {
      const drawn = key(drawScenario(rng, pattern));
      ok(expected.has(drawn), `pattern ${pattern} sampled an unenumerated scenario`);
      counts.set(drawn, (counts.get(drawn) ?? 0) + 1);
    }

    equal(counts.size, scenarios.length, `pattern ${pattern} never sampled some scenarios`);

    for (const [scenarioKey, probability] of expected) {
      const observed = counts.get(scenarioKey) ?? 0;
      const mean = samples * probability;
      // A pattern with a single phase assignment has zero variance, so the
      // bound is zero and the comparison has to admit an exact match.
      const bound = 5 * Math.sqrt(samples * probability * (1 - probability));
      ok(
        Math.abs(observed - mean) <= bound,
        `pattern ${pattern}: ${observed} vs ${mean} (bound ${bound})`,
      );
    }
  }
});

test("buildScenario rejects a phase assignment that does not fill the week", () => {
  throws(() =>
    buildScenario({
      pattern: PATTERN_FLUCTUATING,
      decreasingPhase1Length: 2,
      highPhase1Length: 0,
      highPhase3Length: 8,
    }),
  );
  throws(() => buildScenario({ pattern: PATTERN_LARGE_SPIKE, peakStart: 12 }));
});

test("the small spike always carries its three correlated slots", () => {
  for (const scenario of enumerateScenarios(PATTERN_SMALL_SPIKE)) {
    equal(scenario.segments.filter((segment) => segment.kind === "peak").length, 1);
  }
  for (const pattern of [PATTERN_FLUCTUATING, PATTERN_LARGE_SPIKE, PATTERN_DECREASING] as const) {
    for (const scenario of enumerateScenarios(pattern)) {
      equal(scenario.segments.filter((segment) => segment.kind === "peak").length, 0);
    }
  }
});
