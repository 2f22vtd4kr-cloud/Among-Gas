import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPreciseCollisionGrid,
  buildFineCollisionGridFromRle,
  FINE_COLS,
  FINE_ROWS,
  MAP_W,
  MAP_H,
  MANUAL_BLOCKED_POLYGONS,
  isPlayerPositionWalkable,
} from '@workspace/shared/collisionMap';
import {
  buildShadowGrid,
  buildNarrowShadowOccluders,
  buildFineShadowSegments,
  computeVisibilityPolygon,
  smoothVisibilityPolygon,
  type VisionPoint,
} from '../artifacts/telegram-game/src/game/visibility.js';
import {
  FEET_OFFSET_Y,
  PLAYER_RADIUS,
  PLAYER_HALF_WIDTH,
  PLAYER_SPRITE_HALF_WIDTH_PX,
  PLAYER_SPRITE_HALF_HEIGHT_PX,
  PLAYER_SPAWN_CLEARANCE_PX,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from '@workspace/shared/coords';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let useCandidatePayload = process.argv.includes('--candidate');
let candidatePayload: string | undefined;
if (useCandidatePayload) {
  const candidatePath = path.join(root, 'lib/shared/src/collisionDataFine.generated-preview.ts');
  try {
    const candidateSource = readFileSync(candidatePath, 'utf8');
    const candidateMatch = candidateSource.match(/FINE_RLE_BASE64\s*=\s*"([^"]+)"/);
    if (!candidateMatch) throw new Error('Generated fine collision preview has no canonical Base64 payload');
    candidatePayload = candidateMatch[1];
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code !== 'ENOENT') throw error;
    console.warn('[collision-qa] generated preview is unavailable; rendering committed canonical payload instead');
    useCandidatePayload = false;
  }
}
console.log('[collision-qa] payload source: ' + (useCandidatePayload ? 'generated source-art preview' : 'committed canonical payload'));
const mapPath = path.join(root, 'artifacts/telegram-game/public/map-hires.png');
const webpPath = path.join(root, 'artifacts/telegram-game/public/map-hires.webp');
const referencePath = path.join(root, 'attached_assets/IMG_2907_1783632830477.jpeg');
const outputPath = path.join(root, 'artifacts/telegram-game/collision-qa-overlay.png');
const outputShadowPath = path.join(root, 'artifacts/telegram-game/collision-shadow-qa-overlay.png');
const outputVisionPath = path.join(root, 'artifacts/telegram-game/collision-vision-qa-overlay.png');
const outputWebpPath = path.join(root, 'artifacts/telegram-game/collision-qa-overlay-webp.png');
const referenceOutputPath = path.join(root, 'artifacts/telegram-game/collision-reference-overlay.png');
const tileDir = path.join(root, 'artifacts/telegram-game/collision-qa-tiles');

const grid = useCandidatePayload && candidatePayload ? buildFineCollisionGridFromRle(candidatePayload) : buildPreciseCollisionGrid();
const shadowGrid = buildShadowGrid(grid);
const narrowOccluders = buildNarrowShadowOccluders(grid, true);
const narrowSegments = buildFineShadowSegments(grid);
const map = sharp(mapPath);
const metadata = await map.metadata();
const webpMetadata = await sharp(webpPath).metadata();
const reference = sharp(referencePath);
const referenceMeta = await reference.metadata();
for (const [label, meta] of [['PNG', metadata], ['WebP', webpMetadata], ['reference', referenceMeta]] as const) {
  if (!meta.width || !meta.height) throw new Error(label + ' map image dimensions unavailable');
}
const scaleFor = (width: number, height: number, label: string, requireUpscale = true) => {
  const scaleX = width / MAP_W;
  const scaleY = height / MAP_H;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) ||
      Math.abs(scaleX - scaleY) > 0.002 || (requireUpscale && scaleX < 1)) {
    throw new Error(label + ' dimensions ' + width + 'x' + height + ' do not match logical map ' + MAP_W + 'x' + MAP_H);
  }
  return { x: scaleX, y: scaleY };
};
const pngScale = scaleFor(metadata.width!, metadata.height!, 'PNG');
const webpScale = scaleFor(webpMetadata.width!, webpMetadata.height!, 'WebP');
const refScale = scaleFor(referenceMeta.width!, referenceMeta.height!, 'red-line reference', false);

function makeOverlaySvg(
  sourceGrid: Uint8Array,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  fill: string,
  opacity: number,
  includeSpawn: boolean,
): Buffer {
  const cellWidth = (MAP_W / FINE_COLS) * scaleX;
  const cellHeight = (MAP_H / FINE_ROWS) * scaleY;
  const rects: string[] = [];
  // Merge adjacent blocked cells into horizontal runs: the silhouette remains
  // inspectable without emitting hundreds of thousands of SVG rectangles.
  for (let row = 0; row < FINE_ROWS; row++) {
    let runStart = -1;
    for (let col = 0; col <= FINE_COLS; col++) {
      const blocked = col < FINE_COLS && sourceGrid[row * FINE_COLS + col] === 1;
      if (blocked && runStart < 0) runStart = col;
      if (!blocked && runStart >= 0) {
        const x = runStart * cellWidth;
        const y = row * cellHeight;
        const runWidth = (col - runStart) * cellWidth;
        rects.push(
          '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) +
          '" width="' + runWidth.toFixed(2) + '" height="' + cellHeight.toFixed(2) +
          '" fill="' + fill + '" fill-opacity="' + opacity + '"/>',
        );
        runStart = -1;
      }
    }
  }

  const polygonLines = MANUAL_BLOCKED_POLYGONS.map(polygon => {
    const points = polygon.points.map(([x, y]) =>
      (x * scaleX).toFixed(2) + ',' + (y * scaleY).toFixed(2),
    ).join(' ');
    return '<polygon points="' + points + '" fill="none" stroke="#ffd740" stroke-width="' +
      (3 * scaleX) + '" stroke-linejoin="round"/>';
  }).join('');

  let spawn = '';
  if (includeSpawn) {
    const x = PLAYER_SPAWN_X * scaleX;
    const y = PLAYER_SPAWN_Y * scaleY;
    const feetY = (PLAYER_SPAWN_Y + FEET_OFFSET_Y) * scaleY;
    const radius = PLAYER_RADIUS * scaleX;
    const halfWidth = PLAYER_HALF_WIDTH * scaleX;
    const halfSpriteWidth = PLAYER_SPRITE_HALF_WIDTH_PX * scaleX;
    const halfSpriteHeight = PLAYER_SPRITE_HALF_HEIGHT_PX * scaleY;
    const spawnMarginX = PLAYER_SPAWN_CLEARANCE_PX * scaleX;
    const spawnMarginY = PLAYER_SPAWN_CLEARANCE_PX * scaleY;
    spawn = [
      '<rect x="' + (x - halfSpriteWidth - spawnMarginX) + '" y="' + (y - halfSpriteHeight - spawnMarginY) +
      '" width="' + ((halfSpriteWidth + spawnMarginX) * 2) + '" height="' + ((halfSpriteHeight + spawnMarginY) * 2) +
      '" fill="none" stroke="#00ffae" stroke-width="' + (2 * scaleX) + '" stroke-dasharray="' + (5 * scaleX) + ' ' + (3 * scaleX) + '"/>',
      '<rect x="' + (x - halfSpriteWidth) + '" y="' + (y - halfSpriteHeight) +
      '" width="' + (halfSpriteWidth * 2) + '" height="' + (halfSpriteHeight * 2) +
      '" fill="#00e5ff" fill-opacity="0.08" stroke="#00e5ff" stroke-width="' + (2 * scaleX) + '" stroke-dasharray="' + (6 * scaleX) + ' ' + (4 * scaleX) + '"/>',
      '<circle cx="' + x + '" cy="' + feetY + '" r="' + radius +
      '" fill="#00e5ff" fill-opacity="0.85" stroke="#001018" stroke-width="' + (2 * scaleX) + '"/>',
      '<circle cx="' + (x - halfWidth) + '" cy="' + feetY + '" r="' + radius +
      '" fill="#00e5ff" fill-opacity="0.55" stroke="#001018" stroke-width="' + (1.5 * scaleX) + '"/>',
      '<circle cx="' + (x + halfWidth) + '" cy="' + feetY + '" r="' + radius +
      '" fill="#00e5ff" fill-opacity="0.55" stroke="#001018" stroke-width="' + (1.5 * scaleX) + '"/>',
      '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + feetY +
      '" stroke="#00e5ff" stroke-width="' + (2 * scaleX) + '" stroke-dasharray="' + (5 * scaleX) + ' ' + (4 * scaleX) + '"/>',
      '<text x="' + (x + 16 * scaleX) + '" y="' + (y - 12 * scaleY) +
      '" font-size="' + (22 * scaleX) + '" font-family="sans-serif" font-weight="bold" fill="#fff" stroke="#001018" stroke-width="' +
      (4 * scaleX) + '" paint-order="stroke">SPAWN / FULL SPRITE / FEET</text>',
    ].join('');
  }

  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '">' + rects.join('') + polygonLines + spawn + '</svg>',
  );
}

interface VisionSample {
  row: number;
  col: number;
  origin: VisionPoint;
  points: VisionPoint[];
}

function findWalkableVisionOrigin(centerX: number, centerY: number): VisionPoint | null {
  if (isPlayerPositionWalkable(grid, centerX, centerY)) {
    return { x: centerX, y: centerY + FEET_OFFSET_Y };
  }
  for (let radius = 12; radius <= 240; radius += 12) {
    for (let angleIndex = 0; angleIndex < 32; angleIndex++) {
      const angle = (angleIndex / 32) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const anchorY = centerY + Math.sin(angle) * radius;
      if (isPlayerPositionWalkable(grid, x, anchorY)) {
        return { x, y: anchorY + FEET_OFFSET_Y };
      }
    }
  }
  return null;
}

function makeVisionSvg(
  samples: readonly VisionSample[],
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  offsetX = 0,
  offsetY = 0,
): Buffer {
  // Offsets let the same world-space samples be rendered into either the full
  // map preview or a tile-local overlay. Tile SVGs must match the cropped image
  // dimensions because Sharp applies extract before composite in its pipeline.
  const shapes = samples.map(sample => {
    const path = sample.points.map((point, index) =>
      (index === 0 ? 'M' : 'L') +
      (point.x * scaleX - offsetX).toFixed(2) + ' ' +
      (point.y * scaleY - offsetY).toFixed(2),
    ).join(' ') + ' Z';
    const x = sample.origin.x * scaleX - offsetX;
    const y = sample.origin.y * scaleY - offsetY;
    const label = 'R' + (sample.row + 1) + 'C' + (sample.col + 1);
    return [
      '<path d="' + path + '" fill="#00e5ff" fill-opacity="0.09" stroke="#00e5ff" stroke-opacity="0.72" stroke-width="' + (2 * scaleX) + '"/>',
      '<circle cx="' + x + '" cy="' + y + '" r="' + (8 * scaleX) + '" fill="#00e5ff" stroke="#001018" stroke-width="' + (2 * scaleX) + '"/>',
      '<text x="' + (x + 12 * scaleX) + '" y="' + (y - 12 * scaleY) + '" font-size="' + (18 * scaleX) +
      '" font-family="sans-serif" font-weight="bold" fill="#fff" stroke="#001018" stroke-width="' + (4 * scaleX) +
      '" paint-order="stroke">' + label + '</text>',
    ].join('');
  }).join('');
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '">' + shapes + '</svg>',
  );
}

const tileWidth = 900;
const tileHeight = 650;
const columnStarts = [0, 775, 1550, MAP_W - tileWidth];
const rowStarts = [0, 604, MAP_H - tileHeight];
const visionSamples: VisionSample[] = [];
for (let row = 0; row < rowStarts.length; row++) {
  for (let col = 0; col < columnStarts.length; col++) {
    const left = columnStarts[col];
    const top = rowStarts[row];
    const centerX = Math.min(MAP_W - 1, left + tileWidth / 2);
    const centerY = Math.min(MAP_H - 1, top + tileHeight / 2);
    const origin = findWalkableVisionOrigin(centerX, centerY);
    if (!origin) {
      console.warn('No walkable vision origin found for tile R' + (row + 1) + 'C' + (col + 1));
      continue;
    }
    const raw = computeVisibilityPolygon(origin.x, origin.y, 260, shadowGrid, narrowOccluders, true, narrowSegments);
    const points = smoothVisibilityPolygon(raw, origin, 3);
    visionSamples.push({ row, col, origin, points });
  }
}

await sharp(mapPath).composite([{
  input: makeOverlaySvg(grid, metadata.width!, metadata.height!, pngScale.x, pngScale.y, '#ff1744', 0.32, true),
}]).png().toFile(outputPath);
await sharp(mapPath).composite([{
  input: makeOverlaySvg(shadowGrid, metadata.width!, metadata.height!, pngScale.x, pngScale.y, '#00b0ff', 0.38, false),
}]).png().toFile(outputShadowPath);
await sharp(mapPath).composite([{
  input: makeVisionSvg(visionSamples, metadata.width!, metadata.height!, pngScale.x, pngScale.y),
}]).png().toFile(outputVisionPath);
await sharp(webpPath).composite([{
  input: makeOverlaySvg(grid, webpMetadata.width!, webpMetadata.height!, webpScale.x, webpScale.y, '#ff1744', 0.32, true),
}]).png().toFile(outputWebpPath);
await reference.composite([{
  input: makeOverlaySvg(grid, referenceMeta.width!, referenceMeta.height!, refScale.x, refScale.y, '#ff1744', 0.32, true),
}]).png().toFile(referenceOutputPath);

// Inspect the whole map and a deliberately overlapping 4×3 set of zoomed regions.
mkdirSync(tileDir, { recursive: true });
for (let row = 0; row < rowStarts.length; row++) {
  for (let col = 0; col < columnStarts.length; col++) {
    const left = columnStarts[col];
    const top = rowStarts[row];
    const width = Math.min(tileWidth, MAP_W - left);
    const height = Math.min(tileHeight, MAP_H - top);
    const stem = 'tile-r' + (row + 1) + '-c' + (col + 1);
    const extract = {
      left: Math.round(left * pngScale.x),
      top: Math.round(top * pngScale.y),
      width: Math.round(width * pngScale.x),
      height: Math.round(height * pngScale.y),
    };
    await sharp(outputPath).extract(extract).png().toFile(path.join(tileDir, stem + '-collision.png'));
    await sharp(outputShadowPath).extract(extract).png().toFile(path.join(tileDir, stem + '-shadow.png'));
    const sample = visionSamples.find(item => item.row === row && item.col === col);
    if (sample) {
      const visionSvg = makeVisionSvg(
        [sample], extract.width, extract.height, pngScale.x, pngScale.y, extract.left, extract.top,
      );
      await sharp(mapPath).extract(extract).composite([{ input: visionSvg }]).png()
        .toFile(path.join(tileDir, stem + '-vision.png'));
    }
  }
}

console.log(JSON.stringify({
  collision: outputPath,
  shadow: outputShadowPath,
  vision: outputVisionPath,
  reference: referenceOutputPath,
  tileDirectory: tileDir,
  tileCount: visionSamples.length,
  tileDimensions: tileWidth + 'x' + tileHeight,
  logicalMap: MAP_W + 'x' + MAP_H,
  png: metadata.width + 'x' + metadata.height,
  webp: webpMetadata.width + 'x' + webpMetadata.height,
  reference: referenceMeta.width + 'x' + referenceMeta.height,
  grid: FINE_COLS + 'x' + FINE_ROWS,
  blockedCells: grid.reduce((sum, cell) => sum + cell, 0),
  shadowCells: shadowGrid.reduce((sum, cell) => sum + cell, 0),
  walkableCells: grid.reduce((sum, cell) => sum + (cell === 0 ? 1 : 0), 0),
  feetOffsetPx: FEET_OFFSET_Y,
  spawn: { x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y, feetY: PLAYER_SPAWN_Y + FEET_OFFSET_Y },
}, null, 2));
