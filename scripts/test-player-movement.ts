import assert from 'node:assert/strict';
import { CELL_X, CELL_Y, COLS, ROWS, MAP_W, MAP_H, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
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
const diagonalStart = {
  x: cornerX - PLAYER_HALF_WIDTH - PLAYER_RADIUS - 3,
  y: cornerY - FEET_OFFSET_Y - PLAYER_RADIUS - 3,
};
const diagonalEnd = {
  x: cornerX + CELL_X + PLAYER_HALF_WIDTH + PLAYER_RADIUS + 3,
  y: cornerY + CELL_Y + PLAYER_RADIUS + 3 - FEET_OFFSET_Y,
};
assert.equal(isPlayerPositionWalkable(cornerGrid, diagonalStart.x, diagonalStart.y), true,
  'diagonal sweep start must be independently walkable');
assert.equal(isPlayerPositionWalkable(cornerGrid, diagonalEnd.x, diagonalEnd.y), true,
  'diagonal sweep destination must be independently walkable');
assert.equal(isMovementPathWalkableWide(
  cornerGrid, diagonalStart.x, diagonalStart.y, diagonalEnd.x, diagonalEnd.y,
), false, 'diagonal movement must not cut across a blocked corner cell');
assert.equal(isMovementPathWalkable(
  cornerGrid, diagonalStart.x, diagonalStart.y, diagonalEnd.x, diagonalEnd.y,
), false, 'the server must reject the same diagonal corner sweep');

const cornerStart = {
  ...createInitialPlayerState(),
  x: cornerX - PLAYER_HALF_WIDTH - PLAYER_RADIUS - 3,
  y: cornerY - FEET_OFFSET_Y - PLAYER_RADIUS - 3,
};
const cornerSlide = stepPlayer(cornerGrid, cornerStart, new Set(['d', 's']), 48);
assert.ok(cornerSlide.x > cornerStart.x,
  'the resolver should preserve a clear horizontal slide at a blocked corner');
assert.equal(cornerSlide.y, cornerStart.y,
  'x-first sliding must reject only the blocked vertical component');

// Arbitrary server intents can have unequal components even though the
// on-screen controls quantize to eight directions. Client and server must
// still resolve the same x-first slide deterministically.
{
  const targetX = cornerStart.x + 3;
  const targetY = cornerStart.y + 9;
  const client = resolvePlayerMovement(cornerGrid, cornerStart.x, cornerStart.y, targetX, targetY);
  assert.deepEqual(client, [targetX, cornerStart.y],
    'client must prefer horizontal sliding even when the vertical intent is larger');
  const server = validateMovementIntent({
    x: cornerStart.x, y: cornerStart.y, alive: true,
    movementCreditPx: 20, movementCreditUpdatedAtMs: 2_000,
    lastMovementPacketAtMs: 1_950,
  }, targetX, targetY, 2_000, cornerGrid);
  assert.deepEqual([server.x, server.y], [targetX, cornerStart.y],
    'server must resolve the same unequal diagonal intent as the client');
}

// If the horizontal component is blocked at the current foot row, the same
// resolver must preserve the vertical component without clipping the corner.
{
  const verticalStartX = cornerX - PLAYER_HALF_WIDTH - PLAYER_RADIUS - 3;
  const verticalStartFeetY = cornerY + CELL_Y / 2;
  const verticalStartY = verticalStartFeetY - FEET_OFFSET_Y;
  const targetX = cornerX - 10;
  const targetY = verticalStartY + 12;
  const client = resolvePlayerMovement(cornerGrid, verticalStartX, verticalStartY, targetX, targetY);
  assert.deepEqual(client, [verticalStartX, targetY],
    'client must slide vertically when the horizontal component is blocked');
  const server = validateMovementIntent({
    x: verticalStartX, y: verticalStartY, alive: true,
    movementCreditPx: 20, movementCreditUpdatedAtMs: 2_000,
    lastMovementPacketAtMs: 1_950,
  }, targetX, targetY, 2_000, cornerGrid);
  assert.deepEqual([server.x, server.y], [verticalStartX, targetY],
    'server must preserve the same clear vertical slide');
}
{
  const delta = PLAYER_SPEED_PX_PER_SEC * 0.048 / Math.SQRT2;
  const serverSlide = validateMovementIntent({
    x: cornerStart.x, y: cornerStart.y, alive: true,
    movementCreditPx: 20, movementCreditUpdatedAtMs: 2_000,
    lastMovementPacketAtMs: 1_950,
  }, cornerStart.x + delta, cornerStart.y + delta, 2_000, cornerGrid);
  assert.equal(serverSlide.corrected, true,
    'server must report a correction for the rejected diagonal component');
  assert.ok(serverSlide.x > cornerStart.x,
    'server must preserve the same clear horizontal slide as the client');
  assert.equal(serverSlide.y, cornerStart.y,
    'server must not accept the blocked vertical component');
}

// Map-edge footprint is blocked even while the sprite anchor itself remains inside.
assert.equal(isPlayerPositionWalkable(grid, 1, worldY), false,
  'the full player footprint must not extend beyond the west map boundary');
assert.equal(isPlayerPositionWalkable(grid, MAP_W - 1, worldY), false,
  'the full player footprint must not extend beyond the east map boundary');
assert.equal(isPlayerPositionWalkable(grid, MAP_W / 2, 1 - FEET_OFFSET_Y), false,
  'the full player footprint must not extend beyond the north map boundary');
assert.equal(isPlayerPositionWalkable(grid, MAP_W / 2, MAP_H - FEET_OFFSET_Y - 1), false,
  'the full player footprint must not extend beyond the south map boundary');

// A movement packet that would push an otherwise valid player outside the
// west edge is corrected rather than leaving the authoritative state out of bounds.
{
  const edgeGrid = new Uint8Array(COLS * ROWS);
  const edgeX = PLAYER_HALF_WIDTH + PLAYER_RADIUS + 1;
  const edgeY = MAP_H / 2 - FEET_OFFSET_Y;
  assert.equal(isPlayerPositionWalkable(edgeGrid, edgeX, edgeY), true,
    'edge fixture must begin with the complete footprint inside the map');
  const edgeDecision = validateMovementIntent({
    x: edgeX, y: edgeY, alive: true,
    movementCreditPx: 20, movementCreditUpdatedAtMs: 2_000,
    lastMovementPacketAtMs: 1_950,
  }, edgeX - 8, edgeY, 2_000, edgeGrid);
  assert.equal(edgeDecision.corrected, true,
    'server must correct a target that would push the hitbox beyond the map edge');
  assert.equal(edgeDecision.x, edgeX,
    'server must preserve the last fully in-bounds position');
}

// Blocked input must not animate or generate footstep events. Movement is
// determined by the resolved world delta, not by whether a key is held.
{
  const blockedX = wallLeft - PLAYER_HALF_WIDTH - PLAYER_RADIUS - 1;
  const blockedState = {
    ...createInitialPlayerState(),
    x: blockedX,
    y: worldY,
    pose: 'idle' as const,
    animElapsedMs: 0,
  };
  const blockedResult = stepPlayer(grid, blockedState, new Set(['d']), 48);
  assert.equal(blockedResult.x, blockedState.x);
  assert.equal(blockedResult.y, blockedState.y);
  assert.equal(blockedResult.pose, 'idle',
    'holding into a wall must not animate a walk cycle');
  assert.equal(blockedResult.animElapsedMs, 0,
    'blocked input must not accumulate animation time');
}

console.log('PASS: client/server collision agreement, thin walls, diagonal corners, map edges and blocked-input animation');

// Normal movement remains animated, and dead players retain wall-phasing.
{
  const initial = createInitialPlayerState();
  const normal = stepPlayer(grid, initial, new Set(['d']), 48);
  assert.ok(normal.x > initial.x, 'walkable movement input must advance the player');
  assert.equal(normal.pose, 'walk-1', 'real displacement must animate the walking sprite');

  const ghostState = { ...initial, x: wallLeft + 5, y: worldY };
  const ghost = stepPlayer(grid, ghostState, new Set(['d']), 48, true);
  assert.ok(ghost.x > ghostState.x, 'ghost movement must pass through a blocked collision cell');
  assert.equal(ghost.pose, 'ghost', 'ghost movement must retain its dedicated static pose');
}


// Ghosts ignore wall cells, not the outer map boundary. Clamp the full feet
// footprint on all four edges rather than allowing the sprite anchor to reach
// x=0 / y=0 where its collision base would be outside the map.
{
  const minX = PLAYER_HALF_WIDTH + PLAYER_RADIUS;
  const maxX = MAP_W - minX;
  const minY = PLAYER_RADIUS - FEET_OFFSET_Y;
  const maxY = MAP_H - PLAYER_RADIUS - FEET_OFFSET_Y;
  const base = createInitialPlayerState();
  const west = stepPlayer(grid, { ...base, x: minX + 10 }, new Set(['a']), 48, true);
  const east = stepPlayer(grid, { ...base, x: maxX - 10 }, new Set(['d']), 48, true);
  const north = stepPlayer(grid, { ...base, y: minY + 10 }, new Set(['w']), 48, true);
  const south = stepPlayer(grid, { ...base, y: maxY - 10 }, new Set(['s']), 48, true);
  assert.equal(west.x, minX, 'ghost west edge clamp must preserve the full horizontal foot base');
  assert.equal(east.x, maxX, 'ghost east edge clamp must preserve the full horizontal foot base');
  assert.equal(north.y, minY, 'ghost north edge clamp must preserve the feet circle inside the map');
  assert.equal(south.y, maxY, 'ghost south edge clamp must preserve the feet circle inside the map');
}
