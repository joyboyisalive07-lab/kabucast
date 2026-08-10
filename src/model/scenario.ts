/**
 * Scenario construction: turning the generator's phase-length draws into the
 * segment structure that both the simulator and the inference read.
 *
 * There is exactly one builder. The simulator samples parameters and calls it;
 * the inference enumerates every parameter combination and calls the same
 * function, so the two can never drift apart.
 */

import {
  DECREASING_DECAY_START,
  FLUCTUATING_DECAY_1_LENGTHS,
  FLUCTUATING_DECAY_START,
  FLUCTUATING_DECAY_STEP,
  FLUCTUATING_DECAY_TOTAL,
  FLUCTUATING_HIGH_1_MAX,
  FLUCTUATING_HIGH_TOTAL,
  GAME_SLOT_OFFSET,
  LARGE_SPIKE_DECAY_START,
  LARGE_SPIKE_PEAK_START_MAX,
  LARGE_SPIKE_PEAK_START_MIN,
  LARGE_SPIKE_RATES,
  RATE_HIGH,
  RATE_LOW_TAIL,
  RATE_SMALL_PEAK,
  SELLING_SLOT_COUNT,
  SLOW_DECAY_STEP,
  SMALL_PEAK_FLANK_FLOOR,
  SMALL_SPIKE_DECAY_START,
  SMALL_SPIKE_HIGH_LENGTH,
  SMALL_SPIKE_PEAK_LENGTH,
  SMALL_SPIKE_PEAK_START_MAX,
  SMALL_SPIKE_PEAK_START_MIN,
} from "./constants.ts";
import {
  PATTERN_DECREASING,
  PATTERN_FLUCTUATING,
  PATTERN_LARGE_SPIKE,
  PATTERN_SMALL_SPIKE,
} from "./types.ts";
import type { Pattern, PatternParams, Scenario, Segment } from "./types.ts";

export function segmentLength(segment: Segment): number {
  return segment.kind === "peak" ? SMALL_SPIKE_PEAK_LENGTH : segment.length;
}

export function scenarioLength(scenario: Scenario): number {
  return scenario.segments.reduce((total, segment) => total + segmentLength(segment), 0);
}

function high(length: number): Segment {
  return { kind: "independent", length, rate: RATE_HIGH };
}

function keepFilled(segments: readonly Segment[]): readonly Segment[] {
  return segments.filter((segment) => segmentLength(segment) > 0);
}

function fluctuatingSegments(
  decreasingPhase1Length: number,
  highPhase1Length: number,
  highPhase3Length: number,
): readonly Segment[] {
  const highPhase2Length = FLUCTUATING_HIGH_TOTAL - highPhase1Length - highPhase3Length;
  const decreasingPhase2Length = FLUCTUATING_DECAY_TOTAL - decreasingPhase1Length;
  return [
    high(highPhase1Length),
    {
      kind: "decay",
      length: decreasingPhase1Length,
      start: FLUCTUATING_DECAY_START,
      step: FLUCTUATING_DECAY_STEP,
    },
    high(highPhase2Length),
    {
      kind: "decay",
      length: decreasingPhase2Length,
      start: FLUCTUATING_DECAY_START,
      step: FLUCTUATING_DECAY_STEP,
    },
    high(highPhase3Length),
  ];
}

function largeSpikeSegments(peakStart: number): readonly Segment[] {
  const beforePeak = peakStart - GAME_SLOT_OFFSET;
  const afterPeak = SELLING_SLOT_COUNT - beforePeak - LARGE_SPIKE_RATES.length;
  return [
    { kind: "decay", length: beforePeak, start: LARGE_SPIKE_DECAY_START, step: SLOW_DECAY_STEP },
    ...LARGE_SPIKE_RATES.map((rate): Segment => ({ kind: "independent", length: 1, rate })),
    { kind: "independent", length: afterPeak, rate: RATE_LOW_TAIL },
  ];
}

function smallSpikeSegments(peakStart: number): readonly Segment[] {
  const beforePeak = peakStart - GAME_SLOT_OFFSET;
  const peakBlock = SMALL_SPIKE_HIGH_LENGTH + SMALL_SPIKE_PEAK_LENGTH;
  const afterPeak = SELLING_SLOT_COUNT - beforePeak - peakBlock;
  return [
    { kind: "decay", length: beforePeak, start: SMALL_SPIKE_DECAY_START, step: SLOW_DECAY_STEP },
    high(SMALL_SPIKE_HIGH_LENGTH),
    { kind: "peak", peak: RATE_SMALL_PEAK, flankFloor: SMALL_PEAK_FLANK_FLOOR },
    { kind: "decay", length: afterPeak, start: SMALL_SPIKE_DECAY_START, step: SLOW_DECAY_STEP },
  ];
}

function segmentsFor(params: PatternParams): readonly Segment[] {
  switch (params.pattern) {
    case PATTERN_FLUCTUATING:
      return fluctuatingSegments(
        params.decreasingPhase1Length,
        params.highPhase1Length,
        params.highPhase3Length,
      );
    case PATTERN_LARGE_SPIKE:
      return largeSpikeSegments(params.peakStart);
    case PATTERN_DECREASING:
      return [
        {
          kind: "decay",
          length: SELLING_SLOT_COUNT,
          start: DECREASING_DECAY_START,
          step: SLOW_DECAY_STEP,
        },
      ];
    case PATTERN_SMALL_SPIKE:
      return smallSpikeSegments(params.peakStart);
  }
}

function phaseProbability(params: PatternParams): number {
  switch (params.pattern) {
    case PATTERN_FLUCTUATING: {
      const highPhase2and3 = FLUCTUATING_HIGH_TOTAL - params.highPhase1Length;
      return (
        (1 / FLUCTUATING_DECAY_1_LENGTHS.length) *
        (1 / (FLUCTUATING_HIGH_1_MAX + 1)) *
        (1 / highPhase2and3)
      );
    }
    case PATTERN_LARGE_SPIKE:
      return 1 / (LARGE_SPIKE_PEAK_START_MAX - LARGE_SPIKE_PEAK_START_MIN + 1);
    case PATTERN_DECREASING:
      return 1;
    case PATTERN_SMALL_SPIKE:
      return 1 / (SMALL_SPIKE_PEAK_START_MAX - SMALL_SPIKE_PEAK_START_MIN + 1);
  }
}

export function buildScenario(params: PatternParams): Scenario {
  const segments = keepFilled(segmentsFor(params));
  const scenario: Scenario = {
    pattern: params.pattern,
    segments,
    probability: phaseProbability(params),
  };
  const length = scenarioLength(scenario);
  if (length !== SELLING_SLOT_COUNT) {
    throw new RangeError(`scenario covers ${length} slots, expected ${SELLING_SLOT_COUNT}`);
  }
  return scenario;
}

export function enumerateScenarios(pattern: Pattern): readonly Scenario[] {
  switch (pattern) {
    case PATTERN_FLUCTUATING: {
      const scenarios: Scenario[] = [];
      for (const decreasingPhase1Length of FLUCTUATING_DECAY_1_LENGTHS) {
        for (let highPhase1Length = 0; highPhase1Length <= FLUCTUATING_HIGH_1_MAX; highPhase1Length += 1) {
          const highPhase2and3 = FLUCTUATING_HIGH_TOTAL - highPhase1Length;
          for (let highPhase3Length = 0; highPhase3Length < highPhase2and3; highPhase3Length += 1) {
            scenarios.push(
              buildScenario({
                pattern,
                decreasingPhase1Length,
                highPhase1Length,
                highPhase3Length,
              }),
            );
          }
        }
      }
      return scenarios;
    }
    case PATTERN_LARGE_SPIKE: {
      const scenarios: Scenario[] = [];
      for (
        let peakStart = LARGE_SPIKE_PEAK_START_MIN;
        peakStart <= LARGE_SPIKE_PEAK_START_MAX;
        peakStart += 1
      ) {
        scenarios.push(buildScenario({ pattern, peakStart }));
      }
      return scenarios;
    }
    case PATTERN_DECREASING:
      return [buildScenario({ pattern })];
    case PATTERN_SMALL_SPIKE: {
      const scenarios: Scenario[] = [];
      for (
        let peakStart = SMALL_SPIKE_PEAK_START_MIN;
        peakStart <= SMALL_SPIKE_PEAK_START_MAX;
        peakStart += 1
      ) {
        scenarios.push(buildScenario({ pattern, peakStart }));
      }
      return scenarios;
    }
  }
}
