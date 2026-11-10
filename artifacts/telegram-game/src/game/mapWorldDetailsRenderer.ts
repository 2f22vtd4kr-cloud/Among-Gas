import { ADMIN_TABLE_DEFS } from '@workspace/shared/adminTable';
import {
  CHARACTER_CELL_HEIGHT,
  type CharacterColor,
  type CharacterPose,
} from './characterSprites';

export interface MapCorpse {
  readonly slot: number;
  readonly x: number;
  readonly y: number;
}

export interface MapWorldDetailsOptions {
  readonly context: CanvasRenderingContext2D;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly scale: number;
  readonly devicePixelRatio: number;
  readonly sprite: CanvasImageSource;
  readonly corpses: readonly MapCorpse[];
  readonly playerDisplayWidth: number;
  readonly playerDisplayHeight: number;
  readonly getSlotColor: (slot: number) => CharacterColor;
  readonly getFrameRect: (color: CharacterColor, pose: CharacterPose) => {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly clipCharacter: (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    pose: CharacterPose,
  ) => void;
}

/**
 * Draw static world details between task markers and moving players.
 *
 * Corpse sprites must stay below remote/local avatars. The Admin console
 * marker belongs to the same world-space pass, after corpses and before
 * moving actors. This module owns neither game state nor camera policy.
 */
export function drawWorldDetails({
  context: ctx,
  canvasWidth: cw,
  canvasHeight: ch,
  cameraX: srcX,
  cameraY: srcY,
  scale,
  devicePixelRatio: dpr,
  sprite,
  corpses,
  playerDisplayWidth,
  playerDisplayHeight,
  getSlotColor,
  getFrameRect,
  clipCharacter,
}: MapWorldDetailsOptions): void {
  // ── Dropped bodies (separate from the moving ghost avatar) ─────────────
  ctx.save();
  for (const body of corpses) {
    const bx = Math.round((body.x - srcX) * scale);
    const by = Math.round((body.y - srcY) * scale);
    if (bx < -48 || bx > cw + 48 || by < -48 || by > ch + 48) continue;
    const rect = getFrameRect(getSlotColor(body.slot), 'dead-body');
    const sx = Math.ceil(rect.x);
    const sy = Math.ceil(rect.y);
    const sw = Math.floor(rect.x + rect.width) - sx;
    const sh = Math.floor(rect.y + rect.height) - sy;
    // Preserve the authored sprite's pixel aspect ratio. Its row window is
    // shorter than the atlas average, so scale height with the source window
    // instead of stretching a mixed corpse/crouch crop into a fake landscape.
    const corpseW = Math.max(18, Math.round(playerDisplayWidth * scale * 0.95));
    const corpseH = Math.max(12, Math.round(
      playerDisplayHeight * scale * (rect.height / CHARACTER_CELL_HEIGHT) * 0.95,
    ));
    const corpseX = bx - corpseW / 2;
    const corpseY = by - corpseH / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    clipCharacter(ctx, corpseX, corpseY, corpseW, corpseH, 'dead-body');
    ctx.drawImage(sprite, sx, sy, sw, sh, corpseX, corpseY, corpseW, corpseH);
    ctx.restore();
  }
  ctx.restore();

  // ── Admin Table console marker ─────────────────────────────────────────
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const consoleDef of ADMIN_TABLE_DEFS) {
    const ax = Math.round((consoleDef.x - srcX) * scale);
    const ay = Math.round((consoleDef.y - srcY) * scale);
    if (ax < -30 || ax > cw + 30 || ay < -30 || ay > ch + 30) continue;
    const radius = Math.max(7, Math.round(12 * dpr));
    ctx.beginPath();
    ctx.arc(ax, ay, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax, ay, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#193c4b';
    ctx.fill();
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeStyle = 'rgba(100,225,235,0.95)';
    ctx.stroke();
    ctx.fillStyle = '#e4ffff';
    ctx.font = `900 ${Math.max(10, Math.round(13 * dpr))}px sans-serif`;
    ctx.fillText('A', ax, ay + 0.5 * dpr);
  }
  ctx.restore();
}
