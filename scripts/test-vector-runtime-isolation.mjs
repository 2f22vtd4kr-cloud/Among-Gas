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
console.log("Red-line runtime cut-over passed: client prediction, server authority, and bots share the generated vector world.");
