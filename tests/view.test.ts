import { test } from "node:test";
import { ok, equal } from "node:assert/strict";
import { at } from "../src/model/array.ts";
import { SCENARIOS_BY_PATTERN } from "../src/model/scenario.ts";
import {
  PATTERNS,
  PATTERN_DECREASING,
  PATTERN_FLUCTUATING,
  PATTERN_LARGE_SPIKE,
  PATTERN_SMALL_SPIKE,
} from "../src/model/types.ts";
import { LANGUAGES } from "../src/i18n/index.ts";
import { RU } from "../src/i18n/ru.ts";
import { EN } from "../src/i18n/strings.ts";
import { bells, fill, percent, slotLabel } from "../src/ui/format.ts";
import { describeScenario } from "../src/ui/view.ts";

test("bells are rounded and grouped for the reader's language", () => {
  equal(bells(0, EN.locale), "0");
  equal(bells(87.4, EN.locale), "87");
  equal(bells(87.6, EN.locale), "88");
  equal(bells(1234.2, EN.locale), "1,234");
  // Russian groups with a space rather than a comma.
  ok(/^1.234$/u.test(bells(1234.2, RU.locale)), bells(1234.2, RU.locale));
});

test("every language fills every string", () => {
  const keys = Object.keys(EN) as (keyof typeof EN)[];
  for (const [code, strings] of LANGUAGES) {
    for (const key of keys) {
      const value = strings[key];
      ok(value !== undefined, `${code} is missing ${String(key)}`);
      if (Array.isArray(value)) {
        equal(
          value.length,
          (EN[key] as readonly string[]).length,
          `${code} has the wrong number of ${String(key)}`,
        );
        for (const item of value) {
          ok(typeof item === "string" && item.length > 0, `${code} has an empty ${String(key)}`);
        }
      } else {
        ok(typeof value === "string" && value.length > 0, `${code} has an empty ${String(key)}`);
      }
    }
  }
});

test("every language keeps the placeholders its templates need", () => {
  const templated = [
    "sellNowDetail",
    "holdDetail",
    "scenarioPeakAt",
    "scenarioFalls",
    "scenarioCount",
    "chartSummary",
    "chartPeak",
  ] as const;
  for (const [code, strings] of LANGUAGES) {
    for (const key of templated) {
      const expected = EN[key].match(/\{\w+\}/g) ?? [];
      const actual = strings[key].match(/\{\w+\}/g) ?? [];
      equal(
        [...actual].sort().join(","),
        [...expected].sort().join(","),
        `${code} ${key}: "${strings[key]}"`,
      );
    }
  }
});

/**
 * A scenario that survives with one chance in ten thousand has not been ruled
 * out, and printing it as zero would claim the arithmetic said something it
 * did not.
 */
test("a surviving but tiny probability is never shown as zero", () => {
  equal(percent(0), "0%");
  ok(percent(0.00001).startsWith("<"));
  ok(percent(0.0009).startsWith("<"));
  equal(percent(1), "100.0%");
  equal(percent(0.9999), ">99.9%");
});

test("probabilities keep enough digits to be read", () => {
  equal(percent(0.5), "50.0%");
  equal(percent(0.05), "5.00%");
  equal(percent(0.4682), "46.8%");
  equal(percent(0.0429), "4.29%");
});

test("slot labels name the half-day", () => {
  equal(slotLabel(0, EN.dayNames, EN.morning, EN.afternoon), "Monday AM");
  equal(slotLabel(11, EN.dayNames, EN.morning, EN.afternoon), "Saturday PM");
});

test("templates fill their placeholders and leave unknown ones alone", () => {
  equal(fill("peak at {slot}", { slot: "Wednesday PM" }), "peak at Wednesday PM");
  equal(fill("{a} and {b}", { a: "one" }), "one and {b}");
});

test("every scenario gets a description that names its shape", () => {
  for (const pattern of PATTERNS) {
    for (const scenario of at(SCENARIOS_BY_PATTERN, pattern)) {
      const description = describeScenario(scenario, EN);
      ok(description.length > 0, `pattern ${pattern} produced an empty description`);
      ok(!description.includes("{"), `unfilled placeholder in "${description}"`);
    }
  }
});

test("a spike is described by where it peaks and a fall by where it falls", () => {
  const largeSpike = at(at(SCENARIOS_BY_PATTERN, PATTERN_LARGE_SPIKE), 0);
  ok(describeScenario(largeSpike, EN).startsWith("peak at "));

  const smallSpike = at(at(SCENARIOS_BY_PATTERN, PATTERN_SMALL_SPIKE), 0);
  ok(describeScenario(smallSpike, EN).startsWith("peak at "));

  equal(
    describeScenario(at(at(SCENARIOS_BY_PATTERN, PATTERN_DECREASING), 0), EN),
    EN.scenarioAllWeek,
  );

  const fluctuating = at(at(SCENARIOS_BY_PATTERN, PATTERN_FLUCTUATING), 0);
  const description = describeScenario(fluctuating, EN);
  ok(description.startsWith("falls "), description);
  ok(description.includes(","), `expected two falling stretches in "${description}"`);
});
