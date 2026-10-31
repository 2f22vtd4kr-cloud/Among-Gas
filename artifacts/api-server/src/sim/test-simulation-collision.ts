import assert from 'node:assert/strict';
import { FINE_COLS, FINE_ROWS, MAP_W, MAP_H } from '@workspace/shared/collisionMap';
import { VENT_DEFS } from '@workspace/shared/vents';
import { FEET_OFFSET_Y } from '@workspace/shared/coords';
import { isSimulationCollisionViolation } from './simulateGame.js';

const blockedGrid = new Uint8Array(FINE_COLS * FINE_ROWS);
blockedGrid[0] = 1;

assert.equal(isSimulationCollisionViolation(
  { alive: true, inVent: true, x: 0, y: 0 }, blockedGrid,
), false, 'a living player inside a vent is not an ordinary map-collision violation');
assert.equal(isSimulationCollisionViolation(
  { alive: true, inVent: false, x: 0, y: 0 }, blockedGrid,
), true, 'a living player outside a vent must still be checked against blocked geometry');
assert.equal(isSimulationCollisionViolation(
  { alive: false, inVent: false, x: 0, y: 0 }, blockedGrid,
), false, 'dead players are ghosts and intentionally ignore map collision');

// An actual vent occupant is exempt from collision checks. A player who
// has exited must be relocated first; standing on the blocked authored mouth
// without inVent=true remains a real collision violation.
const ventGrid = new Uint8Array(FINE_COLS * FINE_ROWS);
const cellX = MAP_W / FINE_COLS;
const cellY = MAP_H / FINE_ROWS;
for (const vent of VENT_DEFS) {
  const col = Math.floor(vent.x / cellX);
  const row = Math.floor((vent.y + FEET_OFFSET_Y) / cellY);
  ventGrid[row * FINE_COLS + col] = 1;
  assert.equal(isSimulationCollisionViolation(
    { alive: true, inVent: true, x: vent.x, y: vent.y }, ventGrid,
  ), false, `vent occupant ${vent.id} is exempt while hidden inside the vent`);
  assert.equal(isSimulationCollisionViolation(
    { alive: true, inVent: false, x: vent.x, y: vent.y }, ventGrid,
  ), true, `vent mouth ${vent.id} remains blocked after exit unless the player is relocated`);
}
const firstVent = VENT_DEFS[0];
const nearbyX = firstVent.x + 12;
const nearbyBlockedGrid = new Uint8Array(FINE_COLS * FINE_ROWS).fill(1);
assert.equal(isSimulationCollisionViolation(
  { alive: true, inVent: false, x: nearbyX, y: firstVent.y }, nearbyBlockedGrid,
), true, 'blocked geometry just outside the vent-mouth tolerance remains a violation');

console.log('PASS: simulation collision watchdog respects vent traversal and ghost state');
