// Generates collision data from the actual artwork PNG (no red-line reference needed).
//
// Algorithm:
//  1. Sample the 4 image corners to establish the "outside background" colour.
//  2. Mark every pixel as "background" if its colour is close enough to that sample.
//  3. Flood-fill from every border pixel across background-coloured pixels → "outside" = blocked.
//  4. For pixels that are inside the map boundary, use darkness to detect obstacles:
//     low-luminance pixels (walls, furniture, machinery) are blocked.
//  5. Flood-fill the walkable interior to split large room floors from small obstacle pockets.
//  6. Downsample to the 104×58 logical grid by majority vote.
import sharp from 'sharp';
import { writeFileSync } from 'fs';

const ROOT = new URL('../../', import.meta.url);
const SRC  = new URL('artifacts/telegram-game/public/map-hires.png', ROOT).pathname;
const OUT  = new URL('artifacts/telegram-game/src/game/collisionData.ts', ROOT).pathname;

const CELL = 10;
const COLS = 104;
const ROWS = 58;

// Tuning knobs — tweak if too many/few cells are blocked.
const BG_DIST_THRESHOLD   = 34;   // max colour distance from background sample → "outside"
const DARK_LUM_THRESHOLD  = 38;   // only truly near-black wall outlines; shadowy floors stay walkable
const COMP_SIZE_THRESHOLD = 1200; // obstacle blobs smaller than this (in source px) are blocked

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

function lum(r: number, g: number, b: number) {
  return 0.299*r + 0.587*g + 0.114*b;
}

async function main() {
  const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  console.log(`image ${width}x${height} ch=${channels}`);
  const N = width * height;

  // --- 1. Sample background colour from corners ---------------------------------
  const cornerPts = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [4, 4], [width - 5, 4], [4, height - 5], [width - 5, height - 5],
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [x, y] of cornerPts) {
    const i = (y * width + x) * channels;
    bgR += data[i]; bgG += data[i+1]; bgB += data[i+2];
  }
  bgR /= cornerPts.length; bgG /= cornerPts.length; bgB /= cornerPts.length;
  console.log(`background colour sample: rgb(${bgR.toFixed(0)},${bgG.toFixed(0)},${bgB.toFixed(0)})`);

  // --- 2. Mark background-coloured pixels ---------------------------------------
  const bgMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const off = i * channels;
    if (colorDist(data[off], data[off+1], data[off+2], bgR, bgG, bgB) <= BG_DIST_THRESHOLD) {
      bgMask[i] = 1;
    }
  }

  // --- 3. Flood-fill "outside" from image border --------------------------------
  const outside = new Uint8Array(N);
  {
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (!bgMask[idx] || outside[idx]) return;
      outside[idx] = 1;
      stack.push(idx);
    };
    for (let x = 0; x < width; x++)  { push(x, 0); push(x, height - 1); }
    for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width, y = (idx / width) | 0;
      push(x-1, y); push(x+1, y); push(x, y-1); push(x, y+1);
    }
  }

  // --- 4. Inside the map: dark pixels are obstacles -----------------------------
  const obstacle = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (outside[i]) continue;
    const off = i * channels;
    if (lum(data[off], data[off+1], data[off+2]) < DARK_LUM_THRESHOLD) obstacle[i] = 1;
  }

  // --- 5. Connected components of non-obstacle, non-outside interior pixels -----
  const compId = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < N; start++) {
    if (outside[start] || obstacle[start] || compId[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    compId[start] = id;
    while (stack.length) {
      const idx = stack.pop()!;
      size++;
      const x = idx % width, y = (idx / width) | 0;
      for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]] as [number,number][]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (outside[nidx] || obstacle[nidx] || compId[nidx] !== -1) continue;
        compId[nidx] = id;
        stack.push(nidx);
      }
    }
    sizes.push(size);
  }
  console.log(`components=${sizes.length}, top5 sizes=${[...sizes].sort((a,b)=>b-a).slice(0,5).join(',')}`);

  // --- 6. Build blocked mask ----------------------------------------------------
  const blocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (outside[i] || obstacle[i]) { blocked[i] = 1; continue; }
    if (compId[i] !== -1 && sizes[compId[i]] < COMP_SIZE_THRESHOLD) { blocked[i] = 1; }
  }

  // --- 7. Downsample to logical grid by majority vote ---------------------------
  const scaleX = width / (COLS * CELL);  // src px per logical px
  const scaleY = height / (ROWS * CELL);
  const grid = new Uint8Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const px0 = Math.floor(col * CELL * scaleX);
      const px1 = Math.floor((col + 1) * CELL * scaleX);
      const py0 = Math.floor(row * CELL * scaleY);
      const py1 = Math.floor((row + 1) * CELL * scaleY);
      let bv = 0, total = 0;
      for (let y = py0; y < py1 && y < height; y++) {
        for (let x = px0; x < px1 && x < width; x++) {
          total++;
          if (blocked[y * width + x]) bv++;
        }
      }
      grid[row * COLS + col] = total > 0 && bv / total >= 0.40 ? 1 : 0;
    }
  }

  // --- 8. RLE-encode ------------------------------------------------------------
  const runs: number[] = [];
  let cur = 0, runLen = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === cur) { runLen++; }
    else { runs.push(runLen); cur = grid[i]; runLen = 1; }
  }
  runs.push(runLen);

  const walkable = grid.reduce((s, v) => s + (v === 0 ? 1 : 0), 0);
  console.log(`grid ${COLS}x${ROWS}, walkable cells=${walkable}/${COLS*ROWS} (${(walkable/(COLS*ROWS)*100).toFixed(1)}%), runs=${runs.length}`);

  const banner =
`// AUTO-GENERATED by scripts/src/analyzeCollisionMapArt.ts from map-hires.png.
// Do not hand-edit — re-run the script if the map image changes.
// RLE-encoded row-major grid: alternating run lengths starting with a
// walkable(0) run. Grid is COLS x ROWS cells of CELL px each.
export const CELL = ${CELL};
export const COLS = ${COLS};
export const ROWS = ${ROWS};
export const RUNS: number[] = [${runs.join(',')}];
`;
  writeFileSync(OUT, banner);
  console.log(`wrote ${OUT}`);
}

main();
