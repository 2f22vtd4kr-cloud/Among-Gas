import assert from 'node:assert/strict';
import {
  buildCollisionGrid,
  CELL_X,
  CELL_Y,
  COLS,
  MAP_W,
  ROWS,
  type Grid,
} from '@workspace/shared/collisionMap';
import {
  buildVisionSegments,
  computeVisibilityPolygon,
} from '../artifacts/telegram-game/src/game/visibility.ts';
import {
  IMPOSTOR_VISION_RADIUS_PX,
  LIGHTS_CREWMATE_VISION_RADIUS_PX,
  NORMAL_VISION_RADIUS_PX,
} from '@workspace/shared/sabotage';

// Open space stays circular, and an empty map has no invented blockers.
const openGrid = new Uint8Array(COLS * ROWS) as Grid;
assert.equal(buildVisionSegments(openGrid).length, 0);
const origin = { x: MAP_W / 2, y: MAP_W / 2 };
const openPolygon = computeVisibilityPolygon(origin.x, origin.y, 200, []);
assert.equal(openPolygon.length, 64, 'open space should use the stable circular boundary rays');
for (const point of openPolygon) {
  const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
  assert.ok(Math.abs(distance - 200) < 1e-6, 'open-space points lie on the sight-radius circle');
}

// A blocked collision cell must truncate sight through its near boundary.
const obstacleGrid = new Uint8Array(COLS * ROWS) as Grid;
const wallCol = 51;
const wallRow = 29;
obstacleGrid[wallRow * COLS + wallCol] = 1;
const segments = buildVisionSegments(obstacleGrid);
assert.ok(segments.length > 0, 'blocked cells generate vision-occluding wall boundaries');
const px = (wallCol - 1) * CELL_X + CELL_X * 0.5;
const py = wallRow * CELL_Y + CELL_Y * 0.5;
const polygon = computeVisibilityPolygon(px, py, CELL_X * 10, segments);
const eastRay = polygon.find(point => Math.abs(point.y - py) < 1e-6 && point.x > px);
assert.ok(eastRay, 'the east boundary ray exists');
assert.ok(
  Math.abs(eastRay.x - wallCol * CELL_X) < 1e-5,
  'the east ray terminates at the near wall boundary, not through the obstacle',
);

// Check the real traced map produces a bounded and meaningful polygon at spawn.
const realGrid = buildCollisionGrid();
const realSegments = buildVisionSegments(realGrid);
assert.ok(realSegments.length > 0, 'custom map collision grid has wall boundaries');
const realPolygon = computeVisibilityPolygon(350 * (MAP_W / 1040), 150 * (MAP_W / 1040), NORMAL_VISION_RADIUS_PX, realSegments);
assert.ok(realPolygon.length >= 64, 'the custom map gets a full vision polygon');
assert.ok(IMPOSTOR_VISION_RADIUS_PX > NORMAL_VISION_RADIUS_PX, 'impostors have farther base-game vision');
assert.ok(LIGHTS_CREWMATE_VISION_RADIUS_PX < NORMAL_VISION_RADIUS_PX, 'Lights reduces crewmate vision');

console.log(JSON.stringify({
  ok: true,
  collisionWallSegments: realSegments.length,
  polygonPoints: realPolygon.length,
  crewVisionPx: NORMAL_VISION_RADIUS_PX,
  impostorVisionPx: IMPOSTOR_VISION_RADIUS_PX,
  lightsCrewVisionPx: LIGHTS_CREWMATE_VISION_RADIUS_PX,
}, null, 2));
