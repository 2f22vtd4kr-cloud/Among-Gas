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
assert.ok(document.shapes.length >= 80, "the production document must contain the traced map geometry");
assert.deepEqual(validateCollisionDocument(document), [], "the generated production geometry must validate");
assert.equal(world.isPlayerWalkableAtFeet(PLAYER_SPAWN_X, PLAYER_SPAWN_Y + FEET_OFFSET_Y), true, "the documented lobby spawn footprint is walkable");

// The low planter is a boundary, not a filled polygon. Its floor remains open,
// while the central pedestal blocks movement and sight at its actual footprint.
assert.equal(world.isPlayerWalkableAtFeet(1640, 449), true, "western garden floor remains walkable");
assert.equal(world.isPlayerWalkableAtFeet(1735, 449), true, "garden floor above the pedestal remains walkable");
assert.equal(world.isPlayerWalkableAtFeet(1810, 449), true, "eastern garden floor remains walkable");
assert.equal(world.isPlayerWalkableAtFeet(1735, 500), false, "the statue pedestal blocks its real footprint");
assert.equal(world.isPlayerWalkableAtFeet(1735, 556), true, "the obsolete offset shadow-circle position is not a collision");

// The painted parking-bay marking is not a physical barrier; the nearby car is.
assert.equal(world.isPlayerWalkableAtFeet(300, 400), true, "painted parking line remains traversable");
assert.equal(world.isPlayerWalkableAtFeet(450, 350), false, "parked vehicle remains solid");

// Vector line of sight must stop at the pedestal, not at the decorative ring.
assert.equal(world.isLineOfSightClear(1600, 500, 1650, 500), true);
assert.equal(world.isLineOfSightClear(1600, 500, 1750, 500), false);
assert.equal(world.isLineOfSightToInteractionTarget(1600, 500, 1740, 500, 12), false);

const navigation = world.rasterizePlayerNav(208, 116);
assert.equal(navigation.cols, 208);
assert.equal(navigation.rows, 116);
assert.equal(navigation.walk.length, 208 * 116);
assert.ok(navigation.walk.some(value => value === 1), "vector navigation must contain walkable cells");
assert.ok(navigation.walk.some(value => value === 0), "vector navigation must contain blocked cells");

console.log(JSON.stringify({
  ok: true,
  shapes: document.shapes.length,
  walkableParkingLine: true,
  statuePedestalBlocksSight: true,
  navigationCells: navigation.walk.length,
}, null, 2));
