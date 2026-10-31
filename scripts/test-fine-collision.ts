import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINE_RLE_BASE64 } from '../lib/shared/src/collisionDataFine.js';
import {
  buildPreciseCollisionGrid,
  buildFineCollisionGridFromRle,
  FINE_COLS,
  FINE_ROWS,
  MAP_W,
  MAP_H,
  isBlocked,
} from '@workspace/shared/collisionMap';
import {
  buildNarrowShadowOccluders,
  buildShadowGrid,
} from '../artifacts/telegram-game/src/game/visibility.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const referencePath = path.join(root, 'attached_assets/IMG_2907_1783632830477.jpeg');
const { data, info } = await sharp(referencePath).raw().toBuffer({ resolveWithObject: true });
const useCandidatePayload = process.argv.includes('--candidate');
const payloadSource = useCandidatePayload
  ? readFileSync(path.join(root, 'lib/shared/src/collisionDataFine.generated-preview.ts'), 'utf8')
  : '';
const candidateMatch = useCandidatePayload
  ? payloadSource.match(/FINE_RLE_BASE64\s*=\s*"([^"]+)"/)
  : null;
if (useCandidatePayload && !candidateMatch) {
  throw new Error('Generated fine collision preview has no canonical Base64 payload');
}
const payloadToTest = candidateMatch?.[1] ?? FINE_RLE_BASE64;
const grid = useCandidatePayload
  ? buildFineCollisionGridFromRle(payloadToTest)
  : buildPreciseCollisionGrid();

// Independently decode the committed Base64/LEB128 payload. This catches
// truncated streams, invalid characters, malformed runs and dimension drift.
function decodeCanonicalPayload(encoded: string): Uint8Array {
  assert.ok(/^[A-Za-z0-9+/]+$/.test(encoded), 'payload uses only unpadded Base64 characters');
  assert.notEqual(encoded.length % 4, 1, 'Base64 has a valid encoded length');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of encoded) {
    const value = alphabet.indexOf(character);
    assert.notEqual(value, -1, 'payload contains a valid Base64 character');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  assert.ok(bits === 0 || bits === 2 || bits === 4, 'Base64 has a valid final bit count');
  assert.equal(buffer, 0, 'unused trailing Base64 bits are zero');

  const decoded = new Uint8Array(FINE_COLS * FINE_ROWS);
  let input = 0;
  let output = 0;
  let value: 0 | 1 = 0;
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
      assert.ok(byteCount <= 4, 'RLE run length uses a bounded unsigned varint');
    } while ((byte & 0x80) !== 0);
    if (byteCount > 1) assert.notEqual(byte & 0x7f, 0, 'varints use their shortest representation');
    assert.ok(runLength > 0 || runIndex === 0,
      'only the leading run may be zero-length when the first cell is blocked');
    assert.ok(output + runLength <= decoded.length, 'RLE runs never exceed declared dimensions');
    decoded.fill(value, output, output + runLength);
    output += runLength;
    value = value === 0 ? 1 : 0;
    runIndex++;
  }
  assert.equal(output, FINE_COLS * FINE_ROWS, 'RLE covers every declared cell exactly');
  return decoded;
}
const independentlyDecoded = decodeCanonicalPayload(payloadToTest);
assert.equal(independentlyDecoded.length, 680 * 392);
assert.deepEqual(independentlyDecoded, grid, 'fine collision decoder consumes the selected canonical/candidate payload');

const shadowGrid = buildShadowGrid(grid);
assert.equal(grid.length, FINE_COLS * FINE_ROWS, 'fine collision dimensions match the source grid');
assert.equal(FINE_COLS, 680);
assert.equal(FINE_ROWS, 392);

function pointInPolygon(x: number, y: number, points: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const crosses = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

// The octagonal decorative planter is intentionally omitted from movement and
// vision geometry. Its outline must not become a wall or room-sized shadow.
const gardenPolygon = [
  [690, 135], [735, 125], [780, 135], [800, 170], [805, 220],
  [785, 260], [750, 280], [705, 275], [670, 250], [655, 215], [660, 175],
] as const;

const scaleX = MAP_W / info.width;
const scaleY = MAP_H / info.height;
let redLineSamples = 0;
let redLineBlocked = 0;
for (let y = 0; y < info.height; y += 2) {
  for (let x = 0; x < info.width; x += 2) {
    const offset = (y * info.width + x) * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const isRed = r > 110 && r - g > 28 && r - b > 28 && g < 170 && b < 170;
    if (!isRed || pointInPolygon(x, y, gardenPolygon)) continue;
    redLineSamples++;
    if (isBlocked(grid, x * scaleX, y * scaleY)) redLineBlocked++;
  }
}
const redLineCoverage = redLineSamples ? redLineBlocked / redLineSamples : 0;
assert.ok(redLineSamples > 20_000, 'reference contains enough traced boundary samples to validate');
assert.ok(redLineCoverage >= 0.995,
  'fine collision must cover at least 99.5% of the hand-traced red-line boundary outside the garden; actual coverage was ' +
  (redLineCoverage * 100).toFixed(3) + '%');

const blockedSamples: readonly [number, number][] = [
  [100, 100], [300, 300], [300, 500], [1250, 600],
  [2450, 900], [400, 1500], [2600, 1600], [1600, 1800],
];
for (const [x, y] of blockedSamples) {
  assert.equal(isBlocked(grid, x, y), true, 'traced wall/prop must block at ' + x + ',' + y);
}
const walkableSamples: readonly [number, number][] = [
  [500, 500], [1200, 500], [1500, 800], [1700, 800],
  [2000, 800], [3000, 1000], [1200, 1500], [1800, 1500],
  [1600, 100], [1600, 250],
];
for (const [x, y] of walkableSamples) {
  assert.equal(isBlocked(grid, x, y), false, 'authored floor remains walkable at ' + x + ',' + y);
}

// Garden perimeter/floor is traversable; only the statue base is a blocker.
for (const [x, y] of [[1640, 449], [1810, 449], [1600, 550], [1860, 550]] as const) {
  assert.equal(isBlocked(grid, x, y), false, 'decorative garden floor remains walkable');
}
assert.equal(isBlocked(grid, 1735, 556), true, 'statue base remains a precise movement obstacle');

// Collision and vision are separate: the garden and statue footprint do not
// become a large square shadow; the statue is a small dedicated visual circle.
const fineCell = (x: number, y: number) =>
  Math.floor(y / (MAP_H / FINE_ROWS)) * FINE_COLS + Math.floor(x / (MAP_W / FINE_COLS));
for (const [x, y] of [[1640, 449], [1810, 449], [1600, 550], [1860, 550]] as const) {
  assert.equal(shadowGrid[fineCell(x, y)], 0, 'walkable garden floor must not cast a hard shadow');
}
assert.equal(shadowGrid[fineCell(1250, 600)], 1, 'architectural wall remains a vision occluder');
assert.equal(shadowGrid[fineCell(1735, 556)], 0, 'statue is not rasterized as a square shadow');
// The upper-atrium table remains solid for movement but transparent to vision.
assert.equal(isBlocked(grid, 1740, 210), true, 'upper-atrium table still blocks player movement');
assert.equal(shadowGrid[fineCell(1740, 210)], 0, 'upper-atrium table does not cast a broad shadow');
const statue = buildNarrowShadowOccluders(grid, true).find(item =>
  Math.hypot(item.x - 1735, item.y - 556) < 1,
);
assert.ok(statue, 'tall statue has its own narrow vision occluder');
assert.ok(statue.radius >= 20 && statue.radius <= 30, 'statue occluder follows its measured base');

assert.equal(isBlocked(grid, -1, 100), true, 'out-of-map coordinates remain blocked');
assert.equal(isBlocked(grid, MAP_W + 1, 100), true, 'east map boundary remains blocked');

console.log(JSON.stringify({
  fineGrid: FINE_COLS + 'x' + FINE_ROWS,
  cellPx: { x: MAP_W / FINE_COLS, y: MAP_H / FINE_ROWS },
  payloadSource: useCandidatePayload ? 'generated source-art preview' : 'committed canonical',
  redLineCoverage: Number((redLineCoverage * 100).toFixed(3)) + '%',
  redLineSamples,
  blockedCells: grid.reduce((sum, cell) => sum + cell, 0),
  shadowCells: shadowGrid.reduce((sum, cell) => sum + cell, 0),
  garden: 'walkable, non-occluding',
  statue: { x: statue.x, y: statue.y, radius: statue.radius },
}, null, 2));
