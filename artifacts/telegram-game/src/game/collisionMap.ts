// Re-exported from @workspace/shared — the canonical implementation lives in
// lib/shared/src/collisionMap.ts so both the client and api-server can import it.
export {
  MAP_W, MAP_H,
  COLS, ROWS,
  CELL, CELL_X, CELL_Y,
  KILL_RANGE_PX,
  REPORT_RANGE_PX,
  buildCollisionGrid,
  isBlocked,
  canMoveTo,
  resolveMovement,
  ZONES,
} from '@workspace/shared/collisionMap';
export type { Grid, Zone, ZoneName } from '@workspace/shared/collisionMap';
