/**
 * Headless simulation runner — SINGLE_PLAY.md §8, Phase D.
 *
 * Runs N bot-only games to completion using the exact same LobbyManager,
 * kill/task/meeting/sabotage logic, and bot agents as real multiplayer
 * games — no HTTP/WS transport, no mocked frames.
 *
 * Acceleration strategy: games run genuinely concurrently (`concurrency`
 * at a time) inside ONE LobbyManager, sharing its existing 25Hz delta /
 * 5Hz bot-tick loops. A batch of 50 games therefore finishes in roughly the
 * wall-clock time of ONE game, not 50× that — without touching any of the
 * live game's Date.now()/setTimeout-based timing internals (meeting
 * countdowns, sabotage countdowns, kill cooldowns), which stay byte-for-byte
 * identical to what real multiplayer games run. This was a deliberate
 * choice over a "speed multiplier" that warps the clock, which would have
 * required threading a scaled clock through every timing call site in
 * lobby.ts — a much larger, riskier change to code that real players depend
 * on today.
 */
import { LobbyManager, type Lobby, type LobbyEvent } from '../ws/lobby.js';
import { CrewmateBot } from '../bot/CrewmateBot.js';
import { ImpostorBot } from '../bot/ImpostorBot.js';
import { getSabotageTimeoutMs, isCriticalSabotage, isSabotageSystemId } from '@workspace/shared/sabotage';
import { TASK_DEFS } from '@workspace/shared/tasks';
import { buildPreciseCollisionGrid, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import type { SimGameResult, SimWinner } from './types.js';

export interface SimBatchOptions {
  /** Total number of games to run. */
  games: number;
  /** Bots per game (>= 2 — at least one crewmate and one impostor). */
  bots: number;
  /** Force a specific impostor count instead of the standard playerCount-based table. */
  impostors?: number;
  /** How many games run concurrently at once. Default 25. */
  concurrency?: number;
  /** Safety watchdog per game (ms). A game with no terminal resolution past this is recorded as 'timeout'. Active critical sabotage gets time to resolve. Default 300000. */
  timeoutMs?: number;
  /** Called for every structured lifecycle event across every in-flight game. */
  onEvent?: (event: LobbyEvent) => void;
  /** Called once per finished game, as soon as its result is known. */
  onGameResult?: (result: SimGameResult) => void;
}

const simulationCollisionGrid = buildPreciseCollisionGrid();

/** Only an actual vent occupant is exempt from ordinary walkability checks. */
export function isSimulationCollisionViolation(
  player: { alive: boolean; inVent?: boolean; x: number; y: number },
  collisionGrid: Uint8Array,
): boolean {
  return player.alive && player.inVent !== true &&
    !isPlayerPositionWalkable(collisionGrid, player.x, player.y);
}

const BOT_NAMES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
  'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron',
];

function botName(i: number): string {
  return BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? `-${Math.floor(i / BOT_NAMES.length) + 1}` : '');
}

/** Reassign each bot's AI agent to match its Fisher-Yates-assigned role (same pattern as the CREATE_SOLO WS handler). */
function assignBotAgentsByRole(lobby: Lobby): void {
  for (const player of lobby.players.values()) {
    if (player.isBot) {
      player.botAgent = player.role === 'impostor' ? new ImpostorBot() : new CrewmateBot();
    }
  }
}

export async function runSimulationBatch(opts: SimBatchOptions): Promise<SimGameResult[]> {
  const { games, bots, impostors, concurrency = 25, timeoutMs = 300_000 } = opts;
  if (bots < 2) throw new Error('bots must be at least 2 (need at least one crewmate and one impostor)');
  if (games < 1) throw new Error('games must be at least 1');

  const manager = new LobbyManager();
  const perGameHandlers = new Map<string, (event: LobbyEvent) => void>();
  manager.setEventListener((event) => perGameHandlers.get(event.code)?.(event));

  const results: SimGameResult[] = [];
  let nextGameIndex = 0;

  return new Promise<SimGameResult[]>((resolve) => {
    function startOne(): void {
      if (nextGameIndex >= games) return;
      const gameIndex = nextGameIndex++;

      const lobby = manager.createHeadlessLobby();
      const startedAt = Date.now();
      let kills = 0;
      let meetings = 0;
      let settled = false;
      let collisionMonitor: ReturnType<typeof setInterval> | null = null;
      let collisionViolation: { slot: number; x: number; y: number } | undefined;

      let deadlineAt = startedAt + timeoutMs;
      let criticalSabotageExtensionUsed = false;
      let timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => finish('timeout'), timeoutMs);

      function finish(winner: SimWinner): void {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (collisionMonitor) clearInterval(collisionMonitor);
        perGameHandlers.delete(lobby.code);
        const timeoutState = winner === 'timeout' ? {
          phase: lobby.phase,
          sabotage: lobby.sabotage ? {
            systemId: lobby.sabotage.systemId,
            lockedTaskIds: [...lobby.sabotage.lockedTaskIds],
            fixedPads: [...lobby.sabotage.padFixedAt.keys()],
          } : null,
          completedTaskSteps: lobby.completedTaskSteps.size,
          totalTaskSteps: lobby.totalTaskSteps,
          ...(collisionViolation ? { collisionViolation } : {}),
          players: Array.from(lobby.players.values()).map(player => ({
            slot: player.slot,
            role: player.role,
            alive: player.alive,
            x: Math.round(player.x),
            y: Math.round(player.y),
            inVent: player.inVent === true,
            unfinishedTasks: player.assignedTasks.flatMap(taskId => {
              const task = TASK_DEFS.find(def => def.id === taskId);
              if (!task) return [];
              const remainingSteps = Array.from({ length: task.steps }, (_, step) => step)
                .filter(step => !lobby.completedTaskSteps.has(`${player.slot}:${taskId}:${step}`));
              return remainingSteps.length > 0 ? [{ taskId, name: task.name, remainingSteps }] : [];
            }),
          })),
        } : undefined;
        // Also clears any still-pending meeting/sabotage setTimeout so a late
        // callback can't fire after the lobby is gone or misattribute an
        // event to a different game if this code is ever reused.
        manager.disposeLobby(lobby);

        const impostorCount = Array.from(lobby.players.values()).filter(p => p.role === 'impostor').length;
        const result: SimGameResult = {
          gameIndex, code: lobby.code, botCount: bots, impostorCount,
          winner, durationMs: Date.now() - startedAt, kills, meetings,
          tasksCompleted: lobby.completedTaskSteps.size, totalTaskSteps: lobby.totalTaskSteps,
          ...(timeoutState ? { timeoutState } : {}),
        };
        results.push(result);
        opts.onGameResult?.(result);

        if (results.length >= games) {
          resolve(results.sort((a, b) => a.gameIndex - b.gameIndex));
        } else {
          startOne();
        }
      }

      perGameHandlers.set(lobby.code, (event) => {
        // A critical O₂/reactor sabotage is a live, terminal game mechanic with
        // its own 45s countdown. If it starts just before the simulator's safety
        // watchdog, give that real game timer (plus scheduling grace) time to
        // produce GAMEOVER rather than misclassifying a valid match as stalled.
        if (event.type === 'sabotageStart' && isSabotageSystemId(event.systemId) && isCriticalSabotage(event.systemId) && !criticalSabotageExtensionUsed) {
          const requiredResolutionMs = getSabotageTimeoutMs(event.systemId) + 5_000;
          const remainingWatchdogMs = deadlineAt - Date.now();
          if (remainingWatchdogMs < requiredResolutionMs) {
            clearTimeout(timeoutHandle);
            deadlineAt = Date.now() + requiredResolutionMs;
            criticalSabotageExtensionUsed = true;
            timeoutHandle = setTimeout(() => finish('timeout'), requiredResolutionMs);
          }
        }
        opts.onEvent?.(event);
        if (event.type === 'kill') kills++;
        else if (event.type === 'meetingStart') meetings++;
        else if (event.type === 'gameOver') finish(event.winFlag === 1 ? 'crew' : 'impostor');
      });

      for (let i = 0; i < bots; i++) {
        manager.addBotPlayer(lobby, i, botName(i), new CrewmateBot());
      }
      manager.startGame(lobby, impostors);
      assignBotAgentsByRole(lobby);

      // Independently audit every living bot position throughout the real
      // simulation loop. This catches collision/pathfinding regressions that
      // outcome-only tests miss (e.g. a bot slowly walking through a wall).
      collisionMonitor = setInterval(() => {
        if (settled) return;
        for (const player of lobby.players.values()) {
          if (!isSimulationCollisionViolation(player, simulationCollisionGrid)) continue;
          collisionViolation = {
            slot: player.slot,
            x: Math.round(player.x),
            y: Math.round(player.y),
          };
          finish('timeout');
          return;
        }
      }, 20);
    }

    const initialBatch = Math.min(concurrency, games);
    for (let i = 0; i < initialBatch; i++) startOne();
  });
}
