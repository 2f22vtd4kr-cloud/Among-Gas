import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  ["artifacts/telegram-game/src/pages/GameMap.tsx", /getProductionCollisionWorld/],
  ["artifacts/api-server/src/ws/wsServer.ts", /getProductionCollisionWorld/],
  ["artifacts/api-server/src/ws/lobby.ts", /getProductionCollisionWorld/],
  ["artifacts/api-server/src/bot/BotAgent.ts", /getProductionCollisionWorld/],
  ["artifacts/api-server/src/sim/simulateGame.ts", /getProductionCollisionWorld/],
];
for (const [relative, pattern] of required) {
  const source = await fs.readFile(path.join(root, relative), "utf8");
  assert.match(source, pattern, relative + " must use the authored red-line collision world");
}
const generatorPath = path.join(root, "scripts/src/buildCollisionDocument.ts");
const generatorBytes = await fs.readFile(generatorPath);
const generator = generatorBytes.toString("utf8");
assert.match(generator, /owner red-line reference|red-line reference/i);
assert.equal(document.source.sourceFiles.generator.sha256, hash(generatorBytes),
  "candidate source manifest must identify the exact generator bytes");
const collisionEngineBytes = await fs.readFile(path.join(root, "lib/shared/src/collision/vectorCollision.ts"));
assert.equal(document.source.sourceFiles.collisionEngine.sha256, hash(collisionEngineBytes),
  "candidate source manifest must identify the exact collision engine bytes");
assert.match(generator, /skeletonize|function thin/);
// Vectorization must remain independent from the old fine movement/vision
// raster, but it must preserve the two already-reviewed local movement edits.
assert.doesNotMatch(generator, /buildPreciseCollisionGrid|FINE_RLE_BASE64/);
assert.match(generator, /MANUAL_BLOCKED_POLYGONS/);
assert.match(generator, /MANUAL_WALKABLE_REPLACEMENT_ZONES/);

const document = JSON.parse(await fs.readFile(path.join(root, "lib/shared/src/collision/collision.v1.json"), "utf8"));
assert.equal(document.source.kind, "redline-vector");
assert.ok(document.shapes.length >= 80, "generated vector document must contain traced red-line geometry");
assert.ok(document.source.vectorization.skeletonPixelCount >= 1000);

const { createHash } = await import("node:crypto");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const reference = await fs.readFile(path.join(root, "attached_assets/IMG_2907_1783590932507.jpeg"));
assert.equal(document.source.sourceFiles.redlineReference.sha256, hash(reference));

const overridesPath = path.join(root, "lib/shared/src/collisionOverrides.ts");
const overrides = await fs.readFile(overridesPath);
assert.equal(document.source.sourceFiles.collisionOverrides.sha256, hash(overrides),
  "vector output must record the exact manual-override source revision");
assert.match(overrides.toString("utf8"), /id: 'green-service-van-bay'/);
assert.match(overrides.toString("utf8"), /id: 'east-generator-approach-aisle'/);

const metadata = document.source.geometryOverrides;
assert.ok(metadata, "vector document must explain preserved manual movement geometry");
assert.deepEqual(metadata.walkableReplacementZones, [
  { id: "green-service-van-bay", bounds: [1985, 1055, 2260, 1260] },
  { id: "east-generator-approach-aisle", bounds: [2780, 850, 3100, 950] },
]);
assert.deepEqual(metadata.movementOnlyBlockedPolygons, ["green-service-van-silhouette"]);
const van = document.shapes.find(shape => shape.id === "manual-blocked-001-green-service-van-silhouette");
assert.ok(van, "generated vector world must retain the hand-traced van silhouette");
assert.equal(van.closed, true);
assert.equal(van.blocksMove, true);
assert.equal(van.blocksSight, false,
  "the movement-only van silhouette must not become an invented sight occluder");
assert.equal(document.source.shapeCounts.manualBlockedPolygons, 1);
assert.ok(document.shapes.every(shape => shape.blocksSight === false),
  "movement red-line shapes must not silently become vision/shadow geometry");
console.log("Red-line runtime cut-over passed: source hash, vector geometry, client prediction, server authority, and bot navigation share the authored world.");
