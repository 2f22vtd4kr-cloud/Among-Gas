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
} from './collisionMap.js';
export type { Grid, Zone, ZoneName } from './collisionMap.js';

export {
  WIRE_SCALE,
  FEET_OFFSET_Y,
  PLAYER_RADIUS,
  toWire,
  fromWire,
  DELTA_THRESHOLD_SQ,
} from './coords.js';
