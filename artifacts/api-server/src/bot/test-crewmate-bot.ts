import assert from 'node:assert/strict';
import { CrewmateBot } from './CrewmateBot.js';
import { buildPreciseCollisionGrid, isLineOfSightToInteractionTarget } from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y } from '@workspace/shared/coords';
import { LobbyManager, type Lobby, type LobbyPlayer } from '../ws/lobby.js';
import { isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { SABOTAGE_DOORS } from '@workspace/shared/sabotage';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import { SPAWN_X, SPAWN_Y } from '../ws/lobby.js';

const grid = buildPreciseCollisionGrid();
const task = TASK_DEFS.find(candidate => candidate.steps > 1 && isPlayerPositionWalkable(grid, candidate.x, candidate.y));
assert.ok(task, 'at least one task console must be a walkable bot stand-off position');

const fakeSocket = {
  readyState: 3,
  send: (_packet: unknown) => {},
} as unknown as LobbyPlayer['ws'];

const botPlayer: LobbyPlayer = {
  slot: 0,
  tgUserId: -1,
  username: 'Crewmate bot',
  ws: fakeSocket,
  x: task.x,
  y: task.y,
  lastBroadcastWireX: 0,
  lastBroadcastWireY: 0,
  role: 'crewmate',
  alive: true,
  killCooldownMs: 0,
  assignedTasks: [task.id],
  isBot: true,
};

const corpse: LobbyPlayer = {
  ...botPlayer,
  slot: 1,
  tgUserId: -2,
  username: 'Reported corpse',
  alive: false,
  corpseX: task.x,
  corpseY: task.y,
  assignedTasks: [],
  isBot: true,
};

const lobby = {
  code: 'BOTAI1',
  phase: 'ROAMING',
  players: new Map([[0, botPlayer], [1, corpse]]),
  userIdToSlot: new Map([[-1, 0], [-2, 1]]),
  hostSlot: 0,
  meeting: null,
  completedTaskSteps: new Set<string>(),
  totalTaskSteps: task.steps,
  sabotage: {
    systemId: SABOTAGE_DOORS,
    startedAtMs: Date.now(),
    padFixedAt: new Map<number, number>(),
    lockedTaskIds: [],
    timeoutTimer: setTimeout(() => {}, 60_000),
  },
  sabotageCooldownMs: 0,
} as unknown as Lobby;

const manager = new LobbyManager();
const bot = new CrewmateBot();
try {
  for (let tick = 0; tick < 5; tick++) bot.roamingTick(lobby, botPlayer, manager);

  assert.equal(lobby.phase, 'ROAMING',
    'a nearby corpse must not start a meeting while Doors sabotage is active');
  assert.ok(lobby.completedTaskSteps.has(`0:${task.id}:0`),
    'the bot must continue an unlocked task instead of idling at the unreportable corpse');
  console.log('PASS: crewmate bot continues unlocked tasks during Doors sabotage near a corpse');
} finally {
  if (lobby.sabotage) clearTimeout(lobby.sabotage.timeoutTimer);
  manager.disposeLobby(lobby);
}

 
// Regression: Fuel Engine is beside a solid car. The bot must search far enough
// inside the real interaction radius and arrive precisely, rather than stopping
// at a nearer non-visible stand-off point and retrying a rejected task forever.
{
  const fuelTask = TASK_DEFS.find(candidate => candidate.id === 7)!;
  class InspectableCrewmateBot extends CrewmateBot {
    approach(target: { x: number; y: number }, radius: number) {
      return this.nearestApproachPoint(target, radius);
    }
  }
  const fuelBot = new InspectableCrewmateBot();
  const approach = fuelBot.approach({ x: fuelTask.x, y: fuelTask.y }, TASK_INTERACTION_RANGE_PX - 8);
  assert.equal(isLineOfSightToInteractionTarget(
    grid, approach.x, approach.y + FEET_OFFSET_Y,
    fuelTask.x, fuelTask.y + FEET_OFFSET_Y, 24,
  ), true, 'Fuel Engine bot approach must be actually visible, not the nearest non-visible fallback');
  const player: LobbyPlayer = {
    slot: 0,
    tgUserId: -11,
    username: 'Fuel Engine bot',
    ws: fakeSocket,
    x: SPAWN_X,
    y: SPAWN_Y,
    lastBroadcastWireX: 0,
    lastBroadcastWireY: 0,
    role: 'crewmate',
    alive: true,
    killCooldownMs: 0,
    assignedTasks: [fuelTask.id],
    isBot: true,
    botAgent: fuelBot,
  };
  const fuelLobby = {
    code: 'FUEL01',
    phase: 'ROAMING',
    players: new Map([[0, player]]),
    userIdToSlot: new Map([[-11, 0]]),
    hostSlot: 0,
    meeting: null,
    completedTaskSteps: new Set<string>(),
    totalTaskSteps: fuelTask.steps,
    sabotage: null,
    sabotageCooldownMs: 0,
  } as unknown as Lobby;
  const fuelManager = new LobbyManager();
  try {
    for (let tick = 0; tick < 600 && fuelLobby.phase === 'ROAMING'; tick++) {
      fuelBot.roamingTick(fuelLobby, player, fuelManager);
    }
    assert.equal(fuelLobby.completedTaskSteps.size, fuelTask.steps,
      `a bot starting at the real spawn must complete both Fuel Engine steps (position=${player.x.toFixed(0)},${player.y.toFixed(0)} distance=${Math.hypot(player.x - fuelTask.x, player.y - fuelTask.y).toFixed(0)} goal=${approach.x.toFixed(0)},${approach.y.toFixed(0)})`);
    assert.equal(fuelLobby.phase, 'GAMEOVER',
      'finishing the only assigned Fuel Engine task must end the test round');
    console.log('PASS: bot reaches the visible Fuel Engine stand-off point and completes both steps');
  } finally {
    fuelManager.disposeLobby(fuelLobby);
  }
}
