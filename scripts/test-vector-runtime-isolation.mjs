import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const gameMap = read("artifacts/telegram-game/src/pages/GameMap.tsx");
const server = read("artifacts/api-server/src/ws/wsServer.ts");
const bots = read("artifacts/api-server/src/bot/BotAgent.ts");
const player = read("artifacts/telegram-game/src/game/player.ts");
const productionWorld = read("lib/shared/src/collision/productionWorld.ts");
const vite = read("artifacts/telegram-game/vite.config.ts");
const generator = read("scripts/src/buildCollisionDocument.ts");

assert.match(gameMap, /PRODUCTION_COLLISION_WORLD/,
  "the live Phaser game must import the production vector world");
assert.match(gameMap, /\.movePlayerAtFeet\(/,
  "client movement prediction must use vector collision");
assert.match(gameMap, /\.isLineOfSightClear\(/,
  "body/vision line-of-sight must use vector geometry");
assert.match(gameMap, /\.isLineOfSightToInteractionTarget\(/,
  "task interaction visibility must use vector geometry");
assert.match(gameMap, /PRODUCTION_COLLISION_WORLD\.visibility\(/,
  "the player visibility polygon must use the vector sight layer");
assert.doesNotMatch(gameMap, /taskInteractionGrid|buildPreciseCollisionGrid\(/,
  "the live client must not retain an independent raster collision grid");

assert.match(server, /getProductionCollisionWorld/,
  "the authoritative websocket server must obtain the active vector world");
assert.match(server, /\.movePlayerAtFeet\(/,
  "server movement validation must use vector collision");
assert.doesNotMatch(server, /buildCollisionGrid\(/,
  "the server must not rebuild an independent raster movement grid");

assert.match(bots, /getProductionCollisionWorld/,
  "bot navigation must use the same active vector world");
assert.match(bots, /\.rasterizePlayerNav\(/,
  "bot navigation grid must be rasterized from vector geometry");
assert.match(bots, /\.movePlayerAtFeet\(/,
  "bot route validation must use vector collision");

assert.match(player, /isPlayerSpawnPositionClear/,
  "client spawn selection must preserve full-sprite clearance");
assert.match(productionWorld, /PRODUCTION_COLLISION_WORLD/);
assert.match(productionWorld, /replaceProductionCollisionDocument/);
assert.match(vite, /generatedDocument\.ts/,
  "editor saves must refresh the client module consumed by live gameplay");
assert.match(generator, /collision\.v1\.json/,
  "the build pipeline must consume the editor's saved candidate");

console.log("Vector runtime integration: client, websocket server, bots, and editor candidate are connected.");
