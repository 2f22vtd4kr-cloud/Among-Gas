import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  ["artifacts/telegram-game/src/pages/GameMap.tsx", /getProductionCollisionWorld/],
  ["artifacts/api-server/src/ws/wsServer.ts", /getProductionCollisionWorld/],
  ["artifacts/api-server/src/bot/BotAgent.ts", /getProductionCollisionWorld/],
];
for (const [relative, pattern] of required) {
  const source = await fs.readFile(path.join(root, relative), "utf8");
  assert.match(source, pattern, relative + " must use the authored red-line collision world");
}
const generator = await fs.readFile(path.join(root, "scripts/src/buildCollisionDocument.ts"), "utf8");
assert.match(generator, /owner red-line reference|red-line reference/i);
assert.match(generator, /skeletonize|function thin/);
assert.doesNotMatch(generator, /buildPreciseCollisionGrid|FINE_RLE_BASE64|MANUAL_BLOCKED_POLYGONS/);
const document = JSON.parse(await fs.readFile(path.join(root, "lib/shared/src/collision/collision.v1.json"), "utf8"));
assert.equal(document.source.kind, "redline-vector");
assert.ok(document.shapes.length >= 80, "generated vector document must contain traced red-line geometry");
assert.ok(document.source.vectorization.skeletonPixelCount >= 1000);
const { createHash } = await import("node:crypto");
const reference = await fs.readFile(path.join(root, "attached_assets/IMG_2907_1783590932507.jpeg"));
assert.equal(document.source.sourceFiles.redlineReference.sha256, createHash("sha256").update(reference).digest("hex"));
console.log("Red-line runtime cut-over passed: source hash, vector geometry, client prediction, server authority, and bot navigation share the authored world.");
