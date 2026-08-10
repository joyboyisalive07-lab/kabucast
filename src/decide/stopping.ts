/**
 * When to sell.
 *
 * The seller may take the price at one slot and gets nothing after Saturday, so
 * this is an optimal stopping problem. Its value function is
 * `V(t) = max(price now, E[V(t + 1) | everything seen so far])`, and the
 * conditioning set is the whole price history: the belief over scenarios moves
 * with every new price. Backward induction over that belief exactly is not
 * available, because the branching is over every integer price at every
 * remaining slot.
 *
 * So the induction runs backwards over paths drawn from the posterior, with the
 * continuation value at each slot estimated by least squares on quantities the
 * seller can actually see at that moment. This is the Longstaff and Schwartz
 * construction, and unlike the likelihood in infer/ it is an approximation. Two
 * things keep it honest:
 *
 *   - the rule is fitted on one sample and valued on an independent one, so the
 *     figure reported is the value of a policy that could really be followed,
 *     never the in-sample optimism of the fit;
 *   - the estimate carries its standard error.
 *
 * See docs/DECISIONS.md D-018.
 */

import { at } from "../model/array.ts";
import { SELLING_SLOT_COUNT } from "../model/constants.ts";
import { solveLinearSystem } from "../model/linear.ts";
import { createRng } from "../model/rng.ts";
import type { Observations } from "../infer/likelihood.ts";
import type { Posterior } from "../infer/posterior.ts";
import { buildPathSampler } from "./paths.ts";
import type { PathSampler } from "./paths.ts";

/** Fixed so that identical input produces identical output. */
const DECISION_SEED = 0x6b61627563617374n;

/**
 * Sized against the hundred millisecond budget rather than against a wish. At
 * these counts the standard error of the expected-bells figure is around one
 * bell, which is below the precision anyone acts on, and it is reported
 * alongside the figure rather than left implicit.
 */
const FIT_PATHS = 2_000;
const EVALUATION_PATHS = 4_000;

/** Prices are divided by this so the regression works on numbers near one. */
const PRICE_SCALE = 100;

/**
 * The design is nearly collinear at the first future slot, where the running
 * maximum equals the current price. A ridge this small moves a well-conditioned
 * fit by far less than a bell and keeps the ill-conditioned one solvable.
 */
const RIDGE = 1e-9;

const FEATURE_COUNT = 6;

export interface SlotOutlook {
  readonly slot: number;
  /** Posterior predictive mean of the price at this slot. */
  readonly expectedPrice: number;
  /** Expected bells from declining this slot and continuing under the rule. */
  readonly expectedContinuation: number;
  /** Share of futures in which the rule takes this slot. */
  readonly probabilitySellHere: number;
}

export interface Recommendation {
  readonly action: "sell" | "hold";
  /** The most recent price the player recorded, which is what selling now takes. */
  readonly sellNowPrice: number | null;
  readonly sellNowSlot: number | null;
  readonly expectedBellsIfWaiting: number;
  readonly expectedBellsStandardError: number;
  readonly probabilityBetterByWaiting: number;
  readonly tenthPercentileIfWaiting: number;
  readonly outlook: readonly SlotOutlook[];
  readonly evaluationPaths: number;
}

interface PathSet {
  /** `count * length` prices, path-major. */
  readonly prices: Float64Array;
  /** The largest price seen up to and including each slot, same layout. */
  readonly runningMax: Float64Array;
  readonly count: number;
  readonly length: number;
  readonly firstFutureSlot: number;
}

function drawPaths(sampler: PathSampler, count: number, seed: bigint): PathSet {
  const length = sampler.futureLength;
  const prices = new Float64Array(count * length);
  const runningMax = new Float64Array(count * length);
  const buffer = new Array<number>(length).fill(0);
  const rng = createRng(seed);

  for (let path = 0; path < count; path += 1) {
    sampler.sample(rng, buffer);
    const offset = path * length;
    let highest = 0;
    for (let slot = 0; slot < length; slot += 1) {
      const price = at(buffer, slot);
      prices[offset + slot] = price;
      highest = price > highest ? price : highest;
      runningMax[offset + slot] = highest;
    }
  }

  return { prices, runningMax, count, length, firstFutureSlot: sampler.firstFutureSlot };
}

function priceAt(paths: PathSet, path: number, slot: number): number {
  return paths.prices[path * paths.length + slot] ?? 0;
}

function writeFeatures(
  design: Float64Array,
  path: number,
  price: number,
  previous: number,
  runningMax: number,
): void {
  const x = price / PRICE_SCALE;
  const ratio = previous > 0 ? price / previous : 1;
  const base = path * FEATURE_COUNT;
  design[base] = 1;
  design[base + 1] = x;
  design[base + 2] = x * x;
  design[base + 3] = runningMax / PRICE_SCALE;
  design[base + 4] = ratio;
  design[base + 5] = x * ratio;
}

function fillDesign(
  paths: PathSet,
  slot: number,
  previousPrice: number,
  design: Float64Array,
): void {
  const { prices, runningMax, count, length } = paths;
  for (let path = 0; path < count; path += 1) {
    const offset = path * length + slot;
    const previous = slot === 0 ? previousPrice : (prices[offset - 1] ?? 0);
    writeFeatures(design, path, prices[offset] ?? 0, previous, runningMax[offset] ?? 0);
  }
}

function dot(coefficients: readonly number[], design: Float64Array, path: number): number {
  const base = path * FEATURE_COUNT;
  let total = 0;
  for (let i = 0; i < FEATURE_COUNT; i += 1) {
    total += at(coefficients, i) * (design[base + i] ?? 0);
  }
  return total;
}

function fitLeastSquares(
  design: Float64Array,
  targets: Float64Array,
  count: number,
): readonly number[] {
  const normal: number[][] = [];
  for (let row = 0; row < FEATURE_COUNT; row += 1) {
    normal.push(new Array<number>(FEATURE_COUNT).fill(0));
  }
  const rhs = new Array<number>(FEATURE_COUNT).fill(0);

  const upper = new Float64Array(FEATURE_COUNT * FEATURE_COUNT);
  const moments = new Float64Array(FEATURE_COUNT);
  for (let path = 0; path < count; path += 1) {
    const base = path * FEATURE_COUNT;
    const target = targets[path] ?? 0;
    for (let i = 0; i < FEATURE_COUNT; i += 1) {
      const value = design[base + i] ?? 0;
      for (let j = i; j < FEATURE_COUNT; j += 1) {
        upper[i * FEATURE_COUNT + j] =
          (upper[i * FEATURE_COUNT + j] ?? 0) + value * (design[base + j] ?? 0);
      }
      moments[i] = (moments[i] ?? 0) + value * target;
    }
  }
  for (let i = 0; i < FEATURE_COUNT; i += 1) {
    for (let j = i; j < FEATURE_COUNT; j += 1) {
      at(normal, i)[j] = upper[i * FEATURE_COUNT + j] ?? 0;
    }
    rhs[i] = moments[i] ?? 0;
  }

  for (let i = 0; i < FEATURE_COUNT; i += 1) {
    for (let j = 0; j < i; j += 1) {
      at(normal, i)[j] = at(at(normal, j), i);
    }
    at(normal, i)[i] = at(at(normal, i), i) + RIDGE * count;
  }

  const solution = solveLinearSystem(normal, rhs);
  if (solution !== null) {
    return solution;
  }
  let total = 0;
  for (let path = 0; path < count; path += 1) {
    total += targets[path] ?? 0;
  }
  return [count === 0 ? 0 : total / count, 0, 0, 0, 0, 0];
}

/** One coefficient row per slot; the last slot has no choice and no row. */
function fitStoppingRule(paths: PathSet, previousPrice: number): readonly (readonly number[])[] {
  const { count, length } = paths;
  const value = new Float64Array(count);
  for (let path = 0; path < count; path += 1) {
    value[path] = priceAt(paths, path, length - 1);
  }

  const rules: (readonly number[])[] = [];
  for (let slot = 0; slot < length - 1; slot += 1) {
    rules.push([]);
  }

  const design = new Float64Array(count * FEATURE_COUNT);
  for (let slot = length - 2; slot >= 0; slot -= 1) {
    fillDesign(paths, slot, previousPrice, design);
    const coefficients = fitLeastSquares(design, value, count);
    rules[slot] = coefficients;
    for (let path = 0; path < count; path += 1) {
      const price = priceAt(paths, path, slot);
      if (price >= dot(coefficients, design, path)) {
        value[path] = price;
      }
    }
  }

  return rules;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)));
  return at(sorted, index);
}

export function recommend(posterior: Posterior, observations: Observations): Recommendation {
  let sellNowSlot: number | null = null;
  for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
    if (at(observations, slot) !== null) {
      sellNowSlot = slot;
    }
  }
  const sellNowPrice = sellNowSlot === null ? null : at(observations, sellNowSlot);

  const sampler = buildPathSampler(posterior, observations);
  const fitPaths = drawPaths(sampler, FIT_PATHS, DECISION_SEED);
  const length = fitPaths.length;

  if (length === 0) {
    return {
      action: "sell",
      sellNowPrice,
      sellNowSlot,
      expectedBellsIfWaiting: 0,
      expectedBellsStandardError: 0,
      probabilityBetterByWaiting: 0,
      tenthPercentileIfWaiting: 0,
      outlook: [],
      evaluationPaths: 0,
    };
  }

  const previousPrice = sellNowPrice ?? 0;
  const rules = fitStoppingRule(fitPaths, previousPrice);

  const evaluation = drawPaths(sampler, EVALUATION_PATHS, DECISION_SEED + 1n);
  const count = evaluation.count;

  const design = new Float64Array(count * FEATURE_COUNT);
  const sellHere: boolean[][] = [];
  for (let slot = 0; slot < length; slot += 1) {
    sellHere.push(new Array<boolean>(count).fill(slot === length - 1));
  }

  const valueFrom: Float64Array[] = [];
  for (let slot = 0; slot < length; slot += 1) {
    valueFrom.push(new Float64Array(count));
  }
  for (let path = 0; path < count; path += 1) {
    at(valueFrom, length - 1)[path] = priceAt(evaluation, path, length - 1);
  }

  for (let slot = length - 2; slot >= 0; slot -= 1) {
    fillDesign(evaluation, slot, previousPrice, design);
    const coefficients = at(rules, slot);
    for (let path = 0; path < count; path += 1) {
      const price = priceAt(evaluation, path, slot);
      const take = price >= dot(coefficients, design, path);
      at(sellHere, slot)[path] = take;
      at(valueFrom, slot)[path] = take ? price : (at(valueFrom, slot + 1)[path] ?? 0);
    }
  }

  const realised: number[] = [];
  const soldAt = new Array<number>(length).fill(0);
  for (let path = 0; path < count; path += 1) {
    realised.push(at(valueFrom, 0)[path] ?? 0);
    for (let slot = 0; slot < length; slot += 1) {
      if (at(at(sellHere, slot), path)) {
        soldAt[slot] = at(soldAt, slot) + 1;
        break;
      }
    }
  }

  const mean = realised.reduce((total, value) => total + value, 0) / count;
  const variance =
    realised.reduce((total, value) => total + (value - mean) * (value - mean), 0) /
    Math.max(count - 1, 1);
  const sorted = [...realised].sort((a, b) => a - b);
  const better =
    sellNowPrice === null ? 1 : realised.filter((value) => value > sellNowPrice).length / count;

  const outlook: SlotOutlook[] = [];
  for (let slot = 0; slot < length; slot += 1) {
    let priceTotal = 0;
    let continuationTotal = 0;
    for (let path = 0; path < count; path += 1) {
      priceTotal += priceAt(evaluation, path, slot);
      if (slot + 1 < length) {
        continuationTotal += at(valueFrom, slot + 1)[path] ?? 0;
      }
    }
    outlook.push({
      slot: evaluation.firstFutureSlot + slot,
      expectedPrice: priceTotal / count,
      expectedContinuation: continuationTotal / count,
      probabilitySellHere: at(soldAt, slot) / count,
    });
  }

  return {
    action: sellNowPrice !== null && sellNowPrice >= mean ? "sell" : "hold",
    sellNowPrice,
    sellNowSlot,
    expectedBellsIfWaiting: mean,
    expectedBellsStandardError: Math.sqrt(variance / count),
    probabilityBetterByWaiting: better,
    tenthPercentileIfWaiting: percentile(sorted, 0.1),
    outlook,
    evaluationPaths: count,
  };
}
