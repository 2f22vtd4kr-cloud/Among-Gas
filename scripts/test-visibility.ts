import assert from 'node:assert/strict';
import { FINE_RLE_BASE64 } from '../lib/shared/src/collisionDataFine.js';
import {
  buildCollisionGrid,
  buildPreciseCollisionGrid,
  FINE_COLS,
  FINE_ROWS,
  FINE_CELL_X,
  FINE_CELL_Y,
  isBlocked,
  CELL_X,
  CELL_Y,
  COLS,
  MAP_H,
  MAP_W,
  ROWS,
  isPlayerPositionWalkable,
  type Grid,
} from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y } from '@workspace/shared/coords';
import { buildFineShadowSegments, buildNarrowShadowOccluders, buildShadowGrid, computeVisibilityPolygon, smoothVisibilityPolygon } from '../artifacts/telegram-game/src/game/visibility.ts';
import { CHARACTER_COLORS, CHARACTER_POSES, getCharacterClipPath, getCharacterFrameRect } from '../artifacts/telegram-game/src/game/characterSprites.ts';

// Decode the committed canonical stream independently of the production
// decoder. This guards dimensions, varint validity and exact cell coverage.
function decodeCanonicalFineRle(encoded: string, cols: number, rows: number): Uint8Array {
  assert.ok(/^[A-Za-z0-9+/]+$/.test(encoded), 'fine RLE uses only unpadded Base64 characters');
  assert.notEqual(encoded.length % 4, 1, 'fine RLE has a valid Base64 length');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of encoded) {
    const digit = alphabet.indexOf(character);
    assert.notEqual(digit, -1, 'fine RLE contains a valid Base64 character');
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  assert.ok(bits === 0 || bits === 2 || bits === 4, 'Base64 has a valid final bit count');
  assert.equal(buffer, 0, 'unused Base64 tail bits are zero');

  const decoded = new Uint8Array(cols * rows);
  let input = 0;
  let output = 0;
  let cellValue: 0 | 1 = 0;
  let runIndex = 0;
  while (input < bytes.length) {
    let runLength = 0;
    let multiplier = 1;
    let byte = 0;
    let byteCount = 0;
    do {
      assert.ok(input < bytes.length, 'RLE varint is not truncated');
      byte = bytes[input++];
      runLength += (byte & 0x7f) * multiplier;
      multiplier *= 128;
      byteCount++;
      assert.ok(byteCount <= 4, 'RLE varint is bounded');
    } while ((byte & 0x80) !== 0);
    if (byteCount > 1) assert.notEqual(byte & 0x7f, 0, 'RLE varints are minimally encoded');
    assert.ok(runLength > 0 || runIndex === 0, 'only the initial blocked cell may use a zero run');
    assert.ok(output + runLength <= decoded.length, 'RLE does not overrun declared dimensions');
    decoded.fill(cellValue, output, output + runLength);
    output += runLength;
    cellValue = cellValue === 0 ? 1 : 0;
    runIndex++;
  }
  assert.equal(output, cols * rows, 'RLE covers every cell exactly');
  return decoded;
}

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
  assert.equal(corpseFrames.length, 18, 'all eighteen runtime palettes have a corpse pose');
  assert.equal(new Set(corpseFrames.map(frame => frame.x)).size, 18, 'each runtime palette has its own atlas column');
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

// Fine-grid compact objects cast exact outline shadows without becoming
// inflated square shadow cells.
{
  const finePropGrid = new Uint8Array(FINE_COLS * FINE_ROWS) as Grid;
  for (let row = 10; row < 12; row++) {
    for (let col = 10; col < 12; col++) finePropGrid[row * FINE_COLS + col] = 1;
  }
  const outlineSegments = buildFineShadowSegments(finePropGrid);
  assert.equal(outlineSegments.length, 4, 'a 2×2 compact object produces four merged silhouette edges');
  const openFineShadowGrid = new Uint8Array(FINE_COLS * FINE_ROWS) as Grid;
  const x = FINE_CELL_X * 8;
  const y = FINE_CELL_Y * 10.5;
  const sight = computeVisibilityPolygon(x, y, FINE_CELL_X * 10, openFineShadowGrid, [], false, outlineSegments);
  assert.ok(Math.abs(sight[360].x - FINE_CELL_X * 10) < 1e-5,
    "the east ray terminates at the object's exact left outline, not an expanded square");
}

// The actual custom map yields a complete visibility polygon with distinct
// crew/impostor radii and a much smaller crew radius during Lights sabotage.
const realGrid = buildCollisionGrid();
const realShadowGrid = buildShadowGrid(realGrid);
assert.equal(realGrid[10*COLS+55],0,'manual outline must not fill the old extra-blocked RLE cell');
assert.equal(isPlayerPositionWalkable(realGrid,1640,449),true,'the western garden path remains walkable');
assert.equal(isPlayerPositionWalkable(realGrid,1810,449),true,'the eastern garden path remains walkable');
assert.equal(isPlayerPositionWalkable(realGrid,1735,449),true,'the decorative garden floor remains walkable');
assert.equal(isPlayerPositionWalkable(realGrid,1735,556-FEET_OFFSET_Y),false,'the statue base remains solid');
const realNarrowOccluders = buildNarrowShadowOccluders(realGrid, true);
assert.ok(realNarrowOccluders.length > 0, 'custom map contains narrow props that need silhouette-based shadows');
const westernGardenCell = 14 * COLS + Math.floor(1640 / CELL_X);
const easternGardenCell = 14 * COLS + Math.floor(1810 / CELL_X);
assert.equal(realShadowGrid[westernGardenCell], 0, 'walkable garden floor does not cast a hard shadow');
assert.equal(realShadowGrid[easternGardenCell], 0, 'the opposite garden path also remains clear in the vision grid');
const statueOccluder = realNarrowOccluders.find(item =>
  Math.hypot(item.x - 1735, item.y - 556) < 1,
);
assert.ok(statueOccluder, 'the central statue remains a dedicated narrow vision occluder');
assert.ok(statueOccluder.radius >= 20 && statueOccluder.radius <= 30,
  'the statue vision circle follows its measured 26px base instead of the full garden');
assert.ok(realNarrowOccluders.length < 100, 'narrow visual occluders remain cheap to ray-cast on mobile');
// Low furniture in the upper atrium remains blocked for movement, while the
// table/bench cells do not cast hard shadows. The enclosing room walls still do.
const upperAtriumLeftBench = 9 * COLS + 48;
const upperAtriumRightBench = 9 * COLS + 64;
const upperAtriumTable = 7 * COLS + 56;
assert.equal(realGrid[upperAtriumLeftBench], 1, 'left atrium bench remains collidable');
assert.equal(realShadowGrid[upperAtriumLeftBench], 0, 'left atrium bench does not cast a vision shadow');
assert.equal(realGrid[upperAtriumRightBench], 1, 'right atrium bench remains collidable');
assert.equal(realShadowGrid[upperAtriumRightBench], 0, 'right atrium bench does not cast a vision shadow');
assert.equal(realGrid[upperAtriumTable], 1, 'upper-atrium table remains collidable in the compact navigation grid');
const upperAtriumWall = 4 * COLS + 40;
assert.equal(realGrid[upperAtriumWall], 1, 'upper atrium wall remains blocked for movement');
assert.equal(realShadowGrid[upperAtriumWall], 1, 'architectural wall remains a vision occluder');
const statueRay=computeVisibilityPolygon(1450,556,500,realShadowGrid,realNarrowOccluders,true)[360];
assert.ok(statueRay.x>1707&&statueRay.x<1711,'vision ray stops at the narrow statue footprint, not the decorative garden perimeter');

// The 680×392 grid is authoritative for movement and visual occlusion.
const realFineGrid = buildPreciseCollisionGrid();
const independentlyDecodedFineGrid = decodeCanonicalFineRle(FINE_RLE_BASE64, FINE_COLS, FINE_ROWS);
assert.equal(FINE_COLS * FINE_ROWS, 680 * 392, 'canonical dimensions are 680×392');
assert.deepEqual(independentlyDecodedFineGrid, realFineGrid,
  'the production decoder exactly matches the independently decoded committed payload');
const realFineShadowGrid = buildShadowGrid(realFineGrid);
const realFineShadowSegments = buildFineShadowSegments(realFineGrid);
assert.ok(realFineShadowSegments.length > 0 && realFineShadowSegments.length < 2000,
  'compact production props expose merged silhouette segments within a mobile-safe budget');
const vehicleCell = fineCell(2120, 1150);
assert.equal(realFineGrid[vehicleCell], 1, 'the vehicle remains a solid movement-collision obstacle');
assert.equal(isPlayerPositionWalkable(realFineGrid, 2120, 1150), false,
  'the van body remains blocked after replacing its oversized source footprint');
assert.equal(isPlayerPositionWalkable(realFineGrid, 2000, 1150), true,
  'the player can use the left-side clearance in the vehicle bay');
assert.equal(isPlayerPositionWalkable(realFineGrid, 2250, 1150), true,
  'the player can use the right-side clearance in the vehicle bay');
assert.equal(realFineShadowGrid[vehicleCell], 0, 'the vehicle is not rasterized into a broad square shadow');
assert.ok(realFineShadowSegments.some(segment =>
  [segment.ax, segment.bx].some(x => x >= 1990 && x <= 2260) &&
  [segment.ay, segment.by].some(y => y >= 1050 && y <= 1260)
), 'the vehicle casts a silhouette shadow from its measured fine-grid outline');
assert.equal(realFineGrid.length, FINE_COLS * FINE_ROWS, 'fine collision grid has complete declared coverage');
assert.equal(isPlayerPositionWalkable(realFineGrid, 1640, 449), true, 'fine western garden path is walkable');
assert.equal(isPlayerPositionWalkable(realFineGrid, 1810, 449), true, 'fine eastern garden path is walkable');
assert.equal(isPlayerPositionWalkable(realFineGrid, 1735, 449), true, 'fine garden floor above the statue remains walkable');
assert.equal(isPlayerPositionWalkable(realFineGrid, 1735, 556 - FEET_OFFSET_Y), false, 'fine statue base blocks the player footprint');
const fineCell = (x: number, y: number) =>
  Math.floor(y / FINE_CELL_Y) * FINE_COLS + Math.floor(x / FINE_CELL_X);
assert.equal(realFineShadowGrid[fineCell(1640, 449)], 0, 'fine garden floor does not cast a hard shadow');
assert.equal(realFineShadowGrid[fineCell(1810, 449)], 0, 'opposite fine garden path remains clear');
assert.equal(realFineShadowGrid[fineCell(1250, 600)], 1, 'architectural wall remains a precise vision occluder');
const fineStatue = buildNarrowShadowOccluders(realFineGrid, true).find(item =>
  Math.hypot(item.x - 1735, item.y - 556) < 1,
);
assert.ok(fineStatue, 'tall statue has a dedicated narrow visual occluder');
assert.equal(realFineShadowGrid[fineCell(1735, 556)], 0, 'statue is not rasterized as a square shadow');
assert.equal(isBlocked(realFineGrid, 1740, 210), true, 'upper-atrium table remains solid for movement');
assert.equal(realFineShadowGrid[fineCell(1740, 210)], 0, 'upper-atrium table does not cast a broad shadow');
const fineGardenRay = computeVisibilityPolygon(1600, 556, 220, realFineShadowGrid, [fineStatue], true)[360];
assert.ok(fineGardenRay.x <= fineStatue.x - fineStatue.radius + 1,
  'garden sight stops at the statue itself, not at the decorative garden perimeter');

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
