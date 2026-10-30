/**
 * Automated checks for the canonical Among Gas map and base-game mechanics.
 *
 * Run with: pnpm --filter @workspace/api-server run test:gameplay
 */
import assert from 'node:assert/strict';
import {
  buildCollisionGrid,
  isPlayerPositionWalkable,
  isPlayerSpawnPositionClear,
  MAP_W,
  MAP_H,
  CELL_X,
  CELL_Y,
  COLS,
  ROWS,
} from '@workspace/shared/collisionMap';
import {
  FEET_OFFSET_Y,
  PLAYER_RADIUS,
  PLAYER_HALF_WIDTH,
  PLAYER_SPRITE_HALF_WIDTH_PX,
  PLAYER_SPRITE_HALF_HEIGHT_PX,
  KILL_COOLDOWN_MS,
  NO_TARGET,
  toWire,
} from '@workspace/shared/coords';
import { TASK_DEFS } from '@workspace/shared/tasks';
import { BOT_SPEED_PX } from './bot/BotAgent.js';
import { CrewmateBot } from './bot/CrewmateBot.js';
import { ImpostorBot } from './bot/ImpostorBot.js';
import { ADMIN_TABLE_DEFS, ADMIN_TABLE_INTERACTION_RANGE_PX } from '@workspace/shared/adminTable';
import {
  VENT_DEFS,
  VENT_INTERACTION_RANGE_PX,
  canTravelVent,
  findVent,
} from '@workspace/shared/vents';
import {
  SABOTAGE_DEFS,
  SABOTAGE_LIGHTS,
  SABOTAGE_O2,
  SABOTAGE_REACTOR,
  SABOTAGE_COMMS,
  SABOTAGE_DOORS,
  SABOTAGE_COUNTDOWN_MS,
  SABOTAGE_SAFETY_MS,
  SABOTAGE_DOORS_MS,
  SABOTAGE_COOLDOWN_MS,
  getSabotageTimeoutMs,
  isCriticalSabotage,
} from '@workspace/shared/sabotage';
import {
  LobbyManager,
  MAX_PLAYERS,
  buildCorpsePacket,
  type Lobby,
  type LobbyPlayer,
} from './ws/lobby.js';
import {
  buildMovementCorrectionPacket,
  isMovementPathWalkable,
  isWalkableMovementPoint,
  validateMovementIntent,
  MOVEMENT_PACKET_BURST_CAPACITY,
  type MovementBudgetState,
} from './ws/movement.js';
import { PLAYER_SPEED_PX_PER_SEC } from '@workspace/shared/coords';

const grid = buildCollisionGrid();

function assertClientWalkable(x: number, y: number, label: string): void {
  assert.equal(isPlayerPositionWalkable(grid, x, y), true, label + ' complete feet footprint');
}

function fakeSocket() {
  const packets: Buffer[] = [];
  let closeCalls = 0;
  const ws = {
    readyState: 1,
    send(data: Uint8Array) { packets.push(Buffer.from(data)); },
    close() { closeCalls++; this.readyState = 3; },
  };
  return {
    ws: ws as unknown as LobbyPlayer['ws'],
    packets,
    get closeCalls() { return closeCalls; },
  };
}

function makePlayer(
  slot: number,
  role: LobbyPlayer['role'],
  x: number,
  y: number,
  socket = fakeSocket(),
): { player: LobbyPlayer; packets: Buffer[] } {
  return {
    packets: socket.packets,
    player: {
      slot,
      tgUserId: 9000 + slot,
      username: 'Player' + slot,
      ws: socket.ws,
      x, y,
      lastBroadcastWireX: -100_000,
      lastBroadcastWireY: -100_000,
      role,
      alive: true,
      killCooldownMs: 0,
      assignedTasks: [],
    },
  };
}

function makeLobby(players: LobbyPlayer[]): Lobby {
  return {
    code: 'GAS123',
    phase: 'ROAMING',
    players: new Map(players.map(player => [player.slot, player])),
    userIdToSlot: new Map(players.map(player => [player.tgUserId, player.slot])),
    hostSlot: 0,
    meeting: null,
    completedTaskSteps: new Set<string>(),
    totalTaskSteps: 0,
    sabotage: null,
    sabotageCooldownMs: 0,
  };
}

// Startup readiness: the server must not release bots or accept gameplay until
// every connected human client has finished loading the map and sprite atlas.
{
  const a = makePlayer(0, 'crewmate', 100, 100);
  const b = makePlayer(1, 'impostor', 130, 100);
  const lobby = makeLobby([a.player, b.player]);
  const manager = new LobbyManager();
  assert.equal(manager.isGameplayReady(lobby), false, 'new match is not ready before client acknowledgements');
  assert.equal(manager.markGameplayReady(lobby, 0), false, 'one ready client cannot start gameplay alone');
  assert.equal(manager.isGameplayReady(lobby), false, 'second client is still loading');
  assert.equal(manager.markGameplayReady(lobby, 1), true, 'gameplay unlocks after every connected human is ready');
  assert.equal(manager.isGameplayReady(lobby), true);
  lobby.phase = 'MEETING';
  assert.equal(manager.isGameplayReady(lobby), true, 'readiness persists so discussion and voting RPCs remain available');
  manager.disposeLobby(lobby);
}

// The garden surrounding the statue is walkable; only the statue footprint
// itself remains blocked by its small 2×2 RLE component.
{
  assert.equal(isPlayerPositionWalkable(grid, 1640, 449), true,
    'the western path through the central garden must remain walkable');
  assert.equal(isPlayerPositionWalkable(grid, 1810, 449), true,
    'the eastern path through the central garden must remain walkable');
  assert.equal(isPlayerPositionWalkable(grid, 1735, 449), false,
    'the central statue footprint must remain blocked');
  assert.equal(isPlayerPositionWalkable(grid, 1450, 449), true,
    'the open lobby floor west of the garden must remain walkable');
}

// 1. Tasks, vents and consoles must be valid interaction points on *this* map.
assert.equal(TASK_DEFS.length, 11, 'expected five original and six ported base-game tasks');
assert.equal(new Set(TASK_DEFS.map(task => task.id)).size, TASK_DEFS.length, 'task IDs must be unique');
for (const task of TASK_DEFS) {
  assert.ok(task.steps >= 1 && Number.isInteger(task.steps), task.name + ' has a valid step count');
  assertClientWalkable(task.x, task.y, 'task ' + task.name);
}

assert.equal(ADMIN_TABLE_DEFS.length, 1, 'expected one Admin Table console on the custom map');
assert.ok(ADMIN_TABLE_INTERACTION_RANGE_PX > 0, 'Admin Table interaction range must be positive');
for (const consoleDef of ADMIN_TABLE_DEFS) {
  assertClientWalkable(consoleDef.x, consoleDef.y, 'Admin Table console ' + consoleDef.name);
}

assert.equal(VENT_DEFS.length, 6, 'expected six vents on the custom map');
assert.ok(VENT_INTERACTION_RANGE_PX > 0, 'vent interaction range must be positive');
for (const vent of VENT_DEFS) {
  assertClientWalkable(vent.x, vent.y, 'vent ' + vent.name);
  assert.ok(findVent(vent.id), 'vent IDs must resolve');
  for (const targetId of vent.connections) {
    assert.ok(findVent(targetId), 'vent connection must point to an existing vent');
    assert.ok(canTravelVent(vent.id, targetId), 'declared vent edge must be usable');
    assert.ok(canTravelVent(targetId, vent.id), 'vent connections must be bidirectional');
  }
}
// The graph must be connected, so no vent can strand an impostor.
const visited = new Set<number>([VENT_DEFS[0].id]);
const queue = [VENT_DEFS[0].id];
for (let head = 0; head < queue.length; head++) {
  const vent = findVent(queue[head]);
  assert.ok(vent);
  for (const nextId of vent.connections) {
    if (!visited.has(nextId)) { visited.add(nextId); queue.push(nextId); }
  }
}
assert.equal(visited.size, VENT_DEFS.length, 'vent network must be connected');
assert.equal(canTravelVent(0, 2), false, 'vent travel must reject non-adjacent destinations');

for (const [systemId, definition] of Object.entries(SABOTAGE_DEFS)) {
  for (const [index, pad] of definition.pads.entries()) {
    assertClientWalkable(pad.x, pad.y, 'sabotage system ' + systemId + ' pad ' + index);
  }
}
assert.equal(KILL_COOLDOWN_MS, 15_000, 'base-game kill cooldown parity');
assert.equal(SABOTAGE_COUNTDOWN_MS, 45_000, 'critical sabotage deadline parity');
assert.equal(SABOTAGE_SAFETY_MS, 60_000);
assert.equal(SABOTAGE_DOORS_MS, 15_000);
assert.equal(SABOTAGE_COOLDOWN_MS, 30_000);
assert.equal(getSabotageTimeoutMs(SABOTAGE_O2), 45_000);
assert.equal(getSabotageTimeoutMs(SABOTAGE_REACTOR), 45_000);
assert.equal(getSabotageTimeoutMs(SABOTAGE_LIGHTS), 60_000);
assert.equal(getSabotageTimeoutMs(SABOTAGE_COMMS), 60_000);
assert.equal(getSabotageTimeoutMs(SABOTAGE_DOORS), 15_000);
assert.equal(isCriticalSabotage(SABOTAGE_O2), true);
assert.equal(isCriticalSabotage(SABOTAGE_REACTOR), true);
assert.equal(isCriticalSabotage(SABOTAGE_LIGHTS), false);
assert.equal(isCriticalSabotage(SABOTAGE_COMMS), false);
assert.equal(isCriticalSabotage(SABOTAGE_DOORS), false);

// 2. Corpse packet carries its own immutable position, in canonical wire space.
const corpse = buildCorpsePacket(3, 1000, 800);
assert.equal(corpse.length, 6);
assert.equal(corpse.readUInt8(0), 0x21);
assert.equal(corpse.readUInt8(1), 3);
assert.equal(corpse.readUInt16LE(2), toWire(1000, MAP_W));
assert.equal(corpse.readUInt16LE(4), toWire(800, MAP_H));
assert.ok(MAP_W > 0 && MAP_H > 0);

// 3. Server-authoritative vent access, movement freeze, and exit.
{
  const vent0 = findVent(0)!;
  const vent1 = findVent(1)!;
  const vent2 = findVent(2)!;
  const impostor = makePlayer(0, 'impostor', vent0.x, vent0.y);
  const crewmate = makePlayer(1, 'crewmate', vent1.x + 300, vent1.y);
  const lobby = makeLobby([impostor.player, crewmate.player]);
  const manager = new LobbyManager();

  assert.equal(manager.enterVent(lobby, 1, 0), false, 'crewmates cannot enter vents');
  assert.equal(manager.enterVent(lobby, 0, 99), false, 'unknown vent IDs are rejected');
  assert.equal(manager.enterVent(lobby, 0, 0), true, 'impostor can enter a nearby vent');
  assert.equal(impostor.player.inVent, true);
  assert.equal(impostor.player.ventId, 0);
  assert.equal(manager.travelVent(lobby, 0, 2), false, 'must not jump to unconnected vents');
  assert.equal(manager.travelVent(lobby, 0, 1), true, 'connected vent travel works');
  assert.equal(impostor.player.ventId, 1);
  assert.equal(manager.exitVent(lobby, 0), true);
  assert.equal(impostor.player.inVent, false);
  assert.equal(impostor.player.ventId, undefined);
  assert.ok(impostor.packets.some(packet => packet[0] === 0x18 && packet[1] === 0x01));
  assert.ok(impostor.packets.some(packet => packet[0] === 0x18 && packet[1] === 0x02));
  assert.ok(impostor.packets.some(packet => packet[0] === 0x18 && packet[1] === 0x03));
  manager.disposeLobby(lobby);
  void vent2;
}

// 4. Meeting chat is only available to living players during discussion.
{
  const host = makePlayer(0, 'crewmate', 100, 100);
  const ghost = makePlayer(1, 'crewmate', 120, 100);
  const speaker = makePlayer(2, 'crewmate', 130, 100);
  ghost.player.alive = false;
  const lobby = makeLobby([host.player, ghost.player, speaker.player]);
  lobby.phase = 'MEETING';
  lobby.meeting = {
    reporterSlot: 0, bodySlot: NO_TARGET, votes: new Map(), votingOpen: false,
    discussionTimer: null, votingTimer: null,
  };
  const manager = new LobbyManager();
  assert.equal(manager.sendMeetingChat(lobby, 0, 'gas check'), true);
  assert.equal(manager.sendMeetingChat(lobby, 0, 'too fast'), false, 'chat rate limit applies per sender');
  assert.equal(manager.sendMeetingChat(lobby, 1, 'ghost message'), false, 'dead players cannot chat');
  lobby.meeting.votingOpen = true;
  assert.equal(manager.sendMeetingChat(lobby, 2, 'voting started'), true, 'chat remains available during voting in the base game');
  assert.ok(host.packets.some(packet => packet[0] === 0x19 && packet[1] === 0x02));
  assert.ok(speaker.packets.some(packet => packet[0] === 0x19 && packet[1] === 0x02));
  assert.equal(ghost.packets.filter(packet => packet[0] === 0x19).length, 0, 'ghost does not receive discussion chat');
  manager.disposeLobby(lobby);
}

// 5. Bot reporting follows the immutable corpse, not the ghost's later position.
{
  const reporter = makePlayer(0, 'crewmate', 110, 100);
  const ghost = makePlayer(1, 'crewmate', 900, 900);
  const impostor = makePlayer(2, 'impostor', 500, 500);
  ghost.player.alive = false;
  ghost.player.corpseX = 100;
  ghost.player.corpseY = 100;
  const lobby = makeLobby([reporter.player, ghost.player, impostor.player]);
  const manager = new LobbyManager();
  new CrewmateBot().roamingTick(lobby, reporter.player, manager);
  assert.equal(lobby.phase, 'MEETING', 'reporter near the dropped corpse should call a meeting');
  assert.equal(lobby.meeting?.bodySlot, 1, 'meeting must reference the corpse owner even after the ghost moves away');
  assert.equal(ghost.player.bodyReported, true, 'reported corpse is marked to prevent repeated meetings');
  manager.disposeLobby(lobby);

  const ejectedReporter = makePlayer(3, 'crewmate', 510, 510);
  const ejectedGhost = makePlayer(4, 'crewmate', 500, 500);
  const livingImpostor = makePlayer(5, 'impostor', 700, 700);
  ejectedGhost.player.alive = false;
  const ejectionLobby = makeLobby([ejectedReporter.player, ejectedGhost.player, livingImpostor.player]);
  const ejectionManager = new LobbyManager();
  new CrewmateBot().roamingTick(ejectionLobby, ejectedReporter.player, ejectionManager);
  assert.equal(ejectionLobby.phase, 'ROAMING', 'an ejected ghost without a corpse must not trigger a fake report');
  ejectionManager.disposeLobby(ejectionLobby);
}

// Bots speak during the discussion window, without using omniscient global positions.
{
  const host = makePlayer(0, 'crewmate', 100, 100);
  const botPlayer = makePlayer(1, 'crewmate', 130, 100);
  const bodyPlayer = makePlayer(2, 'crewmate', 101, 100);
  botPlayer.player.isBot = true;
  bodyPlayer.player.alive = false;
  bodyPlayer.player.corpseX = 100;
  bodyPlayer.player.corpseY = 100;
  const lobby = makeLobby([host.player, botPlayer.player, bodyPlayer.player]);
  lobby.phase = 'MEETING';
  lobby.meeting = {
    reporterSlot: 0, bodySlot: 2, votes: new Map(), votingOpen: false,
    discussionTimer: null, votingTimer: null,
  };
  const manager = new LobbyManager();
  const bot = new CrewmateBot();
  bot.tick(lobby, botPlayer.player, manager);
  (bot as unknown as { nextDiscussionChatAtMs: number }).nextDiscussionChatAtMs = 0;
  bot.tick(lobby, botPlayer.player, manager);
  const chatPacket = host.packets.find(packet => packet[0] === 0x19 && packet[1] === 0x02 && packet[2] === 1);
  assert.ok(chatPacket, 'living bot contributes a discussion message to human clients');
  const chatText = chatPacket!.toString('utf8');
  assert.doesNotMatch(chatText, new RegExp(host.player.username), 'bot must not accuse a nearby player based on omniscient coordinates');
  assert.match(chatText, /body was reported|did not witness/i, 'body discussion should use public meeting context without fabricated sightings');
  assert.equal(lobby.phase, 'MEETING', 'discussion chat must not resume movement/gameplay');
  manager.disposeLobby(lobby);
}

// 6. Kills drop a body at the death location, rather than following the ghost.
{
  const vent = findVent(0)!;
  const killer = makePlayer(0, 'impostor', vent.x, vent.y);
  const victim = makePlayer(1, 'crewmate', vent.x + 10, vent.y);
  const survivorA = makePlayer(2, 'crewmate', vent.x + 100, vent.y);
  const survivorB = makePlayer(3, 'crewmate', vent.x + 150, vent.y);
  const lobby = makeLobby([killer.player, victim.player, survivorA.player, survivorB.player]);
  const manager = new LobbyManager();

  victim.player.assignedTasks = [0];
  lobby.totalTaskSteps = TASK_DEFS.find(task => task.id === 0)!.steps;
  assert.equal(manager.applyKill(lobby, 0, 1), true, 'nearby impostor can kill crewmate');
  assert.equal(victim.player.alive, false);
  assert.equal(victim.player.corpseX, vent.x + 10);
  assert.equal(victim.player.corpseY, vent.y);
  assert.equal(lobby.totalTaskSteps, TASK_DEFS.find(task => task.id === 0)!.steps, 'death must not remove unfinished ghost tasks');
  // Ghost task completion remains proximity-checked and counts toward the team win.
  victim.player.x = TASK_DEFS[0].x;
  victim.player.y = TASK_DEFS[0].y;
  assert.equal(manager.handleTaskStep(lobby, 1, 0, 0), true, 'dead crewmate may complete the first assigned step');
  assert.equal(manager.handleTaskStep(lobby, 1, 0, 0), false, 'completed ghost task steps cannot be replayed');
  assert.ok(killer.packets.some(packet => packet[0] === 0x21 && packet[1] === 1), 'corpse location is broadcast');
  manager.disposeLobby(lobby);
}

// 7. Ejected crewmates retain ghost tasks and can still win via the shared task bar.
{
  const task = TASK_DEFS[0];
  const impostor = makePlayer(0, 'impostor', task.x, task.y);
  const ejected = makePlayer(1, 'crewmate', task.x, task.y);
  const crewA = makePlayer(2, 'crewmate', task.x, task.y);
  const crewB = makePlayer(3, 'crewmate', task.x, task.y);
  ejected.player.assignedTasks = [task.id];
  const lobby = makeLobby([impostor.player, ejected.player, crewA.player, crewB.player]);
  lobby.totalTaskSteps = task.steps;
  lobby.phase = 'MEETING';
  lobby.meeting = {
    reporterSlot: 2, bodySlot: NO_TARGET, votes: new Map(), votingOpen: true,
    discussionTimer: null, votingTimer: null,
  };
  const manager = new LobbyManager();
  assert.equal(manager.castVote(lobby, 0, 1), true);
  assert.equal(manager.castVote(lobby, 1, NO_TARGET), true);
  assert.equal(manager.castVote(lobby, 2, 1), true);
  assert.equal(manager.castVote(lobby, 3, 1), true, 'last vote tallies the meeting');
  assert.equal(ejected.player.alive, false, 'voted-out crewmate becomes a ghost');
  assert.equal(lobby.phase, 'ROAMING', 'game continues after non-terminal ejection');
  assert.equal(lobby.totalTaskSteps, task.steps, 'ejection does not remove unfinished ghost tasks');
  assert.equal(manager.applyTaskStep(lobby, 1, task.id, 0), true, 'ejected crewmate can complete ghost task steps');
  if (task.steps > 1) {
    for (let step = 1; step < task.steps; step++) {
      assert.equal(manager.applyTaskStep(lobby, 1, task.id, step), true);
    }
  }
  assert.equal(lobby.phase, 'GAMEOVER', 'ghost task completion can trigger the crew task-win condition');
  manager.disposeLobby(lobby);
}

// 8. Ghost bots can phase through walls and still finish their remaining tasks.
{
  const task = TASK_DEFS.find(def => def.id === 8)!;
  const ghost = makePlayer(0, 'crewmate', MAP_W - 100, MAP_H - 100);
  ghost.player.alive = false;
  ghost.player.assignedTasks = [task.id];
  const lobby = makeLobby([ghost.player]);
  lobby.totalTaskSteps = task.steps;
  const manager = new LobbyManager();
  const bot = new CrewmateBot();

  const beforeX = ghost.player.x;
  const beforeY = ghost.player.y;
  const dx = task.x - beforeX;
  const dy = task.y - beforeY;
  const distance = Math.hypot(dx, dy);
  bot.ghostTick(lobby, ghost.player, manager);
  const movedX = ghost.player.x - beforeX;
  const movedY = ghost.player.y - beforeY;
  assert.ok(Math.abs(Math.hypot(movedX, movedY) - BOT_SPEED_PX * 1.5) < 0.001,
    'ghost movement must move directly toward the task rather than follow collision pathfinding');
  assert.ok(movedX * dx > 0 && movedY * dy > 0, 'ghost movement must progress toward the task');

  for (let tick = 0; tick < 100 && lobby.phase !== 'GAMEOVER'; tick++) {
    bot.ghostTick(lobby, ghost.player, manager);
  }
  assert.equal(lobby.completedTaskSteps.has(`0:${task.id}:0`), true,
    'ghost should complete its assigned task even when the straight route crosses walls');
  assert.equal(lobby.phase, 'GAMEOVER', 'ghost task completion can win the crew game');
  manager.disposeLobby(lobby);
  void distance;
}

// 9. Living bots can navigate to far custom-map tasks instead of silently stalling at blocked waypoints.
{
  const spawn = {
    x: Math.round(350 * MAP_W / 1040),
    y: Math.round(150 * MAP_H / 580),
  };
  for (const taskId of [2, 10]) {
    const task = TASK_DEFS.find(def => def.id === taskId)!;
    const worker = makePlayer(0, 'crewmate', spawn.x, spawn.y);
    worker.player.assignedTasks = [task.id];
    const lobby = makeLobby([worker.player]);
    lobby.totalTaskSteps = task.steps;
    const manager = new LobbyManager();
    const bot = new CrewmateBot();

    for (let tick = 0; tick < 400 && lobby.phase !== 'GAMEOVER'; tick++) {
      bot.roamingTick(lobby, worker.player, manager);
      assertClientWalkable(worker.player.x, worker.player.y,
        `living bot path remains collision-safe while approaching ${task.name} (tick ${tick})`);
    }
    assert.equal(
      lobby.phase,
      'GAMEOVER',
      `living bot must reach ${task.name} from spawn and complete all ${task.steps} step(s)`,
    );
    assert.equal(
      Array.from({ length: task.steps }, (_, step) => lobby.completedTaskSteps.has(`0:${task.id}:${step}`)).every(Boolean),
      true,
      `all steps for ${task.name} must be recorded`,
    );
    manager.disposeLobby(lobby);
  }
}

// 10. Emergency meetings are single-use per player per round.
{
  const host = makePlayer(0, 'crewmate', 100, 100);
  const guest = makePlayer(1, 'crewmate', 130, 100);
  const lobby = makeLobby([host.player, guest.player]);
  const manager = new LobbyManager();
  assert.equal(manager.callMeeting(lobby, 0, NO_TARGET), true, 'first emergency call succeeds');
  assert.equal(host.player.emergencyMeetingUsed, true);
  assert.ok(host.packets.some(packet => packet[0] === 0x20 && packet[1] === 0x01));
  const meeting = lobby.meeting!;
  if (meeting.discussionTimer) clearTimeout(meeting.discussionTimer);
  if (meeting.votingTimer) clearTimeout(meeting.votingTimer);
  lobby.meeting = null;
  lobby.phase = 'ROAMING';
  assert.equal(manager.callMeeting(lobby, 0, NO_TARGET), false, 'second emergency call is rejected');
  manager.disposeLobby(lobby);
}

// 11. Task steps are server-authoritative, ordered, assigned, in range and single-use.
{
  const task = TASK_DEFS[0]; // two-step Fix Wiring task
  const player = makePlayer(0, 'crewmate', task.x, task.y);
  player.player.assignedTasks = [task.id];
  const lobby = makeLobby([player.player]);
  lobby.totalTaskSteps = task.steps;
  const manager = new LobbyManager();

  assert.equal(manager.applyTaskStep(lobby, 0, task.id + 1, 0), false,
    'a task not assigned to the player must be rejected');
  assert.equal(manager.applyTaskStep(lobby, 0, task.id, 1), false,
    'a later step cannot be completed before the earlier step');
  assert.equal(manager.applyTaskStep(lobby, 0, task.id, 0), true,
    'the first assigned step succeeds in range');
  assert.equal(manager.applyTaskStep(lobby, 0, task.id, 0), false,
    'a completed step cannot be replayed');
  assert.equal(manager.applyTaskStep(lobby, 0, task.id, 1), true,
    'the second step succeeds after the first');
  assert.equal(lobby.phase, 'GAMEOVER', 'completing all task steps ends the round for crew');
  manager.disposeLobby(lobby);

  const far = makePlayer(0, 'crewmate', 0, 0);
  far.player.assignedTasks = [task.id];
  const farLobby = makeLobby([far.player]);
  farLobby.totalTaskSteps = task.steps;
  const farManager = new LobbyManager();
  assert.equal(farManager.applyTaskStep(farLobby, 0, task.id, 0), false,
    'task completion outside the interaction range must be rejected');
  farManager.disposeLobby(farLobby);
}

// 12. Sabotage trigger and repairs enforce roles, range, pad count and resolution.
{
  const pads = SABOTAGE_DEFS[SABOTAGE_O2].pads;
  assert.equal(pads.length, 2, 'O2 sabotage has two independent repair pads');
  const impostor = makePlayer(0, 'impostor', 100, 100);
  const crewA = makePlayer(1, 'crewmate', pads[0].x, pads[0].y);
  const crewB = makePlayer(2, 'crewmate', pads[1].x, pads[1].y);
  const farCrew = makePlayer(3, 'crewmate', 0, 0);
  const lobby = makeLobby([impostor.player, crewA.player, crewB.player, farCrew.player]);
  const manager = new LobbyManager();

  assert.equal(manager.triggerSabotage(lobby, 1, SABOTAGE_O2), false,
    'crewmates cannot trigger sabotage');
  assert.equal(manager.triggerSabotage(lobby, 0, SABOTAGE_O2), true,
    'an impostor can trigger O2 sabotage');
  assert.equal(manager.applyRepair(lobby, 3, SABOTAGE_O2, 0), 'rejected',
    'repairing from outside the pad range is rejected');
  assert.equal(manager.applyRepair(lobby, 0, SABOTAGE_O2, 0), 'rejected',
    'impostors cannot repair sabotage');
  assert.equal(manager.applyRepair(lobby, 1, SABOTAGE_O2, 0), 'progress',
    'one O2 pad alone does not resolve critical sabotage');
  assert.notEqual(lobby.sabotage, null);
  assert.equal(manager.applyRepair(lobby, 2, SABOTAGE_O2, 1), 'fixed',
    'a different pad repaired within the sync window resolves O2');
  assert.equal(lobby.sabotage, null, 'resolved sabotage clears its authoritative state');

  assert.equal(manager.triggerSabotage(lobby, 0, SABOTAGE_LIGHTS), false,
    'the shared sabotage cooldown prevents an immediate second sabotage');
  lobby.sabotageCooldownMs = 0;
  assert.equal(manager.triggerSabotage(lobby, 0, SABOTAGE_LIGHTS), true,
    'the impostor can trigger Lights after cooldown');
  const lightPad = SABOTAGE_DEFS[SABOTAGE_LIGHTS].pads[0];
  crewA.player.x = lightPad.x;
  crewA.player.y = lightPad.y;
  assert.equal(manager.applyRepair(lobby, 1, SABOTAGE_LIGHTS, 0), 'fixed',
    'Lights is resolved by one valid repair');
  assert.equal(lobby.sabotage, null);
  manager.disposeLobby(lobby);
}

// 13. Impostors begin with the authoritative cooldown; bots cannot kill at spawn.
{
  const vent = findVent(0)!;
  const playerA = makePlayer(0, 'impostor', vent.x, vent.y);
  const playerB = makePlayer(1, 'crewmate', vent.x + 10, vent.y);
  const lobby = makeLobby([playerA.player, playerB.player]);
  lobby.phase = 'WAITING';
  const manager = new LobbyManager();
  manager.startGame(lobby, 1);

  const impostor = [playerA.player, playerB.player].find(p => p.role === 'impostor')!;
  const crewmate = [playerA.player, playerB.player].find(p => p.role === 'crewmate')!;
  assert.equal(impostor.killCooldownMs, KILL_COOLDOWN_MS,
    'the impostor starts with the full authoritative kill cooldown');
  assert.equal(crewmate.killCooldownMs, 0,
    'crewmates do not receive an impostor kill cooldown');

  const bot = new ImpostorBot();
  // Avoid the unrelated randomized sabotage timer in this deterministic regression.
  (bot as unknown as { _sabotageCountdown: number })._sabotageCountdown = 100;
  impostor.x = vent.x;
  impostor.y = vent.y;
  crewmate.x = vent.x + 10;
  crewmate.y = vent.y;
  bot.roamingTick(lobby, impostor, manager);
  assert.equal(crewmate.alive, true,
    'an impostor bot cannot kill while its initial cooldown is active');

  // Once the authoritative cooldown expires, the bot can hunt and kill normally.
  impostor.killCooldownMs = 0;
  impostor.x = vent.x;
  impostor.y = vent.y;
  crewmate.x = vent.x + 10;
  crewmate.y = vent.y;
  bot.roamingTick(lobby, impostor, manager);
  assert.equal(crewmate.alive, false,
    'the bot may kill normally after the initial cooldown expires');
  manager.disposeLobby(lobby);
}

// 14. Replacing a player session keeps the old lobby roster current and
// prevents an obsolete authenticated socket from acting as the same user.
{
  const manager = new LobbyManager();
  const originalHostSocket = fakeSocket();
  const originalLobby = manager.createLobby(91001, 'OriginalHost', originalHostSocket.ws);
  const guestSocket = fakeSocket();
  const joinedOriginal = manager.joinLobby(
    originalLobby.code, 91002, 'Guest', guestSocket.ws,
  );
  assert.equal(joinedOriginal, originalLobby);
  manager.broadcastRoomUpdate(originalLobby);
  guestSocket.packets.length = 0;

  const replacementHostSocket = fakeSocket();
  const replacementLobby = manager.createLobby(
    91001, 'ReplacementHost', replacementHostSocket.ws,
  );

  assert.equal(originalLobby.hostSlot, 1, 'moving a host migrates the old lobby host');
  assert.ok(
    guestSocket.packets.some(packet => packet[0] === 0x10 && packet[1] === 0x03),
    'the old lobby receives a room update after host migration',
  );
  assert.equal(originalHostSocket.closeCalls, 1, 'the replaced host socket is closed');
  assert.equal(manager.isCurrentSocket(91001, originalHostSocket.ws), false,
    'the previous socket loses ownership immediately, before its close handshake completes');
  assert.equal(manager.isSupersededSocket(originalHostSocket.ws), true,
    'the previous socket is explicitly retired against queued post-replacement packets');
  assert.equal(manager.isSupersededSocket(replacementHostSocket.ws), false,
    'the newly bound replacement socket is not marked stale');
  assert.equal(manager.isCurrentSocket(91001, replacementHostSocket.ws), true,
    'the new socket owns the replacement room');
  assert.equal(
    manager.removePlayer(91001, originalHostSocket.ws),
    null,
    'a delayed close from the replaced socket is ignored',
  );
  assert.equal(manager.getLobbyForUser(91001), replacementLobby);
  assert.equal(replacementLobby.players.get(0)?.ws, replacementHostSocket.ws);
  manager.disposeLobby(originalLobby);
  manager.disposeLobby(replacementLobby);
}

// Moving a user by joining a different room must publish the old-room removal,
// migrate its host, and close the previous WebSocket just like create-room does.
{
  const manager = new LobbyManager();
  const oldHostSocket = fakeSocket();
  const oldLobby = manager.createLobby(92001, 'MovingHost', oldHostSocket.ws);
  const oldGuestSocket = fakeSocket();
  assert.equal(
    manager.joinLobby(oldLobby.code, 92002, 'OldGuest', oldGuestSocket.ws),
    oldLobby,
  );
  const targetHostSocket = fakeSocket();
  const targetLobby = manager.createLobby(92003, 'TargetHost', targetHostSocket.ws);
  oldGuestSocket.packets.length = 0;

  const movedSocket = fakeSocket();
  assert.equal(
    manager.joinLobby(targetLobby.code, 92001, 'MovingHost', movedSocket.ws),
    targetLobby,
  );
  assert.equal(oldLobby.hostSlot, 1);
  assert.ok(
    oldGuestSocket.packets.some(packet => packet[0] === 0x10 && packet[1] === 0x03),
    'the previous lobby receives a roster update when a member joins another room',
  );
  assert.equal(oldHostSocket.closeCalls, 1);
  assert.equal(manager.isCurrentSocket(92001, oldHostSocket.ws), false,
    'the old socket must not authorize queued actions after moving rooms');
  assert.equal(manager.isSupersededSocket(oldHostSocket.ws), true,
    'joining another room explicitly retires the previous socket');
  assert.equal(manager.isCurrentSocket(92001, movedSocket.ws), true);
  assert.equal(manager.getLobbyForUser(92001), targetLobby);
  assert.equal(targetLobby.players.get(1)?.ws, movedSocket.ws);
  assert.equal(manager.removePlayer(92001, oldHostSocket.ws), null);
  manager.disposeLobby(oldLobby);
  manager.disposeLobby(targetLobby);
}

// Reconnecting into the same waiting room replaces and closes the old socket;
// its late close event must not remove the newly bound player.
{
  const manager = new LobbyManager();
  const oldSocket = fakeSocket();
  const lobby = manager.createLobby(93001, 'Reconnect', oldSocket.ws);
  const newSocket = fakeSocket();
  assert.equal(manager.joinLobby(lobby.code, 93001, 'Reconnect', newSocket.ws), lobby);
  assert.equal(oldSocket.closeCalls, 1);
  assert.equal(manager.isCurrentSocket(93001, oldSocket.ws), false,
    'reconnecting into the same room invalidates the older socket immediately');
  assert.equal(manager.isSupersededSocket(oldSocket.ws), true,
    'same-room reconnect explicitly retires the previous socket');
  assert.equal(manager.isCurrentSocket(93001, newSocket.ws), true);
  assert.equal(lobby.players.get(0)?.ws, newSocket.ws);
  assert.equal(manager.removePlayer(93001, oldSocket.ws), null);
  assert.equal(lobby.players.get(0)?.ws, newSocket.ws);
  assert.equal(manager.getLobbyForUser(93001), lobby);
  manager.disposeLobby(lobby);
}

// 15. Client movement packets are constrained by elapsed time and swept collision.
{
  const vent = findVent(0)!;
  const base = {
    x: vent.x,
    y: vent.y,
    alive: true,
    movementCreditPx: 0,
    movementCreditUpdatedAtMs: 1_000,
    lastMovementPacketAtMs: 1_000,
  };

  const teleport = validateMovementIntent(base, vent.x + 500, vent.y, 1_100, grid);
  assert.equal(teleport.accepted, false, 'a forged long-distance movement target is rejected');
  assert.equal(teleport.x, vent.x, 'a rejected teleport does not move the authoritative player');
  assert.equal(teleport.sendCorrection, true, 'a rejected target asks the server to correct prediction');

  const closePacket = validateMovementIntent(base, vent.x + 1, vent.y, 1_005, grid);
  assert.equal(closePacket.rateLimited, false,
    'an ordered movement packet arriving inside 12ms must not be dropped solely due to arrival spacing');
  assert.equal(closePacket.accepted, true,
    'a close-arriving packet is accepted when its distance fits the elapsed movement credit');

  // Packet floods are bounded independently from movement-distance validation.
  let floodState: MovementBudgetState = { ...base };
  let acceptedFloodPackets = 0;
  let floodLimited = false;
  for (let packet = 0; packet < MOVEMENT_PACKET_BURST_CAPACITY + 2; packet++) {
    const decision = validateMovementIntent(floodState, vent.x, vent.y, 1_000, grid);
    if (decision.rateLimited) {
      floodLimited = true;
      break;
    }
    acceptedFloodPackets++;
    floodState = {
      ...floodState,
      movementCreditPx: decision.movementCreditPx,
      movementCreditUpdatedAtMs: decision.movementCreditUpdatedAtMs,
      lastMovementPacketAtMs: decision.lastMovementPacketAtMs,
      movementPacketTokens: decision.movementPacketTokens,
      movementPacketTokensUpdatedAtMs: decision.movementPacketTokensUpdatedAtMs,
    };
  }
  assert.equal(acceptedFloodPackets, MOVEMENT_PACKET_BURST_CAPACITY,
    'the packet flood guard must allow exactly its configured initial burst');
  assert.equal(floodLimited, true, 'excessive movement packet spam is rate limited');

  const legalStepDistance = PLAYER_SPEED_PX_PER_SEC * 0.05;
  const legalStep = validateMovementIntent(base, vent.x + legalStepDistance, vent.y, 1_050, grid);
  assert.equal(legalStep.accepted, true, 'a normal target within the elapsed movement budget is accepted');
  assert.ok(legalStep.x > vent.x, 'an accepted movement intent advances authoritative position');

  const ghostStep = validateMovementIntent(
    { ...base, alive: false },
    vent.x + legalStepDistance,
    vent.y,
    1_050,
    grid,
  );
  assert.equal(ghostStep.accepted, true, 'ghost movement still works through the speed budget');

  const correction = buildMovementCorrectionPacket(toWire(vent.x, MAP_W), toWire(vent.y, MAP_H));
  assert.equal(correction.length, 5, 'movement correction has the expected five-byte frame');
  assert.equal(correction.readUInt8(0), 0x22, 'movement correction uses its dedicated opcode');
  assert.equal(correction.readUInt16LE(1), toWire(vent.x, MAP_W));
  assert.equal(correction.readUInt16LE(3), toWire(vent.y, MAP_H));

  // The actual map has wall segments with walkable endpoints. Find one at
  // runtime so this regression remains tied to the canonical collision map.
  let wallCrossing: [number, number, number, number] | undefined;
  for (let y = 0; y <= MAP_H && !wallCrossing; y += 4) {
    for (let x = 4; x <= MAP_W - 4; x += 4) {
      if (!isWalkableMovementPoint(grid, x, y)) continue;
      for (const dx of [40, 48, 56, 64, 72]) {
        const tx = x + dx;
        if (tx > MAP_W || !isWalkableMovementPoint(grid, tx, y)) continue;
        if (!isMovementPathWalkable(grid, x, y, tx, y)) {
          wallCrossing = [x, y, tx, y];
          break;
        }
      }
      if (wallCrossing) break;
    }
  }
  assert.ok(wallCrossing, 'canonical collision map contains a short wall-crossing fixture');
  assert.equal(
    isMovementPathWalkable(grid, ...wallCrossing!),
    false,
    'swept path validation rejects walkable endpoints separated by a wall',
  );
}

// 16. Spawn scatter must never silently stack players at the central fallback.
{
  const manager = new LobbyManager();
  const players = Array.from({ length: MAX_PLAYERS }, (_, slot) =>
    makePlayer(slot, 'crewmate', 0, 0).player,
  );
  const lobby = makeLobby(players);
  lobby.phase = 'WAITING';
  manager.startGame(lobby, 2);
  const positions = [...lobby.players.values()].map(p => ({ x: p.x, y: p.y }));
  assert.equal(new Set(positions.map(p => `${p.x},${p.y}`)).size, positions.length,
    'all players must receive distinct spawn coordinates');
  for (const pos of positions) {
    assertClientWalkable(pos.x, pos.y, 'scattered spawn');
    assert.equal(isPlayerSpawnPositionClear(grid, pos.x, pos.y), true,
      'the complete visible sprite must spawn clear of blocked map geometry');
  }
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      assert.ok(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y) >= 72,
        'spawn positions must keep players separated to avoid initial collision pileups');
    }
  }
  manager.disposeLobby(lobby);
}


// 15a. Diagonal corner contact and wall sliding share the same full-footprint
// swept geometry as client prediction.
{
  const cornerGrid = new Uint8Array(COLS * ROWS);
  const col = Math.floor(COLS / 2);
  const row = Math.floor(ROWS / 2);
  cornerGrid[row * COLS + col] = 1;
  const wallLeft = col * CELL_X;
  const wallTop = row * CELL_Y;
  const startX = wallLeft - PLAYER_HALF_WIDTH - PLAYER_RADIUS - 3;
  const startY = wallTop - FEET_OFFSET_Y - PLAYER_RADIUS - 3;
  const delta = PLAYER_SPEED_PX_PER_SEC * 0.048 / Math.SQRT2;
  assert.equal(isWalkableMovementPoint(cornerGrid, startX, startY), true);
  assert.equal(isMovementPathWalkable(cornerGrid, startX, startY,
    startX + delta, startY + delta), false,
    'the diagonal segment must detect the blocked corner');
  const slide = validateMovementIntent({
    x: startX, y: startY, alive: true,
    movementCreditPx: 20, movementCreditUpdatedAtMs: 2_000,
    lastMovementPacketAtMs: 1_950,
  }, startX + delta, startY + delta, 2_000, cornerGrid);
  assert.equal(slide.corrected, true);
  assert.ok(slide.x > startX, 'a clear horizontal slide should be preserved');
  assert.equal(slide.y, startY, 'the rejected vertical component must not enter the corner');
  assert.equal(isMovementPathWalkable(cornerGrid, startX, startY, slide.x, slide.y), true);
}


 // 15b. Ghosts phase through walls but keep the complete sprite and feet inside map bounds.
{
  const minX = Math.max(PLAYER_SPRITE_HALF_WIDTH_PX, PLAYER_HALF_WIDTH + PLAYER_RADIUS);
  const maxX = MAP_W - minX;
  const minY = Math.max(0, PLAYER_SPRITE_HALF_HEIGHT_PX, PLAYER_RADIUS - FEET_OFFSET_Y);
  const maxY = MAP_H - Math.max(PLAYER_SPRITE_HALF_HEIGHT_PX, FEET_OFFSET_Y + PLAYER_RADIUS);
  const base = {
    x: MAP_W - 20,
    y: MAP_H / 2,
    alive: false,
    movementCreditPx: 49,
    movementCreditUpdatedAtMs: 2_000,
    lastMovementPacketAtMs: 1_950,
  };
  const east = validateMovementIntent(base, MAP_W + 20, base.y, 2_000, grid);
  assert.equal(east.accepted, true, 'ghost movement remains speed-budgeted and accepted');
  assert.equal(east.corrected, true, 'east-edge ghost target must be clamped');
  assert.equal(east.x, maxX, 'server east-edge clamp must retain the complete foot base');

  const southBase = { ...base, x: MAP_W / 2, y: MAP_H - 20 };
  const south = validateMovementIntent(southBase, southBase.x, MAP_H + 20, 2_000, grid);
  assert.equal(south.corrected, true, 'south-edge ghost target must be clamped');
  assert.equal(south.y, maxY, 'server south-edge clamp must retain the complete sprite and feet');
  const west = validateMovementIntent({ ...base, x: 20 }, -20, base.y, 2_000, grid);
  const north = validateMovementIntent({ ...base, y: 50 }, base.x, 20, 2_000, grid);
  assert.equal(west.x, minX, 'server west-edge clamp must retain the complete sprite');
  assert.equal(north.y, minY, 'server north-edge clamp must remain nonnegative for unsigned wire coordinates');

  assert.ok(minX < maxX && minY < maxY, 'map must have non-empty safe ghost bounds');
}



// 17. Voting handles ties, skip majorities, duplicate/dead voters, and both
// terminal ejection outcomes without accidentally ejecting a player.
{
  const createVotingFixture = (roles: Array<'crewmate' | 'impostor'>) => {
    const players = roles.map((role, slot) =>
      makePlayer(slot, role, MAP_W / 2, MAP_H / 2).player,
    );
    const lobby = makeLobby(players);
    lobby.phase = 'MEETING';
    lobby.meeting = {
      reporterSlot: 0,
      bodySlot: NO_TARGET,
      votes: new Map(),
      votingOpen: true,
      discussionTimer: null,
      votingTimer: null,
    };
    return { lobby, manager: new LobbyManager(), players };
  };

  // 2–2 tie: no one is ejected and play resumes.
  {
    const { lobby, manager, players } = createVotingFixture([
      'impostor', 'crewmate', 'crewmate', 'crewmate',
    ]);
    assert.equal(manager.castVote(lobby, 0, 1), true);
    assert.equal(manager.castVote(lobby, 0, 2), false,
      'a player cannot submit a second vote in the same meeting');
    assert.equal(manager.castVote(lobby, 1, 2), true);
    assert.equal(manager.castVote(lobby, 2, 1), true);
    assert.equal(manager.castVote(lobby, 3, 2), true);
    assert.equal(lobby.phase, 'ROAMING', 'a tied vote must resume roaming');
    assert.equal(players[1].alive, true, 'a tied vote must not eject the first candidate');
    assert.equal(players[2].alive, true, 'a tied vote must not eject the second candidate');
    manager.disposeLobby(lobby);
  }

  // Skip majority: skip wins the tally; dead players cannot vote.
  {
    const { lobby, manager, players } = createVotingFixture([
      'impostor', 'crewmate', 'crewmate', 'crewmate',
    ]);
    players[3].alive = false;
    assert.equal(manager.castVote(lobby, 3, 1), false,
      'dead players cannot cast meeting votes');
    assert.equal(manager.castVote(lobby, 0, NO_TARGET), true);
    assert.equal(manager.castVote(lobby, 1, NO_TARGET), true);
    assert.equal(manager.castVote(lobby, 2, 1), true);
    assert.equal(lobby.phase, 'ROAMING', 'a skip majority must not eject anyone');
    assert.equal(players[1].alive, true, 'skip majority must preserve the leading player');
    manager.disposeLobby(lobby);
  }

  // Removing the final impostor is an immediate crewmate win.
  {
    const { lobby, manager, players } = createVotingFixture([
      'impostor', 'crewmate', 'crewmate', 'crewmate',
    ]);
    for (let voter = 0; voter < players.length; voter++) {
      assert.equal(manager.castVote(lobby, voter, 0), true);
    }
    assert.equal(players[0].alive, false);
    assert.equal(lobby.phase, 'GAMEOVER', 'ejecting the final impostor must end the round');
    manager.disposeLobby(lobby);
  }

  // Ejecting a crewmate when impostors reach parity is an impostor win.
  {
    const { lobby, manager, players } = createVotingFixture([
      'impostor', 'impostor', 'crewmate', 'crewmate',
    ]);
    for (let voter = 0; voter < players.length; voter++) {
      assert.equal(manager.castVote(lobby, voter, 2), true);
    }
    assert.equal(players[2].alive, false);
    assert.equal(lobby.phase, 'GAMEOVER', 'impostor parity after ejection must end the round');
    manager.disposeLobby(lobby);
  }
}

console.log('PASS: Among Gas gameplay invariants (map, tasks, vents, sabotage, chat, corpses, meetings, lobby sessions, bot cooldown, kill and spawn separation)');
