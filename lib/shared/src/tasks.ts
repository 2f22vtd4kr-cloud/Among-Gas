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
  | 'lobby'
  | 'garage_nw'
  | 'office_e'
  | 'park';

export interface TaskDef {
  readonly id: number;
  readonly name: string;
  readonly zone: TaskZone;
  readonly steps: number;
  /** Radius of the solid interaction prop's visible perimeter; defaults to 24px. */
  readonly interactionTargetRadiusPx?: number;
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
  // Existing Among Gas tasks, moved onto verified walkable points on the custom map.
  // Shifted west onto the fine-grid clear feet corridor beside the console.
  { id: 0,  name: 'Fix Wiring',            zone: 'electrical',   steps: 2, ...ref(799, 478) },
  { id: 1,  name: 'Download Data',          zone: 'tech_room_ne', steps: 1, ...ref(755,  89) },
  { id: 2,  name: 'Calibrate Distributor',  zone: 'industrial',   steps: 2, ...ref(125, 279) },
  { id: 3,  name: 'Empty Garbage',          zone: 'gas_station',  steps: 1, ...ref(125, 449) },
  { id: 4,  name: 'Clean Filters',          zone: 'lobby',        steps: 2, ...ref(375, 189) },

  // Base-game task types ported to Among Gas: custom-map locations, original
  // balaclava characters and map artwork remain untouched.
  { id: 5,  name: 'Stabilize Navigation',   zone: 'lobby',        steps: 1, ...ref(675, 179) },
  { id: 6,  name: 'Reboot WiFi',            zone: 'office_e',     steps: 2, ...ref(915, 259) },
  { id: 7,  name: 'Fuel Engine',            zone: 'garage_nw',    steps: 2, interactionTargetRadiusPx: 100, ...ref(175,  99) },
  { id: 8,  name: 'Start Reactor',          zone: 'industrial',   steps: 1, ...ref(45,  209) },
  { id: 9,  name: 'Align Engine',           zone: 'industrial',   steps: 2, ...ref(245, 239) },
  { id: 10, name: 'Clear Asteroids',        zone: 'park',         steps: 1, ...ref(685, 439) },
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
