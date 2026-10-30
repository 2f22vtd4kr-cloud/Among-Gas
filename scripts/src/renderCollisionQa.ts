import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCollisionGrid,
  COLS,
  ROWS,
  MAP_W,
  MAP_H,
  MANUAL_BLOCKED_POLYGONS,
} from '@workspace/shared/collisionMap';
import {
  FEET_OFFSET_Y,
  PLAYER_RADIUS,
  PLAYER_HALF_WIDTH,
  PLAYER_SPRITE_HALF_WIDTH_PX,
  PLAYER_SPRITE_HALF_HEIGHT_PX,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from '@workspace/shared/coords';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.join(root, 'artifacts/telegram-game/public/map-hires.png');
const webpPath = path.join(root, 'artifacts/telegram-game/public/map-hires.webp');
const referencePath = path.join(root, 'attached_assets/IMG_2907_1783632830477.jpeg');
const outputPath = path.join(root, 'artifacts/telegram-game/collision-qa-overlay.png');
const outputWebpPath = path.join(root, 'artifacts/telegram-game/collision-qa-overlay-webp.png');
const referenceOutputPath = path.join(root, 'artifacts/telegram-game/collision-reference-overlay.png');

const grid = buildCollisionGrid();
const map = sharp(mapPath);
const metadata = await map.metadata();
const webpMetadata = await sharp(webpPath).metadata();
const reference = sharp(referencePath);
const referenceMeta = await reference.metadata();
for (const [label, meta] of [['PNG', metadata], ['WebP', webpMetadata], ['reference', referenceMeta]] as const) {
  if (!meta.width || !meta.height) throw new Error(`${label} map image dimensions unavailable`);
}
const scaleFor = (width: number, height: number, label: string, requireUpscale = true) => {
  const scaleX = width / MAP_W;
  const scaleY = height / MAP_H;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) ||
      Math.abs(scaleX - scaleY) > 0.002 || (requireUpscale && scaleX < 1)) {
    throw new Error(`${label} dimensions ${width}x${height} do not match logical map ${MAP_W}x${MAP_H}`);
  }
  return { x: scaleX, y: scaleY };
};
const pngScale = scaleFor(metadata.width!, metadata.height!, 'PNG');
const webpScale = scaleFor(webpMetadata.width!, webpMetadata.height!, 'WebP');
const refScale = scaleFor(referenceMeta.width!, referenceMeta.height!, 'red-line reference', false);
if (metadata.width !== webpMetadata.width || metadata.height !== webpMetadata.height) {
  throw new Error('PNG and WebP map assets must have identical native dimensions');
}

function makeOverlaySvg(
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  includeSpawn: boolean,
): Buffer {
  const cellWidth = (MAP_W / COLS) * scaleX;
  const cellHeight = (MAP_H / ROWS) * scaleY;
  const rects: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row * COLS + col] !== 1) continue;
      const x = col * cellWidth;
      const y = row * cellHeight;
      rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellWidth.toFixed(2)}" height="${cellHeight.toFixed(2)}" fill="#ff1744" fill-opacity="0.32" stroke="#ff1744" stroke-opacity="0.72" stroke-width="1.0"/>`);
    }
  }

  const polygonLines = MANUAL_BLOCKED_POLYGONS.map(polygon => {
    const points = polygon.points.map(([x, y]) => `${(x * scaleX).toFixed(2)},${(y * scaleY).toFixed(2)}`).join(' ');
    return `<polygon points="${points}" fill="none" stroke="#ffd740" stroke-width="${3 * scaleX}" stroke-linejoin="round"/>`;
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
    spawn = [
      `<rect x="${x - halfSpriteWidth}" y="${y - halfSpriteHeight}" width="${halfSpriteWidth * 2}" height="${halfSpriteHeight * 2}" fill="#00e5ff" fill-opacity="0.08" stroke="#00e5ff" stroke-width="${2 * scaleX}" stroke-dasharray="${6 * scaleX} ${4 * scaleX}"/>`,
      `<circle cx="${x}" cy="${feetY}" r="${radius}" fill="#00e5ff" fill-opacity="0.85" stroke="#001018" stroke-width="${2 * scaleX}"/>`,
      `<circle cx="${x - halfWidth}" cy="${feetY}" r="${radius}" fill="#00e5ff" fill-opacity="0.55" stroke="#001018" stroke-width="${1.5 * scaleX}"/>`,
      `<circle cx="${x + halfWidth}" cy="${feetY}" r="${radius}" fill="#00e5ff" fill-opacity="0.55" stroke="#001018" stroke-width="${1.5 * scaleX}"/>`,
      `<line x1="${x}" y1="${y}" x2="${x}" y2="${feetY}" stroke="#00e5ff" stroke-width="${2 * scaleX}" stroke-dasharray="${5 * scaleX} ${4 * scaleX}"/>`,
      `<text x="${x + 16 * scaleX}" y="${y - 12 * scaleY}" font-size="${22 * scaleX}" font-family="sans-serif" font-weight="bold" fill="#fff" stroke="#001018" stroke-width="${4 * scaleX}" paint-order="stroke">SPAWN / FULL SPRITE / FEET</text>`,
    ].join('');
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects.join('')}${polygonLines}${spawn}</svg>`);
}

await map.composite([{ input: makeOverlaySvg(metadata.width!, metadata.height!, pngScale.x, pngScale.y, true) }]).png().toFile(outputPath);
await sharp(webpPath).composite([{ input: makeOverlaySvg(webpMetadata.width!, webpMetadata.height!, webpScale.x, webpScale.y, true) }]).png().toFile(outputWebpPath);
await reference.composite([{ input: makeOverlaySvg(referenceMeta.width!, referenceMeta.height!, refScale.x, refScale.y, true) }]).png().toFile(referenceOutputPath);

console.log(JSON.stringify({
  output: outputPath,
  outputWebp: outputWebpPath,
  referenceOutput: referenceOutputPath,
  logicalMap: `${MAP_W}x${MAP_H}`,
  png: `${metadata.width}x${metadata.height}`,
  webp: `${webpMetadata.width}x${webpMetadata.height}`,
  reference: `${referenceMeta.width}x${referenceMeta.height}`,
  grid: `${COLS}x${ROWS}`,
  blockedCells: grid.reduce((sum, cell) => sum + cell, 0),
  walkableCells: grid.reduce((sum, cell) => sum + (cell === 0 ? 1 : 0), 0),
  feetOffsetPx: FEET_OFFSET_Y,
  spawn: { x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y, feetY: PLAYER_SPAWN_Y + FEET_OFFSET_Y },
}, null, 2));
