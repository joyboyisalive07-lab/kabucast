/**
 * Which price made the week impossible.
 *
 * Telling a player that their numbers cannot happen is only half an answer;
 * the useful half is which number. Every observation lies in the past of the
 * ones after it, so feeding the prices in one at a time and stopping at the
 * first prefix with no surviving scenario names the earliest slot that cannot
 * follow what came before it.
 *
 * That is the earliest slot the data rules out, not necessarily the one the
 * player mistyped: 88, 84, 80, 76, 72, 71 is impossible at the 71, but so
 * would 88, 84, 80, 76, 72, 61 have been had the 72 been the typo. The
 * interface says which price broke it and offers to clear that one, rather
 * than claiming to know which was meant.
 */

import { SELLING_SLOT_COUNT } from "../model/constants.ts";
import { at } from "../model/array.ts";
import { computePosterior } from "./posterior.ts";
import type { PredictorInput } from "./posterior.ts";

export function firstImpossibleSlot(input: PredictorInput): number | null {
  if (computePosterior(input) !== null) {
    return null;
  }

  const prefix: (number | null)[] = new Array<number | null>(SELLING_SLOT_COUNT).fill(null);
  for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
    const price = at(input.observations, slot);
    if (price === null) {
      continue;
    }
    prefix[slot] = price;
    if (computePosterior({ ...input, observations: prefix }) === null) {
      return slot;
    }
  }

  // Every prefix survives but the whole does not, which the loop above cannot
  // produce; the last observation is still the one that closed the door.
  for (let slot = SELLING_SLOT_COUNT - 1; slot >= 0; slot -= 1) {
    if (at(input.observations, slot) !== null) {
      return slot;
    }
  }
  return null;
}
