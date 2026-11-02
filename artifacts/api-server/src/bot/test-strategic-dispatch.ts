import assert from 'node:assert/strict';
import { CrewmateBot } from './CrewmateBot.js';
import { ImpostorBot } from './ImpostorBot.js';
import { SABOTAGE_DEFS, IMPOSTOR_VISION_RADIUS_PX } from '@workspace/shared/sabotage';
import { buildPreciseCollisionGrid, isLineOfSightClear, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y } from '@workspace/shared/coords';
import { TASK_DEFS } from '@workspace/shared/tasks';
import type { Point } from '@workspace/shared';
import type { Lobby, LobbyManager, LobbyPlayer } from '../ws/lobby.js';
import { SPAWN_X, SPAWN_Y } from '../ws/lobby.js';

const originalFetch = globalThis.fetch;
const fakeSocket = { readyState: 3, send: (_packet: unknown) => {} } as unknown as LobbyPlayer['ws'];

class ProbeCrewmateBot extends CrewmateBot {
  override nearestApproachPoint(target: Point, _maxRadius: number, _targetRadiusPx = 24): Point {
    return target;
  }

  override navigateTo(_self: LobbyPlayer, _goal: Point): boolean {
    // Keep the test focused on target selection. Path execution remains covered
    // by the separate bot-navigation and full-game simulation suites.
    return false;
  }

  currentTargetTaskId(): number | null {
    return (this as unknown as { _targetTaskId: number | null })._targetTaskId;
  }

  isTaskPlanningPending(): boolean {
    return (this as unknown as { _taskPlanningPending: boolean })._taskPlanningPending;
  }
}

function makeLobby(apiKey: string): { lobby: Lobby; bot: LobbyPlayer; manager: LobbyManager } {
  const host: LobbyPlayer = {
    slot: 0,
    tgUserId: -100,
    username: 'Human host',
    groqApiKey: apiKey,
    ws: fakeSocket,
    x: 3000,
    y: 1700,
    lastBroadcastWireX: 0,
    lastBroadcastWireY: 0,
    role: 'crewmate',
    alive: true,
    killCooldownMs: 0,
    assignedTasks: [],
  };
  const tasks = [TASK_DEFS.find(task => task.id === 4)!, TASK_DEFS.find(task => task.id === 1)!];
  const bot: LobbyPlayer = {
    slot: 1,
    tgUserId: -101,
    username: 'Nova',
    ws: fakeSocket,
    x: SPAWN_X,
    y: SPAWN_Y,
    lastBroadcastWireX: 0,
    lastBroadcastWireY: 0,
    role: 'crewmate',
    alive: true,
    killCooldownMs: 0,
    assignedTasks: tasks.map(task => task.id),
    isBot: true,
  };
  const lobby = {
    code: 'AIDISP',
    phase: 'ROAMING',
    startedAtMs: 123456,
    players: new Map([[host.slot, host], [bot.slot, bot]]),
    userIdToSlot: new Map([[host.tgUserId, host.slot], [bot.tgUserId, bot.slot]]),
    hostSlot: host.slot,
    meeting: null,
    completedTaskSteps: new Set<string>(),
    totalTaskSteps: tasks.reduce((sum, task) => sum + task.steps, 0),
    sabotage: null,
    sabotageCooldownMs: 0,
  } as unknown as Lobby;
  // The bot test intentionally does not exercise manager actions; navigation
  // is held at the deterministic stand-off point after the strategic plan.
  return { lobby, bot, manager: {} as LobbyManager };
}

async function waitForPlan(bot: ProbeCrewmateBot): Promise<void> {
  for (let attempt = 0; attempt < 30 && bot.isTaskPlanningPending(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(bot.isTaskPlanningPending(), false, 'the asynchronous strategic request must settle');
}

async function runScenario(apiKey: string, modelResponse: string, expectedTaskId: number): Promise<void> {
  const { lobby, bot: player, manager } = makeLobby(apiKey);
  const bot = new ProbeCrewmateBot();
  const candidates = player.assignedTasks.map(taskId => TASK_DEFS.find(task => task.id === taskId)!);
  const fallbackTaskId = candidates
    .sort((a, b) =>
      Math.hypot(a.x - player.x, a.y - player.y) -
      Math.hypot(b.x - player.x, b.y - player.y),
    )[0].id;

  let calls = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(String(input), 'https://api.groq.com/openai/v1/chat/completions');
    const request = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
      temperature: number;
    };
    assert.equal(request.temperature, 0.2, 'strategic decisions use the bounded low-temperature request');
    const payload = JSON.parse(request.messages[1].content) as Record<string, unknown>;
    assert.equal(payload.actingPlayer, 'Nova');
    assert.deepEqual(
      (payload.availableAssignedTasks as Array<{ taskId: number }>).map(task => task.taskId).sort(),
      [...player.assignedTasks].sort(),
      'the provider receives only the bot own unfinished assigned-task candidates',
    );
    assert.equal('hiddenRoles' in payload, false, 'strategic prompt excludes hidden roles');
    assert.equal('serverEvents' in payload, false, 'strategic prompt excludes private server events');
    return new Response(JSON.stringify({
      choices: [{ message: { content: modelResponse } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  bot.roamingTick(lobby, player, manager);
  assert.equal(bot.currentTargetTaskId(), fallbackTaskId,
    'the real bot dispatcher commits the deterministic safe target before the async model returns');
  await waitForPlan(bot);
  assert.equal(calls, 1, 'the real bot dispatcher made exactly one provider request');
  assert.equal(bot.currentTargetTaskId(), expectedTaskId,
    'only a valid model-selected assigned task may replace the deterministic fallback');
}

class ProbeImpostorBot extends ImpostorBot {
  override nearestApproachPoint(target: Point, _maxRadius: number, _targetRadiusPx = 24): Point {
    return target;
  }

  override navigateTo(_self: LobbyPlayer, _goal: Point): boolean {
    return false;
  }

  setSabotageCountdown(value: number): void {
    (this as unknown as { _sabotageCountdown: number })._sabotageCountdown = value;
  }

  targetSlot(): number | null {
    return (this as unknown as { _huntTargetSlot: number | null })._huntTargetSlot;
  }

  isHuntPlanningPending(): boolean {
    return (this as unknown as { _huntPlanningPending: boolean })._huntPlanningPending;
  }

  isSabotagePlanningPending(): boolean {
    return (this as unknown as { _sabotagePlanningPending: boolean })._sabotagePlanningPending;
  }
}

async function waitForImpostorPlan(bot: ProbeImpostorBot, kind: 'hunt' | 'sabotage'): Promise<void> {
  const pending = () => kind === 'hunt' ? bot.isHuntPlanningPending() : bot.isSabotagePlanningPending();
  for (let attempt = 0; attempt < 30 && pending(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(pending(), false, `the impostor ${kind} decision must settle`);
}

function findVisibleTargetPair(): [Point, Point] {
  const grid = buildPreciseCollisionGrid();
  const nearRadius = 80;
  const farRadius = Math.min(220, IMPOSTOR_VISION_RADIUS_PX - 20);
  assert.ok(farRadius > nearRadius + 50, 'impostor vision must accommodate two distinct test targets');
  const origin = { x: SPAWN_X, y: SPAWN_Y };
  for (let step = 0; step < 72; step++) {
    const angle = (step / 72) * Math.PI * 2;
    const points = [nearRadius, farRadius].map(radius => ({
      x: Math.round(origin.x + Math.cos(angle) * radius),
      y: Math.round(origin.y + Math.sin(angle) * radius),
    }));
    if (!points.every(point =>
      isPlayerPositionWalkable(grid, point.x, point.y) &&
      isLineOfSightClear(
        grid,
        origin.x, origin.y + FEET_OFFSET_Y,
        point.x, point.y + FEET_OFFSET_Y,
      ),
    )) continue;
    return [points[0], points[1]];
  }
  throw new Error('Could not find two clear, line-of-sight impostor test positions near the real spawn');
}

function makeImpostorLobby(
  apiKey: string,
  targetPair: readonly Point[] = [{ x: 300, y: 300 }, { x: 600, y: 300 }],
): { lobby: Lobby; bot: LobbyPlayer; targets: LobbyPlayer[] } {
  const host: LobbyPlayer = {
    slot: 0,
    tgUserId: -200,
    username: 'Human host',
    groqApiKey: apiKey,
    ws: fakeSocket,
    x: 3000,
    y: 1700,
    lastBroadcastWireX: 0,
    lastBroadcastWireY: 0,
    role: 'crewmate',
    alive: true,
    killCooldownMs: 0,
    assignedTasks: [],
  };
  const bot: LobbyPlayer = {
    slot: 1,
    tgUserId: -201,
    username: 'Red',
    ws: fakeSocket,
    x: SPAWN_X,
    y: SPAWN_Y,
    lastBroadcastWireX: 0,
    lastBroadcastWireY: 0,
    role: 'impostor',
    alive: true,
    killCooldownMs: 10_000,
    assignedTasks: [],
    isBot: true,
  };
  const targets: LobbyPlayer[] = targetPair.map((point, index) => ({
    slot: index + 2,
    tgUserId: -202 - index,
    username: index === 0 ? 'Blue' : 'Green',
    ws: fakeSocket,
    x: point.x,
    y: point.y,
    lastBroadcastWireX: 0,
    lastBroadcastWireY: 0,
    role: 'crewmate',
    alive: true,
    killCooldownMs: 0,
    assignedTasks: [],
  }));
  const lobby = {
    code: 'AIDISP',
    phase: 'ROAMING',
    startedAtMs: 234567,
    players: new Map([[host.slot, host], [bot.slot, bot], ...targets.map(player => [player.slot, player] as const)]),
    userIdToSlot: new Map(),
    hostSlot: host.slot,
    meeting: null,
    completedTaskSteps: new Set<string>(),
    totalTaskSteps: 18,
    sabotage: null,
    sabotageCooldownMs: 0,
  } as unknown as Lobby;
  return { lobby, bot, targets };
}

async function testModelHuntDispatch(): Promise<void> {
  const targetPair = findVisibleTargetPair();
  const { lobby, bot: player, targets } = makeImpostorLobby('gsk_' + 'H'.repeat(48), targetPair);
  const agent = new ProbeImpostorBot();
  agent.setSabotageCountdown(999);
  const manager = { applyKill: () => false } as unknown as LobbyManager;
  const originalCooldown = player.killCooldownMs;
  player.killCooldownMs = 0;
  const fallbackTarget = targets[0];
  const modelTarget = targets[1];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const payload = JSON.parse(request.messages[1].content) as {
      visibleCrewTargets: Array<{ slot: number }>;
    };
    assert.deepEqual(payload.visibleCrewTargets.map(target => target.slot), targets.map(target => target.slot),
      'hunt planner receives only the two currently visible, server-filtered crew candidates');
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ targetSlot: modelTarget.slot }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  agent.roamingTick(lobby, player, manager);
  assert.equal(agent.targetSlot(), fallbackTarget.slot,
    'impostor first commits its visible-isolation fallback before the asynchronous model response');
  await waitForImpostorPlan(agent, 'hunt');
  assert.equal(agent.targetSlot(), modelTarget.slot,
    'a valid model hunt decision changes the target through the real impostor roaming dispatcher');
  player.killCooldownMs = originalCooldown;
}

async function testModelSabotageDispatch(): Promise<void> {
  const apiKey = 'gsk_' + 'S'.repeat(48);
  const { lobby, bot: player } = makeImpostorLobby(apiKey, []);
  const agent = new ProbeImpostorBot();
  agent.setSabotageCountdown(1);
  const systems = Object.values(SABOTAGE_DEFS).map(definition => definition.id);
  const chosen = systems[systems.length - 1];
  let triggered: number | null = null;
  let broadcasts = 0;
  const manager = {
    triggerSabotage: (_lobby: Lobby, _slot: number, systemId: number) => {
      triggered = systemId;
      return true;
    },
    broadcastSabotageStart: () => { broadcasts++; },
    broadcastDoorLocks: () => {},
  } as unknown as LobbyManager;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    const payload = JSON.parse(request.messages[1].content) as {
      availableSystems: Array<{ systemId: number }>;
    };
    assert.deepEqual(payload.availableSystems.map(system => system.systemId), systems,
      'sabotage planner receives only systems the server currently allows');
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ sabotageId: chosen }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  agent.roamingTick(lobby, player, manager);
  await waitForImpostorPlan(agent, 'sabotage');
  assert.equal(triggered, chosen,
    'a valid model sabotage choice reaches the existing server-authoritative trigger path');
  assert.equal(broadcasts, 1, 'the accepted model choice follows the normal sabotage broadcast path');
}

try {
  await runScenario(
    'gsk_' + 'T'.repeat(48),
    JSON.stringify({ taskId: 1 }),
    1,
  );
  await runScenario(
    'gsk_' + 'M'.repeat(48),
    JSON.stringify({ taskId: 999 }),
    4,
  );
  await testModelHuntDispatch();
  await testModelSabotageDispatch();
  console.log('PASS: live bot dispatch accepts bounded mock-provider task, hunt and sabotage choices with safe fallback');
} finally {
  globalThis.fetch = originalFetch;
}
