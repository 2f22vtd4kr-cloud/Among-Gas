import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  buildPreciseCollisionGrid,
  isPlayerPositionWalkable,
  MAP_H,
  MAP_W,
  MANUAL_WALKABLE_REPLACEMENT_ZONES,
} from "../lib/shared/src/collisionMap.js";
import { FEET_OFFSET_Y } from "../lib/shared/src/coords.js";
import { MAP_AUTHORING_ZONES, getPrimaryMapAuthoringZone } from "../lib/shared/src/collision/mapZones.js";
import { isBotNavigationReachable } from "../lib/shared/src/collision/botNavigation.js";
import { getProductionCollisionWorld } from "../lib/shared/src/collision/productionWorld.js";

const raster = buildPreciseCollisionGrid();
const vector = getProductionCollisionWorld();
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
const reachableByZone: Record<string, number> = {};
const mismatchOverlay = Buffer.alloc(MAP_W * MAP_H * 4);
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
    const zone = getPrimaryMapAuthoringZone(x, y) ?? "outside";
    reachableByZone[zone] = (reachableByZone[zone] ?? 0) + 1;
    if (rasterWalkable && vectorWalkable) {
      reachableBothWalkable++;
      continue;
    }
    if (!rasterWalkable && !vectorWalkable) {
      reachableBothBlocked++;
      continue;
    }
    const mark = (red: number, green: number, blue: number) => {
      const left = Math.max(0, Math.min(MAP_W - 1, Math.floor(x - 4)));
      const top = Math.max(0, Math.min(MAP_H - 1, Math.floor(y - 4)));
      for (let py = top; py < Math.min(MAP_H, top + 8); py++) {
        for (let px = left; px < Math.min(MAP_W, left + 8); px++) {
          const offset = (py * MAP_W + px) * 4;
          mismatchOverlay[offset] = red;
          mismatchOverlay[offset + 1] = green;
          mismatchOverlay[offset + 2] = blue;
          mismatchOverlay[offset + 3] = 185;
        }
      }
    };
    if (vectorWalkable) {
      mark(255, 48, 80);
      reachableVectorOnly++;
      vectorOnlyByZone[zone] = (vectorOnlyByZone[zone] ?? 0) + 1;
      if (vectorOnlyExamples.length < 20) vectorOnlyExamples.push({ x, y, zone });
    } else {
      mark(32, 220, 255);
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
  reachableVectorOnlyByZonePct: Object.fromEntries(
    Object.entries(reachableByZone).map(([zone, count]) => [
      zone,
      Number((((vectorOnlyByZone[zone] ?? 0) / count) * 100).toFixed(2)),
    ]),
  ),
  reachableVectorOnlyExamples: vectorOnlyExamples,
  reachableRasterOnlyExamples: rasterOnlyExamples,
};
const qaDirectory = path.resolve("../artifacts/telegram-game/collision-qa-tiles");
await mkdir(qaDirectory, { recursive: true });
const baseMap = path.resolve("../artifacts/telegram-game/public/map-hires.png");
const mismatchMapPath = path.join(qaDirectory, "vector-raster-parity-mismatches.png");
await sharp(baseMap)
  .composite([{
    input: mismatchOverlay,
    raw: { width: MAP_W, height: MAP_H, channels: 4 },
  }])
  .png()
  .toFile(mismatchMapPath);
for (const zone of MAP_AUTHORING_ZONES) {
  const left = Math.max(0, Math.floor(zone.minX));
  const top = Math.max(0, Math.floor(zone.minY));
  const right = Math.min(MAP_W, Math.ceil(zone.maxX));
  const bottom = Math.min(MAP_H, Math.ceil(zone.maxY));
  await sharp(mismatchMapPath)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toFile(path.join(qaDirectory, "vector-raster-parity-" + zone.id + ".png"));
}
await writeFile(
  path.join(qaDirectory, "vector-raster-parity.json"),
  JSON.stringify({
    ...summary,
    legend: {
      red: "candidate vector says walkable; reviewed fine-grid says blocked",
      cyan: "reviewed fine-grid says walkable; candidate vector says blocked",
    },
  }, null, 2) + "\n",
  "utf8",
);
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
