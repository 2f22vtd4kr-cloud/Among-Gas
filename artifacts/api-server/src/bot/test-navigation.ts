import assert from 'node:assert/strict';
import { BotAgent, hasCompletedNavigationRoute, shouldRefreshNavigationRoute, isBotNavigationReachable } from './BotAgent.js';
import { getProductionCollisionWorld } from '@workspace/shared/collision/productionWorld';
import { KILL_RANGE_PX, buildPreciseCollisionGrid, buildPreciseVisionGrid, isLineOfSightClear, isLineOfSightToInteractionTarget, isPlayerPositionWalkable } from '@workspace/shared/collisionMap';
import { FEET_OFFSET_Y, NO_TARGET, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from '@workspace/shared/coords';
import { BOT_NAVIGATION_GEOMETRY } from '@workspace/shared/collision/botNavigation';
import { IMPOSTOR_VISION_RADIUS_PX } from '@workspace/shared/sabotage';
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
  visible(from: {x:number;y:number}, to: {x:number;y:number}) {
    return this.hasLineOfSightToPoint(from, to);
  }
}

const grid = getProductionCollisionWorld();
const movementSightGrid = buildPreciseCollisionGrid();
const sightGrid = buildPreciseVisionGrid();
const probe = new NavigationProbe();

// Preserve the two already-reviewed sector-specific movement corrections when
// the vector world is authoritative. These are local geometry checks, not an
// assertion that the disconnected vehicle bay has an intended entrance.
assert.equal(isPlayerPositionWalkable(grid, 2120, 1150), false,
  'vector collision keeps the green service van body solid');
assert.equal(isPlayerPositionWalkable(grid, 2000, 1150), true,
  'vector collision preserves left-side service-van bay clearance');
assert.equal(isPlayerPositionWalkable(grid, 2250, 1150), true,
  'vector collision preserves right-side service-van bay clearance');
for (let x = 2820; x <= 3060; x += 8) {
  assert.equal(isPlayerPositionWalkable(grid, x, 900), true,
    'vector collision preserves the full east-generator approach aisle at x=' + x);
}
// Movement-only silhouettes must not become authoritative vision occluders.
// The service-van bay remains walkable at both endpoints. Its physical body
// blocks movement, but the dedicated vision mask intentionally permits sight
// through it, matching the player's client-side visibility.
{
  const from = { x: 2000, y: 1150 };
  const to = { x: 2250, y: 1150 };
  assert.ok(Math.hypot(to.x - from.x, to.y - from.y) < IMPOSTOR_VISION_RADIUS_PX,
    "the service-van sight ray must be inside impostor vision range");
  assert.equal(isPlayerPositionWalkable(grid, from.x, from.y), true);
  assert.equal(isPlayerPositionWalkable(grid, to.x, to.y), true);
  assert.equal(isLineOfSightClear(
    sightGrid, from.x, from.y + FEET_OFFSET_Y, to.x, to.y + FEET_OFFSET_Y,
  ), true, "vision grid must omit the movement-only service-van silhouette");
  assert.equal(isLineOfSightClear(
    movementSightGrid, from.x, from.y + FEET_OFFSET_Y, to.x, to.y + FEET_OFFSET_Y,
  ), false, "movement grid must continue to block the service-van body");
  assert.equal(probe.visible(from, to), true,
    "bot target observation must use the same independent vision grid as the client");
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

// The east generator room's visually open aisle is a named route, not merely
// a centreline sample. Exercise it in both directions with the full player
// footprint and the same live vector BotAgent path follower.
assertPathFollowerRoute({ x: 2820, y: 900 }, { x: 3060, y: 900 }, 'east generator aisle west-to-east');
assertPathFollowerRoute({ x: 3060, y: 900 }, { x: 2820, y: 900 }, 'east generator aisle east-to-west');
assertPathFollowerRoute({ x: 2670, y: 900 }, { x: 2950, y: 900 }, 'east generator camera aisle west-to-east');
assertPathFollowerRoute({ x: 2950, y: 900 }, { x: 2670, y: 900 }, 'east generator camera aisle east-to-west');

// Coarse A* reachability is only a preflight. These routes exercise the actual
// BotAgent path follower and fine swept-footprint collision in both directions,
// so a connected coarse cell cannot hide an impassable doorway or corner.
for (const task of TASK_DEFS) {
  const goal = probe.approach(task, TASK_INTERACTION_RANGE_PX - 8, task.interactionTargetRadiusPx ?? 24);
  assertPathFollowerRoute({ x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y }, goal, task.name + ' spawn-to-task');
  assertPathFollowerRoute(goal, { x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y }, task.name + ' task-to-spawn');
}

// A missing A* route is a cached negative result, not a completed route.
// Treating [] as complete would force the follower to rebuild the same failed
// A* search every 200ms instead of waiting for target drift or meaningful detour progress.
assert.equal(hasCompletedNavigationRoute(null, 0), false,
  'a route that has not been built is not complete');
assert.equal(hasCompletedNavigationRoute([], 0), false,
  'an empty/unreachable route is not complete and remains cached');
assert.equal(hasCompletedNavigationRoute([{ x: 1, y: 1 }], 0), false,
  'a route with a remaining waypoint is not complete');
assert.equal(hasCompletedNavigationRoute([{ x: 1, y: 1 }], 1), true,
  'a non-empty route becomes complete after its final waypoint is consumed');

// A safe nav-cell endpoint may be farther from the requested target than
// the refresh threshold by design. That static endpoint offset is not target
// movement and must not rebuild/reset the A* follower every 200ms tick.
{
  const route = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
  const requestedAtBuild = { x: 220, y: 100 };
  const safeEndpoint = route[1];
  const refreshDistance = 19;
  assert.ok(Math.hypot(safeEndpoint.x - requestedAtBuild.x, safeEndpoint.y - requestedAtBuild.y) > refreshDistance,
    'fixture must place the safe endpoint outside the refresh threshold');
  assert.equal(shouldRefreshNavigationRoute(route, 0, requestedAtBuild, { x: 220, y: 100 }, refreshDistance), false,
    'an unchanged target must retain its route despite the endpoint-to-target offset');
  assert.equal(shouldRefreshNavigationRoute(route, 0, requestedAtBuild, { x: 221, y: 101 }, refreshDistance), false,
    'sub-threshold target jitter must retain the route');
  assert.equal(shouldRefreshNavigationRoute(route, 0, requestedAtBuild, { x: 240, y: 100 }, refreshDistance), true,
    'material target movement must trigger a route refresh');
  assert.equal(shouldRefreshNavigationRoute([], 0, requestedAtBuild, { x: 220, y: 100 }, refreshDistance), false,
    'an empty/unreachable route remains cached until the requested target moves');
  assert.equal(shouldRefreshNavigationRoute(route, route.length, requestedAtBuild, { x: 220, y: 100 }, refreshDistance), true,
    'a completed non-empty route may be rebuilt');
  assert.equal(shouldRefreshNavigationRoute(null, 0, requestedAtBuild, { x: 220, y: 100 }, refreshDistance), true,
    'an unbuilt route must be built');
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
