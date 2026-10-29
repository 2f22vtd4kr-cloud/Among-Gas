import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const num = (text, name) => {
  const m = text.match(new RegExp('export const ' + name + '\\s*=\\s*(\\d+)'));
  assert.ok(m, `Missing numeric constant ${name}`);
  return Number(m[1]);
};
const collisionData = read('lib/shared/src/collisionData.ts');
const collisionMap = read('lib/shared/src/collisionMap.ts');
const coords = read('lib/shared/src/coords.ts');
const taskSource = read('lib/shared/src/tasks.ts');
const ventSource = read('lib/shared/src/vents.ts');
const adminTableSource = read('lib/shared/src/adminTable.ts');
const sabotageSource = read('lib/shared/src/sabotage.ts');
const minigameSource = read('artifacts/telegram-game/src/components/TaskMinigame.tsx');
const gameMapSource = read('artifacts/telegram-game/src/pages/GameMap.tsx');
const visibilitySource = read('artifacts/telegram-game/src/game/visibility.ts');
const indexHtml = read('artifacts/telegram-game/index.html');
const gameContext = read('artifacts/telegram-game/src/context/GameContext.tsx');
const playerSource = read('artifacts/telegram-game/src/game/player.ts');
const appSource = read('artifacts/telegram-game/src/App.tsx');
const uiLobbySource = read('artifacts/telegram-game/src/pages/Lobby.tsx');
const settingsDialogSource = read('artifacts/telegram-game/src/components/SettingsDialog.tsx');
const languageSource = read('artifacts/telegram-game/src/lib/language.ts');
const impostorBotSource = read('artifacts/api-server/src/bot/ImpostorBot.ts');
const botAgentSource = read('artifacts/api-server/src/bot/BotAgent.ts');
const crewmateBotSource = read('artifacts/api-server/src/bot/CrewmateBot.ts');
const gameplayInvariantSource = read('artifacts/api-server/src/test_gameplay_invariants.ts');
const lobbySource = read('artifacts/api-server/src/ws/lobby.ts');

const cols = num(collisionData, 'COLS');
const rows = num(collisionData, 'ROWS');
const mapW = num(collisionMap, 'MAP_W');
const mapH = num(collisionMap, 'MAP_H');
const cellX = mapW / cols;
const cellY = mapH / rows;
const spriteHeight = Math.round(36 * (mapW / 1652));
const feetOffsetY = Math.round(spriteHeight * 0.25);
const playerRadius = num(coords, 'PLAYER_RADIUS');
const wireRunsMatch = collisionData.match(/export const RUNS(?::\s*number\[\])?\s*=\s*\[([\s\S]*?)\]\s*;/);
assert.ok(wireRunsMatch, 'Could not parse RLE collision grid');
const runs = wireRunsMatch[1].split(',').map(s => Number(s.trim())).filter(Number.isFinite);
const grid = new Uint8Array(cols * rows);
let cursor = 0;
let value = 0;
for (const run of runs) {
  assert.ok(Number.isInteger(run) && run >= 0, 'Collision RLE contains an invalid run');
  assert.ok(cursor + run <= grid.length, 'Collision RLE exceeds grid dimensions');
  grid.fill(value, cursor, cursor + run);
  cursor += run;
  value = 1 - value;
}
assert.equal(cursor, cols * rows, 'Collision RLE does not fill the grid');

const blocked = (x, y) => {
  const col = Math.floor(x / cellX);
  const row = Math.floor(y / cellY);
  return col < 0 || col >= cols || row < 0 || row >= rows || grid[row * cols + col] === 1;
};
// Mirror shared collisionMap.canMoveTo and the server's feet-offset check.
const canPlayerMoveTo = (x, y) => {
  const feetY = y + feetOffsetY;
  if (blocked(x, feetY)) return false;
  const samples = Math.max(8, Math.ceil((2 * Math.PI * playerRadius) / (Math.min(cellX, cellY) * 0.5)));
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    if (blocked(x + Math.cos(angle) * playerRadius, feetY + Math.sin(angle) * playerRadius)) return false;
  }
  return true;
};
const pointForCell = (col, row) => ({ x: (col + 0.5) * cellX, y: (row + 0.5) * cellY });
const valid = new Uint8Array(cols * rows);
const nodes = [];
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const point = pointForCell(col, row);
    if (!canPlayerMoveTo(point.x, point.y)) continue;
    const index = row * cols + col;
    valid[index] = 1;
    nodes.push({ col, row, ...point, index });
  }
}
const spawnX = Math.round(350 * mapW / 1040);
const spawnY = Math.round(150 * mapH / 580);
assert.ok(canPlayerMoveTo(spawnX, spawnY), 'Spawn position is not collision-walkable');
let start = nodes[0];
for (const node of nodes) {
  if ((node.x - spawnX) ** 2 + (node.y - spawnY) ** 2 <
      (start.x - spawnX) ** 2 + (start.y - spawnY) ** 2) start = node;
}
const reachable = new Uint8Array(cols * rows);
const queue = [start];
reachable[start.index] = 1;
for (let head = 0; head < queue.length; head++) {
  const current = queue[head];
  for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const col = current.col + dc;
    const row = current.row + dr;
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
    const index = row * cols + col;
    if (!valid[index] || reachable[index]) continue;
    const next = pointForCell(col, row);
    let clear = true;
    for (let step = 1; step < 10; step++) {
      const t = step / 10;
      if (!canPlayerMoveTo(current.x + (next.x - current.x) * t,
                           current.y + (next.y - current.y) * t)) {
        clear = false;
        break;
      }
    }
    if (clear) {
      reachable[index] = 1;
      queue.push({ col, row, ...next, index });
    }
  }
}
const reachableNodes = queue;
const closestReachable = (x, y) => {
  let best = Infinity;
  for (const p of reachableNodes) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
};
const fromRef = (x, y) => ({ x: Math.round(x * mapW / 1040), y: Math.round(y * mapH / 580) });
const parseRefPoints = (block) => [...block.matchAll(/ref\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)]
  .map(m => ({ refX: Number(m[1]), refY: Number(m[2]), ...fromRef(Number(m[1]), Number(m[2])) }));
const taskBlock = taskSource.match(/export const TASK_DEFS[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const;/)?.[1];
assert.ok(taskBlock, 'Could not parse TASK_DEFS');
const tasks = [...taskBlock.matchAll(/\{\s*id:\s*(\d+)\s*,\s*name:\s*'([^']+)'[\s\S]*?\.\.\.ref\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*\}/g)]
  .map(m => ({ id: Number(m[1]), name: m[2], ...fromRef(Number(m[3]), Number(m[4])) }));
assert.equal(tasks.length, 11, 'Expected the five existing Among Gas tasks plus six ported base-game tasks');
tasks.forEach((task, index) => assert.equal(task.id, index, `Task IDs must be contiguous; ${task.name} has id ${task.id}`));
const taskRange = Math.round(55 * mapW / 1040);
const botTaskApproachRange = taskRange - 30; // CrewmateBot.nearestApproachPoint intentionally keeps a 30px margin.
for (const task of tasks) {
  const distance = closestReachable(task.x, task.y);
  assert.ok(distance <= botTaskApproachRange,
    `Task ${task.id} (${task.name}) is ${Math.round(distance)}px from the reachable path; bot approach limit is ${botTaskApproachRange}px (player interaction limit ${taskRange}px)`);
}
const ventBlock = ventSource.match(/export const VENT_DEFS[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const;/)?.[1];
assert.ok(ventBlock, 'Could not parse VENT_DEFS');
const vents = [...ventBlock.matchAll(/\{\s*id:\s*(\d+)\s*,\s*name:\s*'([^']+)'[\s\S]*?\.\.\.ref\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*,\s*connections:\s*\[([^\]]*)\]\s*\}/g)]
  .map(m => ({ id: Number(m[1]), name: m[2], ...fromRef(Number(m[3]), Number(m[4])), connections: m[5].split(',').map(s => Number(s.trim())).filter(Number.isFinite) }));
assert.equal(vents.length, 6, 'Expected six custom-map vents');
const ventIds = new Set(vents.map(v => v.id));
for (const vent of vents) {
  assert.ok(canPlayerMoveTo(vent.x, vent.y), `Vent ${vent.id} (${vent.name}) is not collision-walkable`);
  assert.ok(closestReachable(vent.x, vent.y) <= Math.max(cellX, cellY) * 1.25,
    `Vent ${vent.id} (${vent.name}) is not connected to the spawn area`);
  for (const to of vent.connections) {
    assert.ok(ventIds.has(to), `Vent ${vent.id} points to missing vent ${to}`);
    const other = vents.find(v => v.id === to);
    assert.ok(other.connections.includes(vent.id), `Vent connection ${vent.id} ↔ ${to} is not symmetric`);
  }
}
const saboPadBlock = sabotageSource.match(/export const SABOTAGE_DEFS[\s\S]*?(?=\/\*\* Pixel radius)/)?.[0];
assert.ok(saboPadBlock, 'Could not parse sabotage pads');
const saboPads = parseRefPoints(saboPadBlock);
assert.equal(saboPads.length, 6, 'Expected Lights, two O₂ pads, two Reactor pads and Comms repair consoles');
const saboRange = Math.round(55 * mapW / 1040);
const botSaboApproachRange = saboRange - 30; // CrewmateBot uses the same safety margin for repair consoles.
for (const [i, pad] of saboPads.entries()) {
  const distance = closestReachable(pad.x, pad.y);
  assert.ok(distance <= botSaboApproachRange,
    `Sabotage repair pad ${i} is ${Math.round(distance)}px from the reachable path; bot approach limit is ${botSaboApproachRange}px`);
}
const adminTableStart = adminTableSource.indexOf('export const ADMIN_TABLE_DEFS');
const adminTableEnd = adminTableSource.indexOf('] as const;', adminTableStart);
const adminBlock = adminTableStart >= 0 && adminTableEnd >= 0
  ? adminTableSource.slice(adminTableStart, adminTableEnd + '] as const;'.length)
  : null;
assert.ok(adminBlock, 'Could not parse ADMIN_TABLE_DEFS');
const adminTables = parseRefPoints(adminBlock);
assert.equal(adminTables.length, 1, 'Expected one custom-map Admin Table console');
const adminRange = Math.round(55 * mapW / 1040);
for (const [i, consoleDef] of adminTables.entries()) {
  assert.ok(canPlayerMoveTo(consoleDef.x, consoleDef.y), `Admin Table console ${i} is not walkable`);
  assert.ok(closestReachable(consoleDef.x, consoleDef.y) <= adminRange,
    `Admin Table console ${i} is outside a reachable interaction radius`);
}
assert.match(sabotageSource, /SABOTAGE_COUNTDOWN_MS\s*=\s*45_000/, 'Critical sabotage must use the base-game 45-second window');
assert.match(coords, /KILL_COOLDOWN_MS\s*=\s*15_000/, 'Kill cooldown must match the established base-game clone');
assert.match(sabotageSource, /NORMAL_VISION_RADIUS_PX\s*=\s*Math\.round\(260 \* _sx\)/, 'Normal crewmate vision must be defined in map pixels');
assert.match(sabotageSource, /IMPOSTOR_VISION_RADIUS_PX\s*=\s*Math\.round\(NORMAL_VISION_RADIUS_PX \* 1\.4\)/, 'Impostors must have longer base-game vision');
assert.match(sabotageSource, /LIGHTS_CREWMATE_VISION_RADIUS_PX\s*=\s*Math\.round\(NORMAL_VISION_RADIUS_PX \* LIGHTS_VISION_SCALE\)/, 'Lights sabotage must reduce crew vision');
assert.match(playerSource, /PLAYER_ANIM_INTERVAL_MS = 90/, 'Walking animation must run at a responsive ~11 fps rather than the previous ~7 fps');
assert.match(lobbySource, /\}, 200\); \/\/ 5Hz/, 'Bot AI must update at 10Hz rather than 5Hz');
assert.match(botAgentSource, /BOT_MOVEMENT_STEP_PX = BOT_SPEED_PX \/ 2/, 'Living bots must keep human-like movement speed after the tick rate increase');
assert.match(crewmateBotSource, /TASK_DWELL_TICKS = 5/, 'Task dwell time must remain 1s at the 5Hz bot AI rate');
assert.match(impostorBotSource, /SABOTAGE_INTERVAL_TICKS = 300/, 'Sabotage timing must remain about 60s at the 10Hz tick rate');
assert.match(gameMapSource, /const shadowGrid = buildShadowGrid\(grid\)/, 'GameMap must derive a separate vision occlusion grid from collision');
assert.match(gameMapSource, /const rawVisiblePolygon = computeVisibilityPolygon\(px, py, visionRadius, shadowGrid\)/, 'GameMap must trace sight against its separate visual occlusion grid');
assert.match(gameMapSource, /const visiblePolygon = smoothVisibilityPolygon\(rawVisiblePolygon, \{ x: px, y: py \}\)/, 'GameMap must conservatively smooth shadow contours without changing movement collision');
assert.match(gameMapSource, /stepPlayer\(\s*grid,/, 'Movement must continue to use the original collision grid');
assert.doesNotMatch(gameMapSource, /showCollision|Show Collision \[C\]|toggle collision overlay/i, 'Collision debug controls must not appear in player gameplay');
assert.match(gameMapSource, /getCharacterFrameRect\(slotColor\(body\.slot\), 'dead-body'\)/, 'A corpse must use the authored exposed-bone balaclava sprite, not a synthetic crop');
assert.match(gameMapSource, /if \(lastKill\.victimSlot === mySlot\) \{\s*setKillAnimation\(lastKill\)/, 'Only the victim should receive the full-screen kill sequence');
assert.match(gameMapSource, /sfx\('footstep'/, 'Local walking must trigger footsteps');
assert.match(gameMapSource, /const hearingRange = 520/, 'Nearby bystanders must hear kills within the local sound radius');
assert.match(gameMapSource, /sfx\('taskComplete'/, 'Task completion must trigger its sound cue');
assert.match(gameMapSource, /sfx\(meeting\.bodySlot === NO_TARGET \? 'meeting' : 'bodyReport'/, 'Body reports and emergency meetings must have distinct sound cues');
assert.match(appSource, /VITE_ENABLE_DEV_TOOLS === 'true' && <Route path="\/collision-editor"/, 'Collision editor route must require explicit opt-in even on dev preview servers');
assert.match(gameMapSource, /VITE_ENABLE_DEV_TOOLS === 'true' && \(/, 'Collision editor link must require explicit opt-in even on dev preview servers');
assert.match(settingsDialogSource, /setLanguage\(option\.value\)/, 'Language selector must live in Settings');
assert.match(uiLobbySource, /onSettingsClick/, 'Lobby must expose the Settings entry point');
assert.match(languageSource, /amongGas\.language/, 'Language preference must persist across lobby/game routes');
assert.match(gameContext, /VITE_ENABLE_GAME_MOCKS !== 'true'/, 'Mock mid-game fixtures must require explicit opt-in on development previews');
assert.match(lobbySource, /p\.killCooldownMs = p\.role === 'impostor' \? KILL_COOLDOWN_MS : 0/, 'Impostors must start with the authoritative kill cooldown');
assert.match(gameContext, /killCooldownMs: myRole === 'impostor' \? KILL_COOLDOWN_MS : 0/, 'Client Kill UI must mirror the initial impostor cooldown');
assert.match(gameplayInvariantSource, /starts with the full authoritative kill cooldown/, 'Initial impostor cooldown must have a gameplay regression test');
assert.match(gameMapSource, /if \(!isLocalGhost && \(localRole === 'crewmate' \|\| localRole === 'impostor'\)\)/, 'Only living players use the limited visibility mask');
assert.match(visibilitySource, /const VISION_RAY_COUNT = 720/, 'Sight rays must be smooth without quadratic wall-segment intersections');
const minigameIds = [...minigameSource.matchAll(/taskId === (\d+) &&/g)].map(m => Number(m[1])).sort((a,b) => a-b);
assert.deepEqual(minigameIds, [...Array(tasks.length).keys()], 'Every assigned task needs a playable minigame');
assert.match(indexHtml, /telegram-web-app\.js/, 'Telegram WebApp SDK must load before React bootstraps');
assert.match(indexHtml, /viewport-fit=cover/, 'Viewport must account for mobile safe areas');
assert.match(gameContext, /if \(import\.meta\.env\.PROD\) return ''/, 'Production must not fabricate Telegram identities');
assert.match(lobbySource, /emergencyMeetingUsed/, 'Server must enforce one emergency meeting per player per round');

console.log(JSON.stringify({
  ok: true,
  collisionGrid: `${cols}×${rows}`,
  reachableCells: reachableNodes.length,
  taskCount: tasks.length,
  ventCount: vents.length,
  adminTableCount: adminTables.length,
  sabotageRepairPads: saboPads.length,
  visionRayCount: 720,
  telegramBootstrap: 'present',
}, null, 2));
