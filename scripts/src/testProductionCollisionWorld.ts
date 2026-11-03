import assert from "node:assert/strict";
import {
  PRODUCTION_COLLISION_DOCUMENT,
  PRODUCTION_COLLISION_WORLD,
} from "@workspace/shared/collision/productionWorld";
import { validateCollisionDocument } from "@workspace/shared/collision";
import { FEET_OFFSET_Y, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from "@workspace/shared/coords";

const world = PRODUCTION_COLLISION_WORLD;
const document = PRODUCTION_COLLISION_DOCUMENT;

assert.equal(document.version, 1);
assert.equal(document.mapW, 3224);
assert.equal(document.mapH, 1858);
assert.ok(document.shapes.length >= 80, "production geometry must include the traced map features");
assert.deepEqual(validateCollisionDocument(document), [], "generated production geometry must validate");
assert.equal(
  world.isPlayerWalkableAtFeet(PLAYER_SPAWN_X, PLAYER_SPAWN_Y + FEET_OFFSET_Y),
  true,
  "the actual spawn footprint must be walkable",
);

// The octagonal planter is a boundary, not a filled polygon. The floor inside
// it remains walkable while the statue pedestal itself blocks movement and sight.
assert.equal(world.isPlayerWalkableAtFeet(1640, 449), true, "western garden floor remains walkable");
assert.equal(world.isPlayerWalkableAtFeet(1735, 449), true, "garden floor above the pedestal remains walkable");
assert.equal(world.isPlayerWalkableAtFeet(1810, 449), true, "eastern garden floor remains walkable");
assert.equal(world.isPlayerWalkableAtFeet(1735, 500), false, "statue pedestal blocks its measured footprint");
assert.equal(world.isPlayerWalkableAtFeet(1735, 556), true, "the obsolete offset shadow-circle position is not a collision");

// The painted parking-bay marking is not a physical barrier; the nearby vehicle is.
assert.equal(world.isPlayerWalkableAtFeet(300, 400), true, "painted parking line remains traversable");
assert.equal(world.isPlayerWalkableAtFeet(450, 350), false, "parked vehicle remains solid");

// The statue pedestal, not the decorative garden perimeter, casts the sight shadow.
assert.equal(world.isLineOfSightClear(1600, 500, 1650, 500), true);
assert.equal(world.isLineOfSightClear(1600, 500, 1750, 500), false);
assert.equal(world.isLineOfSightToInteractionTarget(1600, 500, 1740, 500, 12), false);

const navigation = world.rasterizePlayerNav(208, 116);
assert.equal(navigation.cols, 208);
assert.equal(navigation.rows, 116);
assert.equal(navigation.walk.length, 208 * 116);
assert.ok(navigation.walk.some(value => value === 1), "navigation raster must contain walkable cells");
assert.ok(navigation.walk.some(value => value === 0), "navigation raster must contain blocked cells");

console.log(JSON.stringify({
  ok: true,
  shapes: document.shapes.length,
  walkableParkingLine: true,
  statuePedestalBlocksSight: true,
  navigationCells: navigation.walk.length,
}, null, 2));
