// One-off analysis script: builds a pixel-accurate collision grid from the
// red-line reference image and writes it out as a compact RLE-encoded
// TypeScript module the game imports at runtime.
//
// Algorithm:
//  1. Decode the reference JPEG to raw RGB pixels.
//  2. Classify each pixel as "red line" if it matches the traced red-line hue,
//     then dilate slightly to close hairline JPEG-compression gaps in thin
//     strokes so flood-fill can't leak through them.
//  3. Flood-fill from every border pixel across non-wall pixels -> "outside"
//     (background, outside the whole facility outline) = blocked.
//  4. Connected-component-label every remaining non-wall, non-outside pixel.
//     The big components are room floors (walkable); small components are
//     furniture/vehicles/machinery fully enclosed by their own inner red
//     outline within a room (blocked). A size threshold separates the two,
//     verified against the actual size distribution (rooms are >>10x larger
//     than the largest obstacle blob in this reference image).
//  5. Downsample the full-resolution boolean mask to the game's logical grid
//     (COLS x ROWS at CELL px/cell) by majority vote per cell.
import sharp from 'sharp';
import { writeFileSync } from 'fs';

const ROOT = new URL('../../', import.meta.url);
const SRC = new URL('attached_assets/IMG_2907_1783632830477.jpeg', ROOT).pathname;
const OUT = new URL('artifacts/telegram-game/src/game/collisionData.ts', ROOT).pathname;

// Logical game grid (must match collisionMap.ts constants)
const MAP_W = 1040;
const MAP_H = 580;
const CELL = 10; // divides both dimensions evenly: 104 x 58 cells
const COLS = MAP_W / CELL;
const ROWS = MAP_H / CELL;

// Obstacle-vs-room size threshold in source-image pixels (see debug analysis:
// obstacle blobs top out ~5.3k px, room floors start ~9.4k px in this image).
const COMPONENT_SIZE_THRESHOLD = 7000;

// Small props (traffic cones, bins, signs, barrels — anything under this pixel
// area) only block the ground they actually stand on, not their whole traced
// silhouette. Isometric sprites are drawn taller than their footprint, so
// blocking the full outline made walkways feel checkerboarded with obstacles
// the player should be able to walk past. Only the bottom fraction (the base)
// of the component's bounding box stays blocked; the rest becomes walkable.
// Only applied to roughly squarish blobs (cones, bins) — long flat/thin
// components (curbs, pipe cross-sections) keep their full footprint blocked,
// since "top vs base" doesn't make sense for something that isn't upright.
const SMALL_PROP_MAX_SIZE = 3000;
const SMALL_PROP_BASE_FRACTION = 0.35;
const SMALL_PROP_MIN_ASPECT = 0.4; // min(w,h)/max(w,h)

function isRedPixel(data: Buffer, idx: number): boolean {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return r > 110 && r - g > 28 && r - b > 28 && g < 170 && b < 170;
}

function dilate(mask: Uint8Array, width: number, height: number, iters: number): Uint8Array {
  let m = mask;
  for (let it = 0; it < iters; it++) {
    const nm = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (m[idx]) { nm[idx] = 1; continue; }
        let hit = 0;
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1 && !hit; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (m[ny * width + nx]) hit = 1;
          }
        }
        nm[idx] = hit as 0 | 1;
      }
    }
    m = nm;
  }
  return m;
}

async function main() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const N = width * height;

  const red = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (isRedPixel(data, i * channels)) red[i] = 1;
  }
  const wall = dilate(red, width, height, 2);

  // Flood-fill "outside" from the image border across non-wall pixels.
  const outside = new Uint8Array(N);
  {
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (wall[idx] || outside[idx]) return;
      outside[idx] = 1;
      stack.push(idx);
    };
    for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
    for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width, y = (idx / width) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
  }

  // Connected-component label the remaining "inside candidate" pixels,
  // tracking each component's bounding box so small props can be reduced to
  // a base-only footprint afterward.
  const compId = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const bboxes: [number, number, number, number][] = []; // minX, minY, maxX, maxY
  for (let start = 0; start < N; start++) {
    if (wall[start] || outside[start] || compId[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const stack = [start];
    compId[start] = id;
    while (stack.length) {
      const idx = stack.pop()!;
      size++;
      const x = idx % width, y = (idx / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neigh: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of neigh) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (wall[nidx] || outside[nidx] || compId[nidx] !== -1) continue;
        compId[nidx] = id;
        stack.push(nidx);
      }
    }
    sizes.push(size);
    bboxes.push([minX, minY, maxX, maxY]);
  }

  // blocked = wall OR outside OR (inside component below the room-size
  // threshold). Small, roughly-square (prop-scale) components only block
  // their base — the bottom fraction of their bounding box — not the full
  // silhouette. Also track wall/outside separately from the rest so the
  // downsample step below can hold real walls/boundaries to a stricter bar
  // than furniture-scale interior blocking.
  const blocked = new Uint8Array(N);
  const wallOrOutside = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (wall[i] || outside[i]) { blocked[i] = 1; wallOrOutside[i] = 1; continue; }
    const id = compId[i];
    const size = sizes[id];
    if (size >= COMPONENT_SIZE_THRESHOLD) { blocked[i] = 0; continue; }
    if (size >= SMALL_PROP_MAX_SIZE) { blocked[i] = 1; continue; }
    const [minX, minY, maxX, maxY] = bboxes[id];
    const w = maxX - minX, h = maxY - minY;
    const aspect = w > 0 && h > 0 ? Math.min(w, h) / Math.max(w, h) : 0;
    if (aspect < SMALL_PROP_MIN_ASPECT) { blocked[i] = 1; continue; } // flat/thin: not prop-shaped, keep fully blocked
    const y = (i / width) | 0;
    const baseStartY = maxY - h * SMALL_PROP_BASE_FRACTION;
    blocked[i] = y >= baseStartY ? 1 : 0;
  }
  const walkablePx = N - blocked.reduce((a, b) => a + b, 0);
  console.log(`image ${width}x${height}, components=${sizes.length}, walkable px=${walkablePx} (${((walkablePx / N) * 100).toFixed(1)}%)`);

  // Downsample to the logical grid via majority vote per cell. Two
  // thresholds: real walls/outside-boundary use the original conservative
  // bar (WALL_VOTE_THRESHOLD) so the outer boundary and room dividers can
  // never thin out or leak. Furniture/prop-interior blocking (which is what
  // was fragmenting open floors into disconnected islands near densely
  // packed small obstacles) requires a clearer majority
  // (INTERIOR_VOTE_THRESHOLD) before it can block a cell.
  const WALL_VOTE_THRESHOLD = 0.35;
  const INTERIOR_VOTE_THRESHOLD = 0.6;
  const scaleX = width / MAP_W;
  const scaleY = height / MAP_H;
  const grid = new Uint8Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const px0 = Math.floor(col * CELL * scaleX);
      const px1 = Math.floor((col + 1) * CELL * scaleX);
      const py0 = Math.floor(row * CELL * scaleY);
      const py1 = Math.floor((row + 1) * CELL * scaleY);
      let blockedVotes = 0, wallVotes = 0, total = 0;
      for (let y = py0; y < py1 && y < height; y++) {
        for (let x = px0; x < px1 && x < width; x++) {
          total++;
          const idx = y * width + x;
          if (blocked[idx]) blockedVotes++;
          if (wallOrOutside[idx]) wallVotes++;
        }
      }
      const isWall = total > 0 && wallVotes / total >= WALL_VOTE_THRESHOLD;
      const isInterior = total > 0 && blockedVotes / total >= INTERIOR_VOTE_THRESHOLD;
      grid[row * COLS + col] = isWall || isInterior ? 1 : 0;
    }
  }

  // RLE-encode row-major, alternating run lengths starting with a walkable(0) run.
  const runs: number[] = [];
  let cur = 0, runLen = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === cur) { runLen++; }
    else { runs.push(runLen); cur = grid[i]; runLen = 1; }
  }
  runs.push(runLen);

  const banner = `// AUTO-GENERATED by scripts/src/analyzeCollisionMap.ts from ${SRC.split('/').pop()}.
// Do not hand-edit — re-run the script if the reference image changes.
// RLE-encoded row-major grid: alternating run lengths starting with a
// walkable(0) run. Grid is COLS x ROWS cells of CELL px each.
export const CELL = ${CELL};
export const COLS = ${COLS};
export const ROWS = ${ROWS};
export const RUNS: number[] = [${runs.join(',')}];
`;
  writeFileSync(OUT, banner);
  console.log(`wrote ${OUT} (${runs.length} runs, grid ${COLS}x${ROWS}, cell=${CELL}px)`);
}

main();
