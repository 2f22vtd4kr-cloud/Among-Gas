import {
  CHARACTER_SHADOW_HEIGHT_RADIUS_RATIO,
  CHARACTER_SHADOW_WIDTH_RADIUS_RATIO,
  CHARACTER_SHADOW_Y_OFFSET_RATIO,
} from './characterAnimation';
import type { CharacterPose } from './characterSprites';

export interface LocalPlayerAppearanceOptions {
  readonly context: CanvasRenderingContext2D;
  readonly sprite: CanvasImageSource;
  readonly frameRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly pose: CharacterPose;
  readonly slot: number;
  readonly timestampMs: number;
  readonly shadowX: number;
  readonly shadowY: number;
  readonly spriteX: number;
  readonly spriteY: number;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly facingLeft: boolean;
  readonly ghost: boolean;
  readonly shadowScale: number;
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
 * Draw the local player's already-positioned shadow and sprite appearance.
 * Movement, camera coordinates, walk/ghost bob, pose and facing are supplied
 * by GameMap; this function performs no gameplay or vision calculations.
 */
export function drawLocalPlayerAppearance({
  context: ctx,
  sprite,
  frameRect,
  pose,
  slot,
  timestampMs,
  shadowX,
  shadowY,
  spriteX,
  spriteY,
  spriteWidth,
  spriteHeight,
  facingLeft,
  ghost,
  shadowScale,
  clipCharacterLegGap,
}: LocalPlayerAppearanceOptions): void {
  if (!ghost) {
    const blurPx = Math.max(2, Math.round(spriteHeight * 0.05));
    ctx.save();
    ctx.filter = `blur(${blurPx}px)`;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(
      shadowX,
      shadowY + spriteHeight * CHARACTER_SHADOW_Y_OFFSET_RATIO,
      spriteWidth * CHARACTER_SHADOW_WIDTH_RADIUS_RATIO * shadowScale,
      spriteHeight * CHARACTER_SHADOW_HEIGHT_RADIUS_RATIO * shadowScale,
      0, 0, Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    ctx.filter = 'none';
  }

  const sx = Math.ceil(frameRect.x);
  const sy = Math.ceil(frameRect.y);
  const sw = Math.floor(frameRect.x + frameRect.width) - sx;
  const sh = Math.floor(frameRect.y + frameRect.height) - sy;

  ctx.save();
  ctx.translate(spriteX, spriteY);
  if (ghost) {
    const ghostPulse = Math.sin(timestampMs / 275 + slot * 0.9);
    const ghostSway = Math.sin(timestampMs / 390 + slot * 0.7);
    ctx.rotate(ghostSway * 0.045);
    ctx.scale(1 + ghostPulse * 0.025, 1 - ghostPulse * 0.04);
    ctx.globalAlpha = 0.46 + 0.1 * (0.5 + 0.5 * Math.sin(timestampMs / 430 + slot * 0.6));
  }
  if (facingLeft) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  clipCharacterLegGap(ctx, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight, pose);
  ctx.drawImage(
    sprite,
    sx, sy, sw, sh,
    -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight,
  );
  ctx.restore();
}
