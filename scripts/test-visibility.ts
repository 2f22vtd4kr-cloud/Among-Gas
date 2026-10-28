import assert from 'node:assert/strict';
import {
  buildCollisionGrid,
  CELL_X,
  CELL_Y,
  COLS,
  MAP_H,
  MAP_W,
  ROWS,
  type Grid,
} from '@workspace/shared/collisionMap';
import { buildShadowGrid, computeVisibilityPolygon } from '../artifacts/telegram-game/src/game/visibility.ts';
import {
  IMPOSTOR_VISION_RADIUS_PX,
  LIGHTS_CREWMATE_VISION_RADIUS_PX,
  NORMAL_VISION_RADIUS_PX,
} from '@workspace/shared/sabotage';

// Open space stays circular, even in a grid with no walls.
const openGrid = new Uint8Array(COLS * ROWS) as Grid;
const origin = { x: MAP_W / 2, y: MAP_H / 2 };
const openPolygon = computeVisibilityPolygon(origin.x, origin.y, 200, openGrid);
assert.equal(openPolygon.length, 720, 'visibility uses stable half-degree rays');
for (const point of openPolygon) {
  const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
  assert.ok(Math.abs(distance - 200) < 1e-6, 'open-space points lie on the sight-radius circle');
}

// A blocked collision cell must truncate sight at its near boundary.
const obstacleGrid = new Uint8Array(COLS * ROWS) as Grid;
const wallCol = 51;
const wallRow = 29;
obstacleGrid[wallRow * COLS + wallCol] = 1;
const px = (wallCol - 1) * CELL_X + CELL_X * 0.5;
const py = wallRow * CELL_Y + CELL_Y * 0.5;
const polygon = computeVisibilityPolygon(px, py, CELL_X * 10, obstacleGrid);
const eastRay = polygon[360]; // angle 0
assert.ok(Math.abs(eastRay.y - py) < 1e-6, 'the east boundary ray is horizontal');
assert.ok(
  Math.abs(eastRay.x - wallCol * CELL_X) < 1e-5,
  'the east ray terminates at the near wall boundary, not through the obstacle',
);

// Small isolated solid props stay collidable but do not create hard vision shadows.
const propGrid = new Uint8Array(COLS * ROWS) as Grid;
const propA = 2 * COLS + 2;
const propB = 2 * COLS + 3;
propGrid[propA] = 1;
propGrid[propB] = 1;
for (let col = 20; col < 50; col++) propGrid[20 * COLS + col] = 1;
const shadowGrid = buildShadowGrid(propGrid);
assert.equal(propGrid[propA], 1, 'small prop remains solid for movement collision');
assert.equal(propGrid[propB], 1, 'small prop collision cells are not mutated');
assert.equal(shadowGrid[propA], 0, 'small isolated prop does not cast a hard shadow');
assert.equal(shadowGrid[propB], 0, 'all cells of the small prop are non-occluding');
assert.equal(shadowGrid[20 * COLS + 25], 1, 'long wall component remains a vision occluder');

 // Collision and vision are separate contracts: the same small prop blocks
 // movement, but does not truncate the vision radius.
 const propVisionOriginX = CELL_X * 0.5;
 const propVisionOriginY = CELL_Y * 2.5;
 const collisionPropRay = computeVisibilityPolygon(propVisionOriginX, propVisionOriginY, CELL_X * 4, propGrid)[360];
 const visionPropRay = computeVisibilityPolygon(propVisionOriginX, propVisionOriginY, CELL_X * 4, shadowGrid)[360];
 assert.ok(Math.abs(collisionPropRay.x - CELL_X * 2) < 1e-5,
   'collision geometry still marks the prop as a solid cell');
 assert.ok(Math.abs(visionPropRay.x - (propVisionOriginX + CELL_X * 4)) < 1e-5,
   'a non-occluding prop must not cast a hard vision shadow');

// The actual custom map yields a complete visibility polygon with distinct
// crew/impostor radii and a much smaller crew radius during Lights sabotage.
const realGrid = buildCollisionGrid();
const realShadowGrid = buildShadowGrid(realGrid);
// Low furniture in the upper atrium remains blocked for movement, while the
// table/bench cells do not cast hard shadows. The enclosing room walls still do.
const upperAtriumLeftBench = 9 * COLS + 48;
const upperAtriumRightBench = 9 * COLS + 64;
const upperAtriumStatue = 7 * COLS + 56;
assert.equal(realGrid[upperAtriumLeftBench], 1, 'left atrium bench remains collidable');
assert.equal(realShadowGrid[upperAtriumLeftBench], 0, 'left atrium bench does not cast a vision shadow');
assert.equal(realGrid[upperAtriumRightBench], 1, 'right atrium bench remains collidable');
assert.equal(realShadowGrid[upperAtriumRightBench], 0, 'right atrium bench does not cast a vision shadow');
assert.equal(realGrid[upperAtriumStatue], 1, 'central atrium furnishing remains collidable');
assert.equal(realShadowGrid[upperAtriumStatue], 1, 'central statue remains a vision occluder');
assert.equal(realGrid[0], 1, 'map boundary remains blocked for movement');
assert.equal(realShadowGrid[0], 1, 'architectural boundary remains a vision occluder');
const realPolygon = computeVisibilityPolygon(
  350 * (MAP_W / 1040),
  150 * (MAP_H / 580),
  NORMAL_VISION_RADIUS_PX,
  realGrid,
);
assert.equal(realPolygon.length, 720, 'custom map returns a full visibility polygon');
assert.ok(IMPOSTOR_VISION_RADIUS_PX > NORMAL_VISION_RADIUS_PX, 'impostors have farther base-game vision');
assert.ok(LIGHTS_CREWMATE_VISION_RADIUS_PX < NORMAL_VISION_RADIUS_PX, 'Lights reduces crewmate vision');

console.log(JSON.stringify({
  ok: true,
  rayCount: realPolygon.length,
  crewVisionPx: NORMAL_VISION_RADIUS_PX,
  impostorVisionPx: IMPOSTOR_VISION_RADIUS_PX,
  lightsCrewVisionPx: LIGHTS_CREWMATE_VISION_RADIUS_PX,
}, null, 2));
