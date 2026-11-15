import assert from "node:assert/strict";
import { FINE_COLS, FINE_ROWS } from "@workspace/shared/collisionMap";
import {
  buildVisualOccluderSegmentIndex,
  computeVisibilityPolygon,
  smoothVisibilityPolygon,
  type VisualOccluderSegment,
} from "./visibility";

const emptyFineGrid = new Uint8Array(FINE_COLS * FINE_ROWS);
const segments: VisualOccluderSegment[] = [
  { ax: 180, ay: 80, bx: 180, by: 200 },
  { ax: 180, ay: 200, bx: 80, by: 200 },
  { ax: 80, ay: 200, bx: 80, by: 80 },
  { ax: 80, ay: 80, bx: 180, by: 80 },
];
// Include distant contours to exercise BVH pruning without changing the scene.
for (let index = 0; index < 1024; index++) {
  const x = 1200 + index * 3;
  const y = 900 + (index % 17) * 11;
  segments.push({ ax: x, ay: y, bx: x + 24, by: y + 9 });
}

const origin = { x: 120, y: 140 };
const radius = 260;
const reference = computeVisibilityPolygon(
  origin.x, origin.y, radius, emptyFineGrid, [], false, segments,
);
const index = buildVisualOccluderSegmentIndex(segments);
const indexed = computeVisibilityPolygon(
  origin.x, origin.y, radius, emptyFineGrid, [], false, segments, index,
);
assert.deepEqual(indexed, reference,
  "indexed ray traversal must preserve every ray hit and vertex exactly");
assert.ok(index.nodes.length > 1, "large contour sets should build a hierarchy");
assert.equal(index.segments, segments, "index must retain the immutable source segment collection");

const emptyIndex = buildVisualOccluderSegmentIndex([]);
assert.deepEqual(computeVisibilityPolygon(
  origin.x, origin.y, radius, emptyFineGrid, [], false, [], emptyIndex,
), computeVisibilityPolygon(origin.x, origin.y, radius, emptyFineGrid),
"empty indexed contours must match the no-contour fallback");

const customLeafIndex = buildVisualOccluderSegmentIndex(segments, 1);
assert.deepEqual(computeVisibilityPolygon(
  origin.x, origin.y, radius, emptyFineGrid, [], false, segments, customLeafIndex,
), reference, "single-segment leaves must preserve exact ray results");

// A non-finite smoothing window must fall back to the default instead of
// emitting NaN vertices; finite windows remain clamped to the supported range.
const smoothingFixture = Array.from({ length: 24 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  const distance = index % 5 === 0 ? 70 : 100;
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
});
const defaultSmoothed = smoothVisibilityPolygon(smoothingFixture, origin);
assert.deepEqual(
  smoothVisibilityPolygon(smoothingFixture, origin, Number.NaN),
  defaultSmoothed,
  "NaN smoothing window falls back to the documented default",
);
assert.deepEqual(
  smoothVisibilityPolygon(smoothingFixture, origin, Number.POSITIVE_INFINITY),
  smoothVisibilityPolygon(smoothingFixture, origin, 8),
  "positive infinity clamps to the maximum supported smoothing window",
);
assert.deepEqual(
  smoothVisibilityPolygon(smoothingFixture, origin, -Infinity),
  smoothVisibilityPolygon(smoothingFixture, origin, 1),
  "negative infinity clamps to the minimum supported smoothing window",
);
assert.ok(defaultSmoothed.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)),
  "smoothing always returns finite vertices for finite source geometry");

console.log("VISION CONTOUR INDEX TESTS PASSED: exact indexed/brute-force parity, empty index and leaf-size edge case");
