import type { GroqDialogueMessage } from './groqDialogue.js';

export interface VisiblePlayerSource {
  readonly slot: number;
  readonly username: string;
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
}

export interface VisiblePlayerObservation {
  readonly slot: number;
  readonly username: string;
  readonly distancePx: number;
}

/**
 * Convert server positions into a limited observation. The returned structure
 * intentionally cannot represent roles, exact coordinates, or unseen players.
 * Callers must pass only players whose role is legitimately known to the bot.
 */
export function observeVisiblePlayers(
  observerSlot: number,
  observerX: number,
  observerY: number,
  players: readonly VisiblePlayerSource[],
  visionRadiusPx: number,
  hasLineOfSight: (x: number, y: number) => boolean,
): VisiblePlayerObservation[] {
  if (![observerX, observerY, visionRadiusPx].every(Number.isFinite) || visionRadiusPx <= 0) {
    return [];
  }
  return players
    .filter(player => player.alive && player.slot !== observerSlot)
    .map(player => ({
      slot: player.slot,
      username: player.username,
      distancePx: Math.hypot(player.x - observerX, player.y - observerY),
      x: player.x,
      y: player.y,
    }))
    .filter(player => player.distancePx <= visionRadiusPx && hasLineOfSight(player.x, player.y))
    .map(({ slot, username, distancePx }) => ({
      slot,
      username,
      distancePx: Math.round(distancePx),
    }))
    .sort((a, b) => a.distancePx - b.distancePx || a.slot - b.slot);
}

export interface CrewTaskOption {
  readonly taskId: number;
  readonly name: string;
  readonly remainingSteps: number;
  readonly approximateDistancePx: number;
}

export function buildCrewTaskPlanningMessages(input: {
  readonly username: string;
  readonly availableTasks: readonly CrewTaskOption[];
  readonly nearbyPlayers: readonly VisiblePlayerObservation[];
}): GroqDialogueMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are an autonomous crewmate in Among Gas choosing your next assigned task.',
        'Choose only from the task options in the structured observation. You cannot invent tasks or change game rules.',
        'Prefer practical progress: consider approximate travel distance, remaining steps, and avoiding unnecessary backtracking.',
        'Nearby players are only those currently visible to you; their roles are unknown. Do not infer guilt or hidden roles from proximity.',
        'Return exactly one JSON object: {"taskId": <listed integer>} or {"taskId": null} if no listed task is suitable.',
        'Do not include explanations or additional fields.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        actingPlayer: input.username,
        role: 'crewmate',
        availableAssignedTasks: input.availableTasks,
        currentlyVisiblePlayers: input.nearbyPlayers,
      }),
    },
  ];
}

export function parseCrewTaskChoice(
  response: string,
  allowedTaskIds: readonly number[],
): number | null {
  const value = parseExactIntegerChoice(response, 'taskId', allowedTaskIds);
  return value;
}

export interface VisibleCrewTarget {
  readonly slot: number;
  readonly username: string;
  readonly distancePx: number;
  readonly otherVisibleCrewNearby: number;
}

export function buildImpostorHuntPlanningMessages(input: {
  readonly username: string;
  readonly killCooldownMs: number;
  readonly visibleCrew: readonly VisibleCrewTarget[];
}): GroqDialogueMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are an autonomous impostor in Among Gas selecting a possible hunting target.',
        'Your observation contains only crewmates currently visible to you. You know you are an impostor, but you must not assume information about unseen players.',
        'Consider target distance and the number of other visible crewmates near the target. Avoid a target surrounded by visible witnesses when a safer opportunity exists.',
        'The server still validates every kill, range, cooldown and line of sight. You are selecting a target, not authorizing an attack.',
        'Choose only a listed slot. Return exactly {"targetSlot": <listed integer>} or {"targetSlot": null} when no visible target is worth pursuing.',
        'Do not include explanations or additional fields.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        actingPlayer: input.username,
        role: 'impostor',
        ownKillCooldownMs: Math.max(0, Math.round(input.killCooldownMs)),
        visibleCrewTargets: input.visibleCrew,
      }),
    },
  ];
}

export function parseImpostorHuntChoice(
  response: string,
  visibleTargetSlots: readonly number[],
): number | null {
  return parseExactIntegerChoice(response, 'targetSlot', visibleTargetSlots);
}

function parseExactIntegerChoice(
  response: string,
  property: string,
  allowedValues: readonly number[],
): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== property) return null;
  const choice = (parsed as Record<string, unknown>)[property];
  if (choice === null) return null;
  if (typeof choice !== 'number' || !Number.isSafeInteger(choice)) return null;
  return allowedValues.includes(choice) ? choice : null;
}

export interface SabotageOption {
  readonly systemId: number;
  readonly name: string;
}

export function buildImpostorSabotagePlanningMessages(input: {
  readonly username: string;
  readonly availableSystems: readonly SabotageOption[];
  readonly visibleCrewCount: number;
  readonly visibleCrewPairsWithin350Px: number;
  readonly publicTaskProgressPct: number;
  readonly killCooldownMs: number;
}): GroqDialogueMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are an autonomous impostor choosing one legal sabotage system in Among Gas.',
        'Use only the listed systems and the public task progress plus your currently visible crewmate observation.',
        'Choose a system that advances a coherent strategy: Lights can reduce crew vision, Comms disrupts task completion, Doors can interrupt movement, and O₂/Reactor create critical pressure.',
        'Do not invent players, positions, cooldowns, or systems. The server revalidates sabotage availability and cooldown.',
        'Return exactly one JSON object: {"sabotageId": <listed integer>} or {"sabotageId": null} when none is justified.',
        'Do not include explanations or additional fields.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        actingPlayer: input.username,
        role: 'impostor',
        availableSystems: input.availableSystems,
        currentlyVisibleCrew: {
          count: Math.max(0, Math.round(input.visibleCrewCount)),
          pairsWithin350Px: Math.max(0, Math.round(input.visibleCrewPairsWithin350Px)),
        },
        publicTaskProgressPct: Math.max(0, Math.min(100, Math.round(input.publicTaskProgressPct))),
        ownKillCooldownMs: Math.max(0, Math.round(input.killCooldownMs)),
      }),
    },
  ];
}

export function parseImpostorSabotageChoice(
  response: string,
  availableSystemIds: readonly number[],
): number | null {
  return parseExactIntegerChoice(response, 'sabotageId', availableSystemIds);
}
