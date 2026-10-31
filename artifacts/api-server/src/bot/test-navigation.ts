import assert from 'node:assert/strict';
import { BotAgent, isBotNavigationReachable } from './BotAgent.js';
import { buildPreciseCollisionGrid, isLineOfSightToInteractionTarget, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y, NO_TARGET } from '@workspace/shared/coords';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';

class NavigationProbe extends BotAgent {
  override roamingTick(_lobby: Lobby, _self: LobbyPlayer, _manager: LobbyManager): void {}
  override chooseVote(_lobby: Lobby, _self: LobbyPlayer): number { return NO_TARGET; }
  approach(target: {x:number;y:number}, radius: number) {
    return this.nearestApproachPoint(target, radius);
  }
}

const grid = buildPreciseCollisionGrid();
const probe = new NavigationProbe();
for (const task of TASK_DEFS) {
  const approach = probe.approach(task, TASK_INTERACTION_RANGE_PX - 3);
  const distance = Math.hypot(approach.x - task.x, approach.y - task.y);
  assert.ok(distance <= TASK_INTERACTION_RANGE_PX - 3,
    task.name + ' bot approach must leave enough arrival tolerance inside server interaction range');
  assert.equal(isPlayerPositionWalkable(grid, approach.x, approach.y), true,
    task.name + ' bot approach must have a walkable player footprint');
  assert.equal(isBotNavigationReachable(approach.x, approach.y + FEET_OFFSET_Y), true,
    task.name + ' bot approach must be in the spawn-connected navigation component');
  assert.equal(isLineOfSightToInteractionTarget(
    grid, approach.x, approach.y + FEET_OFFSET_Y,
    task.x, task.y + FEET_OFFSET_Y, 24,
  ), true, task.name + ' bot approach must satisfy server-authoritative line of sight');
}

console.log('PASS: every assigned task has a walkable, spawn-reachable, visible bot approach within interaction range');
