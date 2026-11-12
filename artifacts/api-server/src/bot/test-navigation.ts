import assert from 'node:assert/strict';
import { BotAgent, isBotNavigationReachable } from './BotAgent.js';
import { getProductionCollisionWorld } from '@workspace/shared/collision/productionWorld';
import { KILL_RANGE_PX, buildPreciseCollisionGrid, isLineOfSightToInteractionTarget, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y, NO_TARGET, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from '@workspace/shared/coords';
import { BOT_NAVIGATION_GEOMETRY } from '@workspace/shared/collision/botNavigation';
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
  randomPoint() {
    return this.randomWalkablePoint();
  }
}

const grid = getProductionCollisionWorld();
const sightGrid = buildPreciseCollisionGrid();
const probe = new NavigationProbe();
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
    sightGrid, approach.x, approach.y + FEET_OFFSET_Y,
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
  let bestPosition = { x: self.x, y: self.y };
  let ticks = 0;
  for (; ticks < 500; ticks++) {
    arrived = routeProbe.moveTo(self, goal, 25);
    const distance = Math.hypot(goal.x - self.x, goal.y - self.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPosition = { x: self.x, y: self.y };
    }
    assert.equal(isPlayerPositionWalkable(grid, self.x, self.y), true,
      label + ' must keep the complete player footprint walkable at tick ' + (ticks + 1));
    if (arrived) {
      ticks++;
      break;
    }
  }
  assert.ok(arrived,
    label + ' path follower failed after 500 ticks (start=' + start.x.toFixed(0) + ',' + start.y.toFixed(0) +
      ' goal=' + goal.x.toFixed(0) + ',' + goal.y.toFixed(0) +
      ' end=' + self.x.toFixed(0) + ',' + self.y.toFixed(0) +
      ' best=' + bestPosition.x.toFixed(0) + ',' + bestPosition.y.toFixed(0) +
      ' bestDistance=' + bestDistance.toFixed(1) + 'px)');
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

// A moving player's authoritative position is not guaranteed to coincide
// with a navigation-cell centre. Verify target jitter does not reset the
// follower every tick or make the exact end connector reject a reachable chase.
// Use a deterministic sample already certified by the production vector
// world and spawn-connected nav graph. Unlike a hand-picked wall-adjacent
// task point, this guarantees a valid continuous off-centre target.
const originalRandom = Math.random;
let randomState = 0x51a7c0de;
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x1_0000_0000;
};
let chaseGoal: { x: number; y: number } | null = null;
try {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = probe.randomPoint();
    const feetY = candidate.y + FEET_OFFSET_Y;
    const col = Math.floor(candidate.x / BOT_NAVIGATION_GEOMETRY.cellX);
    const row = Math.floor(feetY / BOT_NAVIGATION_GEOMETRY.cellY);
    const centreX = (col + 0.5) * BOT_NAVIGATION_GEOMETRY.cellX;
    const centreY = (row + 0.5) * BOT_NAVIGATION_GEOMETRY.cellY;
    if (Math.hypot(candidate.x - centreX, feetY - centreY) > 1) {
      chaseGoal = candidate;
      break;
    }
  }
} finally {
  Math.random = originalRandom;
}
assert.ok(chaseGoal, 'must find a deterministic off-centre, spawn-reachable target');
assert.equal(isPlayerPositionWalkable(grid, chaseGoal.x, chaseGoal.y), true,
  'sampled off-centre target must have a valid production player footprint');
assert.equal(isBotNavigationReachable(chaseGoal.x, chaseGoal.y + FEET_OFFSET_Y), true,
  'sampled off-centre target must be in the spawn-connected nav component');

const chaseProbe = new NavigationProbe();
const chaser = { x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y } as LobbyPlayer;
let chaseDistance = Infinity;
for (let tick = 0; tick < 500; tick++) {
  // Sub-cell position changes model the continuous coordinates of a moving
  // player; they should not throw away the bot's whole A* route every tick.
  const jitterX = Math.sin(tick * 0.7) * 1.25;
  const jitterY = Math.cos(tick * 0.7) * 1.25;
  const [targetFeetX, targetFeetY] = grid.movePlayerAtFeet(
    chaseGoal.x, chaseGoal.y + FEET_OFFSET_Y, jitterX, jitterY,
  );
  const movingTarget = { x: targetFeetX, y: targetFeetY - FEET_OFFSET_Y };
  chaseProbe.moveTo(chaser, movingTarget, KILL_RANGE_PX - 2);
  chaseDistance = Math.hypot(movingTarget.x - chaser.x, movingTarget.y - chaser.y);
  assert.equal(isPlayerPositionWalkable(grid, chaser.x, chaser.y), true,
    'moving-target pursuit must preserve the complete player footprint');
  if (chaseDistance <= KILL_RANGE_PX - 2) break;
}
assert.ok(chaseDistance <= KILL_RANGE_PX - 2,
  'vector bot navigation must close to kill range against a continuously moving, off-centre target (distance=' +
    chaseDistance.toFixed(1) + 'px)');


console.log('PASS: every task approach has a bidirectional production path-follower route with full-footprint collision');
