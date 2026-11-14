import assert from 'node:assert/strict';
import { BotObservationLog } from './botObservationLog.js';

const log = new BotObservationLog(2);
const observation = {
  visiblePlayers: [{ slot: 2, username: 'Blue', distancePx: 120 }],
  publicTaskProgressPct: 45,
};
const fallback: { targetSlot: number | null } = { targetSlot: null };
const first = log.record(1, 'impostor-hunt', observation, fallback);

observation.visiblePlayers[0].username = 'mutated after record';
fallback.targetSlot = 2;
let snapshot = log.snapshot();
assert.equal(snapshot.length, 1);
assert.equal(snapshot[0].sequence, first);
assert.equal(snapshot[0].source, 'pending');
assert.equal((snapshot[0].observation.visiblePlayers as Array<{ username: string }>)[0].username, 'Blue',
  'recorded observations must be detached from caller-owned objects');
assert.deepEqual(snapshot[0].fallback, { targetSlot: null },
  'recorded fallback decisions must be detached from caller-owned objects');

const selected = { targetSlot: 2, rationale: 'closest visible target' };
log.resolve(first, 'model', selected, 'validated visible target');
selected.targetSlot = 99;
snapshot = log.snapshot();
assert.equal(snapshot[0].source, 'model');
assert.deepEqual(snapshot[0].selected, { targetSlot: 2, rationale: 'closest visible target' },
  'resolved model decisions must be cloned');
assert.equal(snapshot[0].reason, 'validated visible target');

log.resolve(first, 'fallback', { targetSlot: null }, 'x'.repeat(200));
snapshot = log.snapshot();
assert.equal(snapshot[0].reason?.length, 160, 'diagnostic reasons must be bounded');
assert.equal(snapshot[0].source, 'fallback');

const second = log.record(2, 'crew-task', { assignedTasks: [3, 4] }, { taskId: 3 });
const third = log.record(3, 'meeting-vote', { publicVotes: 2 }, { vote: 'skip' });
assert.deepEqual(log.snapshot().map(entry => entry.sequence), [second, third],
  'the observation log must evict the oldest entry at its configured capacity');
log.resolve(first, 'stale', null, 'entry already evicted');
assert.equal(log.snapshot()[0].source, 'pending',
  'resolving an evicted entry must not mutate a newer entry');

const minimumCapacity = new BotObservationLog(0);
minimumCapacity.record(1, 'bounded', {}, null);
minimumCapacity.record(1, 'bounded', {}, null);
assert.equal(minimumCapacity.snapshot().length, 1,
  'the log must retain at least one entry even for a non-positive configured capacity');

console.log('PASS: bounded bot observation trace, immutable snapshots and decision resolution');
