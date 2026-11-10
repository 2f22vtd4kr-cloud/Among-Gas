import { useEffect, useRef } from 'react';
import {
  CHARACTER_CELL_WIDTH,
  CHARACTER_COLORS,
  CHARACTER_POSES,
  getCharacterClipNotch,
  getCharacterClipPath,
  getCharacterFrameRect,
  type CharacterColor,
  type CharacterPose,
} from './characterSprites';
import { loadCharacterAtlas } from './characterAtlas';

/** Clip atlas scanlines from the gap between the character's legs. */
export function clipCharacterLegGap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pose: CharacterPose,
): void {
  const notch = getCharacterClipNotch(pose);
  if (!notch) return;
  const leftStart = x + width * notch.leftLegStart;
  const leftEnd = x + width * notch.leftLegEnd;
  const rightStart = x + width * notch.rightLegStart;
  const rightEnd = x + width * notch.rightLegEnd;
  const top = y + height * notch.top;
  const bottom = y + height;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, top);
  ctx.lineTo(rightEnd, top);
  ctx.lineTo(rightEnd, bottom);
  ctx.lineTo(rightStart, bottom);
  ctx.lineTo(rightStart, top);
  ctx.lineTo(leftEnd, top);
  ctx.lineTo(leftEnd, bottom);
  ctx.lineTo(leftStart, bottom);
  ctx.lineTo(leftStart, top);
  ctx.lineTo(x, top);
  ctx.closePath();
  ctx.clip();
}

/** Canvas-backed sprite used by role-reveal, kill and game-over overlays. */
export function CharacterSpriteCanvas({
  color, pose = 'idle', size = 64, flipped = false,
}: {
  color: string; pose?: string; size?: number; flipped?: boolean;
}) {
  const safePose: CharacterPose = (CHARACTER_POSES as readonly string[]).includes(pose)
    ? pose as CharacterPose
    : 'idle';
  const frame = getCharacterFrameRect(
    CHARACTER_COLORS.includes(color as CharacterColor) ? color as CharacterColor : 'teal',
    safePose,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scale = size / CHARACTER_CELL_WIDTH;
  const height = frame.height * scale;

  useEffect(() => {
    let cancelled = false;
    void loadCharacterAtlas(import.meta.env.BASE_URL).then(atlas => {
      if (cancelled || !canvasRef.current) return;
      const context = canvasRef.current.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, frame.width, frame.height);
      context.drawImage(
        atlas,
        frame.x, frame.y, frame.width, frame.height,
        0, 0, frame.width, frame.height,
      );
    }).catch(error => {
      if (import.meta.env.DEV) console.error('Could not render Among Gas character sprite', error);
    });
    return () => { cancelled = true; };
  }, [frame.x, frame.y, frame.width, frame.height]);

  // Every pose uses its measured, isolated atlas window. The corpse is a single
  // authored sprite (cut suit + exposed bone); do not splice in the adjacent
  // sit-crouch row or erase pixels at guessed uniform row boundaries.
  return (
    <canvas
      ref={canvasRef}
      className="ag-character-sprite"
      data-pose={safePose}
      data-sprite-row={frame.row}
      data-source-y={frame.y}
      data-source-height={frame.height}
      data-display-height={frame.displayHeight}
      width={frame.width}
      height={frame.height}
      style={{
        display: 'block',
        width: size,
        height,
        flexShrink: 0,
        imageRendering: 'pixelated',
        transformOrigin: 'top center',
        transform: flipped ? 'scaleX(-1)' : 'none',
        clipPath: getCharacterClipPath(safePose),
      }}
    />
  );
}
