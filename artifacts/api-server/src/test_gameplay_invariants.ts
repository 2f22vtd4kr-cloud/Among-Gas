/**
 * Automated checks for the canonical Among Gas map and base-game mechanics.
 *
 * Run with: pnpm --filter @workspace/api-server run test:gameplay
 */
import assert from 'node:assert/strict';
import {
  buildCollisionGrid,
  canMoveTo,
  MAP_W,
  MAP_H,
} from '@workspace/shared/collisionMap';
import {
  FEET_OFFSET_Y,
  PLAYER_RADIUS,
  KILL_COOLDOWN_MS,
  NO_TARGET,
  toWire,
} from '@workspace/shared/coords';
import { TASK_DEFS } from '@workspace/shared/tasks';
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
  buildCorpsePacket,
  type Lobby,
  type LobbyPlayer,
} from './ws/lobby.js';

const grid = buildCollisionGrid();

function assertClientWalkable(x: number, y: number, label: string): void {
  // Server collision checks the feet center; the client additionally checks
  // two side points because the custom balaclava sprite is wider than its feet.
  assert.equal(canMoveTo(grid, x, y + FEET_OFFSET_Y, PLAYER_RADIUS), true, label + ' center');
  assert.equal(canMoveTo(grid, x - 10, y + FEET_OFFSET_Y, PLAYER_RADIUS), true, label + ' left edge');
  assert.equal(canMoveTo(grid, x + 10, y + FEET_OFFSET_Y, PLAYER_RADIUS), true, label + ' right edge');
}

function fakeSocket() {
  const packets: Buffer[] = [];
  const ws = {
    readyState: 1,
    send(data: Uint8Array) { packets.push(Buffer.from(data)); },
  };
  return { ws: ws as unknown as LobbyPlayer['ws'], packets };
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

// 5. Kills drop a body at the death location, rather than following the ghost.
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

// 6. Emergency meetings are single-use per player per round.
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

console.log('PASS: Among Gas gameplay invariants (map, tasks, vents, sabotage, chat, corpse drops, emergency meeting, kill)');
