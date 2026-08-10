/**
 * The whole input state, encoded in the URL hash.
 *
 * The hash rather than the query string, so that opening a link never sends the
 * numbers to a server: a fragment is not transmitted with the request. The
 * language is deliberately not part of it, because a link should arrive in the
 * reader's own language rather than in the sender's.
 */

import { at } from "../model/array.ts";
import { BASE_PRICE_MAX, BASE_PRICE_MIN, SELLING_SLOT_COUNT } from "../model/constants.ts";
import { PATTERNS } from "../model/types.ts";
import type { Pattern } from "../model/types.ts";
import type { InputState } from "./input.ts";
import { emptyInputState } from "./input.ts";

const MAX_SELLING_PRICE = 999;

export function encodeState(state: InputState): string {
  const parameters = new URLSearchParams();

  if (state.basePrice !== null) {
    parameters.set("b", String(state.basePrice));
  }

  const prices = state.prices.map((price) => (price === null ? "" : String(price)));
  while (prices.length > 0 && prices[prices.length - 1] === "") {
    prices.pop();
  }
  if (prices.length > 0) {
    parameters.set("p", prices.join("."));
  }

  if (state.firstBuy) {
    parameters.set("f", "1");
  } else if (state.previousPattern !== null) {
    parameters.set("w", String(state.previousPattern));
  }

  return parameters.toString();
}

function readInteger(text: string | null, low: number, high: number): number | null {
  if (text === null || !/^\d{1,4}$/.test(text)) {
    return null;
  }
  const value = Number.parseInt(text, 10);
  return value >= low && value <= high ? value : null;
}

/** Anything malformed is dropped rather than rejected; a link is not a form. */
export function decodeState(hash: string): InputState {
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const empty = emptyInputState();

  const prices: (number | null)[] = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  const encoded = parameters.get("p");
  if (encoded !== null) {
    const parts = encoded.split(".");
    for (let slot = 0; slot < Math.min(parts.length, SELLING_SLOT_COUNT); slot += 1) {
      prices[slot] = readInteger(at(parts, slot), 1, MAX_SELLING_PRICE);
    }
  }

  const firstBuy = parameters.get("f") === "1";
  const patternValue = readInteger(parameters.get("w"), 0, PATTERNS.length - 1);

  return {
    ...empty,
    basePrice: readInteger(parameters.get("b"), BASE_PRICE_MIN, BASE_PRICE_MAX),
    firstBuy,
    previousPattern: firstBuy || patternValue === null ? null : (patternValue as Pattern),
    prices,
  };
}
