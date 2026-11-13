import assert from "node:assert/strict";
import {
  CollisionWorld,
  validateCollisionDocument,
  History,
  shouldCloseLoop,
  simplifyRDP,
  snapPoint,
  type CollisionShape,
  type Point,
  MAP_AUTHORING_ZONES,
  getPrimaryMapAuthoringZone,
  getCollisionShapeGroundCentroid,
  validateMapAuthoringZoneDocument,
  assignMapAuthoringZonesByCentroid,
} from "@workspace/shared/collision";

const shape = (id: string, points: Point[], closed = false, blocksMove = true, blocksSight = true): CollisionShape =>
  ({ id, points, closed, blocksMove, blocksSight });

function contains(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Canonical Plan 2 4×3 authoring partition and primary-owner centroid contract.
{
  assert.equal(MAP_AUTHORING_ZONES.length, 12);
  assert.deepEqual(MAP_AUTHORING_ZONES.map(zone => zone.id), [
    "Z01", "Z02", "Z03", "Z04", "Z05", "Z06",
    "Z07", "Z08", "Z09", "Z10", "Z11", "Z12",
  ]);
  assert.equal(getPrimaryMapAuthoringZone(0, 0), "Z01");
  assert.equal(getPrimaryMapAuthoringZone(806, 100), "Z02", "vertical seams belong to the eastern zone");
  assert.equal(getPrimaryMapAuthoringZone(1612, 100), "Z03");
  assert.equal(getPrimaryMapAuthoringZone(2418, 100), "Z04");
  assert.equal(getPrimaryMapAuthoringZone(100, 1858 / 3), "Z05", "horizontal seams belong to the southern zone");
  assert.equal(getPrimaryMapAuthoringZone(3224, 1858), "Z12", "the final east/south boundary is inclusive");
  assert.equal(getPrimaryMapAuthoringZone(-0.01, 0), null);
  assert.equal(getPrimaryMapAuthoringZone(3224.01, 100), null);
  assert.equal(getPrimaryMapAuthoringZone(100, Number.NaN), null);

  const clockwise = shape("clockwise-square", [[100, 100], [200, 100], [200, 200], [100, 200]], true);
  const counterClockwise = shape("counter-clockwise-square", [[100, 100], [100, 200], [200, 200], [200, 100]], true);
  assert.deepEqual(getCollisionShapeGroundCentroid(clockwise), [150, 150]);
  assert.deepEqual(getCollisionShapeGroundCentroid(counterClockwise), [150, 150],
    "signed-area centroid must be winding-independent");

  const weightedWall = shape("weighted-wall", [[0, 0], [100, 0], [100, 300]]);
  const [wallX, wallY] = getCollisionShapeGroundCentroid(weightedWall);
  assert.equal(wallX, 87.5);
  assert.equal(wallY, 112.5, "open-wall centroid weights each segment by its length");

  const validZoneDocument = {
    shapes: [
      { ...shape("seam-wall", [[790, 100], [820, 100]]), zone: "Z01" },
    ],
  };
  assert.deepEqual(validateMapAuthoringZoneDocument(validZoneDocument, "Z01"), [],
    "a seam-crossing shape is owned by the zone containing its ground centroid");
  assert.ok(validateMapAuthoringZoneDocument(validZoneDocument, "Z02").some(error => error.includes("assigned to Z01")));
  assert.ok(validateMapAuthoringZoneDocument({
    shapes: [{ ...shape("wrong-zone", [[850, 100], [900, 100]]), zone: "Z01" }],
  }, "Z01").some(error => error.includes("belongs to Z02")));
  assert.ok(validateMapAuthoringZoneDocument({
    shapes: [{ ...shape("unassigned", [[100, 100], [200, 100]]) }],
  }, "Z01").some(error => error.includes("unassigned")));
  assert.ok(validateMapAuthoringZoneDocument({ shapes: [] }, "A").length > 0,
    "legacy A–E identifiers are rejected");

  const legacyShape = { ...shape("legacy-north-west", [[100, 100], [200, 100]]), zone: "A" };
  const eastShape = { ...shape("legacy-south-east", [[3180, 1800], [3220, 1800]]), zone: "E" };
  const outOfBoundsShape = shape("outside-map", [[-20, 100], [-10, 100]]);
  const migrated = assignMapAuthoringZonesByCentroid({
    shapes: [legacyShape, eastShape, outOfBoundsShape],
  });
  assert.deepEqual(migrated.shapes.map(item => item.zone), ["Z01", "Z12", "unassigned"]);
  assert.deepEqual(migrated.shapes[0].points, legacyShape.points,
    "centroid migration changes zone metadata only, never geometry");
  assert.equal(migrated.shapes[0].blocksMove, legacyShape.blocksMove);
  assert.equal(migrated.shapes[1].label, eastShape.label);
  assert.equal(migrated.shapes.length, 3, "migration preserves shape count and order");
}

// Diagonal wall slide and fast thin-wall rejection.
{
  const world = new CollisionWorld([shape("diagonal", [[500, 1000], [1500, 1577]])]);
  let x = 900, y = 700;
  for (let i = 0; i < 400; i++) [x, y] = world.move(x, y, 1.5, 1.5, 12);
  const gap = Math.abs((x - 500) * 577 - (y - 1000) * 1000) / Math.hypot(1000, 577);
  assert.ok(gap >= 11.4 && x > 1000);
  const thin = new CollisionWorld([shape("thin", [[1000, 0], [1000, 1800]])]);
  const [after] = thin.move(990, 500, 400, 0, 10);
  assert.ok(after <= 990.01);
}

// Closed solid interior, move-only bench, and sight-only foliage.
{
  const car = shape("car", [[1000, 500], [1100, 500], [1100, 600], [1000, 600]], true);
  const world = new CollisionWorld([car]);
  assert.equal(world.insideSolid(1050, 550), true);
  assert.equal(world.isWalkable(1050, 550, 12), false);
  assert.equal(world.isWalkable(900, 550, 12), true);
  const bench = new CollisionWorld([shape("bench", [[1600, 480], [1650, 480], [1650, 530], [1600, 530]], true, true, false)]);
  assert.equal(bench.isWalkable(1625, 505, 10), false);
  assert.equal(contains([1900, 505], bench.visibility(1500, 505, 500)), true);
  const foliage = new CollisionWorld([shape("foliage", [[1600, 480], [1650, 480], [1650, 530], [1600, 530]], true, false, true)]);
  assert.equal(foliage.isWalkable(1625, 505, 10), true);
  assert.equal(contains([1900, 505], foliage.visibility(1500, 505, 500)), false);
}

// Direct and perimeter-aware line of sight share the same vector blockers.
{
  const wall = new CollisionWorld([
    shape("los-wall", [[100, 0], [100, 200]], false, false, true),
  ], 200, 200);
  assert.equal(wall.isLineOfSightClear(20, 100, 80, 100), true);
  assert.equal(wall.isLineOfSightClear(20, 100, 180, 100), false);
  const consoleWorld = new CollisionWorld([
    shape("console", [[140, 80], [190, 80], [190, 120], [140, 120]], true, false, true),
  ], 240, 200);
  assert.equal(consoleWorld.isLineOfSightClear(80, 100, 165, 100), false,
    "a point inside a sight-blocking object is not directly visible");
  assert.equal(consoleWorld.isLineOfSightToInteractionTarget(80, 100, 165, 100, 35), true,
    "the visible perimeter of a console remains interactable");
  assert.equal(consoleWorld.isLineOfSightToInteractionTarget(80, 100, 165, 100, 8), false,
    "a target radius fully inside the solid cannot be interacted through it");
}

// A closed-looking polyline boundary must not fill the walkable garden interior.
{
  const ring = new CollisionWorld([
    shape("planter-boundary", [[40, 40], [160, 40], [180, 100], [160, 160], [40, 160], [20, 100], [40, 40]], false, true, false),
  ], 200, 200);
  assert.equal(ring.isPlayerWalkableAtFeet(100, 100), true,
    "the interior of a low planter boundary remains walkable");
  assert.equal(ring.isPlayerWalkableAtFeet(100, 40), false,
    "the authored planter boundary itself blocks the player footprint");
}

// A long sight-only wall crossing the radius must contribute exact clipped
// endpoints even though neither authored endpoint lies inside the vision circle.
{
  const longWall = new CollisionWorld([
    shape("long-sight-wall", [[1400, 400], [1400, 1600]], false, false, true),
  ], 2000, 2000);
  const view = longWall.visibility(1000, 1000, 500);
  assert.ok(
    view.some(point => Math.abs(point[0] - 1400) < 1e-4 && Math.abs(point[1] - 700) < 1e-4),
    "visibility must include the upper circle-clipped endpoint of a long wall",
  );
  assert.ok(
    view.some(point => Math.abs(point[0] - 1400) < 1e-4 && Math.abs(point[1] - 1300) < 1e-4),
    "visibility must include the lower circle-clipped endpoint of a long wall",
  );
  assert.equal(contains([1450, 1000], view), false, "long wall must occlude points behind it");
}

// A blocker is aligned to the authored outline, and open-room range is circular.
{
  const pedestal = new CollisionWorld([shape("pedestal", [[1705, 475], [1782, 475], [1782, 532], [1705, 532]], true)]);
  const view = pedestal.visibility(1500, 505, 500);
  assert.equal(contains([1690, 505], view), true);
  assert.equal(contains([1900, 505], view), false);
  assert.equal(contains([1900, 300], view), true);
  const radius = 120;
  const circle = new CollisionWorld([]).visibility(1000, 900, radius);
  assert.ok(circle.length >= 64);
  for (const p of circle) assert.ok(Math.abs(Math.hypot(p[0] - 1000, p[1] - 900) - radius) < 1e-5);
}

// Invalid geometry, map bounds, raster and editor utilities.
{
  const errors = validateCollisionDocument({ version: 1, mapW: 100, mapH: 100, shapes: [
    shape("bad", [[10, 10], [90, 90], [10, 90], [90, 10]], true),
    shape("bad", [[1, 1], [2, 2]]),
  ] });
  assert.ok(errors.some(e => e.includes("self-intersects")));
  assert.ok(errors.some(e => e.includes("duplicates")));
  assert.throws(() => new CollisionWorld([shape("zero", [[0, 0], [0, 0]])]), /Invalid collision geometry/);
  const world = new CollisionWorld([shape("wall", [[100, 0], [100, 200]])], 200, 200);
  assert.deepEqual(world.move(100, 100, -100, -100, 12), [100, 100]);
  const zeroRadius = new CollisionWorld([shape("thin-line", [[50, 0], [50, 100]])], 100, 100);
  assert.equal(zeroRadius.isWalkable(50, 50, 0), false, "zero-radius point on an open wall must be blocked");
  assert.equal(zeroRadius.isWalkable(49, 50, 0), true);
  assert.equal(zeroRadius.move(49, 50, 2, 0, 0)[0], 49, "zero-radius movement must not cross an open wall");
  const playerFootprint = new CollisionWorld([shape("near-foot-wall", [[96, 0], [96, 200]])], 200, 200);
  assert.equal(playerFootprint.isWalkable(105, 100, 4), true, "center circle alone is clear");
  assert.equal(playerFootprint.isPlayerWalkableAtFeet(105, 100), false, "side foot circle must preserve the current wider feet footprint");
  assert.deepEqual(playerFootprint.movePlayerAtFeet(110, 100, -10, 0), [110, 100], "player feet footprint must not clip the nearby wall");
  const corridor = new CollisionWorld([
    shape("corridor-lower", [[0, 100], [200, 100]], false, true, false),
    shape("corridor-upper", [[0, 115], [200, 115]], false, true, false),
  ], 200, 200);
  assert.equal(corridor.isPlayerWalkableAtFeet(55, 105), true, "three-circle footprint fits the 15px corridor");
  assert.equal(corridor.isWalkable(55, 105, 12), false, "12px circular proxy is too conservative for this corridor");
  const playerNav = corridor.rasterizePlayerNav(20, 20);
  assert.equal(playerNav.walk[10 * playerNav.cols + 5], 1, "bot nav raster must use the production three-circle footprint");
  const bounds = new CollisionWorld([], 200, 200);
  const [boundedX, boundedY] = bounds.move(20, 20, -100, -100, 12);
  assert.ok(boundedX >= 12 && boundedY >= 12, "player footprint must remain inside map edges");
  const edgeVision = bounds.visibility(30, 100, 100);
  assert.ok(edgeVision.every(point => point[0] >= -1e-6 && point[0] <= 200 + 1e-6));
  assert.ok(edgeVision.some(point => Math.abs(point[0]) < 1e-5), "map border must occlude rays at x=0");
  const nav = world.rasterizeNav(16, 12);
  assert.equal(nav.cols, 13);
  assert.equal(nav.rows, 13);
  assert.ok(nav.walk.some(value => value === 0));
  assert.throws(() => world.rasterizeNav(0, 12), /navigation cell/);
  assert.equal(simplifyRDP(Array.from({ length: 60 }, (_, i) => [i * 5, (i % 2) * 1.2] as Point), 3).length, 2);
  assert.equal(snapPoint([shape("edge", [[100, 100], [300, 100]])], [200, 104], 12).kind, "segment");
  assert.equal(snapPoint([shape("edge-end", [[100, 100], [300, 100]])], [104, 100], 12).kind, "endpoint",
    "open-wall endpoints take magnet priority over nearby segment projections");
  const prioritySnap = snapPoint([
    shape("vertex-priority", [[100, 100], [100, 200]]),
    shape("nearby-segment", [[80, 104], [120, 104]]),
  ], [104, 104], 24);
  assert.equal(prioritySnap.kind, "endpoint",
    "a vertex magnet must win when its 48px touch target contains the pointer, even if another segment is geometrically closer");
  assert.ok(Math.abs(prioritySnap.distance - Math.sqrt(32)) < 1e-9,
    "endpoint snap reports the geometric distance while staying inside the 24px radius (48px diameter)");
  assert.equal(snapPoint([shape("touch-target", [[100, 100], [300, 100]])], [124, 100], 24).kind, "endpoint",
    "48px touch target includes its 24px boundary");
  assert.equal(shouldCloseLoop([[0, 0], [100, 0], [100, 100], [4, 3]], 10), true);
  const history = new History<number[]>([], value => value.slice(), 3);
  history.commit([1]); history.commit([1, 2]); assert.equal(history.undo(), true);
  assert.deepEqual(history.current, [1]); assert.equal(history.redo(), true);
  assert.deepEqual(history.current, [1, 2]);
}

// Small deterministic performance smoke across many authored shapes.
{
  const shapes = Array.from({ length: 120 }, (_, i) => {
    const x = (i % 12) * 200 + 50, y = Math.floor(i / 12) * 160 + 50;
    return shape("box-" + i, [[x, y], [x + 70, y], [x + 70, y + 60], [x, y + 60]], true);
  });
  const world = new CollisionWorld(shapes);
  const start = Date.now();
  let x = 20, y = 20;
  for (let i = 0; i < 1000; i++) [x, y] = world.move(x, y, 2, 1, 12);
  for (let i = 0; i < 20; i++) world.visibility(1000 + i, 800, 500);
  console.log("vector-collision smoke elapsed ms:", Date.now() - start);
}
console.log("VECTOR COLLISION TESTS PASSED");
