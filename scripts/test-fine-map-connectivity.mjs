import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const fineSource = read('../lib/shared/src/collisionDataFine.ts');
const overrideSource = read('../lib/shared/src/collisionOverrides.ts');
const coordsSource = read('../lib/shared/src/coords.ts');

const payload = fineSource.match(/FINE_RLE_BASE64\s*=\s*"([^"]+)"/)?.[1];
assert.ok(payload, 'canonical fine collision RLE payload exists');
const cols = 680, rows = 392, mapW = 3224, mapH = 1858;
const cellX = mapW / cols, cellY = mapH / rows;
const bytes = Buffer.from(payload, 'base64');
const grid = new Uint8Array(cols * rows);
let input = 0, output = 0, value = 0;
while (input < bytes.length) {
  let length = 0, multiplier = 1, byte;
  do {
    assert.ok(input < bytes.length, 'RLE varint is complete');
    byte = bytes[input++];
    length += (byte & 0x7f) * multiplier;
    multiplier *= 128;
    assert.ok(multiplier <= 0x100000000, 'RLE varint is bounded');
  } while (byte & 0x80);
  assert.ok(output + length <= grid.length, 'RLE stays within declared dimensions');
  grid.fill(value, output, output + length);
  output += length;
  value = 1 - value;
}
assert.equal(output, grid.length, 'RLE fills the complete fine grid');

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}
const polygonMatch = overrideSource.match(/blockedPolygons:\s*\[\[([\s\S]*?)\]\]/);
if (polygonMatch) {
  const points = [...polygonMatch[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(points.length >= 3, 'authored blocked override polygon has at least three points');
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  for (let row = Math.max(0, Math.floor(Math.min(...ys) / cellY)); row <= Math.min(rows - 1, Math.ceil(Math.max(...ys) / cellY)); row++) {
    for (let col = Math.max(0, Math.floor(Math.min(...xs) / cellX)); col <= Math.min(cols - 1, Math.ceil(Math.max(...xs) / cellX)); col++) {
      if (pointInPolygon((col + 0.5) * cellX, (row + 0.5) * cellY, points)) grid[row * cols + col] = 1;
    }
  }
}
const bounds = [...overrideSource.matchAll(/bounds:\s*\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g)]
  .map((match) => match.slice(1).map(Number));
for (const [minX, minY, maxX, maxY] of bounds) {
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = (col + 0.5) * cellX, y = (row + 0.5) * cellY;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) grid[row * cols + col] = 0;
  }
}

const radius = Number(coordsSource.match(/PLAYER_RADIUS\s*=\s*(\d+)/)?.[1]);
const halfWidth = Number(coordsSource.match(/PLAYER_HALF_WIDTH\s*=\s*(\d+)/)?.[1]);
assert.ok(Number.isFinite(radius) && Number.isFinite(halfWidth), 'player collision footprint constants exist');
function blocked(x, y) {
  const col = Math.floor(x / cellX), row = Math.floor(y / cellY);
  return col < 0 || col >= cols || row < 0 || row >= rows || grid[row * cols + col] === 1;
}
function playerCenterWalkable(x, y) {
  const circumferenceSamples = Math.max(8, Math.ceil((2 * Math.PI * radius) / (Math.min(cellX, cellY) * 0.5)));
  for (const offset of [-halfWidth, 0, halfWidth]) {
    if (blocked(x + offset, y)) return false;
    for (let i = 0; i < circumferenceSamples; i++) {
      const angle = (i / circumferenceSamples) * Math.PI * 2;
      if (blocked(x + offset + Math.cos(angle) * radius, y + Math.sin(angle) * radius)) return false;
    }
  }
  return true;
}

const valid = new Uint8Array(grid.length);
for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
  if (playerCenterWalkable((col + 0.5) * cellX, (row + 0.5) * cellY)) valid[row * cols + col] = 1;
}
const componentOf = new Int32Array(grid.length);
componentOf.fill(-1);
const componentSizes = [];
const componentBounds = [];
for (let start = 0; start < valid.length; start++) {
  if (!valid[start] || componentOf[start] !== -1) continue;
  const id = componentSizes.length, queue = [start];
  let minCol = cols, minRow = rows, maxCol = -1, maxRow = -1;
  componentOf[start] = id;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], col = index % cols, row = Math.floor(index / cols);
    minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nextCol = col + dc, nextRow = row + dr;
      if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) continue;
      if (dc !== 0 && dr !== 0 &&
          (!valid[row * cols + nextCol] || !valid[nextRow * cols + col])) continue;
      const next = nextRow * cols + nextCol;
      if (valid[next] && componentOf[next] === -1) {
        componentOf[next] = id;
        queue.push(next);
      }
    }
  }
  componentSizes.push(queue.length);
  componentBounds.push([Math.round(minCol * cellX), Math.round(minRow * cellY), Math.round((maxCol + 1) * cellX), Math.round((maxRow + 1) * cellY)]);
}
const spawnX = Math.round(450 * mapW / 1040);
const spawnY = Math.round(150 * mapH / 580);
const spawnIndex = Math.floor(spawnY / cellY) * cols + Math.floor(spawnX / cellX);
assert.ok(componentOf[spawnIndex] >= 0, 'configured player spawn has valid full-footprint clearance');
const spawnComponent = componentOf[spawnIndex];

// Render a component-coloured map for visual diagnosis. This is emitted even
// when the release assertion below fails, so the CI artifact shows exactly
// which rooms/corridors are detached instead of reducing the failure to a count.
const componentPixels = Buffer.alloc(cols * rows * 4);
for (let index = 0; index < componentOf.length; index++) {
  const id = componentOf[index];
  if (id < 0) continue;
  const hue = (id * 137.508) % 360;
  const chroma = 0.72, sector = hue / 60, x = chroma * (1 - Math.abs((sector % 2) - 1));
  let rgb;
  if (sector < 1) rgb = [chroma, x, 0];
  else if (sector < 2) rgb = [x, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, x];
  else if (sector < 4) rgb = [0, x, chroma];
  else if (sector < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  const offset = index * 4;
  componentPixels[offset] = Math.round((rgb[0] + 0.28) * 255);
  componentPixels[offset + 1] = Math.round((rgb[1] + 0.28) * 255);
  componentPixels[offset + 2] = Math.round((rgb[2] + 0.28) * 255);
  componentPixels[offset + 3] = id === spawnComponent ? 165 : 125;
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mapPath = path.join(root, 'artifacts/telegram-game/public/map-hires.png');
const outputPath = path.join(root, 'artifacts/telegram-game/fine-connectivity-components.png');
const componentOverlay = await sharp(componentPixels, { raw: { width: cols, height: rows, channels: 4 } })
  .resize(mapW, mapH, { kernel: 'nearest' }).png().toBuffer();
await sharp(mapPath).composite([{ input: componentOverlay, blend: 'over' }]).png().toFile(outputPath);
console.log('Fine-grid component visual: ' + outputPath);
const significant = componentSizes
  .map((size, id) => ({ id, size, bounds: componentBounds[id] }))
  .filter(({ size }) => size >= 1000)
  .sort((a, b) => b.size - a.size);
console.log(JSON.stringify({
  fineGrid: { cols, rows, cellX, cellY },
  playerFootprint: { radius, halfWidth },
  components: componentSizes.length,
  significantComponents: significant,
  spawnComponent,
  spawnComponentCells: componentSizes[spawnComponent],
}, null, 2));

// A disconnected region large enough to hold meaningful gameplay is not harmless
// raster speckle: it strands players/tasks and must be connected to the spawn
// network or explicitly documented as a non-playable region.
assert.equal(significant.filter(({ id }) => id !== spawnComponent).length, 0,
  'all significant player-clearance regions must connect to the configured spawn network');
