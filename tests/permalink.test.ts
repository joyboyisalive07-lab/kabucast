import { test } from "node:test";
import { ok, deepEqual, equal } from "node:assert/strict";
import { SELLING_SLOT_COUNT } from "../src/model/constants.ts";
import { PATTERN_DECREASING, PATTERN_LARGE_SPIKE } from "../src/model/types.ts";
import { emptyInputState } from "../src/ui/input.ts";
import type { InputState } from "../src/ui/input.ts";
import { decodeState, encodeState } from "../src/ui/permalink.ts";

function withPrices(values: readonly (number | null)[]): readonly (number | null)[] {
  const prices = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  values.forEach((value, slot) => {
    prices[slot] = value;
  });
  return prices;
}

function roundTrip(state: InputState): InputState {
  return decodeState(encodeState(state));
}

test("an empty state encodes to nothing and comes back empty", () => {
  equal(encodeState(emptyInputState()), "");
  deepEqual(decodeState(""), emptyInputState());
});

test("a full state survives the round trip", () => {
  const state: InputState = {
    basePrice: 104,
    firstBuy: false,
    previousPattern: PATTERN_LARGE_SPIKE,
    prices: withPrices([86, 81, 76, 73, 107, 175, 517, 148, 109, 66, 85, 41]),
  };
  deepEqual(roundTrip(state), state);
});

test("gaps in the middle of the week survive", () => {
  const state: InputState = {
    basePrice: 90,
    firstBuy: false,
    previousPattern: null,
    prices: withPrices([88, null, 80, null, null, 72]),
  };
  deepEqual(roundTrip(state), state);
});

test("a first-time buyer drops the previous pattern, which cannot apply", () => {
  const state: InputState = {
    basePrice: 100,
    firstBuy: true,
    previousPattern: PATTERN_DECREASING,
    prices: withPrices([]),
  };
  const decoded = roundTrip(state);
  equal(decoded.firstBuy, true);
  equal(decoded.previousPattern, null);
});

test("trailing empty slots are not carried in the link", () => {
  const encoded = encodeState({
    basePrice: 100,
    firstBuy: false,
    previousPattern: null,
    prices: withPrices([88, 84]),
  });
  equal(encoded, "b=100&p=88.84");
});

test("a leading hash is accepted, as pasted from an address bar", () => {
  deepEqual(decodeState("#b=100&p=88.84"), decodeState("b=100&p=88.84"));
});

/** A link is not a form: a broken one loads what it can rather than refusing. */
test("values outside the model are dropped rather than rejected", () => {
  const decoded = decodeState("b=200&p=88.abc.9999.0.84&w=9");
  equal(decoded.basePrice, null);
  equal(decoded.previousPattern, null);
  deepEqual([...decoded.prices].slice(0, 5), [88, null, null, null, 84]);
});

test("more prices than the week has are ignored", () => {
  const decoded = decodeState("p=" + new Array(20).fill("90").join("."));
  equal(decoded.prices.length, SELLING_SLOT_COUNT);
  ok(decoded.prices.every((price) => price === 90));
});
