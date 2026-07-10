/**
 * Phase 8 — Sabotages & Vision definitions.
 * Shared between api-server (trigger/repair validation, countdown) and
 * telegram-game (sabotage panel, repair prompts, fog-of-war rendering).
 *
 * Protocol reference: GAME_SPEC.md §10, §13 Phase 8.
 */
import { MAP_W, MAP_H } from './collisionMap.js';

export const SABOTAGE_LIGHTS = 0x01 as const;
export const SABOTAGE_O2 = 0x02 as const;
export const SABOTAGE_REACTOR = 0x03 as const;

export type SabotageSystemId =
  | typeof SABOTAGE_LIGHTS
  | typeof SABOTAGE_O2
  | typeof SABOTAGE_REACTOR;

export function isSabotageSystemId(n: number): n is SabotageSystemId {
  return n === SABOTAGE_LIGHTS || n === SABOTAGE_O2 || n === SABOTAGE_REACTOR;
}

export interface SabotagePad {
  readonly x: number;
  readonly y: number;
}

export interface SabotageDef {
  readonly id: SabotageSystemId;
  readonly name: string;
  /** 1 pad for Lights (fixed by any single crewmate interaction); 2 pads for O2/Reactor. */
  readonly pads: readonly SabotagePad[];
}

// Reference-space → MAP pixel converter (same 1040×580 reference grid as tasks.ts/collisionMap.ts)
const _sx = MAP_W / 1040;
const _sy = MAP_H / 580;
const ref = (rx: number, ry: number) => ({ x: Math.round(rx * _sx), y: Math.round(ry * _sy) });

/**
 * Sabotage systems and their console/pad positions.
 * Reuses the existing 'electrical' / 'gas_station' / 'industrial' zone areas
 * from collisionMap.ts's ZONES so consoles land in thematically-fitting rooms.
 */
export const SABOTAGE_DEFS: Record<SabotageSystemId, SabotageDef> = {
  [SABOTAGE_LIGHTS]: {
    id: SABOTAGE_LIGHTS,
    name: 'Lights',
    pads: [ref(800, 500)], // electrical zone
  },
  [SABOTAGE_O2]: {
    id: SABOTAGE_O2,
    name: 'O₂',
    pads: [ref(60, 430), ref(240, 460)], // gas_station zone, two separate pads
  },
  [SABOTAGE_REACTOR]: {
    id: SABOTAGE_REACTOR,
    name: 'Reactor',
    pads: [ref(50, 210), ref(230, 300)], // industrial zone, two separate pads
  },
};

/** Pixel radius within which a player can interact with a sabotage pad. */
export const SABOTAGE_INTERACTION_RANGE_PX = Math.round(55 * _sx);

/** Countdown before impostors win outright if a sabotage is not fixed in time (GAME_SPEC.md §10). */
export const SABOTAGE_COUNTDOWN_MS = 30_000;

/** Global cooldown between sabotage triggers, shared across all impostors in a lobby (GAME_SPEC.md §10). */
export const SABOTAGE_COOLDOWN_MS = 30_000;

/**
 * For O2/Reactor: max window between the two pads being fixed to count as
 * "simultaneous" (GAME_SPEC.md §10 says two crewmates must "interact"/"hold ...
 * simultaneously"). Since repairs are discrete one-shot RPCs rather than a
 * continuous hold, this rolling window is the pragmatic interpretation —
 * documented as an intentional deviation in GAME_SPEC.md §14.
 */
export const SABOTAGE_PAD_SYNC_WINDOW_MS = 10_000;

/**
 * Crewmate vision radius while a Lights sabotage is active — 15% of the
 * conceptual "normal" radius below (GAME_SPEC.md §10). Impostor vision is
 * unaffected by Lights, so no fog is rendered on an impostor's own client.
 * Fog-of-war is only ever rendered during an active Lights sabotage — normal
 * gameplay has full visibility, matching the rest of the game before Phase 8.
 */
export const NORMAL_VISION_RADIUS_PX = Math.round(260 * _sx);
export const LIGHTS_VISION_SCALE = 0.15;
export const LIGHTS_CREWMATE_VISION_RADIUS_PX = Math.round(NORMAL_VISION_RADIUS_PX * LIGHTS_VISION_SCALE);

/**
 * 0x16 — Sabotage Control opcode (S→C, sub-actions). Not present in the
 * original GAME_SPEC.md §3 opcode matrix — added the same way Phase 7 added
 * 0x1D for task assignment, extending the wire protocol for a mechanic the
 * spec describes but doesn't give a concrete opcode for.
 *   sub 0x01 — Started:    [0x16, 0x01, systemId, attackerSlot]
 *   sub 0x02 — Pad fixed:  [0x16, 0x02, systemId, padId]      (2-pad systems only)
 *   sub 0x03 — Fixed:      [0x16, 0x03, systemId]
 */
export const OPCODE_SABOTAGE = 0x16 as const;
