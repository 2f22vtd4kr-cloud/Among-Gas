/**
 * Shared draw-only motion for the dedicated ghost sprite.
 *
 * The returned offsets are presentation coordinates only. Callers keep
 * authoritative position, camera conversion, movement, collision and vision
 * outside this helper.
 */
export interface CharacterGhostMotion {
  /** Lateral floating offset in screen pixels. */
  readonly driftX: number;
  /** Vertical floating offset in screen pixels. */
  readonly bobY: number;
  /** Small body rotation in radians. */
  readonly rotationRad: number;
  /** Breathing scale applied before the facing flip. */
  readonly scaleX: number;
  readonly scaleY: number;
  /** Ghost sprite opacity during its breathing pulse. */
  readonly opacity: number;
}

export function getCharacterGhostMotion(
  timestampMs: number,
  slot: number,
  spriteWidth: number,
  spriteHeight: number,
): CharacterGhostMotion {
  const ghostPhase = timestampMs / 245 + slot * 0.8;
  const ghostPulse = Math.sin(timestampMs / 275 + slot * 0.9);
  const ghostSway = Math.sin(timestampMs / 390 + slot * 0.7);

  return {
    bobY: Math.sin(ghostPhase) * Math.max(2.5, spriteHeight * 0.13),
    driftX: Math.sin(timestampMs / 335 + slot * 1.1) * Math.max(1.5, spriteWidth * 0.06),
    rotationRad: ghostSway * 0.045,
    scaleX: 1 + ghostPulse * 0.025,
    scaleY: 1 - ghostPulse * 0.04,
    opacity: 0.46 + 0.1 * (0.5 + 0.5 * Math.sin(timestampMs / 430 + slot * 0.6)),
  };
}
