import assert from "node:assert/strict";
import {
  buildPreciseCollisionGrid,
  isPlayerPositionWalkable,
  MAP_H,
  MAP_W,
  MANUAL_WALKABLE_REPLACEMENT_ZONES,
} from "../lib/shared/src/collisionMap.js";
import { getPrimaryMapAuthoringZone } from "../lib/shared/src/collision/mapZones.js";
import { getProductionCollisionWorld } from "../lib/shared/src/collision/productionWorld.js";

const raster = buildPreciseCollisionGrid();
const vector = getProductionCollisionWorld();
const SAMPLE_STEP_PX = 8;
const MAX_DIRECTIONAL_MISMATCH_PCT = 2;

const insideApprovedOverride = (x: number, y: number): boolean =>
  MANUAL_WALKABLE_REPLACEMENT_ZONES.some(({ bounds }) =>
    x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]
  );

let samples = 0;
let bothWalkable = 0;
let bothBlocked = 0;
let vectorOnly = 0;
let rasterOnly = 0;
const vectorOnlyByZone: Record<string, number> = {};
const vectorOnlyExamples: Array<{ x: number; y: number; zone: string }> = [];
const rasterOnlyExamples: Array<{ x: number; y: number; zone: string }> = [];

for (let y = 40; y <= MAP_H - 80; y += SAMPLE_STEP_PX) {
  for (let x = 40; x <= MAP_W - 40; x += SAMPLE_STEP_PX) {
    // The two currently approved, explicitly measured source-mask replacements
    // are not raster-parity regressions; compare the remaining map unchanged.
    if (insideApprovedOverride(x, y)) continue;
    samples++;
    const rasterWalkable = isPlayerPositionWalkable(raster, x, y);
    const vectorWalkable = isPlayerPositionWalkable(vector, x, y);
    if (rasterWalkable && vectorWalkable) {
      bothWalkable++;
      continue;
    }
    if (!rasterWalkable && !vectorWalkable) {
      bothBlocked++;
      continue;
    }
    const zone = getPrimaryMapAuthoringZone(x, y) ?? "outside";
    if (vectorWalkable) {
      vectorOnly++;
      vectorOnlyByZone[zone] = (vectorOnlyByZone[zone] ?? 0) + 1;
      if (vectorOnlyExamples.length < 20) vectorOnlyExamples.push({ x, y, zone });
    } else {
      rasterOnly++;
      if (rasterOnlyExamples.length < 20) rasterOnlyExamples.push({ x, y, zone });
    }
  }
}

const vectorOnlyPct = samples > 0 ? (vectorOnly / samples) * 100 : 0;
const rasterOnlyPct = samples > 0 ? (rasterOnly / samples) * 100 : 0;
const summary = {
  sampleStepPx: SAMPLE_STEP_PX,
  samples,
  bothWalkable,
  bothBlocked,
  vectorWalkableRasterBlocked: vectorOnly,
  rasterWalkableVectorBlocked: rasterOnly,
  vectorOnlyPct: Number(vectorOnlyPct.toFixed(2)),
  rasterOnlyPct: Number(rasterOnlyPct.toFixed(2)),
  vectorOnlyByZone,
  vectorOnlyExamples,
  rasterOnlyExamples,
};
console.log("[vector/raster player-footprint parity]", JSON.stringify(summary));

assert.ok(
  vectorOnlyPct <= MAX_DIRECTIONAL_MISMATCH_PCT,
  "Vector collision allows player footprints rejected by the current reviewed fine-grid source in " +
    vectorOnlyPct.toFixed(2) + "% of sampled positions (limit " +
    MAX_DIRECTIONAL_MISMATCH_PCT + "%). Trace and review the missing floor/wall geometry; do not waive this by changing the threshold.",
);
assert.ok(
  rasterOnlyPct <= MAX_DIRECTIONAL_MISMATCH_PCT,
  "Vector collision rejects player footprints accepted by the current reviewed fine-grid source in " +
    rasterOnlyPct.toFixed(2) + "% of sampled positions (limit " +
    MAX_DIRECTIONAL_MISMATCH_PCT + "%). Review every new boundary against the source art.",
);

console.log("VECTOR/RASTER PLAYER-FOOTPRINT PARITY PASSED");
