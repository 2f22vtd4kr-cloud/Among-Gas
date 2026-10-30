import { PLAYER_ANIM_INTERVAL_MS } from './player';

/**
 * Draw-only vertical bounce for the two-frame walk cycle.
 * The animation accumulator is shared with pose selection so feet and body
 * motion cannot drift out of phase with one another.
 */
export function getCharacterWalkBobOffset(animElapsedMs: number, spriteHeight: number): number {
  if (!Number.isFinite(animElapsedMs) || !Number.isFinite(spriteHeight) || spriteHeight <= 0) return 0;
  return Math.abs(Math.sin((animElapsedMs / PLAYER_ANIM_INTERVAL_MS) * Math.PI)) *
    Math.max(1.5, spriteHeight * 0.06);
}

/** Keep the ground oval anchored while compressing it as the sprite rises. */
export function getCharacterShadowScale(walkBobOffset: number, spriteHeight: number): number {
  if (!Number.isFinite(walkBobOffset) || !Number.isFinite(spriteHeight) || spriteHeight <= 0) return 1;
  const maxBob = Math.max(1, spriteHeight * 0.06);
  return 1 - Math.min(0.24, Math.max(0, walkBobOffset) / maxBob * 0.24);
}
