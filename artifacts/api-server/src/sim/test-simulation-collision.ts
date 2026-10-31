import assert from 'node:assert/strict';
import { FINE_COLS, FINE_ROWS } from '@workspace/shared/collisionMap';
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

console.log('PASS: simulation collision watchdog respects vent traversal and ghost state');
