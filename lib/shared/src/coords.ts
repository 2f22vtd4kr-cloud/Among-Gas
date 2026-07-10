/**
 * Wire coordinate normalization — shared between client and server.
 *
 * Problem: The map is 3224×1858px. Encoding raw pixel coords as Int16LE
 * overflows (Int16 max = 32767, but 3224 > 32767).
 *
 * Solution: Normalize to 0–32000 range on the wire.
 *   wireX = round((pixelX / MAP_W) * WIRE_SCALE)   → 0..32000
 *   pixelX = (wireX / WIRE_SCALE) * MAP_W
 *
 * 32000 fits safely in Int16 (max 32767).
 * Resolution: MAP_W / WIRE_SCALE ≈ 0.1 px/unit — sub-pixel precision.
 *
 * These constants MUST stay in sync with lib/shared/src/collisionMap.ts MAP_W/MAP_H.
 */

/** Wire coordinate range. Must fit in Int16 (max 32767). */
export const WIRE_SCALE = 32000;

/** Map asset dimensions — must match collisionMap.ts MAP_W/MAP_H exactly. */
export const MAP_W = 3224;
export const MAP_H = 1858;

/**
 * Player constants — must stay in sync with artifacts/telegram-game/src/game/player.ts.
 * Used by the server for collision validation with the same geometry as the client.
 */
const _SPRITE_H_MAP_PX = Math.round(36 * (MAP_W / 1652));
export const FEET_OFFSET_Y = Math.round(_SPRITE_H_MAP_PX * 0.25);
export const PLAYER_RADIUS = 4;

/** Pixel → wire coordinate. */
export function toWire(px: number, mapDim: number): number {
  return Math.round((px / mapDim) * WIRE_SCALE);
}

/** Wire → pixel coordinate. */
export function fromWire(wire: number, mapDim: number): number {
  return (wire / WIRE_SCALE) * mapDim;
}

/**
 * Squared wire-space delta threshold for 0xFF broadcast inclusion.
 *
 * Wire resolution: 1px ≈ WIRE_SCALE/MAP_W ≈ 32000/3224 ≈ 9.93 wire units.
 * So 1 wire unit ≈ 0.1 px.  We broadcast when Δwire² > this value.
 *
 * DELTA_THRESHOLD_SQ = 100 ≈ Δwire > 10 units ≈ ~1px of movement.
 * (The previous value of 10 was incorrectly documented as "squared"
 *  but behaved as ~0.3px threshold.  100 is the correct 1px² equivalent.)
 */
export const DELTA_THRESHOLD_SQ = 100;

/**
 * Phase 5 — default impostor kill cooldown, in ms.
 * GAME_SPEC.md §9: default 25s; host-configurable range 15s/25s/45s is future work.
 */
export const KILL_COOLDOWN_MS = 25_000;

/**
 * Phase 6 — meeting timing, in ms (GAME_SPEC.md §6 DISCUSSION → VOTING).
 * Server is authoritative: votes are rejected until the discussion window
 * elapses, and the meeting is auto-tallied once the voting window elapses
 * (or earlier, once every alive player has voted). The client uses the same
 * constants to drive its local discussion/voting countdown UI, timed from
 * the 0x1B Meeting Start receipt.
 */
export const MEETING_DISCUSSION_MS = 15_000;
export const MEETING_VOTING_MS = 30_000;

/** Sentinel byte meaning "skip vote" / "emergency meeting" (no body) / "no one ejected". */
export const NO_TARGET = 0xFF;
