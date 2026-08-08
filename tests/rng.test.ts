import { test } from "node:test";
import { ok, equal, notEqual } from "node:assert/strict";
import { createRng } from "../src/model/rng.ts";

const MASK32 = 0xffffffffn;
const MASK64 = 0xffffffffffffffffn;

/**
 * Literal BigInt transcription of the two reference C listings, used only to
 * cross-check the 32-bit production implementation. The risk being tested is
 * not the algorithm but JavaScript's signed shifts and float multiplication:
 * a missing `>>> 0` or a `*` where `Math.imul` belongs stays silent otherwise.
 */
function referenceRotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (32n - k))) & MASK32;
}

function referenceSplitmix64(seed: bigint, count: number): bigint[] {
  let x = seed & MASK64;
  const out: bigint[] = [];
  while (out.length < count) {
    x = (x + 0x9e3779b97f4a7c15n) & MASK64;
    let z = x;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    out.push((z ^ (z >> 31n)) & MASK64);
  }
  return out;
}

function createReferenceXoshiro(seed: bigint): () => bigint {
  const seeds = referenceSplitmix64(seed, 2);
  const first = seeds[0] ?? 0n;
  const second = seeds[1] ?? 0n;
  const s: [bigint, bigint, bigint, bigint] = [
    (first >> 32n) & MASK32,
    first & MASK32,
    (second >> 32n) & MASK32,
    second & MASK32,
  ];

  return () => {
    const result = (referenceRotl((s[1] * 5n) & MASK32, 7n) * 9n) & MASK32;
    const t = (s[1] << 9n) & MASK32;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = referenceRotl(s[3], 11n);
    return result;
  };
}

test("rng matches a literal transcription of the reference implementations", () => {
  for (const seed of [0n, 1n, 42n, 0xdeadbeefn, 0xffffffffffffffffn]) {
    const rng = createRng(seed);
    const reference = createReferenceXoshiro(seed);
    for (let i = 0; i < 1000; i += 1) {
      equal(BigInt(rng.nextUint32()), reference(), `seed ${seed}, draw ${i}`);
    }
  }
});

test("rng is deterministic for a given seed", () => {
  const a = createRng(2026n);
  const b = createRng(2026n);
  for (let i = 0; i < 1000; i += 1) {
    equal(a.nextFloat(), b.nextFloat());
  }
});

test("rng produces distinct streams for distinct seeds", () => {
  const a = createRng(1n);
  const b = createRng(2n);
  let identical = 0;
  for (let i = 0; i < 100; i += 1) {
    if (a.nextUint32() === b.nextUint32()) {
      identical += 1;
    }
  }
  notEqual(identical, 100);
});

test("nextUint32 stays inside the unsigned 32-bit range", () => {
  const rng = createRng(7n);
  for (let i = 0; i < 100_000; i += 1) {
    const value = rng.nextUint32();
    ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, `out of range: ${value}`);
  }
});

test("nextFloat is uniform on [0, 1)", () => {
  const buckets = 16;
  const samples = 1_000_000;
  const counts = new Array<number>(buckets).fill(0);
  const rng = createRng(20260808n);
  let sum = 0;

  for (let i = 0; i < samples; i += 1) {
    const value = rng.nextFloat();
    ok(value >= 0 && value < 1, `out of range: ${value}`);
    sum += value;
    const index = Math.min(buckets - 1, Math.floor(value * buckets));
    counts[index] = (counts[index] ?? 0) + 1;
  }

  // 1e6 draws over 16 buckets give a per-bucket standard deviation of about
  // 242 against an expectation of 62500, so 2% is roughly five sigma: wide
  // enough never to flake, narrow enough to catch a broken bit extraction.
  const expected = samples / buckets;
  for (const count of counts) {
    ok(Math.abs(count - expected) / expected < 0.02, `bucket skew: ${count} vs ${expected}`);
  }
  ok(Math.abs(sum / samples - 0.5) < 0.002, `mean drift: ${sum / samples}`);
});
