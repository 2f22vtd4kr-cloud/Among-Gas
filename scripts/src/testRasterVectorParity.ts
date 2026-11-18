import assert from "node:assert/strict";
import { measureRasterVectorParity } from "./measureRasterVectorParity.js";

const base = {
  mapW: 128,
  mapH: 128,
  spawnFeetX: 32,
  spawnFeetY: 64,
  stepPx: 4,
};

const open = () => true;
const identical = measureRasterVectorParity({
  ...base,
  rasterWalkable: open,
  vectorWalkable: open,
});
assert.equal(identical.passed, true, "identical full-footprint worlds should pass");
assert.equal(identical.vectorWalkableRasterBlocked, 0);
assert.equal(identical.rasterWalkableVectorBlocked, 0);
assert.equal(identical.vectorReachableRasterUnreachable, 0);
assert.equal(identical.rasterReachableVectorUnreachable, 0);
assert.ok(identical.unionSpawnReachableSampleCount >= 1_000);
assert.match(identical.sampleSetSha256, /^[a-f0-9]{64}$/);

const rasterWall = (x: number, _y: number) => !(x >= 60 && x <= 68);
const vectorOpen = measureRasterVectorParity({
  ...base,
  rasterWalkable: rasterWall,
  vectorWalkable: open,
});
assert.ok(vectorOpen.vectorWalkableRasterBlocked > 0,
  "vector-only walkable positions must be counted in the vector-to-raster direction");
assert.equal(vectorOpen.rasterWalkableVectorBlocked, 0);
assert.ok(vectorOpen.vectorWalkableRasterBlockedRatio > 0.02,
  "the unchanged 2% vector-to-raster ceiling must fail when exceeded");
assert.equal(vectorOpen.passed, false);
assert.ok(vectorOpen.vectorReachableRasterUnreachable > 0,
  "the union must preserve positions reachable only in the vector graph");

const vectorWall = (x: number, _y: number) => !(x >= 60 && x <= 68);
const rasterOpen = measureRasterVectorParity({
  ...base,
  rasterWalkable: open,
  vectorWalkable: vectorWall,
});
assert.equal(rasterOpen.vectorWalkableRasterBlocked, 0);
assert.ok(rasterOpen.rasterWalkableVectorBlocked > 0,
  "raster-only walkable positions must be counted in the raster-to-vector direction");
assert.ok(rasterOpen.rasterWalkableVectorBlockedRatio > 0.02,
  "the unchanged 2% raster-to-vector ceiling must fail when exceeded");
assert.equal(rasterOpen.passed, false);
assert.ok(rasterOpen.rasterReachableVectorUnreachable > 0,
  "the union must preserve positions reachable only in the raster graph");

const repeated = measureRasterVectorParity({
  ...base,
  rasterWalkable: open,
  vectorWalkable: open,
});
assert.equal(repeated.sampleSetSha256, identical.sampleSetSha256,
  "the deterministic union sample set digest must be stable across identical runs");

const cornerCut = measureRasterVectorParity({
  mapW: 8,
  mapH: 8,
  spawnFeetX: 0,
  spawnFeetY: 0,
  stepPx: 4,
  rasterWalkable: (x, y) => !((x === 4 && y === 0) || (x === 0 && y === 4)),
  vectorWalkable: (x, y) => !((x === 4 && y === 0) || (x === 0 && y === 4)),
});
assert.equal(cornerCut.unionSpawnReachableSampleCount, 1,
  "diagonal movement must not pass between two blocked orthogonal neighbours");

assert.throws(() => measureRasterVectorParity({
  ...base,
  stepPx: 9,
  rasterWalkable: open,
  vectorWalkable: open,
}), /1px through 8px/, "sampling coarser than the existing 8px ceiling must be rejected");

assert.throws(() => measureRasterVectorParity({
  ...base,
  rasterWalkable: () => false,
  vectorWalkable: open,
}), /Raster production spawn is not full-footprint walkable/,
"the production spawn must be walkable in both candidate worlds");

console.log("PASS: deterministic two-way three-circle raster/vector parity, union reachability, swept edges, no corner cutting and unchanged 2% limits.");
