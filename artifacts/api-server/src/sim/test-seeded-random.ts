import assert from 'node:assert/strict';
import { createSeededRandom, withSeededRandom } from './seededRandom.js';

function sample(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random());
}

const first = sample(17_001, 32);
assert.deepEqual(sample(17_001, 32), first, 'the same seed must produce the same random stream');
assert.notDeepEqual(sample(17_002, 32), first, 'different seeds must produce independent streams');
assert.deepEqual(sample(0, 4), sample(0, 4), 'zero is a valid unsigned seed');
assert.ok(first.every(value => Number.isFinite(value) && value >= 0 && value < 1),
  'every generated value must remain in [0, 1)');
assert.throws(() => createSeededRandom(-1), RangeError);
assert.throws(() => createSeededRandom(0x1_0000_0000), RangeError);
assert.throws(() => createSeededRandom(1.5), RangeError);

// Concurrent lobbies must not share a single batch-wide stream. Each lobby's
// synchronous bot tick temporarily installs its own stream and restores the
// ambient random source afterward.
{
  const ambient = Math.random;
  const streamA = createSeededRandom(17_001);
  const streamB = createSeededRandom(17_002);
  const a1 = withSeededRandom(streamA, () => Math.random());
  const b1 = withSeededRandom(streamB, () => Math.random());
  const a2 = withSeededRandom(streamA, () => Math.random());
  const b2 = withSeededRandom(streamB, () => Math.random());
  assert.deepEqual([a1, a2], sample(17_001, 2), 'interleaving another lobby must not consume this game stream');
  assert.deepEqual([b1, b2], sample(17_002, 2), 'each game must advance only its own stream');
  assert.equal(Math.random, ambient, 'the ambient production random source must be restored after each operation');
  const nestedA = createSeededRandom(21);
  const nestedB = createSeededRandom(22);
  const nestedValues = withSeededRandom(nestedA, () => {
    const inner = withSeededRandom(nestedB, () => Math.random());
    const resumedOuter = Math.random();
    return [inner, resumedOuter];
  });
  assert.deepEqual(nestedValues, [sample(22, 1)[0], sample(21, 1)[0]],
    'nested game operations must restore the outer stream after the inner operation');
}

console.log('PASS: simulation PRNG accepts unsigned seeds and isolates interleaved game streams');
