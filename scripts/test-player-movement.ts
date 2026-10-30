import assert from 'node:assert/strict';
import { CELL_X, CELL_Y, COLS, ROWS, MAP_W, MAP_H, buildCollisionGrid, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import {
  isMovementPathWalkable,
  validateMovementIntent,
  MOVEMENT_PACKET_BURST_CAPACITY,
} from '../artifacts/api-server/src/ws/movement.js';
import {
  FEET_OFFSET_Y,
  PLAYER_HALF_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPRITE_HALF_WIDTH_PX,
  PLAYER_SPRITE_HALF_HEIGHT_PX,
  PLAYER_SPEED_PX_PER_SEC,
} from '@workspace/shared/coords';
import { createInitialPlayerState, isMovementPathWalkableWide, stepPlayer } from '../artifacts/telegram-game/src/game/player.js';
import { resolvePlayerMovement } from '../artifacts/telegram-game/src/game/collisionMap.js';
import { classifyMovementEcho } from '../artifacts/telegram-game/src/game/movementReconciliation.js';

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


// The authoritative dead-player movement path must use the same nonnegative
// edge clamp so the server never emits an invalid unsigned wire coordinate.
{
  const decision = validateMovementIntent({
    x: MAP_W / 2,
    y: 50,
    alive: false,
    movementCreditPx: 27,
    movementCreditUpdatedAtMs: 2_000,
    lastMovementPacketAtMs: 1_950,
  }, MAP_W / 2, 30, 2_000, grid);
  assert.equal(decision.y, PLAYER_SPRITE_HALF_HEIGHT_PX,
    'server ghost movement must clamp the anchor to the visible north sprite bound');
  assert.ok(decision.y >= 0, 'server ghost movement must never produce a negative wire y coordinate');
}


// Ordered 25Hz WebSocket position packets may be delivered in a tight burst
// after a short event-loop/network stall. They must be validated against the
// accumulated distance budget rather than dropped by an arrival-spacing guard.
{
  const burstGrid = new Uint8Array(COLS * ROWS);
  const burstStartX = MAP_W / 4;
  const burstY = MAP_H / 2 - FEET_OFFSET_Y;
  const packetStepPx = PLAYER_SPEED_PX_PER_SEC * 0.04;
  let burstState = {
    x: burstStartX,
    y: burstY,
    alive: true,
    movementCreditPx: 0,
    movementCreditUpdatedAtMs: 1_000,
    lastMovementPacketAtMs: 1_000,
  };
  for (let packet = 1; packet <= 5; packet++) {
    const decision = validateMovementIntent(
      burstState,
      burstStartX + packetStepPx * packet,
      burstY,
      1_200 + packet - 1,
      burstGrid,
    );
    assert.equal(decision.rateLimited, false,
      `buffered movement packet ${packet} must pass the independent packet token bucket`);
    assert.equal(decision.accepted, true,
      `buffered movement packet ${packet} must consume only its 40ms share of the accumulated 200ms budget`);
    burstState = {
      ...burstState,
      x: decision.x,
      y: decision.y,
      movementCreditPx: decision.movementCreditPx,
      movementCreditUpdatedAtMs: decision.movementCreditUpdatedAtMs,
      lastMovementPacketAtMs: decision.lastMovementPacketAtMs,
      movementPacketTokens: decision.movementPacketTokens,
      movementPacketTokensUpdatedAtMs: decision.movementPacketTokensUpdatedAtMs,
    };
  }
  assert.ok(Math.abs(burstState.x - (burstStartX + PLAYER_SPEED_PX_PER_SEC * 0.2)) < 0.01,
    'a 200ms queued movement burst must be accepted without a forced rollback');
}

// The independent packet token bucket still bounds pathological packet floods.
{
  const floodGrid = new Uint8Array(COLS * ROWS);
  const floodStartX = MAP_W / 4;
  const floodY = MAP_H / 2 - FEET_OFFSET_Y;
  let floodState = {
    x: floodStartX,
    y: floodY,
    alive: true,
    movementCreditPx: 0,
    movementCreditUpdatedAtMs: 2_000,
  };
  let acceptedPackets = 0;
  let floodWasLimited = false;
  for (let packet = 0; packet < MOVEMENT_PACKET_BURST_CAPACITY + 2; packet++) {
    const decision = validateMovementIntent(floodState, floodStartX, floodY, 2_000, floodGrid);
    if (decision.rateLimited) {
      floodWasLimited = true;
      break;
    }
    acceptedPackets++;
    floodState = {
      ...floodState,
      movementCreditPx: decision.movementCreditPx,
      movementCreditUpdatedAtMs: decision.movementCreditUpdatedAtMs,
      lastMovementPacketAtMs: decision.lastMovementPacketAtMs,
      movementPacketTokens: decision.movementPacketTokens,
      movementPacketTokensUpdatedAtMs: decision.movementPacketTokensUpdatedAtMs,
    };
  }
  assert.equal(acceptedPackets, MOVEMENT_PACKET_BURST_CAPACITY,
    'the packet token bucket must allow its configured burst and no more');
  assert.equal(floodWasLimited, true,
    'the independent packet token bucket must still reject an excessive burst');
}

// Delayed/duplicate ordinary 0xFF echoes cannot rollback newer prediction.
{
 const sent=[{wireX:100,wireY:200},{wireX:110,wireY:200},{wireX:120,wireY:200}];
 assert.deepEqual(classifyMovementEcho(sent,{wireX:100,wireY:200},false),{kind:'initial'});
 assert.deepEqual(classifyMovementEcho(sent,{wireX:110,wireY:200},true),{kind:'acknowledgement',acknowledgedIndex:1});
 assert.deepEqual(classifyMovementEcho(sent.slice(2),{wireX:110,wireY:200},true),{kind:'stale'});
 assert.deepEqual(classifyMovementEcho(sent.slice(2),{wireX:105,wireY:200},true),{kind:'stale'});
 assert.deepEqual(classifyMovementEcho(sent.slice(2),{wireX:105,wireY:200,force:true},true),{kind:'correction'});
}
// The decorative garden remains walkable around the statue. The statue's
// small 2×2 RLE footprint remains blocked without a planter-wide polygon.
{
 const canonical=buildCollisionGrid();
 assert.equal(canonical[10*COLS+55],0,'manual outline must not rasterize an open base cell');
 assert.equal(isPlayerPositionWalkable(canonical,1640,449),true,'western garden path stays walkable');
 assert.equal(isPlayerPositionWalkable(canonical,1810,449),true,'eastern garden path stays walkable');
 assert.equal(isPlayerPositionWalkable(canonical,1735,449),false,'the statue footprint remains blocked');
 assert.equal(isPlayerPositionWalkable(canonical,1450,449),true,'open west lobby floor stays walkable');
}

console.log('PASS: movement, vector obstacle collision, stale echoes, thin walls, diagonal corners and map edges');

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
  const minX = Math.max(PLAYER_SPRITE_HALF_WIDTH_PX, PLAYER_HALF_WIDTH + PLAYER_RADIUS);
  const maxX = MAP_W - minX;
  const minY = Math.max(0, PLAYER_SPRITE_HALF_HEIGHT_PX, PLAYER_RADIUS - FEET_OFFSET_Y);
  const maxY = MAP_H - Math.max(PLAYER_SPRITE_HALF_HEIGHT_PX, FEET_OFFSET_Y + PLAYER_RADIUS);
  const base = createInitialPlayerState();
  const west = stepPlayer(grid, { ...base, x: minX + 10 }, new Set(['a']), 48, true);
  const east = stepPlayer(grid, { ...base, x: maxX - 10 }, new Set(['d']), 48, true);
  const north = stepPlayer(grid, { ...base, y: minY + 10 }, new Set(['w']), 48, true);
  const south = stepPlayer(grid, { ...base, y: maxY - 10 }, new Set(['s']), 48, true);
  assert.equal(west.x, minX, 'ghost west edge clamp must preserve the full horizontal foot base');
  assert.equal(east.x, maxX, 'ghost east edge clamp must preserve the full horizontal foot base');
  assert.equal(north.y, minY, 'ghost north edge clamp must preserve the complete sprite and feet inside the map');
  assert.equal(south.y, maxY, 'ghost south edge clamp must preserve the complete sprite and feet inside the map');
  assert.ok(north.y >= 0, 'ghost north edge anchor must remain nonnegative for unsigned wire coordinates');
  assert.ok(north.y - PLAYER_SPRITE_HALF_HEIGHT_PX >= 0,
    'ghost north edge must keep the complete visible sprite inside the map');
  assert.ok(south.y + Math.max(PLAYER_SPRITE_HALF_HEIGHT_PX, FEET_OFFSET_Y + PLAYER_RADIUS) <= MAP_H,
    'ghost south edge must keep the visible sprite and feet inside the map');
}
