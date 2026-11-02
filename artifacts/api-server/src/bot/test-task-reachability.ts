import assert from 'node:assert/strict';
import {
  buildPreciseCollisionGrid,
  isLineOfSightToInteractionTarget,
  isPlayerPositionWalkable,
} from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y } from '@workspace/shared/coords';
import {
  BotAgent,
  isBotNavigationReachable,
  NO_TARGET,
} from './BotAgent.js';
import type { Lobby, LobbyManager, LobbyPlayer } from '../ws/lobby.js';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX, type TaskDef } from '@workspace/shared/tasks';

class TaskReachabilityProbe extends BotAgent {
  roamingTick(_lobby: Lobby, _self: LobbyPlayer, _manager: LobbyManager): void {}
  chooseVote(_lobby: Lobby, _self: LobbyPlayer): number { return NO_TARGET; }

  approach(task: TaskDef) {
    return this.nearestApproachPoint(
      task,
      TASK_INTERACTION_RANGE_PX - 8,
      task.interactionTargetRadiusPx ?? 24,
    );
  }
}

const movementGrid = buildPreciseCollisionGrid();
const probe = new TaskReachabilityProbe();
const results = TASK_DEFS.map(task => {
  const point = probe.approach(task);
  const reachable =
    isPlayerPositionWalkable(movementGrid, point.x, point.y) &&
    isBotNavigationReachable(point.x, point.y + FEET_OFFSET_Y);
  const visible = isLineOfSightToInteractionTarget(
    movementGrid,
    point.x,
    point.y + FEET_OFFSET_Y,
    task.x,
    task.y + FEET_OFFSET_Y,
    task.interactionTargetRadiusPx ?? 24,
  );
  return { id: task.id, name: task.name, point, reachable, visible };
});

for (const result of results) {
  console.log(`taskReachability ${JSON.stringify(result)}`);
  assert.ok(result.reachable && result.visible,
    `task ${result.id} (${result.name}) must have a spawn-reachable, LOS-clear interaction point`);
}

console.log(`PASS: all ${results.length} task definitions have a reachable, visible approach point`);
