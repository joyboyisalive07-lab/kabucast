/**
 * The calibration harness.
 *
 * Generates weeks with the generative model, feeds the predictor the prices a
 * player would have by a given half-day, and records what it claimed against
 * what was true. Nothing here inspects the inference; it only compares its
 * output with the pattern that actually produced the prices.
 *
 * Run with: node tools/simulate.ts --weeks 1000000
 * Writes docs/calibration.json, which docs/CALIBRATION.md quotes and phase 9
 * draws.
 */

import { writeFileSync } from "node:fs";
import process from "node:process";
import { at } from "../src/model/array.ts";
import { computePosterior } from "../src/infer/posterior.ts";
import { drawWeek } from "../src/model/generator.ts";
import { STATIONARY_PATTERN_PRIOR } from "../src/model/prior.ts";
import { createRng } from "../src/model/rng.ts";
import type { Rng } from "../src/model/rng.ts";
import { PATTERNS } from "../src/model/types.ts";
import type { Pattern } from "../src/model/types.ts";

const DEFAULT_WEEKS = 1_000_000;
const DEFAULT_SEED = 20260811n;
const OUTPUT_PATH = "docs/calibration.json";

/** Monday morning through Thursday afternoon, plus two later checkpoints. */
const DEPTHS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

const CALIBRATION_BINS = 20;

/** A pattern is called resolved when nothing else retains this much weight. */
const NEAR_CERTAIN = 0.99;

const PROGRESS_INTERVAL = 25_000;

interface DepthAccumulator {
  readonly depth: number;
  weeks: number;
  /** Claimed probability summed over every (week, pattern) pair, by bin. */
  binCount: number[];
  binPredicted: number[];
  binObserved: number[];
  trueProbabilitySum: number;
  brierSum: number;
  topChoiceCorrect: number;
  uniqueSurvivor: number;
  nearCertain: number;
  nearCertainCorrect: number;
  survivingCountHistogram: number[];
}

function newAccumulator(depth: number): DepthAccumulator {
  return {
    depth,
    weeks: 0,
    binCount: new Array<number>(CALIBRATION_BINS).fill(0),
    binPredicted: new Array<number>(CALIBRATION_BINS).fill(0),
    binObserved: new Array<number>(CALIBRATION_BINS).fill(0),
    trueProbabilitySum: 0,
    brierSum: 0,
    topChoiceCorrect: 0,
    uniqueSurvivor: 0,
    nearCertain: 0,
    nearCertainCorrect: 0,
    survivingCountHistogram: new Array<number>(PATTERNS.length + 1).fill(0),
  };
}

function binIndexOf(probability: number): number {
  return Math.min(CALIBRATION_BINS - 1, Math.floor(probability * CALIBRATION_BINS));
}

function record(
  accumulator: DepthAccumulator,
  probabilities: readonly number[],
  truePattern: Pattern,
): void {
  accumulator.weeks += 1;

  let surviving = 0;
  let best = 0;
  let bestPattern: Pattern = at(PATTERNS, 0);

  for (const pattern of PATTERNS) {
    const probability = at(probabilities, pattern);
    const truth = pattern === truePattern ? 1 : 0;
    const bin = binIndexOf(probability);
    accumulator.binCount[bin] = at(accumulator.binCount, bin) + 1;
    accumulator.binPredicted[bin] = at(accumulator.binPredicted, bin) + probability;
    accumulator.binObserved[bin] = at(accumulator.binObserved, bin) + truth;
    accumulator.brierSum += (probability - truth) * (probability - truth);
    if (probability > 0) {
      surviving += 1;
    }
    if (probability > best) {
      best = probability;
      bestPattern = pattern;
    }
  }

  accumulator.trueProbabilitySum += at(probabilities, truePattern);
  accumulator.survivingCountHistogram[surviving] =
    at(accumulator.survivingCountHistogram, surviving) + 1;
  if (surviving === 1) {
    accumulator.uniqueSurvivor += 1;
  }
  if (best >= NEAR_CERTAIN) {
    accumulator.nearCertain += 1;
    if (bestPattern === truePattern) {
      accumulator.nearCertainCorrect += 1;
    }
  }
  if (bestPattern === truePattern) {
    accumulator.topChoiceCorrect += 1;
  }
}

function drawStationaryPattern(rng: Rng): Pattern {
  const draw = rng.nextFloat();
  let running = 0;
  for (const pattern of PATTERNS) {
    running += at(STATIONARY_PATTERN_PRIOR, pattern);
    if (draw < running) {
      return pattern;
    }
  }
  return at(PATTERNS, PATTERNS.length - 1);
}

interface Summary {
  readonly depth: number;
  readonly weeks: number;
  readonly meanProbabilityOnTruth: number;
  readonly brier: number;
  readonly topChoiceAccuracy: number;
  readonly uniquePatternShare: number;
  readonly nearCertainShare: number;
  readonly nearCertainAccuracy: number;
  readonly survivingPatternShares: readonly number[];
  readonly bins: readonly {
    readonly from: number;
    readonly to: number;
    readonly count: number;
    readonly meanPredicted: number;
    readonly observedFrequency: number;
    readonly standardError: number;
  }[];
}

function summarise(accumulator: DepthAccumulator): Summary {
  const bins = [];
  for (let index = 0; index < CALIBRATION_BINS; index += 1) {
    const count = at(accumulator.binCount, index);
    const observed = count === 0 ? 0 : at(accumulator.binObserved, index) / count;
    bins.push({
      from: index / CALIBRATION_BINS,
      to: (index + 1) / CALIBRATION_BINS,
      count,
      meanPredicted: count === 0 ? 0 : at(accumulator.binPredicted, index) / count,
      observedFrequency: observed,
      standardError: count === 0 ? 0 : Math.sqrt((observed * (1 - observed)) / count),
    });
  }

  const weeks = accumulator.weeks;
  return {
    depth: accumulator.depth,
    weeks,
    meanProbabilityOnTruth: accumulator.trueProbabilitySum / weeks,
    brier: accumulator.brierSum / weeks,
    topChoiceAccuracy: accumulator.topChoiceCorrect / weeks,
    uniquePatternShare: accumulator.uniqueSurvivor / weeks,
    nearCertainShare: accumulator.nearCertain / weeks,
    nearCertainAccuracy:
      accumulator.nearCertain === 0 ? 0 : accumulator.nearCertainCorrect / accumulator.nearCertain,
    survivingPatternShares: accumulator.survivingCountHistogram.map((count) => count / weeks),
    bins,
  };
}

function numericArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) {
    return fallback;
  }
  const value = Number(at(process.argv, index + 1));
  return Number.isFinite(value) ? value : fallback;
}

function run(): void {
  const weeks = numericArgument("--weeks", DEFAULT_WEEKS);
  const seed = BigInt(numericArgument("--seed", Number(DEFAULT_SEED)));
  const rng = createRng(seed);

  const known = DEPTHS.map((depth) => newAccumulator(depth));
  const unknown = DEPTHS.map((depth) => newAccumulator(depth));

  let inconsistent = 0;
  const started = performance.now();

  for (let week = 0; week < weeks; week += 1) {
    const previousPattern = drawStationaryPattern(rng);
    const draw = drawWeek(rng, previousPattern, false);

    for (let index = 0; index < DEPTHS.length; index += 1) {
      const depth = at(DEPTHS, index);
      const observations = draw.prices.map((price, slot) => (slot < depth ? price : null));

      const withPrevious = computePosterior({
        basePrice: draw.basePrice,
        observations,
        previousPattern,
        firstBuy: false,
      });
      const withoutPrevious = computePosterior({
        basePrice: draw.basePrice,
        observations,
        previousPattern: null,
        firstBuy: false,
      });

      if (withPrevious === null || withoutPrevious === null) {
        inconsistent += 1;
        continue;
      }
      record(at(known, index), withPrevious.patterns, draw.pattern);
      record(at(unknown, index), withoutPrevious.patterns, draw.pattern);
    }

    if ((week + 1) % PROGRESS_INTERVAL === 0) {
      const elapsed = (performance.now() - started) / 1000;
      const rate = (week + 1) / elapsed;
      const remaining = (weeks - week - 1) / rate;
      process.stdout.write(
        `${week + 1}/${weeks} weeks, ${rate.toFixed(0)}/s, ${remaining.toFixed(0)}s left\n`,
      );
    }
  }

  const report = {
    weeks,
    seed: seed.toString(),
    depths: [...DEPTHS],
    calibrationBins: CALIBRATION_BINS,
    nearCertainThreshold: NEAR_CERTAIN,
    inconsistentInputs: inconsistent,
    previousPatternKnown: known.map(summarise),
    previousPatternUnknown: unknown.map(summarise),
  };

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`wrote ${OUTPUT_PATH} after ${((performance.now() - started) / 1000).toFixed(0)}s\n`);
}

run();
