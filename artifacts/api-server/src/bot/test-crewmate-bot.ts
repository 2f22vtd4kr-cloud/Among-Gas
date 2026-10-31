import assert from 'node:assert/strict';
import { CrewmateBot } from './CrewmateBot.js';
import { grid } from './BotAgent.js';
import { LobbyManager, type Lobby, type LobbyPlayer } from '../ws/lobby.js';
import { isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { SABOTAGE_DOORS } from '@workspace/shared/sabotage';
import { TASK_DEFS } from '@workspace/shared/tasks';

const task = TASK_DEFS.find(candidate => isPlayerPositionWalkable(grid, candidate.x, candidate.y));
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
