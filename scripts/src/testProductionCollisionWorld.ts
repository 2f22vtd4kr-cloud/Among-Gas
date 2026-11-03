import assert from "node:assert/strict";
import {
  PRODUCTION_COLLISION_DOCUMENT,
  PRODUCTION_COLLISION_WORLD,
} from "@workspace/shared/collision/productionWorld";
import { validateCollisionDocument } from "@workspace/shared/collision";
import {
  buildPreciseCollisionGrid,
  isPlayerFootprintWalkableAtFeet,
  isPlayerSpawnPositionClear,
} from "@workspace/shared/collisionMap";
import {
  FINE_CELL_X,
  FINE_CELL_Y,
  FINE_COLS,
  FINE_ROWS,
} from "@workspace/shared/collisionDataFine";
import {
  FEET_OFFSET_Y,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from "@workspace/shared/coords";
import { buildNarrowShadowOccluders } from "../../artifacts/telegram-game/src/game/visibility.js";

const world = PRODUCTION_COLLISION_WORLD;
const document = PRODUCTION_COLLISION_DOCUMENT;
const raster = buildPreciseCollisionGrid();

assert.equal(document.version, 1);
assert.equal(document.mapW, 3224);
assert.equal(document.mapH, 1858);
assert.ok(document.shapes.length >= 80, "production geometry must include the traced map features");
assert.deepEqual(validateCollisionDocument(document), [], "generated production geometry and source manifest must validate");
assert.equal(document.source?.kind, "fine-grid-derived");
assert.equal(document.source?.fineGrid.cols, FINE_COLS);
assert.equal(document.source?.fineGrid.rows, FINE_ROWS);
assert.equal(document.source?.shapeCounts.total, document.shapes.length);
assert.ok(document.source?.sourceFiles.redlineReference.sha256, "the original red-line reference hash is recorded");
assert.ok(document.shapes.some(shape => shape.id.startsWith("movement-cell-")));
assert.ok(document.shapes.some(shape => shape.id.startsWith("sight-area-")));
assert.ok(document.shapes.some(shape => shape.id.startsWith("sight-segment-")));

const rasterSpawnClear = isPlayerSpawnPositionClear(raster, PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
assert.equal(world.isPlayerSpawnPositionClear(PLAYER_SPAWN_X, PLAYER_SPAWN_Y), rasterSpawnClear,
  "vector spawn clearance must preserve the complete visible-sprite rectangle contract");
assert.equal(rasterSpawnClear, true, "the authored production spawn remains clear");

// Compare the generated vector footprint against the exact fine-grid movement
// predicate across a deterministic spread of the complete map.
const offsets: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.5],
  [0.25, 0.75],
  [0.75, 0.25],
];
let paritySamples = 0;
let parityMismatches = 0;
const mismatchExamples: Array<{ x: number; y: number; raster: boolean; vector: boolean }> = [];
for (let row = 0; row < FINE_ROWS; row += 2) {
  for (let col = 0; col < FINE_COLS; col += 2) {
    for (const [ox, oy] of offsets) {
      const x = (col + ox) * FINE_CELL_X;
      const y = (row + oy) * FINE_CELL_Y;
      const rasterWalkable = isPlayerFootprintWalkableAtFeet(raster, x, y);
      const vectorWalkable = world.isPlayerWalkableAtFeet(x, y);
      paritySamples++;
      if (rasterWalkable !== vectorWalkable) {
        parityMismatches++;
        if (mismatchExamples.length < 12) {
          mismatchExamples.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, raster: rasterWalkable, vector: vectorWalkable });
        }
      }
    }
  }
}
assert.equal(parityMismatches, 0,
  `vector movement must preserve the fine-grid footprint at all ${paritySamples} sampled points; mismatches: ${JSON.stringify(mismatchExamples)}`);

// Known source-art probes: the central garden floor is walkable, while the
// actual statue base remains solid. The obsolete circular shadow is not present.
for (const [x, y, expected] of [
  [1640, 449, true],
  [1810, 449, true],
  [1735, 449, true],
  [1735, 556, false],
] as const) {
  assert.equal(world.isPlayerWalkableAtFeet(x, y), isPlayerFootprintWalkableAtFeet(raster, x, y),
    `vector/raster footprint parity at ${x},${y}`);
  assert.equal(world.isPlayerWalkableAtFeet(x, y), expected,
    `authored garden/statue footprint at ${x},${y}`);
}
const narrowOccluders = buildNarrowShadowOccluders(raster, true);
assert.equal(narrowOccluders.some(item => Math.hypot(item.x - 1735, item.y - 556) < 1), false,
  "the misplaced statue shadow circle must not return");
assert.ok(narrowOccluders.length > 0 && narrowOccluders.length < 100,
  "the small manual occluder set remains mobile-safe");
assert.equal(world.isLineOfSightClear(1600, 556, 1800, 556), false,
  "the real statue-base outline, not a detached circle, blocks the sight ray");

// Print the source parking-garage movement mask for review. This makes any
// remaining collision on painted parking markings visible in CI logs.
const garageCols = Math.ceil(270 / FINE_CELL_X);
const garageRows = Math.ceil(180 / FINE_CELL_Y);
const garageAscii: string[] = [];
for (let row = 0; row < garageRows; row++) {
  let line = "";
  for (let col = 0; col < garageCols; col++) {
    const x = (col + 0.5) * FINE_CELL_X;
    const y = (row + 0.5) * FINE_CELL_Y;
    line += isPlayerFootprintWalkableAtFeet(raster, x, y) ? "." : "#";
  }
  garageAscii.push(line);
}
console.log("[parking-garage-footprint-mask]\n" + garageAscii.join("\n"));

const navigation = world.rasterizePlayerNav(208, 116);
assert.equal(navigation.cols, 208);
assert.equal(navigation.rows, 116);
assert.equal(navigation.walk.length, 208 * 116);
assert.ok(navigation.walk.some(value => value === 1), "navigation raster must contain walkable cells");
assert.ok(navigation.walk.some(value => value === 0), "navigation raster must contain blocked cells");

const visibility = world.visibility(PLAYER_SPAWN_X, PLAYER_SPAWN_Y + FEET_OFFSET_Y, 120);
assert.ok(visibility.length >= 32, "the vector sight layer must return a complete polygon at spawn");

console.log(JSON.stringify({
  ok: true,
  shapes: document.shapes.length,
  paritySamples,
  parityMismatches,
  movementShapes: document.source?.shapeCounts.movementRectangles,
  sightShapes: (document.source?.shapeCounts.sightRectangles ?? 0) +
    (document.source?.shapeCounts.sightSegments ?? 0) +
    (document.source?.shapeCounts.narrowOccluders ?? 0),
  narrowOccluders: narrowOccluders.length,
  navigationCells: navigation.walk.length,
  visibilityVertices: visibility.length,
}, null, 2));
