/**
 * Phase 7 — Task system definitions.
 * Shared between api-server (assignment + validation) and telegram-game (UI + markers).
 *
 * Task positions are expressed in MAP_W × MAP_H pixel space, derived from the
 * same 1040×580 reference grid used by collisionMap.ts.
 */
import { MAP_W, MAP_H } from './coords.js';

export type TaskZone =
  | 'electrical'
  | 'tech_room_ne'
  | 'industrial'
  | 'gas_station'
  | 'lobby';

export interface TaskDef {
  readonly id: number;
  readonly name: string;
  readonly zone: TaskZone;
  readonly steps: number;
  /** Pixel centre of the task console on the map (MAP_W × MAP_H space). */
  readonly x: number;
  readonly y: number;
}

// Reference-space → MAP pixel converter (maps 1040×580 reference to MAP_W×MAP_H)
const _sx = MAP_W / 1040;
const _sy = MAP_H / 580;
const ref = (rx: number, ry: number) => ({ x: Math.round(rx * _sx), y: Math.round(ry * _sy) });

/**
 * All task types in the game. Positions are map-pixel centres of the interactive
 * console for each task, referenced from the 1040×580 layout grid.
 */
export const TASK_DEFS: readonly TaskDef[] = [
  { id: 0, name: 'Fix Wiring',            zone: 'electrical',   steps: 2, ...ref(820, 510) },
  { id: 1, name: 'Download Data',          zone: 'tech_room_ne', steps: 1, ...ref(760,  80) },
  { id: 2, name: 'Calibrate Distributor',  zone: 'industrial',   steps: 2, ...ref(130, 280) },
  { id: 3, name: 'Empty Garbage',          zone: 'gas_station',  steps: 1, ...ref(130, 455) },
  { id: 4, name: 'Clean Filters',          zone: 'lobby',        steps: 2, ...ref(395, 185) },
] as const;

export const TASK_COUNT = TASK_DEFS.length;

/** Tasks assigned to each crewmate at game start. */
export const TASKS_PER_CREWMATE = 2;

/**
 * Pixel radius within which a player can interact with a task console.
 * ~55 reference-px → scaled up proportionally with the map.
 */
export const TASK_INTERACTION_RANGE_PX = Math.round(55 * _sx);

/** 0x1D — Task assignment packet opcode (S→C, crewmates only). */
export const OPCODE_TASK_ASSIGN = 0x1D as const;
