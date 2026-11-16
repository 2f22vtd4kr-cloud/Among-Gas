import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CollisionWorld,
  validateCollisionDocument,
  type CollisionDocument,
} from "@workspace/shared/collision";
import {
  buildPreciseCollisionGrid,
  isPlayerPositionWalkable,
  isPlayerSpawnPositionClear,
  MAP_W,
  MAP_H,
} from "../../lib/shared/src/collisionMap.js";
import {
  FEET_OFFSET_Y,
  PLAYER_SPAWN_MIN_X,
  PLAYER_SPAWN_MAX_X,
  PLAYER_SPAWN_MAX_FEET_Y,
} from "../../lib/shared/src/coords.js";

const root = path.resolve(import.meta.dirname, "../..");
const candidatePath = path.join(root, "lib/shared/src/collision/collision.v1.json");
const STEP = 8;
const ORIGIN = STEP / 2;
const DIRECTIONS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
] as const;

const document = JSON.parse(await readFile(candidatePath, "utf8")) as CollisionDocument;
const documentErrors = validateCollisionDocument(document);
assert.deepEqual(documentErrors, [], "generated collision candidate must validate before parity sampling");
assert.equal(document.mapW, MAP_W);
assert.equal(document.mapH, MAP_H);

// The comparison intentionally uses the candidate's movement semantics only.
// Sight and shadow have separate acceptance gates and are never inferred here.
const movementShapes = document.shapes.filter(shape =>
  shape.blocksMove || shape.walkableRegion === true || shape.walkableRegionHole === true);
const vector = new CollisionWorld(movementShapes, document.mapW, document.mapH);
const raster = buildPreciseCollisionGrid();

const columns = Math.floor((MAP_W - ORIGIN - 1e-9) / STEP) + 1;
const rows = Math.floor((MAP_H - ORIGIN - 1e-9) / STEP) + 1;
const total = columns * rows;
const rasterWalkCache = new Uint8Array(total);
const vectorWalkCache = new Uint8Array(total);
const xAt = (column: number) => ORIGIN + column * STEP;
const yAt = (row: number) => ORIGIN + row * STEP;

function rasterWalkable(index: number): boolean {
  if (rasterWalkCache[index] === 0) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    rasterWalkCache[index] = isPlayerPositionWalkable(raster, xAt(column), yAt(row)) ? 1 : 2;
  }
  return rasterWalkCache[index] === 1;
}

function vectorWalkable(index: number): boolean {
  if (vectorWalkCache[index] === 0) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    vectorWalkCache[index] = vector.isPlayerWalkableAtFeet(
      xAt(column),
      yAt(row) + FEET_OFFSET_Y,
    ) ? 1 : 2;
  }
  return vectorWalkCache[index] === 1;
}

function rasterPathWalkable(from: number, to: number): boolean {
  const fromColumn = from % columns, fromRow = Math.floor(from / columns);
  const toColumn = to % columns, toRow = Math.floor(to / columns);
  const ax = xAt(fromColumn), ay = yAt(fromRow);
  const bx = xAt(toColumn), by = yAt(toRow);
  const distance = Math.hypot(bx - ax, by - ay);
  const samples = Math.max(1, Math.ceil(distance / 2));
  for (let sample = 0; sample <= samples; sample++) {
    const t = sample / samples;
    if (!isPlayerPositionWalkable(raster, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function vectorPathWalkable(from: number, to: number): boolean {
  const fromColumn = from % columns, fromRow = Math.floor(from / columns);
  const toColumn = to % columns, toRow = Math.floor(to / columns);
  const ax = xAt(fromColumn), ay = yAt(fromRow) + FEET_OFFSET_Y;
  const bx = xAt(toColumn), by = yAt(toRow) + FEET_OFFSET_Y;
  const distance = Math.hypot(bx - ax, by - ay);
  const samples = Math.max(1, Math.ceil(distance / 2));
  for (let sample = 0; sample <= samples; sample++) {
    const t = sample / samples;
    if (!vector.isPlayerWalkableAtFeet(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function collectReachable(
  canStand: (index: number) => boolean,
  canSweep: (from: number, to: number) => boolean,
  isSpawnClear: (x: number, y: number) => boolean,
): Uint8Array {
  const reached = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;

  // Every legal spawn position in the canonical lobby spawn rectangle is a
  // valid root. This avoids privileging a single arbitrary spawn slot.
  const firstColumn = Math.max(0, Math.ceil((PLAYER_SPAWN_MIN_X - ORIGIN) / STEP));
  const lastColumn = Math.min(columns - 1, Math.floor((PLAYER_SPAWN_MAX_X - ORIGIN) / STEP));
  const lastSpawnRow = Math.min(rows - 1, Math.floor(
    (PLAYER_SPAWN_MAX_FEET_Y - FEET_OFFSET_Y - ORIGIN) / STEP,
  ));
  for (let row = 0; row <= lastSpawnRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const index = row * columns + column;
      const x = xAt(column), y = yAt(row);
      if (isSpawnClear(x, y) && canStand(index)) {
        reached[index] = 1;
        queue[tail++] = index;
      }
    }
  }
  assert.ok(tail > 0, "each collision model must expose at least one valid lobby spawn sample");

  while (head < tail) {
    const current = queue[head++];
    const column = current % columns;
    const row = Math.floor(current / columns);
    for (const [dx, dy] of DIRECTIONS) {
      const nextColumn = column + dx, nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      const next = nextRow * columns + nextColumn;
      if (reached[next] || !canStand(next) || !canSweep(current, next)) continue;
      reached[next] = 1;
      queue[tail++] = next;
    }
  }
  return reached;
}

const rasterReachable = collectReachable(
  rasterWalkable,
  rasterPathWalkable,
  (x, y) => isPlayerSpawnPositionClear(raster, x, y),
);
const vectorReachable = collectReachable(
  vectorWalkable,
  vectorPathWalkable,
  (x, y) => vector.isPlayerSpawnPositionClear(x, y),
);

let unionCount = 0;
let vectorWalkableRasterBlocked = 0;
let rasterWalkableVectorBlocked = 0;
const hash = createHash("sha256");
hash.update(`among-gas-raster-vector-parity-v1|map=${MAP_W}x${MAP_H}|step=${STEP}|origin=${ORIGIN}\n`);
for (let index = 0; index < total; index++) {
  const inRaster = rasterReachable[index] === 1;
  const inVector = vectorReachable[index] === 1;
  if (!inRaster && !inVector) continue;
  unionCount++;
  const column = index % columns, row = Math.floor(index / columns);
  const x = xAt(column), y = yAt(row);
  const rasterOpen = rasterWalkable(index);
  const vectorOpen = vectorWalkable(index);
  if (vectorOpen && !rasterOpen) vectorWalkableRasterBlocked++;
  if (rasterOpen && !vectorOpen) rasterWalkableVectorBlocked++;
  hash.update(`${x},${y},${inRaster ? 1 : 0},${inVector ? 1 : 0}\n`);
}

const sampleSetSha256 = hash.digest("hex");
const vectorOnlyRatio = vectorWalkableRasterBlocked / Math.max(1, unionCount);
const rasterOnlyRatio = rasterWalkableVectorBlocked / Math.max(1, unionCount);
const report = {
  footprintContract: "three-circle-player-footprint",
  sampleDomain: "union-of-raster-and-vector-spawn-reachable",
  sampleStepPx: STEP,
  unionSpawnReachableSampleCount: unionCount,
  vectorWalkableRasterBlocked,
  rasterWalkableVectorBlocked,
  vectorWalkableRasterBlockedRatio: Number(vectorOnlyRatio.toFixed(6)),
  rasterWalkableVectorBlockedRatio: Number(rasterOnlyRatio.toFixed(6)),
  sampleSetSha256,
  candidateSha256: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
  candidateSourceKind: document.source?.kind ?? "unattributed",
};
console.log(JSON.stringify(report, null, 2));

assert.ok(unionCount >= 1_000, "parity denominator must contain at least 1,000 union-reachable samples");
assert.ok(vectorOnlyRatio <= 0.02,
  `vector-walkable/raster-blocked disagreement ${(vectorOnlyRatio * 100).toFixed(2)}% exceeds 2%`);
assert.ok(rasterOnlyRatio <= 0.02,
  `raster-walkable/vector-blocked disagreement ${(rasterOnlyRatio * 100).toFixed(2)}% exceeds 2%`);
console.log("PASS: two-way raster/vector parity over the union of spawn-reachable full-footprint positions.");
