import assert from "node:assert/strict";
import { CollisionWorld, validateCollisionDocument, type CollisionShape, type Point } from "../../lib/shared/src/collision/index.js";
import { History, shouldCloseLoop, simplifyRDP, snapPoint } from "../../lib/shared/src/collision/editorGeometry.js";

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
  const nav = world.rasterizeNav(16, 12);
  assert.equal(nav.cols, 13);
  assert.equal(nav.rows, 13);
  assert.ok(nav.walk.some(value => value === 0));
  assert.throws(() => world.rasterizeNav(0, 12), /navigation cell/);
  assert.equal(simplifyRDP(Array.from({ length: 60 }, (_, i) => [i * 5, (i % 2) * 1.2] as Point), 3).length, 2);
  assert.equal(snapPoint([shape("edge", [[100, 100], [300, 100]])], [200, 104], 12).kind, "segment");
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
