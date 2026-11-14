import assert from "node:assert/strict";
import {
  buildPreciseCollisionGrid,
  isPlayerPositionWalkable,
  MAP_H,
  MAP_W,
  MANUAL_WALKABLE_REPLACEMENT_ZONES,
} from "../lib/shared/src/collisionMap.js";
import { FEET_OFFSET_Y } from "../lib/shared/src/coords.js";
import { getPrimaryMapAuthoringZone } from "../lib/shared/src/collision/mapZones.js";
import { isBotNavigationReachable } from "../lib/shared/src/collision/botNavigation.js";
import { getProductionCollisionDocument, getProductionCollisionWorld } from "../lib/shared/src/collision/productionWorld.js";

const raster = buildPreciseCollisionGrid();
const vector = getProductionCollisionWorld();
const document = getProductionCollisionDocument();
assert.equal(document.source?.rasterConstraint?.kind, "fine-grid-blocked-cell-union",
  "candidate movement geometry must carry an explicit fine-grid topology constraint");
assert.equal(document.source?.rasterConstraint?.cols, 680);
assert.equal(document.source?.rasterConstraint?.rows, 392);
assert.ok((document.source?.rasterConstraint?.mergedRectangles ?? 0) > 1000,
  "candidate must preserve the blocked-cell union as indexed vector solids");

const SAMPLE_STEP_PX = 8;
const MAX_REACHABLE_DIRECTIONAL_MISMATCH_PCT = 2;

const insideApprovedOverride = (x: number, y: number): boolean =>
  MANUAL_WALKABLE_REPLACEMENT_ZONES.some(({ bounds }) =>
    x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3]
  );

let mapSamples = 0;
let mapVectorOnly = 0;
let mapRasterOnly = 0;
let reachableSamples = 0;
let reachableBothWalkable = 0;
let reachableBothBlocked = 0;
let reachableVectorOnly = 0;
let reachableRasterOnly = 0;
const vectorOnlyByZone: Record<string, number> = {};
const vectorOnlyExamples: Array<{ x: number; y: number; zone: string }> = [];
const rasterOnlyExamples: Array<{ x: number; y: number; zone: string }> = [];

for (let y = 40; y <= MAP_H - 80; y += SAMPLE_STEP_PX) {
  for (let x = 40; x <= MAP_W - 40; x += SAMPLE_STEP_PX) {
    if (insideApprovedOverride(x, y)) continue;
    const rasterWalkable = isPlayerPositionWalkable(raster, x, y);
    const vectorWalkable = isPlayerPositionWalkable(vector, x, y);
    mapSamples++;
    if (vectorWalkable && !rasterWalkable) mapVectorOnly++;
    if (rasterWalkable && !vectorWalkable) mapRasterOnly++;

    // Disconnected/off-floor areas are separately owned by the zone/region
    // review process. For bot parity, compare the exact spawn-reachable graph.
    if (!isBotNavigationReachable(x, y + FEET_OFFSET_Y)) continue;
    reachableSamples++;
    if (rasterWalkable && vectorWalkable) {
      reachableBothWalkable++;
      continue;
    }
    if (!rasterWalkable && !vectorWalkable) {
      reachableBothBlocked++;
      continue;
    }
    const zone = getPrimaryMapAuthoringZone(x, y) ?? "outside";
    if (vectorWalkable) {
      reachableVectorOnly++;
      vectorOnlyByZone[zone] = (vectorOnlyByZone[zone] ?? 0) + 1;
      if (vectorOnlyExamples.length < 20) vectorOnlyExamples.push({ x, y, zone });
    } else {
      reachableRasterOnly++;
      if (rasterOnlyExamples.length < 20) rasterOnlyExamples.push({ x, y, zone });
    }
  }
}

const mapVectorOnlyPct = mapSamples > 0 ? (mapVectorOnly / mapSamples) * 100 : 0;
const mapRasterOnlyPct = mapSamples > 0 ? (mapRasterOnly / mapSamples) * 100 : 0;
const vectorOnlyPct = reachableSamples > 0 ? (reachableVectorOnly / reachableSamples) * 100 : 100;
const rasterOnlyPct = reachableSamples > 0 ? (reachableRasterOnly / reachableSamples) * 100 : 100;
const summary = {
  sampleStepPx: SAMPLE_STEP_PX,
  mapSamples,
  mapVectorWalkableRasterBlockedPct: Number(mapVectorOnlyPct.toFixed(2)),
  mapRasterWalkableVectorBlockedPct: Number(mapRasterOnlyPct.toFixed(2)),
  spawnReachableSamples: reachableSamples,
  reachableBothWalkable,
  reachableBothBlocked,
  reachableVectorWalkableRasterBlocked: reachableVectorOnly,
  reachableRasterWalkableVectorBlocked: reachableRasterOnly,
  reachableVectorOnlyPct: Number(vectorOnlyPct.toFixed(2)),
  reachableRasterOnlyPct: Number(rasterOnlyPct.toFixed(2)),
  reachableVectorOnlyByZone: vectorOnlyByZone,
  reachableVectorOnlyExamples: vectorOnlyExamples,
  reachableRasterOnlyExamples: rasterOnlyExamples,
};
console.log("[vector/raster player-footprint parity]", JSON.stringify(summary));

assert.ok(
  reachableSamples >= 1000,
  "The candidate's spawn-reachable movement graph is unexpectedly small; inspect the spawn component before evaluating parity.",
);
assert.ok(
  vectorOnlyPct <= MAX_REACHABLE_DIRECTIONAL_MISMATCH_PCT,
  "The vector bot-navigation graph reaches player footprints rejected by the current reviewed fine-grid source in " +
    vectorOnlyPct.toFixed(2) + "% of sampled reachable positions (limit " +
    MAX_REACHABLE_DIRECTIONAL_MISMATCH_PCT + "%). Trace and review the missing floor/wall geometry; do not waive this by changing the threshold.",
);
assert.ok(
  rasterOnlyPct <= MAX_REACHABLE_DIRECTIONAL_MISMATCH_PCT,
  "The vector bot-navigation graph rejects player footprints accepted by the current reviewed fine-grid source in " +
    rasterOnlyPct.toFixed(2) + "% of sampled reachable positions (limit " +
    MAX_REACHABLE_DIRECTIONAL_MISMATCH_PCT + "%). Review every new boundary against the source art.",
);

console.log("VECTOR/Raster SPAWN-REACHABLE PLAYER-FOOTPRINT PARITY PASSED");
