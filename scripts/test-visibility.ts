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
import { computeVisibilityPolygon } from '../artifacts/telegram-game/src/game/visibility.ts';
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

// The actual custom map yields a complete visibility polygon with distinct
// crew/impostor radii and a much smaller crew radius during Lights sabotage.
const realGrid = buildCollisionGrid();
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
