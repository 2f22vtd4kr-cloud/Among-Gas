import assert from 'node:assert/strict';
import { CELL_X, CELL_Y, COLS, ROWS } from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y } from '@workspace/shared/coords';
import { createInitialPlayerState, stepPlayer } from '../artifacts/telegram-game/src/game/player.js';

// Regression for prediction/server disagreement: both endpoints are walkable,
// but the straight path crosses a thin wall. Local movement must not teleport
// across it, otherwise the server's correction makes the camera shake and the
// character appear stuck when a joystick is held against that wall.
const grid = new Uint8Array(COLS * ROWS);
const wallCol = Math.floor(COLS / 2);
const wallRow = Math.floor(ROWS / 2);
grid[wallRow * COLS + wallCol] = 1;
const wallLeft = wallCol * CELL_X;
const wallTop = wallRow * CELL_Y;
const feetY = wallTop + CELL_Y / 2;
const startX = wallLeft - 24;
const state = {
  ...createInitialPlayerState(),
  x: startX,
  y: feetY - FEET_OFFSET_Y,
};
const targetKeys = new Set(['d']);
const result = stepPlayer(grid, state, targetKeys, 150);

assert.ok(startX < wallLeft, 'fixture must start before the wall');
assert.ok(startX + 20 > wallLeft - 10, 'fixture movement must be large enough to reach the wall');
assert.ok(result.x < wallLeft - 10,
  `client prediction must not cross the wall (start=${startX.toFixed(1)}, result=${result.x.toFixed(1)}, wall=${wallLeft.toFixed(1)})`);

console.log('PASS: client prediction validates the full movement path against thin walls');
