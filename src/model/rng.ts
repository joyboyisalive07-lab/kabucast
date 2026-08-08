/**
 * Seeded uniform pseudo-random generator.
 *
 * Determinism is a hard requirement of this project: identical input must
 * produce byte-identical output, and Monte Carlo error bounds are only
 * meaningful if the sample path can be reproduced. Math.random offers neither
 * seeding nor a stable stream across engines, so the generator is explicit.
 *
 * Generation: xoshiro128** 1.0, David Blackman and Sebastiano Vigna, 2018.
 *   Reference implementation: https://prng.di.unimi.it/xoshiro128starstar.c
 * Seeding: splitmix64, Sebastiano Vigna, 2015.
 *   Reference implementation: https://prng.di.unimi.it/splitmix64.c
 *
 * xoshiro128** is chosen over a 64-bit member of the family because its state
 * and arithmetic are 32-bit, which JavaScript performs natively through
 * Math.imul; the 64-bit variants would force BigInt into the hot loop.
 */

const WORD_BITS = 32;
const WORD_BITS_BIG = 32n;
const UINT32_MASK_BIG = 0xffffffffn;
const UINT64_MASK_BIG = 0xffffffffffffffffn;
const STATE_WORDS = 4;

const SPLITMIX64_INCREMENT = 0x9e3779b97f4a7c15n;
const SPLITMIX64_MULTIPLIER_A = 0xbf58476d1ce4e5b9n;
const SPLITMIX64_MULTIPLIER_B = 0x94d049bb133111ebn;
const SPLITMIX64_SHIFT_A = 30n;
const SPLITMIX64_SHIFT_B = 27n;
const SPLITMIX64_SHIFT_C = 31n;

const XOSHIRO_SCRAMBLE_MULTIPLIER_A = 5;
const XOSHIRO_SCRAMBLE_ROTATION = 7;
const XOSHIRO_SCRAMBLE_MULTIPLIER_B = 9;
const XOSHIRO_STATE_SHIFT = 9;
const XOSHIRO_STATE_ROTATION = 11;

/**
 * A double carries 53 mantissa bits, so a uniform draw is assembled from two
 * 32-bit words split 27 + 26. A single word would sample the unit interval on
 * a 2^-32 lattice, and the likelihood code integrates over rate intervals
 * narrow enough for that lattice to distort the result.
 */
const FLOAT53_HIGH_BITS = 27;
const FLOAT53_LOW_BITS = 26;
const FLOAT53_LOW_SCALE = 2 ** FLOAT53_LOW_BITS;
const FLOAT53_DIVISOR = 2 ** (FLOAT53_HIGH_BITS + FLOAT53_LOW_BITS);

export interface Rng {
  /** Uniform over the 2^32 unsigned 32-bit integers. */
  nextUint32(): number;
  /** Uniform over [0, 1) on the 2^-53 lattice. */
  nextFloat(): number;
}

type StateWords = [number, number, number, number];

function rotateLeft32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (WORD_BITS - bits))) >>> 0;
}

function splitmix64Next(state: bigint): { readonly value: bigint; readonly state: bigint } {
  const advanced = (state + SPLITMIX64_INCREMENT) & UINT64_MASK_BIG;
  let z = advanced;
  z = ((z ^ (z >> SPLITMIX64_SHIFT_A)) * SPLITMIX64_MULTIPLIER_A) & UINT64_MASK_BIG;
  z = ((z ^ (z >> SPLITMIX64_SHIFT_B)) * SPLITMIX64_MULTIPLIER_B) & UINT64_MASK_BIG;
  return { value: z ^ (z >> SPLITMIX64_SHIFT_C), state: advanced };
}

function seedState(seed: bigint): StateWords {
  let state = seed & UINT64_MASK_BIG;
  const words: number[] = [];
  while (words.length < STATE_WORDS) {
    const step = splitmix64Next(state);
    state = step.state;
    words.push(Number((step.value >> WORD_BITS_BIG) & UINT32_MASK_BIG));
    words.push(Number(step.value & UINT32_MASK_BIG));
  }
  const seeded: StateWords = [words[0] ?? 0, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0];

  // xoshiro128** has an all-zero fixed point. splitmix64 reaching it has
  // probability 2^-128, but the branch costs nothing and turns an impossible
  // silent failure into an impossible loud one.
  return seeded.every((word) => word === 0) ? [1, 0, 0, 0] : seeded;
}

export function createRng(seed: bigint): Rng {
  let [s0, s1, s2, s3] = seedState(seed);

  function nextUint32(): number {
    const result =
      Math.imul(
        rotateLeft32(Math.imul(s1, XOSHIRO_SCRAMBLE_MULTIPLIER_A), XOSHIRO_SCRAMBLE_ROTATION),
        XOSHIRO_SCRAMBLE_MULTIPLIER_B,
      ) >>> 0;

    const t = (s1 << XOSHIRO_STATE_SHIFT) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotateLeft32(s3, XOSHIRO_STATE_ROTATION);

    return result;
  }

  return {
    nextUint32,
    nextFloat(): number {
      const high = nextUint32() >>> (WORD_BITS - FLOAT53_HIGH_BITS);
      const low = nextUint32() >>> (WORD_BITS - FLOAT53_LOW_BITS);
      return (high * FLOAT53_LOW_SCALE + low) / FLOAT53_DIVISOR;
    },
  };
}
