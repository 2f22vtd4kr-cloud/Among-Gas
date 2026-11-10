import {
  CHARACTER_SHADOW_HEIGHT_RADIUS_RATIO,
  CHARACTER_SHADOW_WIDTH_RADIUS_RATIO,
  CHARACTER_SHADOW_Y_OFFSET_RATIO,
} from './characterAnimation';
import type { CharacterPose } from './characterSprites';
import type { CharacterGhostMotion } from './characterGhostMotion';

export interface RemotePlayerFrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RemotePlayerAppearanceOptions {
  readonly context: CanvasRenderingContext2D;
  readonly sprite: CanvasImageSource;
  readonly frameRect: RemotePlayerFrameRect;
  readonly pose: CharacterPose;
  readonly ghostMotion: CharacterGhostMotion;
  readonly screenX: number;
  readonly screenY: number;
  readonly groundY: number;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly facingLeft: boolean;
  readonly ghost: boolean;
  readonly devicePixelRatio: number;
  readonly shadowScale: number;
  readonly name: string;
  readonly labelColor: string;
  readonly clipCharacterLegGap: (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    pose: CharacterPose,
  ) => void;
}

/**
 * Draw one already-positioned remote character and its nameplate.
 *
 * Visibility, off-screen culling, movement interpolation, pose selection,
 * ghost drift/bob, and teammate label colour are computed by GameMap. This
 * renderer owns only the appearance pass and never changes world/game state.
 */
export function drawRemotePlayerAppearance({
  context: ctx,
  sprite,
  frameRect,
  pose,
  ghostMotion,
  screenX,
  screenY,
  groundY,
  spriteWidth,
  spriteHeight,
  facingLeft,
  ghost,
  devicePixelRatio: dpr,
  shadowScale,
  name,
  labelColor,
  clipCharacterLegGap,
}: RemotePlayerAppearanceOptions): void {
  // Ground shadows belong to living players only; ghost sprites float.
  if (!ghost) {
    const blurPx = Math.max(2, Math.round(spriteHeight * 0.05));
    ctx.save();
    ctx.filter = `blur(${blurPx}px)`;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(
      screenX,
      groundY + spriteHeight * CHARACTER_SHADOW_Y_OFFSET_RATIO,
      spriteWidth * CHARACTER_SHADOW_WIDTH_RADIUS_RATIO * shadowScale,
      spriteHeight * CHARACTER_SHADOW_HEIGHT_RADIUS_RATIO * shadowScale,
      0, 0, Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    ctx.filter = 'none';
  }

  // Preserve the measured, isolated atlas crop rather than rounding the
  // atlas window as a uniform grid cell.
  const sx = Math.ceil(frameRect.x);
  const sy = Math.ceil(frameRect.y);
  const sw = Math.floor(frameRect.x + frameRect.width) - sx;
  const sh = Math.floor(frameRect.y + frameRect.height) - sy;

  ctx.save();
  ctx.translate(screenX, screenY);
  if (ghost) {
    ctx.rotate(ghostMotion.rotationRad);
    ctx.scale(ghostMotion.scaleX, ghostMotion.scaleY);
    ctx.globalAlpha = ghostMotion.opacity;
  }
  if (facingLeft) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  clipCharacterLegGap(ctx, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight, pose);
  ctx.drawImage(
    sprite,
    sx,
    sy,
    sw,
    sh,
    -spriteWidth / 2,
    -spriteHeight / 2,
    spriteWidth,
    spriteHeight,
  );
  ctx.restore();
  ctx.imageSmoothingEnabled = true;

  // The player label uses the precomputed role/ghost colour from GameMap.
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;
  ctx.fillStyle = labelColor;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = Math.round(2 * dpr);
  const labelY = screenY - spriteHeight / 2 - 3;
  ctx.strokeText(name, screenX, labelY);
  ctx.fillText(name, screenX, labelY);
}
