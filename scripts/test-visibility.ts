import assert from 'node:assert/strict';
import {
  buildCollisionGrid,
  CELL_X,
  CELL_Y,
  COLS,
  MAP_H,
  MAP_W,
  ROWS,
  isPlayerPositionWalkable,
  type Grid,
} from '@workspace/shared/collisionMap';
import { buildNarrowShadowOccluders, buildShadowGrid, computeVisibilityPolygon, smoothVisibilityPolygon } from '../artifacts/telegram-game/src/game/visibility.ts';
import { CHARACTER_COLORS, CHARACTER_POSES, getCharacterClipPath, getCharacterFrameRect } from '../artifacts/telegram-game/src/game/characterSprites.ts';
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
const roundedPolygon = smoothVisibilityPolygon(polygon, { x: px, y: py });
assert.equal(roundedPolygon.length, polygon.length, 'shadow smoothing keeps the same angular ray count');
assert.ok(roundedPolygon.every((point, index) =>
  Math.hypot(point.x - px, point.y - py) <= Math.hypot(polygon[index].x - px, polygon[index].y - py) + 1e-6
), 'visual smoothing must never extend sight beyond the original wall/radius hit');
assert.ok(roundedPolygon.some((point, index) =>
  Math.hypot(point.x - px, point.y - py) < Math.hypot(polygon[index].x - px, polygon[index].y - py) - 1e-4
), 'a grid-step corner should produce a rounded-in contour instead of hard stair-step edges');
assert.ok(Math.abs(eastRay.y - py) < 1e-6, 'the east boundary ray is horizontal');
assert.ok(
  Math.abs(eastRay.x - wallCol * CELL_X) < 1e-5,
  'the east ray terminates at the near wall boundary, not through the obstacle',
);

// Every balaclava color has an authored dead-body frame. Crop windows trim
// detached underline strokes; rendering uses native crop scale and a pose-specific gap mask.
{
  const corpseFrames = CHARACTER_COLORS.map(color => getCharacterFrameRect(color, 'dead-body'));
  assert.equal(corpseFrames.length, 7, 'all seven balaclava colors have a corpse pose');
  assert.equal(new Set(corpseFrames.map(frame => frame.x)).size, 7, 'each color has its own corpse atlas column');
  assert.equal(getCharacterFrameRect('teal', 'idle').height, 136,
    'idle crop ends before the detached under-foot scanlines');
  assert.equal(corpseFrames[0].height, 93,
    'corpse crop keeps the exposed bone and cut suit but excludes detached under-foot scanlines');
  assert.match(getCharacterClipPath('idle') ?? '', /79%/,
    'idle leg-gap clipping starts before horizontal atlas strokes enter the foot gap');
  assert.match(getCharacterClipPath('dead-body') ?? '', /66%/,
    'corpse leg-gap clipping starts before detached strokes enter the leg gap');
  for (const frame of corpseFrames) {
    assert.equal(frame.row, CHARACTER_POSES.indexOf('dead-body'));
    assert.ok(frame.height < frame.displayHeight, 'corpse crop excludes detached underline rows and keeps the source pixels unstretched');
  }
  assert.match(getCharacterClipPath('idle') ?? '', /polygon/, 'idle pose masks stray strokes in the leg gap');
assert.equal(getCharacterClipPath('mask'), undefined, 'mask prop must not be clipped as a full character sprite');
  assert.match(getCharacterClipPath('dead-body') ?? '', /polygon/, 'corpse pose masks stray strokes while preserving the bone');
  for (const color of CHARACTER_COLORS) {
    for (const pose of CHARACTER_POSES) {
      const frame = getCharacterFrameRect(color, pose);
      assert.ok(frame.width > 0 && frame.height > 0 && frame.displayHeight >= frame.height,
        `valid isolated sprite window for ${color}/${pose}`);
    }
  }
}

// Small isolated solid props stay collidable but do not create hard vision shadows.
const propGrid = new Uint8Array(COLS * ROWS) as Grid;
const propA = 2 * COLS + 2;
const propB = 2 * COLS + 3;
const propC = 3 * COLS + 2;
const propD = 3 * COLS + 3;
propGrid[propA] = 1;
propGrid[propB] = 1;
propGrid[propC] = 1;
propGrid[propD] = 1;
for (let col = 20; col < 50; col++) propGrid[20 * COLS + col] = 1;
const shadowGrid = buildShadowGrid(propGrid);
assert.equal(propGrid[propA], 1, 'small prop remains solid for movement collision');
assert.equal(propGrid[propB], 1, 'small prop collision cells are not mutated');
assert.equal(propGrid[propC], 1, 'the lower row of a small prop remains solid for movement');
assert.equal(propGrid[propD], 1, 'the lower-right prop cell remains solid for movement');
assert.equal(shadowGrid[propA], 0, 'small isolated prop does not cast a hard shadow');
assert.equal(shadowGrid[propB], 0, 'all cells of the small prop are non-occluding');
assert.equal(shadowGrid[propC], 0, 'four-cell light-pole-sized footprints stay out of visual occlusion');
assert.equal(shadowGrid[propD], 0, 'four-cell light-pole-sized footprints stay out of the coarse square occlusion grid');
assert.equal(shadowGrid[20 * COLS + 25], 1, 'long wall component remains a vision occluder');
const narrowOccluders = buildNarrowShadowOccluders(propGrid);
assert.equal(narrowOccluders.length, 1, 'a four-cell 2×2 pole footprint becomes one narrow visual occluder');
const pole = narrowOccluders[0];
assert.equal(pole.x, 3 * CELL_X, 'narrow occluder is centered on the original prop');
assert.equal(pole.y, 3 * CELL_Y, 'narrow occluder keeps the prop center in world coordinates');
assert.ok(pole.radius < Math.min(CELL_X, CELL_Y) * 0.25, 'pole shadow geometry is narrower than a collision cell');
const poleSight = computeVisibilityPolygon(CELL_X * 0.5, pole.y, CELL_X * 10, shadowGrid, narrowOccluders);
assert.ok(poleSight[360].x < pole.x && poleSight[360].x > pole.x - CELL_X,
  'the east ray stops at the narrow pole silhouette instead of a 2×2 square');

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
assert.equal(realGrid[10*COLS+55],0,'manual outline must not fill the old extra-blocked RLE cell');
assert.equal(isPlayerPositionWalkable(realGrid,1735,490),false,'exact vector collision blocks fountain footprint');
const realNarrowOccluders = buildNarrowShadowOccluders(realGrid);
assert.ok(realNarrowOccluders.length > 0, 'custom map contains narrow props that need silhouette-based shadows');
assert.ok(realNarrowOccluders.length < 100, 'narrow visual occluders remain cheap to ray-cast on mobile');
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
const upperAtriumWall = 4 * COLS + 40;
assert.equal(realGrid[upperAtriumWall], 1, 'upper atrium wall remains blocked for movement');
assert.equal(realShadowGrid[upperAtriumWall], 1, 'architectural wall remains a vision occluder');
const fountainRay=computeVisibilityPolygon(1450,490,500,realShadowGrid,realNarrowOccluders,true)[360];
assert.ok(fountainRay.x>1580&&fountainRay.x<1586,'vision ray stops at the vector fountain edge');

const realOrigin = { x: 350 * (MAP_W / 1040), y: 150 * (MAP_H / 580) };
const realPolygon = computeVisibilityPolygon(
  realOrigin.x,
  realOrigin.y,
  NORMAL_VISION_RADIUS_PX,
  realShadowGrid,
  realNarrowOccluders,
  true,
);
const roundedRealPolygon = smoothVisibilityPolygon(realPolygon, realOrigin);
assert.equal(realPolygon.length, 720, 'custom map returns a full visibility polygon');
assert.equal(roundedRealPolygon.length, realPolygon.length, 'custom map shadow smoothing preserves the complete polygon');
assert.ok(IMPOSTOR_VISION_RADIUS_PX > NORMAL_VISION_RADIUS_PX, 'impostors have farther base-game vision');
assert.ok(LIGHTS_CREWMATE_VISION_RADIUS_PX < NORMAL_VISION_RADIUS_PX, 'Lights reduces crewmate vision');

console.log(JSON.stringify({
  ok: true,
  rayCount: realPolygon.length,
  narrowOccluderCount: realNarrowOccluders.length,
  crewVisionPx: NORMAL_VISION_RADIUS_PX,
  impostorVisionPx: IMPOSTOR_VISION_RADIUS_PX,
  lightsCrewVisionPx: LIGHTS_CREWMATE_VISION_RADIUS_PX,
}, null, 2));
