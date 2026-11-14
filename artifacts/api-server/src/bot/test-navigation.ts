import assert from 'node:assert/strict';
import { BotAgent, isBotNavigationReachable } from './BotAgent.js';
import { buildPreciseCollisionGrid, buildPreciseVisionGrid, isLineOfSightClear, isLineOfSightToInteractionTarget, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y, NO_TARGET, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from '@workspace/shared/coords';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';

class NavigationProbe extends BotAgent {
  override roamingTick(_lobby: Lobby, _self: LobbyPlayer, _manager: LobbyManager): void {}
  override chooseVote(_lobby: Lobby, _self: LobbyPlayer): number { return NO_TARGET; }
  approach(target: {x:number;y:number}, radius: number, targetRadiusPx = 24) {
    return this.nearestApproachPoint(target, radius, targetRadiusPx);
  }
  moveTo(self: LobbyPlayer, goal: {x:number;y:number}, arrivalTolerancePx = 25) {
    return this.navigateTo(self, goal, arrivalTolerancePx);
  }
  visible(from: {x:number;y:number}, to: {x:number;y:number}) {
    return this.hasLineOfSightToPoint(from, to);
  }
}

const grid = buildPreciseCollisionGrid();
const movementSightGrid = buildPreciseCollisionGrid();
const sightGrid = buildPreciseVisionGrid();
const probe = new NavigationProbe();

// Movement-only silhouettes must not become vision occluders. The service-van
// body remains solid to movement, while the dedicated sight mask preserves the
// reviewed clear sight line through its bay, matching client/server visibility.
{
  const from = { x: 2000, y: 1150 };
  const to = { x: 2250, y: 1150 };
  assert.equal(isPlayerPositionWalkable(grid, from.x, from.y), true);
  assert.equal(isPlayerPositionWalkable(grid, to.x, to.y), true);
  assert.equal(isLineOfSightClear(
    sightGrid, from.x, from.y + FEET_OFFSET_Y, to.x, to.y + FEET_OFFSET_Y,
  ), true, 'vision grid must omit the movement-only service-van silhouette');
  assert.equal(isLineOfSightClear(
    movementSightGrid, from.x, from.y + FEET_OFFSET_Y, to.x, to.y + FEET_OFFSET_Y,
  ), false, 'movement grid must continue to block the service-van body');
  assert.equal(probe.visible(from, to), true,
    'bot target observation must use the same independent vision grid as the client and server');
}
for (const task of TASK_DEFS) {
  const approach = probe.approach(task, TASK_INTERACTION_RANGE_PX - 8, task.interactionTargetRadiusPx ?? 24);
  const distance = Math.hypot(approach.x - task.x, approach.y - task.y);
  assert.ok(distance <= TASK_INTERACTION_RANGE_PX - 8,
    task.name + ' bot approach must leave enough arrival tolerance inside server interaction range');
  assert.equal(isPlayerPositionWalkable(grid, approach.x, approach.y), true,
    task.name + ' bot approach must have a walkable player footprint');
  assert.equal(isBotNavigationReachable(approach.x, approach.y + FEET_OFFSET_Y), true,
    task.name + ' bot approach must be in the spawn-connected navigation component');
  assert.equal(isLineOfSightToInteractionTarget(
    grid, approach.x, approach.y + FEET_OFFSET_Y,
    task.x, task.y + FEET_OFFSET_Y, task.interactionTargetRadiusPx ?? 24,
  ), true, task.name + ' bot approach must satisfy server-authoritative line of sight');
}

const assertPathFollowerRoute = (
  start: { x: number; y: number },
  goal: { x: number; y: number },
  label: string,
) => {
  const routeProbe = new NavigationProbe();
  const self = { x: start.x, y: start.y } as LobbyPlayer;
  let arrived = false;
  let bestDistance = Math.hypot(goal.x - self.x, goal.y - self.y);
  let ticks = 0;
  for (; ticks < 500; ticks++) {
    arrived = routeProbe.moveTo(self, goal, 25);
    const distance = Math.hypot(goal.x - self.x, goal.y - self.y);
    bestDistance = Math.min(bestDistance, distance);
    assert.equal(isPlayerPositionWalkable(grid, self.x, self.y), true,
      label + ' must keep the complete player footprint walkable at tick ' + (ticks + 1));
    if (arrived) {
      ticks++;
      break;
    }
  }
  assert.ok(arrived,
    label + ' path follower failed to arrive after 500 ticks (best distance ' + bestDistance.toFixed(1) + 'px)');
  console.log('PASS: ' + label + ' (' + ticks + ' ticks)');
};

// Coarse A* reachability is only a preflight. These routes exercise the actual
// BotAgent path follower and fine swept-footprint collision in both directions,
// so a connected coarse cell cannot hide an impassable doorway or corner.
for (const task of TASK_DEFS) {
  const goal = probe.approach(task, TASK_INTERACTION_RANGE_PX - 8, task.interactionTargetRadiusPx ?? 24);
  assertPathFollowerRoute({ x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y }, goal, task.name + ' spawn-to-task');
  assertPathFollowerRoute(goal, { x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y }, task.name + ' task-to-spawn');
}

console.log('PASS: every task approach has a bidirectional production path-follower route with full-footprint collision');
