import type { CharacterGhostMotion } from './characterGhostMotion';

export interface MapCanvasCameraProjection {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly scale: number;
}

type GhostPositionOffsets = Pick<CharacterGhostMotion, 'driftX' | 'bobY'>;

export interface RemotePlayerCanvasPosition {
  /** Ground-space Y before ghost float or living walk bob. */
  readonly groundY: number;
  /** Combined screen X including ghost drift, rounded once as before. */
  readonly spriteX: number;
  /** Screen Y including ghost float or living walk bob, rounded as before. */
  readonly spriteY: number;
}

export interface LocalPlayerCanvasPosition {
  /** Rounded, unshifted ground anchor used by the living-player shadow. */
  readonly groundX: number;
  readonly groundY: number;
  /** Local sprite offsets are applied after the base coordinates are rounded. */
  readonly spriteX: number;
  readonly spriteY: number;
}

/**
 * Convert an interpolated remote player's world position to canvas coordinates.
 * Preserve the remote path's historical combined-X rounding and second-stage
 * Y rounding; do not feed the resulting presentation coordinates back to game
 * state, interpolation, collision, or visibility.
 */
export function getRemotePlayerCanvasPosition(input: {
  readonly worldX: number;
  readonly worldY: number;
  readonly camera: MapCanvasCameraProjection;
  readonly ghost: boolean;
  readonly ghostMotion: GhostPositionOffsets;
  readonly walkBobOffset: number;
}): RemotePlayerCanvasPosition {
  const groundY = Math.round(
    (input.worldY - input.camera.sourceY) * input.camera.scale,
  );
  const driftX = input.ghost ? input.ghostMotion.driftX : 0;
  const bobY = input.ghost ? input.ghostMotion.bobY : 0;
  const walkBob = input.ghost ? 0 : input.walkBobOffset;

  return {
    groundY,
    spriteX: Math.round(
      (input.worldX - input.camera.sourceX) * input.camera.scale + driftX,
    ),
    spriteY: Math.round(groundY - bobY - walkBob),
  };
}

/**
 * Convert the local player's world anchor to canvas coordinates.
 * Unlike remote players, the local path rounds the base ground anchor first,
 * then adds/subtracts draw-only ghost/walk offsets without another rounding.
 * Preserve that distinction because it is visible at fractional camera scales.
 */
export function getLocalPlayerCanvasPosition(input: {
  readonly worldX: number;
  readonly worldY: number;
  readonly camera: MapCanvasCameraProjection;
  readonly ghost: boolean;
  readonly ghostMotion: GhostPositionOffsets;
  readonly walkBobOffset: number;
}): LocalPlayerCanvasPosition {
  const groundX = Math.round(
    (input.worldX - input.camera.sourceX) * input.camera.scale,
  );
  const groundY = Math.round(
    (input.worldY - input.camera.sourceY) * input.camera.scale,
  );

  return {
    groundX,
    groundY,
    spriteX: groundX + (input.ghost ? input.ghostMotion.driftX : 0),
    spriteY: groundY - (input.ghost ? input.ghostMotion.bobY : input.walkBobOffset),
  };
}
