import assert from 'node:assert/strict';
import {
  buildCrewTaskPlanningMessages,
  buildImpostorHuntPlanningMessages,
  observeVisiblePlayers,
  parseCrewTaskChoice,
  parseImpostorHuntChoice,
} from './strategicPolicy.js';

const visible = observeVisiblePlayers(
  0, 100, 100,
  [
    { slot: 0, username: 'Self', x: 100, y: 100, alive: true },
    { slot: 1, username: 'Near', x: 180, y: 100, alive: true },
    { slot: 2, username: 'BehindWall', x: 140, y: 100, alive: true },
    { slot: 3, username: 'TooFar', x: 900, y: 100, alive: true },
    { slot: 4, username: 'Dead', x: 110, y: 100, alive: false },
  ],
  250,
  (x, y) => !(x === 140 && y === 100),
);
assert.deepEqual(visible, [{ slot: 1, username: 'Near', distancePx: 80 }],
  'only living, in-range, line-of-sight players become observations');
assert.equal('x' in visible[0], false, 'observations do not expose exact coordinates');
assert.equal('role' in visible[0], false, 'observations cannot encode hidden player roles');

const crewMessages = buildCrewTaskPlanningMessages({
  username: 'Nova',
  availableTasks: [
    { taskId: 3, name: 'Fix Wiring', remainingSteps: 2, approximateDistancePx: 480 },
    { taskId: 8, name: 'Start Reactor', remainingSteps: 1, approximateDistancePx: 160 },
  ],
  nearbyPlayers: visible,
});
const crewPayload = JSON.parse(crewMessages[1].content);
assert.deepEqual(crewPayload.availableAssignedTasks.map((task: { taskId: number }) => task.taskId), [3, 8]);
assert.deepEqual(crewPayload.currentlyVisiblePlayers, visible);
assert.equal('hiddenRoles' in crewPayload, false);
assert.equal(parseCrewTaskChoice('{"taskId":8}', [3, 8]), 8);
assert.equal(parseCrewTaskChoice('{"taskId":99}', [3, 8]), null);
assert.equal(parseCrewTaskChoice('{"taskId":"8"}', [3, 8]), null);
assert.equal(parseCrewTaskChoice('{"taskId":8,"role":"impostor"}', [3, 8]), null);
assert.equal(parseCrewTaskChoice('{"taskId":null}', [3, 8]), null);
assert.equal(parseCrewTaskChoice('{"taskId":8} trailing', [3, 8]), null);

const impostorMessages = buildImpostorHuntPlanningMessages({
  username: 'Red',
  killCooldownMs: 1200,
  visibleCrew: [
    { slot: 2, username: 'Blue', distancePx: 130, otherVisibleCrewNearby: 0 },
    { slot: 3, username: 'Green', distancePx: 210, otherVisibleCrewNearby: 2 },
  ],
});
const impostorPayload = JSON.parse(impostorMessages[1].content);
assert.equal(impostorPayload.role, 'impostor');
assert.deepEqual(impostorPayload.visibleCrewTargets.map((target: { slot: number }) => target.slot), [2, 3]);
assert.equal('unseenPlayers' in impostorPayload, false);
assert.equal(parseImpostorHuntChoice('{"targetSlot":2}', [2, 3]), 2);
assert.equal(parseImpostorHuntChoice('{"targetSlot":4}', [2, 3]), null);
assert.equal(parseImpostorHuntChoice('{"targetSlot":2,"kill":true}', [2, 3]), null);
assert.equal(parseImpostorHuntChoice('{"targetSlot":null}', [2, 3]), null);
assert.deepEqual(observeVisiblePlayers(0, 0, 0, [], 100, () => true), []);

console.log('PASS: role-scoped bot observations, visible-only candidates and strict task/hunt decision schemas');
