import assert from "node:assert/strict";
import { getProductionCollisionDocument } from "../lib/shared/src/collision/productionWorld.js";
import {
  CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS,
  SOURCE_ART_ISOLATED_REGION_CANDIDATES,
} from "../lib/shared/src/collisionOverrides.js";

const document = getProductionCollisionDocument();
const expected = [
  "north-cafeteria-upper-furniture-strip",
  "northwest-tank-machinery-enclosure",
  "south-central-service-fixture-enclosure",
  "southwest-shop-shelving-interior",
] as const;

assert.equal(CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS.length, expected.length);
assert.equal(document.source?.shapeCounts.provisionalSourceArtBlockedPolygons, expected.length);
const declared = new Set(document.source?.geometryOverrides?.movementOnlyBlockedPolygons ?? []);

for (const id of expected) {
  const source = CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS.find(polygon => polygon.id === id);
  assert.ok(source, id + " source-art polygon is declared");
  assert.ok(source.points.length >= 7, id + " retains an irregular source contour, not a guessed rectangle");

  const shape = document.shapes.find(candidate => candidate.id === "source-art-candidate-" + id);
  assert.ok(shape, id + " is present in the generated candidate document");
  assert.equal(shape.closed, true);
  assert.equal(shape.blocksMove, true);
  assert.equal(shape.blocksSight, false,
    id + " is movement-only and must not silently become an interaction-LOS blocker");
  assert.notEqual(shape.castsShadow, true,
    id + " must not silently become a decorative-shadow occluder");
  assert.equal(shape.points.length, source.points.length);
  assert.ok(declared.has(id), id + " is recorded in source geometry provenance");
}

assert.equal(SOURCE_ART_ISOLATED_REGION_CANDIDATES.length, 1);
assert.equal(SOURCE_ART_ISOLATED_REGION_CANDIDATES[0].id, "east-office-vehicle-service-bay");
assert.match(SOURCE_ART_ISOLATED_REGION_CANDIDATES[0].entryExitMechanics, /design-owner confirmation remains pending/);
assert.equal(document.shapes.some(shape => shape.id.includes("east-office-vehicle-service-bay")), false,
  "C38 remains a separately reviewed isolated interior; do not invent a fill or doorway");

console.log("SOURCE-ART CANDIDATE OVERRIDES PASSED: four irregular movement-only contours; C38 remains provisional and separate");
