import assert from 'node:assert/strict';
import { CELL_X, CELL_Y, COLS, ROWS, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { isMovementPathWalkable, validateMovementIntent } from '../artifacts/api-server/src/ws/movement.js';
import { FEET_OFFSET_Y, PLAYER_HALF_WIDTH, PLAYER_RADIUS, PLAYER_SPEED_PX_PER_SEC } from '@workspace/shared/coords';
import { createInitialPlayerState, isMovementPathWalkableWide, stepPlayer } from '../artifacts/telegram-game/src/game/player.js';

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
const worldY = feetY - FEET_OFFSET_Y;
const startX = wallLeft - 24;
const state = {
  ...createInitialPlayerState(),
  x: startX,
  y: worldY,
};
const targetKeys = new Set(['d']);
const longPathMs = 200;
const expectedEndpointX = startX + PLAYER_SPEED_PX_PER_SEC * longPathMs / 1000;
const feetWalkable = (x: number) => isPlayerPositionWalkable(grid, x, worldY);
const segmentIsWalkable = isMovementPathWalkableWide(grid, startX, worldY, expectedEndpointX, worldY);
// stepPlayer uses the real frame clamp; test the normal single-frame safety too.
const result = stepPlayer(grid, state, targetKeys, 48);

assert.ok(startX < wallLeft, 'fixture must start before the wall');
assert.ok(expectedEndpointX > wallLeft + CELL_X + PLAYER_HALF_WIDTH + PLAYER_RADIUS,
  'fixture must travel completely past the wall cell');
assert.equal(feetWalkable(startX), true, 'the starting endpoint must be walkable');
assert.equal(feetWalkable(expectedEndpointX), true,
  'the destination endpoint is deliberately walkable; only the path crosses the wall');
assert.equal(segmentIsWalkable, false,
  'the full movement segment must be rejected because it passes through the thin wall');
assert.equal(isMovementPathWalkable(grid, startX, worldY, expectedEndpointX, worldY), false,
  'the authoritative server must reject the same thin-wall path as client prediction');
const serverDecision = validateMovementIntent({
  x: startX, y: worldY, alive: true,
  movementCreditPx: 0, movementCreditUpdatedAtMs: 0,
}, wallLeft + 6, worldY, 120, grid);
assert.equal(serverDecision.corrected, true,
  'the server must correct a target whose complete player footprint overlaps the wall');
assert.equal(serverDecision.x, startX,
  'the authoritative correction must keep the player on the safe side of the wall');
assert.ok(result.x < wallLeft - PLAYER_HALF_WIDTH,
  `client prediction must not cross the wall (start=${startX.toFixed(1)}, result=${result.x.toFixed(1)}, wall=${wallLeft.toFixed(1)})`);

// A diagonal approach to a single blocked corner cell must also be rejected;
 // this catches gaps between the old four-cardinal-point circumference samples.
const cornerGrid = new Uint8Array(COLS * ROWS);
const cornerCol = wallCol + 1;
const cornerRow = wallRow + 1;
cornerGrid[cornerRow * COLS + cornerCol] = 1;
const cornerX = cornerCol * CELL_X;
const cornerY = cornerRow * CELL_Y;
const diagonalStart = { x: cornerX - 24, y: cornerY - FEET_OFFSET_Y - 24 };
const diagonalEnd = { x: cornerX + 24, y: cornerY - FEET_OFFSET_Y + 24 };
assert.equal(isMovementPathWalkableWide(
  cornerGrid, diagonalStart.x, diagonalStart.y, diagonalEnd.x, diagonalEnd.y,
), false, 'diagonal movement must not cut across a blocked corner cell');

// Map-edge footprint is blocked even when the sprite centre remains inside.
assert.equal(isPlayerPositionWalkable(grid, -1, worldY), false,
  'the full player footprint must not extend beyond the west map boundary');

console.log('PASS: client/server collision agreement, thin walls, diagonal corners, and map edges');
