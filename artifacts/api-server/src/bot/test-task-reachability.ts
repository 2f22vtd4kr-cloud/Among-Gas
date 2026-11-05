import assert from 'node:assert/strict';
import { getProductionCollisionWorld } from '@workspace/shared/collision/productionWorld';
import { buildPreciseCollisionGrid } from '@workspace/shared/collisionMap';
import {
  isLineOfSightToInteractionTarget,
  isPlayerPositionWalkable,
} from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y } from '@workspace/shared/coords';
import {
  BotAgent,
  isBotNavigationReachable,
  NO_TARGET,
} from './BotAgent.js';
import { SPAWN_X, SPAWN_Y } from '../ws/lobby.js';
import type { Lobby, LobbyManager, LobbyPlayer } from '../ws/lobby.js';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX, type TaskDef } from '@workspace/shared/tasks';
import type { Point } from '@workspace/shared';

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

  moveTo(player: LobbyPlayer, goal: Point): boolean {
    return this.navigateTo(player, goal, 8);
  }
}

const movementGrid = getProductionCollisionWorld();
const sightGrid = buildPreciseCollisionGrid();
const probe = new TaskReachabilityProbe();
const results = TASK_DEFS.map(task => {
  const point = probe.approach(task);
  const reachable =
    isPlayerPositionWalkable(movementGrid, point.x, point.y) &&
    isBotNavigationReachable(point.x, point.y + FEET_OFFSET_Y);
  const visible = isLineOfSightToInteractionTarget(
    sightGrid,
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
}
const unreachable = results.filter(result => !result.reachable || !result.visible);
assert.equal(unreachable.length, 0,
  `tasks without a spawn-reachable, LOS-clear interaction point: ${unreachable.map(task => `${task.id}:${task.name}`).join(', ')}`);

console.log(`PASS: all ${results.length} task definitions have a reachable, visible approach point`);

 
// Reproduce the only stuck-task state observed in seeded cohort 17001:
// a live crewmate at (1656, 797) could not finish Empty Garbage (task 3).
// Reachability from spawn alone is insufficient; exercise the production A*
// path-following step from that exact in-game position as well.
function assertRoute(start: Point, goal: Point, label: string): void {
  const player = { x: start.x, y: start.y } as LobbyPlayer;
  const routeProbe = new TaskReachabilityProbe();
  let arrived = false;
  let stalledTicks = 0;
  for (let tick = 0; tick < 1_000; tick++) {
    const beforeX = player.x;
    const beforeY = player.y;
    arrived = routeProbe.moveTo(player, goal);
    if (arrived) break;
    const moved = Math.hypot(player.x - beforeX, player.y - beforeY);
    stalledTicks = moved < 0.01 ? stalledTicks + 1 : 0;
    if (stalledTicks >= 20) break;
  }
  console.log(`taskRoute ${JSON.stringify({ label, start, goal, end: { x: player.x, y: player.y }, arrived, stalledTicks })}`);
  assert.ok(arrived, `production bot path follower must reach ${label} from the observed start point`);
}

const emptyGarbage = TASK_DEFS.find(task => task.id === 3)!;
const emptyGarbageApproach = probe.approach(emptyGarbage);
assertRoute({ x: SPAWN_X, y: SPAWN_Y }, emptyGarbageApproach, 'Empty Garbage from spawn');
assertRoute({ x: 1656, y: 797 }, emptyGarbageApproach, 'Empty Garbage from timeout position');

