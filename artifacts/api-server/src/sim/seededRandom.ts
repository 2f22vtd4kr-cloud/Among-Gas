/**
 * Small deterministic PRNG for simulation batches. Each simulated game owns
 * its own stream so concurrent lobbies cannot steal one another's random draws.
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

/**
 * Apply a game-owned random stream only for a synchronous game operation.
 * LobbyManager's shared tick loop invokes each bot synchronously in turn, so
 * this isolates all random decisions made by that bot and nested authoritative
 * game actions without changing the production server's global random source.
 */
export function withSeededRandom<T>(random: () => number, operation: () => T): T {
  const originalRandom = Math.random;
  Math.random = random;
  try {
    return operation();
  } finally {
    Math.random = originalRandom;
  }
}
