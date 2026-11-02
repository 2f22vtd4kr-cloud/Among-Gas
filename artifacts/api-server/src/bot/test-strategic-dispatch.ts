import assert from 'node:assert/strict';
import { CrewmateBot } from './CrewmateBot.js';
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
  console.log('PASS: real crewmate roaming dispatch accepts a valid mock-provider task choice and rejects an unassigned choice');
} finally {
  globalThis.fetch = originalFetch;
}
