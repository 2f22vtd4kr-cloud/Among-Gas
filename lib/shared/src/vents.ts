/**
 * Vent network for the Among Gas map.
 *
 * These are deliberately defined in the custom 1040×580 reference layout,
 * then converted to the canonical 3224×1858 map pixels. The positions were
 * checked against the Among Gas collision grid; never copy coordinates from
 * the older AmongGas map, whose world/layout is different.
 */
import { MAP_W, MAP_H } from './collisionMap.js';

const SX = MAP_W / 1040;
const SY = MAP_H / 580;
const ref = (x: number, y: number) => ({
  x: Math.round(x * SX),
  y: Math.round(y * SY),
});

export interface VentDef {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly connections: readonly number[];
}

export const VENT_INTERACTION_RANGE_PX = Math.round(50 * SX);

export const VENT_DEFS: readonly VentDef[] = [
  { id: 0, name: 'Котельная', ...ref(95, 309), connections: [1, 3] },
  { id: 1, name: 'Атриум', ...ref(455, 199), connections: [0, 2] },
  { id: 2, name: 'Техкомната', ...ref(785, 99), connections: [1, 4] },
  { id: 3, name: 'Газовая станция', ...ref(135, 439), connections: [0, 5] },
  { id: 4, name: 'Восточный офис', ...ref(865, 269), connections: [2, 5] },
  { id: 5, name: 'Электрощитовая', ...ref(795, 479), connections: [3, 4] },
] as const;

export function findVent(ventId: number): VentDef | undefined {
  return VENT_DEFS.find(vent => vent.id === ventId);
}

export function canTravelVent(fromVentId: number, toVentId: number): boolean {
  return findVent(fromVentId)?.connections.includes(toVentId) ?? false;
}
