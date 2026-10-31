import assert from 'node:assert/strict';
import { FINE_COLS, FINE_ROWS, MAP_W, MAP_H } from '@workspace/shared/collisionMap';
import { VENT_DEFS } from '@workspace/shared/vents';
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

// Vent mouths are intentionally non-walkable collision cells, but a player
// can validly stand on the mouth after exiting a vent. The watchdog must not
// treat those six authored anchors as ordinary wall penetration.
const ventGrid = new Uint8Array(FINE_COLS * FINE_ROWS);
const cellX = MAP_W / FINE_COLS;
const cellY = MAP_H / FINE_ROWS;
for (const vent of VENT_DEFS) {
  const col = Math.floor(vent.x / cellX);
  const row = Math.floor(vent.y / cellY);
  ventGrid[row * FINE_COLS + col] = 1;
  assert.equal(isSimulationCollisionViolation(
    { alive: true, inVent: false, x: vent.x, y: vent.y }, ventGrid,
  ), false, `vent mouth ${vent.id} is a valid post-exit position`);
}
const firstVent = VENT_DEFS[0];
const nearbyX = firstVent.x + 12;
const nearbyCol = Math.floor(nearbyX / cellX);
const nearbyRow = Math.floor(firstVent.y / cellY);
ventGrid[nearbyRow * FINE_COLS + nearbyCol] = 1;
assert.equal(isSimulationCollisionViolation(
  { alive: true, inVent: false, x: nearbyX, y: firstVent.y }, ventGrid,
), true, 'blocked geometry just outside the vent-mouth tolerance remains a violation');

console.log('PASS: simulation collision watchdog respects vent traversal and ghost state');
