/**
 * Small deterministic PRNG for simulation batches. The seed initializes the
 * batch-wide Math.random stream; independent CI invocations use independent
 * seeds. Concurrent timers can interleave draws differently, so this is a
 * reproducible seed input rather than a guarantee of byte-identical schedules.
 */
export function createSeededRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }

  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}
