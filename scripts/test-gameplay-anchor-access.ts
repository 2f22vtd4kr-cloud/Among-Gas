import assert from "node:assert/strict";
import {
  buildPreciseCollisionGrid,
  isLineOfSightToInteractionTarget,
  isPlayerPositionWalkable,
} from "@workspace/shared/collisionMap";
import { FEET_OFFSET_Y } from "@workspace/shared/coords";
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from "@workspace/shared/tasks";
import { VENT_DEFS, VENT_INTERACTION_RANGE_PX } from "@workspace/shared/vents";
import { ADMIN_TABLE_DEFS, ADMIN_TABLE_INTERACTION_RANGE_PX } from "@workspace/shared/adminTable";
import { SABOTAGE_DEFS, SABOTAGE_INTERACTION_RANGE_PX } from "@workspace/shared/sabotage";
import {
  BotAgent,
  isBotNavigationReachable,
  NO_TARGET,
} from "../artifacts/api-server/src/bot/BotAgent.js";
import { SPAWN_X, SPAWN_Y } from "../artifacts/api-server/src/ws/lobby.js";
import type { Lobby, LobbyManager, LobbyPlayer } from "../artifacts/api-server/src/ws/lobby.js";
import type { Point } from "@workspace/shared";

interface GameplayAnchor {
  id: string;
  kind: "task" | "vent" | "admin" | "sabotage";
  name: string;
  target: Point;
  interactionRange: number;
  targetRadius: number;
}

class GameplayAnchorProbe extends BotAgent {
  roamingTick(_lobby: Lobby, _self: LobbyPlayer, _manager: LobbyManager): void {}
  chooseVote(_lobby: Lobby, _self: LobbyPlayer): number { return NO_TARGET; }

  approach(anchor: GameplayAnchor): Point {
    return this.nearestApproachPoint(
      anchor.target,
      anchor.interactionRange - 8,
      anchor.targetRadius,
    );
  }

  advance(player: LobbyPlayer, goal: Point): boolean {
    return this.navigateTo(player, goal, 8);
  }
}

const anchors: GameplayAnchor[] = [
  ...TASK_DEFS.map(task => ({
    id: `task-${task.id + 1}`,
    kind: "task" as const,
    name: task.name,
    target: { x: task.x, y: task.y },
    interactionRange: TASK_INTERACTION_RANGE_PX,
    targetRadius: task.interactionTargetRadiusPx ?? 24,
  })),
  ...VENT_DEFS.map(vent => ({
    id: `vent-${vent.id + 1}`,
    kind: "vent" as const,
    name: vent.nameEn,
    target: { x: vent.x, y: vent.y },
    interactionRange: VENT_INTERACTION_RANGE_PX,
    targetRadius: 24,
  })),
  ...ADMIN_TABLE_DEFS.map(table => ({
    id: "admin-table",
    kind: "admin" as const,
    name: table.name,
    target: { x: table.x, y: table.y },
    interactionRange: ADMIN_TABLE_INTERACTION_RANGE_PX,
    targetRadius: 24,
  })),
  ...Object.values(SABOTAGE_DEFS).flatMap(system => system.pads.map(pad => ({
    kind: "sabotage" as const,
    name: system.name,
    target: { x: pad.x, y: pad.y },
    interactionRange: SABOTAGE_INTERACTION_RANGE_PX,
    targetRadius: 24,
  }))),
].map((anchor, index) => anchor.kind === "sabotage"
  ? { ...anchor, id: `sabotage-${index - (TASK_DEFS.length + VENT_DEFS.length + ADMIN_TABLE_DEFS.length) + 1}` }
  : anchor);

assert.equal(TASK_DEFS.length, 11, "the anchor matrix expects eleven task consoles");
assert.equal(VENT_DEFS.length, 6, "the anchor matrix expects six vents");
assert.equal(ADMIN_TABLE_DEFS.length, 1, "the anchor matrix expects one Admin console");
assert.equal(anchors.length, 24, "the complete gameplay anchor matrix must contain exactly 24 entries");
assert.equal(new Set(anchors.map(anchor => anchor.id)).size, 24, "anchor IDs must be unique");

const movementGrid = buildPreciseCollisionGrid();
const probe = new GameplayAnchorProbe();
const failures: string[] = [];

for (const anchor of anchors) {
  const approach = probe.approach(anchor);
  const walkable = isPlayerPositionWalkable(movementGrid, approach.x, approach.y);
  const spawnConnected = isBotNavigationReachable(approach.x, approach.y + FEET_OFFSET_Y);
  const sightClear = isLineOfSightToInteractionTarget(
    movementGrid,
    approach.x,
    approach.y + FEET_OFFSET_Y,
    anchor.target.x,
    anchor.target.y + FEET_OFFSET_Y,
    anchor.targetRadius,
  );

  const player = { x: SPAWN_X, y: SPAWN_Y } as LobbyPlayer;
  let arrived = false;
  let stalledTicks = 0;
  let routeTicks = 0;
  for (; routeTicks < 400; routeTicks++) {
    const before = { x: player.x, y: player.y };
    arrived = probe.advance(player, approach);
    if (arrived) break;
    const displacement = Math.hypot(player.x - before.x, player.y - before.y);
    stalledTicks = displacement < 0.01 ? stalledTicks + 1 : 0;
    if (stalledTicks >= 20) break;
  }

  const result = {
    id: anchor.id,
    kind: anchor.kind,
    name: anchor.name,
    target: anchor.target,
    approach: { x: Math.round(approach.x * 100) / 100, y: Math.round(approach.y * 100) / 100 },
    walkable,
    spawnConnected,
    sightClear,
    routePassed: arrived,
    routeTicks,
    stalledTicks,
  };
  console.log(`gameplayAnchorAccess ${JSON.stringify(result)}`);

  if (!walkable) failures.push(`${anchor.id}: approach point is not full-footprint walkable`);
  if (!spawnConnected) failures.push(`${anchor.id}: approach point is not in the spawn-connected bot graph`);
  if (!sightClear) failures.push(`${anchor.id}: interaction line of sight is blocked`);
  if (!arrived) failures.push(`${anchor.id}: production bot path follower did not reach the approach point`);
}

assert.deepEqual(failures, [],
  `gameplay anchors missing full-footprint, spawn-connected, sight-clear bot routes:\n${failures.join("\n")}`);

console.log("PASS: all 24 gameplay anchors have full-footprint, spawn-connected, sight-clear paths from spawn");
