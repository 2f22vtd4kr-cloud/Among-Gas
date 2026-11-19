import assert from "node:assert/strict";
import {
  measureRasterVectorParity,
  validateIndependentRedlineSource,
  CANONICAL_REDLINE_REFERENCE_PATH,
} from "./measureRasterVectorParity.js";

const base = {
  mapW: 128,
  mapH: 128,
  spawnFeetX: 32,
  spawnFeetY: 64,
  stepPx: 4,
};

const open = () => true;

const redlineCandidate = {
  version: 1,
  mapW: 3224,
  mapH: 1858,
  shapes: Array.from({ length: 12 }, (_, index) => ({
    id: "authored-zone-" + index,
    points: [[index, 0], [index + 1, 0]] as [[number, number], [number, number]],
    closed: false,
    blocksMove: true,
    blocksSight: false,
    zone: "Z" + String(index + 1).padStart(2, "0"),
  })),
  source: {
    kind: "redline-vector",
    generatorVersion: 2,
    sourceFiles: {
      redlineReference: {
        path: CANONICAL_REDLINE_REFERENCE_PATH,
        sha256: "a".repeat(64),
      },
    },
    referenceImage: { width: 1359, height: 784 },
    authoring: {
      method: "manual-trace",
      zones: Array.from({ length: 12 }, (_, index) => {
        const zone = "Z" + String(index + 1).padStart(2, "0");
        return {
          zone,
          authorName: "Source Author",
          completedAt: "2026-11-18T10:00:00.000Z",
          traceEvidencePath: `evidence/map-zones/${zone}/trace.json`,
          traceEvidenceSha256: (index + 1).toString(16).padStart(64, "0"),
        };
      }),
    },
    vectorization: {
      redPixelCount: 1,
      skeletonPixelCount: 1,
      tracedPathCount: 1,
      simplifiedPointCount: 2,
      simplificationToleranceSourcePx: 1,
      closedSolidCount: 0,
      openBoundaryCount: 1,
    },
    shapeCounts: { total: 12 },
    zoneShapeCounts: Object.fromEntries(Array.from({ length: 12 }, (_, index) =>
      ["Z" + String(index + 1).padStart(2, "0"), 1])),

  },
} as Parameters<typeof validateIndependentRedlineSource>[0];

const redlineSource = redlineCandidate.source;
assert.ok(redlineSource && redlineSource.kind === "redline-vector");

assert.deepEqual(validateIndependentRedlineSource(redlineCandidate, "a".repeat(64)), [],
  "the canonical current-main red-line source and matching bytes should be accepted");

const generatedSeed = structuredClone(redlineCandidate);
delete (generatedSeed.source as unknown as Record<string, unknown>).authoring;
assert.ok(validateIndependentRedlineSource(generatedSeed, "a".repeat(64)).some(error =>
  error.includes("manual-trace authoring records")),
  "a generated skeleton seed must not masquerade as a source-authored zone candidate");

const incompleteZoneAuthorship = structuredClone(redlineCandidate);
(incompleteZoneAuthorship.source as any).authoring.zones.pop();
assert.ok(validateIndependentRedlineSource(incompleteZoneAuthorship, "a".repeat(64)).some(error =>
  error.includes("exactly twelve source-authored zone records")),
  "all twelve canonical zones require a trace record");

const duplicateZoneAuthorship = structuredClone(redlineCandidate);
(duplicateZoneAuthorship.source as any).authoring.zones[11].zone = "Z01";
assert.ok(validateIndependentRedlineSource(duplicateZoneAuthorship, "a".repeat(64)).some(error =>
  error.includes("Z01: exactly one source-authored trace record")),
  "duplicate zone traces cannot replace an omitted zone");

const unsafeZoneEvidence = structuredClone(redlineCandidate);
(unsafeZoneEvidence.source as any).authoring.zones[0].traceEvidencePath =
  "evidence/map-zones/Z01/../../Z02/trace.json";
assert.ok(validateIndependentRedlineSource(unsafeZoneEvidence, "a".repeat(64)).some(error =>
  error.includes("zone-specific evidence bundle")),
  "zone evidence cannot traverse into another zone's directory");

const mismatchedZoneCounts = structuredClone(redlineCandidate);
(mismatchedZoneCounts.source as any).zoneShapeCounts.Z01 = 0;
assert.ok(validateIndependentRedlineSource(mismatchedZoneCounts, "a".repeat(64)).some(error =>
  error.includes("recorded shape count does not match candidate geometry")),
  "the source manifest's per-zone counts must match actual candidate shapes");
const staleRedlineCandidate = {
  ...redlineCandidate,
  source: {
    ...redlineSource,
    sourceFiles: {
      ...redlineSource.sourceFiles,
      redlineReference: {
        ...redlineSource.sourceFiles.redlineReference,
        path: "attached_assets/IMG_2907_1783590932507.jpeg",
      },
    },
  },
} as Parameters<typeof validateIndependentRedlineSource>[0];
assert.ok(validateIndependentRedlineSource(staleRedlineCandidate, "a".repeat(64)).some(error =>
  error.includes("canonical current-main red-line image path")),
  "a historical red-line path must not be accepted as current source evidence");
assert.ok(validateIndependentRedlineSource(redlineCandidate, "b".repeat(64)).some(error =>
  error.includes("does not match the canonical tracked image bytes")),
  "a self-declared source digest must match the actual tracked image bytes");
const wrongRedlineDimensions = {
  ...redlineCandidate,
  source: {
    ...redlineSource,
    referenceImage: { ...redlineSource.referenceImage, width: 1358 },
  },
} as Parameters<typeof validateIndependentRedlineSource>[0];
assert.ok(validateIndependentRedlineSource(wrongRedlineDimensions, "a".repeat(64)).some(error =>
  error.includes("canonical 1359x784 image")),
  "a candidate traced from a different source-image geometry must be rejected");
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
