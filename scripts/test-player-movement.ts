import assert from 'node:assert/strict';
import { canMoveTo, CELL_X, CELL_Y, COLS, ROWS } from '@workspace/shared/collisionMap';
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
const startX = wallLeft - 24;
const state = {
  ...createInitialPlayerState(),
  x: startX,
  y: feetY - FEET_OFFSET_Y,
};
const targetKeys = new Set(['d']);
const longPathMs = 200;
const expectedEndpointX = startX + PLAYER_SPEED_PX_PER_SEC * longPathMs / 1000;
const feetWalkable = (x: number) =>
  canMoveTo(grid, x, feetY, PLAYER_RADIUS) &&
  canMoveTo(grid, x - PLAYER_HALF_WIDTH, feetY, PLAYER_RADIUS) &&
  canMoveTo(grid, x + PLAYER_HALF_WIDTH, feetY, PLAYER_RADIUS);
const segmentIsWalkable = isMovementPathWalkableWide(grid, startX, feetY, expectedEndpointX, feetY);
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
assert.ok(result.x < wallLeft - PLAYER_HALF_WIDTH,
  `client prediction must not cross the wall (start=${startX.toFixed(1)}, result=${result.x.toFixed(1)}, wall=${wallLeft.toFixed(1)})`);

console.log('PASS: client prediction validates the full movement path against thin walls');

// Diagonal corner contact: the straight segment clips a blocked cell even
// though both independent axis slides remain clear. The resolver must slide
// rather than letting the character's wide feet hitbox enter the corner.
{
  const cornerGrid = new Uint8Array(COLS * ROWS);
  cornerGrid[wallRow * COLS + wallCol] = 1;
  const cornerStartX = wallLeft - PLAYER_HALF_WIDTH - PLAYER_RADIUS - 3;
  const cornerStartFeetY = wallTop - PLAYER_RADIUS - 3;
  const cornerState = {
    ...createInitialPlayerState(),
    x: cornerStartX,
    y: cornerStartFeetY - FEET_OFFSET_Y,
  };
  const diagonalKeys = new Set(['d', 's']);
  const cornerResult = stepPlayer(cornerGrid, cornerState, diagonalKeys, 48);
  const intendedDistance = PLAYER_SPEED_PX_PER_SEC * 48 / 1000;
  const intendedX = cornerStartX + intendedDistance / Math.SQRT2;
  const intendedFeetY = cornerStartFeetY + intendedDistance / Math.SQRT2;

  assert.equal(isMovementPathWalkableWide(
    cornerGrid, cornerStartX, cornerStartFeetY, intendedX, intendedFeetY,
  ), false, 'diagonal contact with a blocked cell corner must be rejected');
  assert.ok(cornerResult.x > cornerStartX,
    'a clear horizontal slide should preserve horizontal movement');
  assert.equal(cornerResult.y, cornerState.y,
    'x-first sliding must not push the player diagonally into the blocked corner');
  assert.ok(isMovementPathWalkableWide(
    cornerGrid, cornerStartX, cornerStartFeetY, intendedX, cornerStartFeetY,
  ), 'the horizontal slide itself must remain clear');
}

// Long diagonal sweep: endpoints are walkable on opposite sides of one
// blocked cell, but the full segment intersects it. This catches corner
// clipping that cardinal-only endpoint tests miss.
{
  const diagonalGrid = new Uint8Array(COLS * ROWS);
  diagonalGrid[wallRow * COLS + wallCol] = 1;
  const fromX = wallLeft - 20;
  const fromFeetY = wallTop - 20;
  const toX = wallLeft + CELL_X + 20;
  const toFeetY = wallTop + CELL_Y + 20;
  const diagonalPointWalkable = (x: number, feetY: number) =>
    canMoveTo(diagonalGrid, x, feetY, PLAYER_RADIUS) &&
    canMoveTo(diagonalGrid, x - PLAYER_HALF_WIDTH, feetY, PLAYER_RADIUS) &&
    canMoveTo(diagonalGrid, x + PLAYER_HALF_WIDTH, feetY, PLAYER_RADIUS);
  assert.equal(diagonalPointWalkable(fromX, fromFeetY), true,
    'diagonal fixture start must be walkable');
  assert.equal(diagonalPointWalkable(toX, toFeetY), true,
    'diagonal fixture destination must be walkable');
  assert.equal(isMovementPathWalkableWide(
    diagonalGrid, fromX, fromFeetY, toX, toFeetY,
  ), false, 'a diagonal segment must not tunnel through a blocked cell');
}

// Pressing into a wall must not fake movement. The old input-driven animation
// kept cycling walk poses and footstep audio even though collision held the
// player at exactly the same coordinates.
{
  const blockedX = wallLeft - PLAYER_HALF_WIDTH - PLAYER_RADIUS - 1;
  const blockedFeetY = wallTop + CELL_Y / 2;
  const blockedState = {
    ...createInitialPlayerState(),
    x: blockedX,
    y: blockedFeetY - FEET_OFFSET_Y,
    pose: 'idle' as const,
    animElapsedMs: 0,
  };
  const blockedResult = stepPlayer(grid, blockedState, new Set(['d']), 48);
  assert.equal(blockedResult.x, blockedState.x, 'the wall must block all horizontal displacement');
  assert.equal(blockedResult.y, blockedState.y, 'a cardinal wall contact must not change vertical position');
  assert.equal(blockedResult.pose, 'idle',
    'a player held against a wall must not show a walking animation');
  assert.equal(blockedResult.animElapsedMs, 0,
    'blocked input must not accumulate walk-cycle animation time');
}

// Ordinary movement must still animate, while ghosts must bypass solid cells.
{
  const ordinary = stepPlayer(grid, createInitialPlayerState(), new Set(['d']), 48);
  assert.ok(ordinary.x > createInitialPlayerState().x,
    'a walkable movement input must advance the player');
  assert.equal(ordinary.pose, 'walk-1',
    'real displacement must continue to drive the walk animation');

  const ghostState = {
    ...createInitialPlayerState(),
    x: wallLeft + 5,
    y: feetY - FEET_OFFSET_Y,
  };
  const ghostResult = stepPlayer(grid, ghostState, new Set(['d']), 48, true);
  assert.ok(ghostResult.x > ghostState.x,
    'ghost movement must pass through a blocked collision cell');
  assert.equal(ghostResult.pose, 'ghost',
    'ghost movement must retain the dedicated ghost sprite pose');
}
