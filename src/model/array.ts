/**
 * Indexed access that fails loudly.
 *
 * `noUncheckedIndexedAccess` is on, so every array read is `T | undefined`.
 * Silencing that with a fallback value would hide an out-of-range index behind
 * a plausible-looking number, which in this codebase means a wrong probability
 * rather than a crash.
 */
export function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`index ${index} is outside 0..${values.length - 1}`);
  }
  return value;
}
