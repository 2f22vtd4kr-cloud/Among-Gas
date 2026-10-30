import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataPath = path.join(root, 'lib/shared/src/collisionData.ts');
const mapPath = path.join(root, 'artifacts/telegram-game/public/map-hires.png');
const outputPath = path.join(root, 'artifacts/telegram-game/collision-qa-overlay.png');

const source = fs.readFileSync(dataPath, 'utf8');
const readNumber = (name: string) => {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
  if (!match) throw new Error(`Missing collision constant ${name}`);
  return Number(match[1]);
};
const cols = readNumber('COLS');
const rows = readNumber('ROWS');
const runsMatch = source.match(/export const RUNS(?::\\s*number\\[\\])?\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;/);
if (!runsMatch) throw new Error('Could not parse canonical collision RLE');
const runs = runsMatch[1].split(',').map(value => Number(value.trim()));
const grid = new Uint8Array(cols * rows);
let cursor = 0;
let value = 0;
for (const run of runs) {
  if (!Number.isInteger(run) || run < 0 || cursor + run > grid.length) {
    throw new Error(`Invalid collision run at cell ${cursor}`);
  }
  grid.fill(value, cursor, cursor + run);
  cursor += run;
  value = 1 - value;
}
if (cursor !== grid.length) throw new Error(`Collision RLE covers ${cursor}, expected ${grid.length}`);

const map = sharp(mapPath);
const metadata = await map.metadata();
if (!metadata.width || !metadata.height) throw new Error('Map image dimensions unavailable');
const mapWidth = readNumber('MAP_W');
const mapHeight = readNumber('MAP_H');
if (metadata.width !== mapWidth || metadata.height !== mapHeight) {
  throw new Error(`Collision/map size mismatch: grid expects ${mapWidth}x${mapHeight}, image is ${metadata.width}x${metadata.height}`);
}
const cellWidth = mapWidth / cols;
const cellHeight = mapHeight / rows;
const rects: string[] = [];
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    if (grid[row * cols + col] !== 1) continue;
    const x = col * cellWidth;
    const y = row * cellHeight;
    rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellWidth.toFixed(2)}" height="${cellHeight.toFixed(2)}" fill="#ff1744" fill-opacity="0.34" stroke="#ff1744" stroke-opacity="0.8" stroke-width="1.1"/>`);
  }
}

// Render the exact player footprint at the configured solo spawn: three
// overlapping foot circles, with the visible-feet baseline highlighted.
const coords = fs.readFileSync(path.join(root, 'lib/shared/src/coords.ts'), 'utf8');
const spriteHeight = Math.round(36 * (mapWidth / 1652));
const feetOffset = Math.round(spriteHeight * (136 / (1401 / 9)) / 2);
const spawnX = Math.round(350 * mapWidth / 1040);
const spawnY = Math.round(150 * mapHeight / 580);
const feetY = spawnY + feetOffset;
const footprint = [
  `<circle cx="${spawnX}" cy="${feetY}" r="4" fill="#00e5ff" fill-opacity="0.9" stroke="#001018" stroke-width="2"/>`,
  `<circle cx="${spawnX - 10}" cy="${feetY}" r="4" fill="#00e5ff" fill-opacity="0.65" stroke="#001018" stroke-width="1.5"/>`,
  `<circle cx="${spawnX + 10}" cy="${feetY}" r="4" fill="#00e5ff" fill-opacity="0.65" stroke="#001018" stroke-width="1.5"/>`,
  `<line x1="${spawnX}" y1="${spawnY}" x2="${spawnX}" y2="${feetY}" stroke="#00e5ff" stroke-width="2" stroke-dasharray="5 4"/>`,
  `<circle cx="${spawnX}" cy="${spawnY}" r="9" fill="none" stroke="#fff" stroke-width="2"/>`,
  `<text x="${spawnX + 16}" y="${spawnY - 12}" font-size="22" font-family="sans-serif" font-weight="bold" fill="#fff" stroke="#001018" stroke-width="4" paint-order="stroke">PLAYER SPAWN / FEET</text>`,
].join('');
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${mapWidth}" height="${mapHeight}" viewBox="0 0 ${mapWidth} ${mapHeight}">${rects.join('')}${footprint}</svg>`);
await map.composite([{ input: svg }]).png().toFile(outputPath);
console.log(JSON.stringify({
  output: outputPath,
  map: `${mapWidth}x${mapHeight}`,
  grid: `${cols}x${rows}`,
  blockedCells: grid.reduce((sum, cell) => sum + cell, 0),
  walkableCells: grid.reduce((sum, cell) => sum + (cell === 0 ? 1 : 0), 0),
  feetOffsetPx: feetOffset,
  spawn: { x: spawnX, y: spawnY, feetY },
}, null, 2));
