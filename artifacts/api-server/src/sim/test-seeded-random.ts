import assert from 'node:assert/strict';
import { createSeededRandom } from './seededRandom.js';

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

console.log('PASS: simulation PRNG accepts unsigned seeds and produces independent repeatable streams');
