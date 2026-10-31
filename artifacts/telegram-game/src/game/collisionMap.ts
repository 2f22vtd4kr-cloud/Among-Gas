// Re-exported from @workspace/shared — the canonical implementation lives in
// lib/shared/src/collisionMap.ts so both the client and api-server can import it.
export {
  MAP_W, MAP_H,
  COLS, ROWS, FINE_COLS, FINE_ROWS,
  CELL, CELL_X, CELL_Y, FINE_CELL_X, FINE_CELL_Y,
  KILL_RANGE_PX,
  REPORT_RANGE_PX,
  buildCollisionGrid,
  buildPreciseCollisionGrid,
  buildFineCollisionGridFromRle,
  isPlayerPositionWalkable,
  isPlayerSpawnPositionClear,
  isPlayerFootprintWalkableAtFeet,
  clampPlayerPositionToMapBounds,
  isPlayerPathWalkable,
  resolvePlayerMovement,
  isBlocked,
  canMoveTo,
  resolveMovement,
  ZONES,
} from '@workspace/shared/collisionMap';
export type { Grid, Zone, ZoneName } from '@workspace/shared/collisionMap';
