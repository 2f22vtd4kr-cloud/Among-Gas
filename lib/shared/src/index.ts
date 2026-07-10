// Named re-exports to avoid MAP_W/MAP_H ambiguity between coords and collisionMap.
// MAP_W and MAP_H are canonical in collisionMap; coords imports them implicitly
// but they are NOT re-exported from index — import from collisionMap directly.
export {
  MAP_W, MAP_H,
  COLS, ROWS, CELL, CELL_X, CELL_Y,
  buildCollisionGrid,
  isBlocked,
  canMoveTo,
  resolveMovement,
  ZONES,
  KILL_RANGE_PX,
  REPORT_RANGE_PX,
} from './collisionMap.js';
export type { Grid, Zone, ZoneName } from './collisionMap.js';

export {
  WIRE_SCALE,
  FEET_OFFSET_Y,
  PLAYER_RADIUS,
  toWire,
  fromWire,
  DELTA_THRESHOLD_SQ,
  KILL_COOLDOWN_MS,
  MEETING_DISCUSSION_MS,
  MEETING_VOTING_MS,
  NO_TARGET,
} from './coords.js';

export {
  TASK_DEFS,
  TASK_COUNT,
  TASKS_PER_CREWMATE,
  TASK_INTERACTION_RANGE_PX,
  OPCODE_TASK_ASSIGN,
} from './tasks.js';
export type { TaskZone, TaskDef } from './tasks.js';

export { findPath, PathCache } from './pathfinding.js';
export type { Point, PathResult } from './pathfinding.js';

export {
  SABOTAGE_LIGHTS,
  SABOTAGE_O2,
  SABOTAGE_REACTOR,
  isSabotageSystemId,
  SABOTAGE_DEFS,
  SABOTAGE_INTERACTION_RANGE_PX,
  SABOTAGE_COUNTDOWN_MS,
  SABOTAGE_COOLDOWN_MS,
  SABOTAGE_PAD_SYNC_WINDOW_MS,
  NORMAL_VISION_RADIUS_PX,
  LIGHTS_VISION_SCALE,
  LIGHTS_CREWMATE_VISION_RADIUS_PX,
  OPCODE_SABOTAGE,
} from './sabotage.js';
export type { SabotageSystemId, SabotagePad, SabotageDef } from './sabotage.js';
