import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPreciseCollisionGrid,
  isPlayerFootprintWalkableAtFeet,
  MAP_H,
  MAP_W,
} from "@workspace/shared/collisionMap";
import {
  CollisionWorld,
  validateCollisionDocument,
  type CollisionDocument,
} from "@workspace/shared/collision";
import {
  FEET_OFFSET_Y,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from "@workspace/shared/coords";

export interface RasterVectorParityInput {
  mapW: number;
  mapH: number;
  spawnFeetX: number;
  spawnFeetY: number;
  stepPx: number;
  rasterWalkable: (feetX: number, feetY: number) => boolean;
  vectorWalkable: (feetX: number, feetY: number) => boolean;
}

interface ReachabilityResult {
  visited: Uint8Array;
  isNodeWalkable: (index: number) => boolean;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  startIndex: number;
}

export interface RasterVectorParityReport {
  footprintContract: "three-circle-player-footprint";
  sampleDomain: "union-of-raster-and-vector-spawn-reachable";
  sampleStepPx: number;
  unionSpawnReachableSampleCount: number;
  vectorWalkableRasterBlocked: number;
  rasterWalkableVectorBlocked: number;
  vectorWalkableRasterBlockedRatio: number;
  rasterWalkableVectorBlockedRatio: number;
  vectorReachableRasterUnreachable: number;
  rasterReachableVectorUnreachable: number;
  sampleSetSha256: string;
  spawnFeet: { x: number; y: number };
  map: { width: number; height: number };
  zoneCounts: Record<string, {
    unionSamples: number;
    vectorWalkableRasterBlocked: number;
    rasterWalkableVectorBlocked: number;
    vectorReachableRasterUnreachable: number;
    rasterReachableVectorUnreachable: number;
  }>;
  passed: boolean;
}

const MAX_DISAGREEMENT_RATIO = 0.02;
const MIN_SAMPLE_COUNT = 1_000;

export const CANONICAL_REDLINE_REFERENCE_PATH =
  "attached_assets/IMG_2907_1783632830477.jpeg";
export const CANONICAL_REDLINE_REFERENCE_DIMENSIONS = { width: 1359, height: 784 } as const;

/** Bind parity measurements to the exact current-main red-line source, not a self-labelled vector file. */
export function validateIndependentRedlineSource(
  candidate: CollisionDocument,
  expectedRedlineSha256: string,
): string[] {
  const errors: string[] = [];
  const source = candidate.source;
  if (!source || source.kind !== "redline-vector") {
    return ["Candidate must be an independently authored redline-vector document"];
  }
  const reference = source.sourceFiles?.redlineReference;
  if (!reference || reference.path !== CANONICAL_REDLINE_REFERENCE_PATH) {
    errors.push("Candidate must reference the canonical current-main red-line image path");
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedRedlineSha256) ||
      !reference || reference.sha256.toLowerCase() !== expectedRedlineSha256.toLowerCase()) {
    errors.push("Candidate red-line source SHA-256 does not match the canonical tracked image bytes");
  }
  if (source.referenceImage.width !== CANONICAL_REDLINE_REFERENCE_DIMENSIONS.width ||
      source.referenceImage.height !== CANONICAL_REDLINE_REFERENCE_DIMENSIONS.height) {
    errors.push("Candidate red-line source dimensions do not match the canonical 1359x784 image");
  }

  // A red-line skeleton is only a seed. Release parity may be measured only
  // against a manually authored, source-evidenced candidate covering all 12
  // canonical authoring zones. Generated raster/vector conversions must not
  // masquerade as source-authored geometry.
  const requiredZones = Array.from({ length: 12 }, (_, index) =>
    "Z" + String(index + 1).padStart(2, "0"));
  const authoring = source.authoring;
  if (!authoring || authoring.method !== "manual-trace" || !Array.isArray(authoring.zones)) {
    errors.push("Candidate requires explicit manual-trace authoring records for all twelve zones");
  } else {
    if (authoring.zones.length !== requiredZones.length) {
      errors.push("Candidate must contain exactly twelve source-authored zone records");
    }
    const digests: string[] = [];
    for (const zone of requiredZones) {
      const records = authoring.zones.filter(record => record?.zone === zone);
      if (records.length !== 1) {
        errors.push(zone + ": exactly one source-authored trace record is required");
        continue;
      }
      const record = records[0];
      if (typeof record.authorName !== "string" || !record.authorName.trim()) {
        errors.push(zone + ": source author identity is required");
      }
      if (typeof record.completedAt !== "string" || !Number.isFinite(Date.parse(record.completedAt))) {
        errors.push(zone + ": source trace completion date is required");
      }
      const path = typeof record.traceEvidencePath === "string" ? record.traceEvidencePath.replace(/\\/g, "/") : "";
      if (!path.startsWith("evidence/map-zones/" + zone + "/") ||
          path.startsWith("/") || /^[a-z]:/i.test(path) ||
          path.split("/").some(part => part === "." || part === "..")) {
        errors.push(zone + ": trace evidence must stay inside its zone-specific evidence bundle");
      }
      if (!/^[a-f0-9]{64}$/i.test(record.traceEvidenceSha256 ?? "")) {
        errors.push(zone + ": source trace evidence SHA-256 is required");
      } else {
        digests.push(record.traceEvidenceSha256.toLowerCase());
      }
    }
    if (new Set(digests).size !== digests.length) {
      errors.push("Each source-authored zone must have its own evidence digest");
    }
  }

  const zoneCounts = source.zoneShapeCounts;
  if (!zoneCounts || typeof zoneCounts !== "object") {
    errors.push("Candidate must record shape ownership counts for all twelve zones");
  } else {
    let total = 0;
    for (const zone of requiredZones) {
      const count = zoneCounts[zone];
      if (!Number.isSafeInteger(count) || count < 0) {
        errors.push(zone + ": a non-negative integer authored-shape count is required");
      } else {
        total += count;
      }
      const actual = candidate.shapes.filter(shape => shape.zone === zone).length;
      if (actual !== count) errors.push(zone + ": recorded shape count does not match candidate geometry");
    }
    if (total !== candidate.shapes.length || source.shapeCounts.total !== candidate.shapes.length) {
      errors.push("Twelve-zone shape counts must reconcile exactly with the candidate geometry");
    }
    if (candidate.shapes.some(shape => !requiredZones.includes(shape.zone ?? ""))) {
      errors.push("Every candidate shape must have exactly one canonical Z01–Z12 primary owner");
    }
  }
  return errors;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function zoneIdAt(x: number, y: number, mapW: number, mapH: number): string | null {
  if (x < 0 || y < 0 || x > mapW || y > mapH) return null;
  const column = Math.min(3, Math.floor(x / (mapW / 4)));
  const row = Math.min(2, Math.floor(y / (mapH / 3)));
  return "Z" + String(row * 4 + column + 1).padStart(2, "0");
}

function collectSpawnReachable(
  mapW: number,
  mapH: number,
  spawnFeetX: number,
  spawnFeetY: number,
  stepPx: number,
  walkable: (feetX: number, feetY: number) => boolean,
  label: string,
): ReachabilityResult {
  const originX = modulo(spawnFeetX, stepPx);
  const originY = modulo(spawnFeetY, stepPx);
  const cols = Math.floor((mapW - originX) / stepPx) + 1;
  const rows = Math.floor((mapH - originY) / stepPx) + 1;
  const total = cols * rows;
  const startCol = Math.round((spawnFeetX - originX) / stepPx);
  const startRow = Math.round((spawnFeetY - originY) / stepPx);
  const startIndex = startRow * cols + startCol;
  if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows ||
      !Number.isSafeInteger(startIndex) || startIndex < 0 || startIndex >= total) {
    throw new RangeError(label + " spawn is outside the sampled world");
  }

  const state = new Uint8Array(total); // 0 unknown, 1 walkable, 2 blocked
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const xAt = (index: number) => originX + (index % cols) * stepPx;
  const yAt = (index: number) => originY + Math.floor(index / cols) * stepPx;
  const isNodeWalkable = (index: number): boolean => {
    if (index < 0 || index >= total) return false;
    if (state[index] === 0) {
      const x = xAt(index);
      const y = yAt(index);
      state[index] = x <= mapW && y <= mapH && walkable(x, y) ? 1 : 2;
    }
    return state[index] === 1;
  };
  if (!isNodeWalkable(startIndex)) {
    throw new Error(label + " production spawn is not full-footprint walkable");
  }

  const directions: ReadonlyArray<readonly [number, number, boolean]> = [
    [0, -1, false], [0, 1, false], [-1, 0, false], [1, 0, false],
    [-1, -1, true], [-1, 1, true], [1, -1, true], [1, 1, true],
  ];
  const segmentWalkable = (fromIndex: number, toIndex: number): boolean => {
    const fromX = xAt(fromIndex);
    const fromY = yAt(fromIndex);
    const toX = xAt(toIndex);
    const toY = yAt(toIndex);
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const samples = Math.max(1, Math.ceil(distance / (stepPx / 2)));
    for (let sample = 1; sample < samples; sample++) {
      const t = sample / samples;
      if (!walkable(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t)) return false;
    }
    return true;
  };

  let head = 0;
  let tail = 0;
  queue[tail++] = startIndex;
  visited[startIndex] = 1;
  while (head < tail) {
    const current = queue[head++];
    const currentCol = current % cols;
    const currentRow = Math.floor(current / cols);
    for (const [dx, dy, diagonal] of directions) {
      const nextCol = currentCol + dx;
      const nextRow = currentRow + dy;
      if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) continue;
      const next = nextRow * cols + nextCol;
      if (visited[next] || !isNodeWalkable(next)) continue;
      if (diagonal) {
        const horizontal = currentRow * cols + nextCol;
        const vertical = nextRow * cols + currentCol;
        if (!isNodeWalkable(horizontal) || !isNodeWalkable(vertical)) continue;
      }
      if (!segmentWalkable(current, next)) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }

  return { visited, isNodeWalkable, cols, rows, originX, originY, startIndex };
}

/**
 * Compare full three-circle player-footprint occupancy across the union of
 * each world's spawn-reachable lattice. The lattice is anchored to the real
 * spawn and uses swept edges at no more than half-step spacing; diagonal
 * corner-cutting is rejected in the same way as production navigation.
 */
export function measureRasterVectorParity(input: RasterVectorParityInput): RasterVectorParityReport {
  const { mapW, mapH, spawnFeetX, spawnFeetY, stepPx } = input;
  if (![mapW, mapH, spawnFeetX, spawnFeetY].every(Number.isFinite) ||
      mapW <= 0 || mapH <= 0 ||
      spawnFeetX < 0 || spawnFeetY < 0 || spawnFeetX > mapW || spawnFeetY > mapH) {
    throw new RangeError("Map dimensions and spawn coordinates must be finite and inside the world");
  }
  if (!Number.isSafeInteger(stepPx) || stepPx < 1 || stepPx > 8) {
    throw new RangeError("Raster/vector parity sample spacing must be an integer from 1px through 8px");
  }

  const raster = collectSpawnReachable(
    mapW, mapH, spawnFeetX, spawnFeetY, stepPx, input.rasterWalkable, "Raster",
  );
  const vector = collectSpawnReachable(
    mapW, mapH, spawnFeetX, spawnFeetY, stepPx, input.vectorWalkable, "Vector",
  );
  if (raster.cols !== vector.cols || raster.rows !== vector.rows ||
      raster.originX !== vector.originX || raster.originY !== vector.originY) {
    throw new Error("Raster and vector parity graphs do not share an identical deterministic lattice");
  }

  const total = raster.cols * raster.rows;
  const zones: RasterVectorParityReport["zoneCounts"] = {};
  for (let index = 0; index < 12; index++) {
    zones["Z" + String(index + 1).padStart(2, "0")] = {
      unionSamples: 0,
      vectorWalkableRasterBlocked: 0,
      rasterWalkableVectorBlocked: 0,
      vectorReachableRasterUnreachable: 0,
      rasterReachableVectorUnreachable: 0,
    };
  }

  let unionCount = 0;
  let vectorWalkableRasterBlocked = 0;
  let rasterWalkableVectorBlocked = 0;
  let vectorReachableRasterUnreachable = 0;
  let rasterReachableVectorUnreachable = 0;
  const hash = createHash("sha256");
  hash.update(JSON.stringify({
    mapW, mapH, spawnFeetX, spawnFeetY, stepPx,
    originX: raster.originX, originY: raster.originY,
    footprintContract: "three-circle-player-footprint",
    edgeSweepSpacingPx: stepPx / 2,
    diagonalCornerCutting: false,
  }) + "\n");
  const sample = Buffer.alloc(8);

  for (let index = 0; index < total; index++) {
    const rasterReachable = raster.visited[index] === 1;
    const vectorReachable = vector.visited[index] === 1;
    if (!rasterReachable && !vectorReachable) continue;
    unionCount++;
    const rasterWalkable = raster.isNodeWalkable(index);
    const vectorWalkable = vector.isNodeWalkable(index);
    const vectorOnlyBlocked = vectorWalkable && !rasterWalkable;
    const rasterOnlyBlocked = rasterWalkable && !vectorWalkable;
    const vectorOnlyReachable = vectorReachable && !rasterReachable;
    const rasterOnlyReachable = rasterReachable && !vectorReachable;

    if (vectorOnlyBlocked) vectorWalkableRasterBlocked++;
    if (rasterOnlyBlocked) rasterWalkableVectorBlocked++;
    if (vectorOnlyReachable) vectorReachableRasterUnreachable++;
    if (rasterOnlyReachable) rasterReachableVectorUnreachable++;

    const x = raster.originX + (index % raster.cols) * stepPx;
    const y = raster.originY + Math.floor(index / raster.cols) * stepPx;
    const zoneId = zoneIdAt(x, y, mapW, mapH);
    if (zoneId) {
      const zone = zones[zoneId];
      zone.unionSamples++;
      if (vectorOnlyBlocked) zone.vectorWalkableRasterBlocked++;
      if (rasterOnlyBlocked) zone.rasterWalkableVectorBlocked++;
      if (vectorOnlyReachable) zone.vectorReachableRasterUnreachable++;
      if (rasterOnlyReachable) zone.rasterReachableVectorUnreachable++;
    }

    sample.writeUInt32LE(index, 0);
    sample[4] = rasterReachable ? 1 : 0;
    sample[5] = vectorReachable ? 1 : 0;
    sample[6] = rasterWalkable ? 1 : 0;
    sample[7] = vectorWalkable ? 1 : 0;
    hash.update(sample);
  }

  const vectorRatio = unionCount ? vectorWalkableRasterBlocked / unionCount : 1;
  const rasterRatio = unionCount ? rasterWalkableVectorBlocked / unionCount : 1;
  return {
    footprintContract: "three-circle-player-footprint",
    sampleDomain: "union-of-raster-and-vector-spawn-reachable",
    sampleStepPx: stepPx,
    unionSpawnReachableSampleCount: unionCount,
    vectorWalkableRasterBlocked,
    rasterWalkableVectorBlocked,
    vectorWalkableRasterBlockedRatio: vectorRatio,
    rasterWalkableVectorBlockedRatio: rasterRatio,
    vectorReachableRasterUnreachable,
    rasterReachableVectorUnreachable,
    sampleSetSha256: hash.digest("hex"),
    spawnFeet: { x: spawnFeetX, y: spawnFeetY },
    map: { width: mapW, height: mapH },
    zoneCounts: zones,
    passed: unionCount >= MIN_SAMPLE_COUNT &&
      vectorRatio <= MAX_DISAGREEMENT_RATIO &&
      rasterRatio <= MAX_DISAGREEMENT_RATIO,
  };
}

function runCandidateMeasurement(): void {
  const candidatePath = process.env.VECTOR_COLLISION_DOCUMENT_PATH;
  if (!candidatePath) {
    throw new Error("Set VECTOR_COLLISION_DOCUMENT_PATH to a source-authored vector candidate; no default or raster-derived preview is accepted");
  }
  const absolutePath = resolve(candidatePath);
  const bytes = readFileSync(absolutePath);
  const candidate = JSON.parse(bytes.toString("utf8")) as CollisionDocument;
  const validationErrors = validateCollisionDocument(candidate);
  if (validationErrors.length) {
    throw new Error("Vector candidate is invalid: " + validationErrors.slice(0, 12).join("; "));
  }
  if (candidate.mapW !== MAP_W || candidate.mapH !== MAP_H) {
    throw new Error("Vector candidate dimensions must exactly match the production map");
  }
  const redlineBytes = readFileSync(new URL("../../attached_assets/IMG_2907_1783632830477.jpeg", import.meta.url));
  const canonicalRedlineSha256 = createHash("sha256").update(redlineBytes).digest("hex");
  const provenanceErrors = validateIndependentRedlineSource(candidate, canonicalRedlineSha256);
  if (provenanceErrors.length) {
    throw new Error("Vector candidate source provenance is invalid: " + provenanceErrors.join("; "));
  }
  const sourceKind = candidate.source!.kind;

  const rasterGrid = buildPreciseCollisionGrid();
  const vectorWorld = new CollisionWorld(candidate.shapes, candidate.mapW, candidate.mapH);
  const stepPx = process.env.RASTER_VECTOR_PARITY_STEP_PX
    ? Number(process.env.RASTER_VECTOR_PARITY_STEP_PX)
    : 4;
  const report = measureRasterVectorParity({
    mapW: MAP_W,
    mapH: MAP_H,
    spawnFeetX: PLAYER_SPAWN_X,
    spawnFeetY: PLAYER_SPAWN_Y + FEET_OFFSET_Y,
    stepPx,
    rasterWalkable: (x, y) => isPlayerFootprintWalkableAtFeet(rasterGrid, x, y),
    vectorWalkable: (x, y) => vectorWorld.isPlayerWalkableAtFeet(x, y),
  });
  const result = {
    candidatePath: absolutePath,
    candidateSha256: createHash("sha256").update(bytes).digest("hex"),
    candidateSourceKind: sourceKind,
    candidateSource: candidate.source ?? null,
    maxDirectionalDisagreementRatio: MAX_DISAGREEMENT_RATIO,
    minimumUnionSampleCount: MIN_SAMPLE_COUNT,
    ...report,
  };
  const outputPath = process.env.RASTER_VECTOR_PARITY_OUTPUT;
  if (outputPath) writeFileSync(resolve(outputPath), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  runCandidateMeasurement();
}
