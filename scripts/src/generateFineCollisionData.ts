/**
 * Deterministic high-resolution collision-mask generator.
 *
 * The generated preview is intentionally separate from production data.
 * Review the fine collision and shadow overlays before using --write to
 * promote a regenerated mask into lib/shared/src/collisionDataFine.ts.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'attached_assets/IMG_2907_1783632830477.jpeg');
const canonicalPath = path.join(root, 'lib/shared/src/collisionDataFine.ts');
const previewPath = path.join(root, 'lib/shared/src/collisionDataFine.generated-preview.ts');

const FINE_COLS = 680;
const FINE_ROWS = 392;
const COMPONENT_SIZE_THRESHOLD = 8000;
const SMALL_PROP_MAX_SIZE = 3000;
const SMALL_PROP_BASE_FRACTION = 0.35;
const SMALL_PROP_MIN_ASPECT = 0.4;
const GARDEN_POLYGON: readonly (readonly [number, number])[] = [
  [690, 135], [735, 125], [780, 135], [800, 170], [805, 220],
  [785, 260], [750, 280], [705, 275], [670, 250], [655, 215], [660, 175],
];
const STATUE_BASE = { cx: 730, cy: 234, rx: 10, ry: 8 };

function isRedPixel(data: Buffer, idx: number): boolean {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return r > 110 && r - g > 28 && r - b > 28 && g < 170 && b < 170;
}

function dilate(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  let current = mask;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const nextMask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (current[index]) { nextMask[index] = 1; continue; }
        let hit = false;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1 && !hit; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && current[ny * width + nx]) hit = true;
          }
        }
        nextMask[index] = hit ? 1 : 0;
      }
    }
    current = nextMask;
  }
  return current;
}

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

function encodeVarintRuns(grid: Uint8Array): string {
  const bytes: number[] = [];
  let current = 0;
  let runLength = 0;
  const pushRun = (value: number) => {
    let remaining = value;
    while (remaining >= 128) {
      bytes.push((remaining & 0x7f) | 0x80);
      remaining = Math.floor(remaining / 128);
    }
    bytes.push(remaining);
  };
  for (const cell of grid) {
    if (cell === current) runLength++;
    else {
      pushRun(runLength);
      current = cell;
      runLength = 1;
    }
  }
  pushRun(runLength);
  return Buffer.from(bytes).toString('base64');
}

async function main(): Promise<void> {
  const { data, info } = await sharp(sourcePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (width !== 1359 || height !== 784) {
    throw new Error('Unexpected red-line reference dimensions: ' + width + 'x' + height);
  }
  const total = width * height;
  const red = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (isRedPixel(data, i * channels)) red[i] = 1;
  }
  const wall = dilate(red, width, height, 2);

  // Flood-fill exterior/background from all image borders through non-wall pixels.
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (index < 0 || index >= total || wall[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  // Label interior components and retain their size/bounds for prop-base reduction.
  const componentIds = new Int32Array(total).fill(-1);
  const componentSizes: number[] = [];
  const componentBounds: [number, number, number, number][] = [];
  const componentQueue = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (wall[start] || outside[start] || componentIds[start] !== -1) continue;
    const id = componentSizes.length;
    let componentHead = 0;
    let componentTail = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    componentQueue[componentTail++] = start;
    componentIds[start] = id;
    while (componentHead < componentTail) {
      const index = componentQueue[componentHead++];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || wall[next] || outside[next] || componentIds[next] !== -1) continue;
        componentIds[next] = id;
        componentQueue[componentTail++] = next;
      }
    }
    componentSizes.push(componentTail);
    componentBounds.push([minX, minY, maxX, maxY]);
  }

  const blocked = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (wall[i] || outside[i]) { blocked[i] = 1; continue; }
    const id = componentIds[i];
    const size = componentSizes[id];
    if (size >= COMPONENT_SIZE_THRESHOLD) continue;
    if (size >= SMALL_PROP_MAX_SIZE) { blocked[i] = 1; continue; }
    const [minX, minY, maxX, maxY] = componentBounds[id];
    const componentWidth = maxX - minX;
    const componentHeight = maxY - minY;
    const aspect = componentWidth > 0 && componentHeight > 0
      ? Math.min(componentWidth, componentHeight) / Math.max(componentWidth, componentHeight)
      : 0;
    if (aspect < SMALL_PROP_MIN_ASPECT) { blocked[i] = 1; continue; }
    const y = Math.floor(i / width);
    const baseStartY = maxY - componentHeight * SMALL_PROP_BASE_FRACTION;
    if (y >= baseStartY) blocked[i] = 1;
  }

  // Explicit spatial exception: the decorative planter perimeter is walkable.
  const [minGardenX, minGardenY] = GARDEN_POLYGON.reduce(
    (bounds, point) => [Math.min(bounds[0], point[0]), Math.min(bounds[1], point[1])],
    [width, height],
  );
  const [maxGardenX, maxGardenY] = GARDEN_POLYGON.reduce(
    (bounds, point) => [Math.max(bounds[0], point[0]), Math.max(bounds[1], point[1])],
    [0, 0],
  );
  for (let y = minGardenY; y <= maxGardenY; y++) {
    for (let x = minGardenX; x <= maxGardenX; x++) {
      if (pointInPolygon(x, y, GARDEN_POLYGON)) blocked[y * width + x] = 0;
    }
  }
  // Restore only the statue's small ground-contact footprint.
  for (let y = STATUE_BASE.cy - STATUE_BASE.ry; y <= STATUE_BASE.cy + STATUE_BASE.ry; y++) {
    for (let x = STATUE_BASE.cx - STATUE_BASE.rx; x <= STATUE_BASE.cx + STATUE_BASE.rx; x++) {
      const dx = (x - STATUE_BASE.cx) / STATUE_BASE.rx;
      const dy = (y - STATUE_BASE.cy) / STATUE_BASE.ry;
      if (dx * dx + dy * dy <= 1) blocked[y * width + x] = 1;
    }
  }

  // 2×2 conservative reduction keeps thin red-line walls while producing
  // 4.74px world cells — much finer than the legacy 31×32px grid.
  const fine = new Uint8Array(FINE_COLS * FINE_ROWS);
  for (let row = 0; row < FINE_ROWS; row++) {
    for (let col = 0; col < FINE_COLS; col++) {
      const x = col * 2;
      const y = row * 2;
      const a = y * width + x;
      fine[row * FINE_COLS + col] =
        blocked[a] || blocked[a + 1] || blocked[a + width] || blocked[a + width + 1] ? 1 : 0;
    }
  }

  const base64 = encodeVarintRuns(fine);
  const candidate = [
    '/** Generated candidate; promote only after reviewing fine collision and shadow overlays. */',
    'export const FINE_COLS = ' + FINE_COLS + ';',
    'export const FINE_ROWS = ' + FINE_ROWS + ';',
    'export const FINE_RLE_BASE64 = "' + base64 + '";',
    '',
  ].join('\n');
  writeFileSync(previewPath, candidate);

  const canonical = readFileSync(canonicalPath, 'utf8');
  const match = canonical.match(/FINE_RLE_BASE64\s*=\s*["'`]([^"'`]+)["'`]/);
  const matchesCanonical = Boolean(match && match[1] === base64);
  if (process.argv.includes('--check') && !matchesCanonical) {
    throw new Error('Committed fine collision RLE differs from the reviewed source-art candidate. Run pnpm --filter @workspace/scripts run regenerate:fine-collision and review the diff.');
  }
  if (process.argv.includes('--write')) {
    const header = [
      '/**',
      ' * High-resolution map collision mask generated from',
      ' * attached_assets/IMG_2907_1783632830477.jpeg.',
      ' * Source dimensions: 1359×784 reference pixels.',
      ' * Runtime dimensions: 680×392 cells (2×2 conservative source-pixel reduction).',
      ' * The central decorative garden perimeter is deliberately walkable;',
      ' * only the statue base footprint remains blocked.',
      ' * RLE: alternating walkable/blocked runs, starting with walkable (0),',
      ' * encoded as unsigned LEB128 varints and Base64.',
      ' */',
      'export const FINE_COLS = ' + FINE_COLS + ';',
      'export const FINE_ROWS = ' + FINE_ROWS + ';',
      'export const FINE_RLE_BASE64 = "' + base64 + '";',
      '',
    ].join('\n');
    writeFileSync(canonicalPath, header);
  }

  console.log(JSON.stringify({
    source: width + 'x' + height,
    fineGrid: FINE_COLS + 'x' + FINE_ROWS,
    components: componentSizes.length,
    blockedCells: fine.reduce((sum, cell) => sum + cell, 0),
    candidateBase64Length: base64.length,
    matchesCanonical,
    preview: previewPath,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
