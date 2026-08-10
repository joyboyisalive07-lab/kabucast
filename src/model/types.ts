export const PATTERN_FLUCTUATING = 0;
export const PATTERN_LARGE_SPIKE = 1;
export const PATTERN_DECREASING = 2;
export const PATTERN_SMALL_SPIKE = 3;

export const PATTERNS = [
  PATTERN_FLUCTUATING,
  PATTERN_LARGE_SPIKE,
  PATTERN_DECREASING,
  PATTERN_SMALL_SPIKE,
] as const;

export type Pattern = (typeof PATTERNS)[number];

/**
 * A rate drawn as `origin + u * span` with `u` uniform on [0, 1).
 *
 * The game's `randfloat(a, b)` is exactly this with `origin = a` and
 * `span = b - a`, and a negative span is how it produces its descending
 * ranges. Keeping the affine form rather than a sorted pair preserves the
 * float32 arithmetic of the original: `0.9 - randfloat(0, 0.05)` and
 * `randfloat(0.9, 0.85)` have the same support but different spans in float32.
 * See ALGORITHM.md, "The game's random primitives".
 */
export interface RateDraw {
  readonly origin: number;
  readonly span: number;
}

/**
 * One step of a decreasing phase: a fixed subtraction followed by a uniform
 * one. The two are kept apart because the game performs them as two separate
 * float32 subtractions.
 */
export interface DecayStep {
  readonly fixed: number;
  readonly randomSpan: number;
}

/**
 * A run of consecutive slots that share one generative rule.
 *
 * `independent` — each slot draws its own rate, nothing is carried across.
 * `decay` — one starting rate, then a decrement per slot; consecutive slots
 *   are dependent and this is where the polytope volume of ALGORITHM.md lives.
 * `peak` — the three correlated slots of the small spike: a rate `R` is drawn
 *   once, the middle slot is `R`, and the two flanking slots are independent
 *   draws from `[flankFloor, R)` whose price carries an offset of -1.
 */
export type Segment =
  | { readonly kind: "independent"; readonly length: number; readonly rate: RateDraw }
  | {
      readonly kind: "decay";
      readonly length: number;
      readonly start: RateDraw;
      readonly step: DecayStep;
    }
  | { readonly kind: "peak"; readonly peak: RateDraw; readonly flankFloor: number };

/**
 * A pattern together with everything the generator draws before it starts
 * drawing rates. The simulator samples one of these; the inference enumerates
 * all of them.
 */
export interface Scenario {
  readonly pattern: Pattern;
  readonly segments: readonly Segment[];
  /** P(this phase assignment | pattern). */
  readonly probability: number;
}

/** Peak start positions are game array indices, as in ALGORITHM.md. */
export type PatternParams =
  | {
      readonly pattern: typeof PATTERN_FLUCTUATING;
      readonly decreasingPhase1Length: number;
      readonly highPhase1Length: number;
      readonly highPhase3Length: number;
    }
  | { readonly pattern: typeof PATTERN_LARGE_SPIKE; readonly peakStart: number }
  | { readonly pattern: typeof PATTERN_DECREASING }
  | { readonly pattern: typeof PATTERN_SMALL_SPIKE; readonly peakStart: number };
