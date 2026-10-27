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
const sabotageSource = read('lib/shared/src/sabotage.ts');
const minigameSource = read('artifacts/telegram-game/src/components/TaskMinigame.tsx');
const indexHtml = read('artifacts/telegram-game/index.html');
const gameContext = read('artifacts/telegram-game/src/context/GameContext.tsx');
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
const wireRunsMatch = collisionData.match(/export const RUNS(?::\\s*number\\[\\])?\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;/);
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
const parseRefPoints = (block) => [...block.matchAll(/ref\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)/g)]
  .map(m => ({ refX: Number(m[1]), refY: Number(m[2]), ...fromRef(Number(m[1]), Number(m[2])) }));
const taskBlock = taskSource.match(/export const TASK_DEFS[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\]\\s*as const;/)?.[1];
assert.ok(taskBlock, 'Could not parse TASK_DEFS');
const tasks = [...taskBlock.matchAll(/\\{\\s*id:\\s*(\\d+)\\s*,\\s*name:\\s*'([^']+)'[\\s\\S]*?\\.\\.\\.ref\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)\\s*\\}/g)]
  .map(m => ({ id: Number(m[1]), name: m[2], ...fromRef(Number(m[3]), Number(m[4])) }));
assert.equal(tasks.length, 11, 'Expected the five existing Among Gas tasks plus six ported base-game tasks');
tasks.forEach((task, index) => assert.equal(task.id, index, `Task IDs must be contiguous; ${task.name} has id ${task.id}`));
const taskRange = Math.round(55 * mapW / 1040);
for (const task of tasks) {
  const distance = closestReachable(task.x, task.y);
  assert.ok(distance <= taskRange, `Task ${task.id} (${task.name}) is ${Math.round(distance)}px from the reachable path; interaction limit is ${taskRange}px`);
}
const ventBlock = ventSource.match(/export const VENT_DEFS[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\]\\s*as const;/)?.[1];
assert.ok(ventBlock, 'Could not parse VENT_DEFS');
const vents = [...ventBlock.matchAll(/\\{\\s*id:\\s*(\\d+)\\s*,\\s*name:\\s*'([^']+)'[\\s\\S]*?\\.\\.\\.ref\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)\\s*,\\s*connections:\\s*\\[([^\\]]*)\\]\\s*\\}/g)]
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
const saboPadBlock = sabotageSource.match(/export const SABOTAGE_DEFS[\\s\\S]*?(?=\\/\\*\\* Pixel radius)/)?.[0];
assert.ok(saboPadBlock, 'Could not parse sabotage pads');
const saboPads = parseRefPoints(saboPadBlock);
assert.equal(saboPads.length, 6, 'Expected Lights, two O₂ pads, two Reactor pads and Comms repair consoles');
const saboRange = Math.round(55 * mapW / 1040);
for (const [i, pad] of saboPads.entries()) {
  assert.ok(closestReachable(pad.x, pad.y) <= saboRange,
    `Sabotage repair pad ${i} is outside a reachable interaction radius`);
}
assert.match(sabotageSource, /SABOTAGE_COUNTDOWN_MS\\s*=\\s*45_000/, 'Critical sabotage must use the base-game 45-second window');
assert.match(coords, /KILL_COOLDOWN_MS\\s*=\\s*15_000/, 'Kill cooldown must match the established base-game clone');
const minigameIds = [...minigameSource.matchAll(/taskId === (\\d+) &&/g)].map(m => Number(m[1])).sort((a,b) => a-b);
assert.deepEqual(minigameIds, [...Array(tasks.length).keys()], 'Every assigned task needs a playable minigame');
assert.match(indexHtml, /telegram-web-app\\.js/, 'Telegram WebApp SDK must load before React bootstraps');
assert.match(indexHtml, /viewport-fit=cover/, 'Viewport must account for mobile safe areas');
assert.match(gameContext, /if \\(import\\.meta\\.env\\.PROD\\) return ''/, 'Production must not fabricate Telegram identities');
assert.match(lobbySource, /emergencyMeetingUsed/, 'Server must enforce one emergency meeting per player per round');

console.log(JSON.stringify({
  ok: true,
  collisionGrid: `${cols}×${rows}`,
  reachableCells: reachableNodes.length,
  taskCount: tasks.length,
  ventCount: vents.length,
  sabotageRepairPads: saboPads.length,
  telegramBootstrap: 'present',
}, null, 2));
