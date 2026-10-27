/**
 * Admin table console for the custom Among Gas map.
 *
 * This is an interaction point, not a replacement map. The canonical map and
 * balaclava player models remain the visual assets; the table reads normalized
 * live player coordinates and hides impostors inside vents.
 */
import { MAP_W, MAP_H } from './collisionMap.js';

const SX = MAP_W / 1040;
const SY = MAP_H / 580;
const ref = (x: number, y: number) => ({
  x: Math.round(x * SX),
  y: Math.round(y * SY),
});

export interface AdminTableDef {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

export const ADMIN_TABLE_INTERACTION_RANGE_PX = Math.round(55 * SX);

/** Central atrium console location, validated against Among Gas's own collision map. */
export const ADMIN_TABLE_DEFS: readonly AdminTableDef[] = [
  { id: 0, name: 'Admin Table', ...ref(485, 219) },
] as const;
