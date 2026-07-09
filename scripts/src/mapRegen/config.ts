// Shared config for the map detail-regeneration pipeline.
// Keeps MAP_W/MAP_H identical to artifacts/telegram-game/src/game/collisionMap.ts
// (6608×3808) — we are NOT changing map resolution or the coordinate system,
// only replacing blurry upscale-interpolated pixels with model-generated detail.
// This means collision boundaries should mostly still line up; re-verify with
// scripts/src/mapRegen/qaOverlay.ts after stitching, before trusting it live.

export const MAP_W = 6608;
export const MAP_H = 3808;
export const COLS = 5;
export const ROWS = 3;
export const OVERLAP = 100; // px of neighbor context fed into each tile's edit call

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve relative to the workspace root regardless of the shell's cwd
// (scripts/src/mapRegen -> ../../.. = workspace root).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const SOURCE_WEBP = path.join(ROOT, 'artifacts/telegram-game/public/map-hires.webp');
export const WORK_DIR = path.join(ROOT, 'scripts/tmp/map-regen');

export interface Rect { x: number; y: number; w: number; h: number; }

export interface TileSpec {
  index: number;
  row: number;
  col: number;
  /** Region that gets pasted into the final composite (no overlap). */
  core: Rect;
  /** Region sent to the model (core + neighbor overlap, clamped to map bounds). */
  crop: Rect;
  /** Where `core` sits inside `crop`, in crop-local pixel coords. */
  coreInCrop: Rect;
  zoneHint: string;
}

// Zone bounding boxes, copied from collisionMap.ts's ZONES table (defined in a
// 1040×580 reference space) and scaled into the 6608×3808 map space the same
// way collisionMap.ts does it (_SX = MAP_W/1040, _SY = MAP_H/580). Used only to
// give each tile a text hint of which named areas it covers — purely a prompt
// aid, not used for any pixel-accurate purpose.
const _SX = MAP_W / 1040;
const _SY = MAP_H / 580;
const zoneRect = (px: number, py: number, pw: number, ph: number, label: string) => ({
  label,
  x: px * _SX, y: py * _SY, w: pw * _SX, h: ph * _SY,
});
const ZONE_BOXES = [
  zoneRect(0, 0, 270, 180, 'Parking Garage'),
  zoneRect(0, 180, 310, 210, 'Boiler Room'),
  zoneRect(0, 210, 45, 180, 'Pipe Corridor'),
  zoneRect(280, 0, 430, 390, 'Main Lobby / Atrium'),
  zoneRect(710, 0, 170, 190, 'Tech Room'),
  zoneRect(670, 80, 50, 110, 'NE Connector'),
  zoneRect(880, 0, 160, 80, 'Far-Right Upper'),
  zoneRect(780, 190, 170, 200, 'East Office'),
  zoneRect(950, 80, 90, 310, 'Far-Right Strip'),
  zoneRect(0, 390, 310, 190, 'Gas Station'),
  zoneRect(310, 390, 400, 190, 'Outdoor Park'),
  zoneRect(600, 360, 130, 130, 'South Junction'),
  zoneRect(730, 330, 140, 160, 'Vehicle Garage'),
  zoneRect(870, 210, 50, 280, 'SE Corridor'),
  zoneRect(730, 470, 190, 110, 'Electrical Room'),
  zoneRect(920, 320, 120, 260, 'Far-SE Strip'),
];

function intersects(a: Rect, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function zoneHintFor(crop: Rect): string {
  const labels = ZONE_BOXES.filter((z) => intersects(crop, z)).map((z) => z.label);
  if (labels.length === 0) return '';
  return `This particular section mainly overlaps these named areas: ${labels.join(', ')}.`;
}

export function buildTileGrid(): TileSpec[] {
  const colBounds = Array.from({ length: COLS + 1 }, (_, i) => Math.round((i * MAP_W) / COLS));
  const rowBounds = Array.from({ length: ROWS + 1 }, (_, i) => Math.round((i * MAP_H) / ROWS));
  const tiles: TileSpec[] = [];
  let index = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const core: Rect = {
        x: colBounds[col],
        y: rowBounds[row],
        w: colBounds[col + 1] - colBounds[col],
        h: rowBounds[row + 1] - rowBounds[row],
      };
      const cx0 = Math.max(0, core.x - OVERLAP);
      const cy0 = Math.max(0, core.y - OVERLAP);
      const cx1 = Math.min(MAP_W, core.x + core.w + OVERLAP);
      const cy1 = Math.min(MAP_H, core.y + core.h + OVERLAP);
      const crop: Rect = { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
      const coreInCrop: Rect = { x: core.x - crop.x, y: core.y - crop.y, w: core.w, h: core.h };
      tiles.push({ index, row, col, core, crop, coreInCrop, zoneHint: zoneHintFor(crop) });
      index++;
    }
  }
  return tiles;
}

const STYLE_LOCK =
  'flat top-down 2D video-game map art, muted industrial/urban color palette, soft even ambient lighting with no strong directional shadows, consistent clean shading across the whole map';

export function buildPrompt(tile: TileSpec): string {
  return [
    'This image is one rectangular section cropped from a larger top-down 2D game map of a modern Russian industrial-urban complex (garages, boiler room, pipe corridor, main lobby/atrium, tech room, offices, a small gas station, a park, an electrical room).',
    'Re-render this exact section with much more fine surface detail, realistic textures, materials, and subtle weathering added to every object and surface.',
    'Do NOT move, resize, add, remove, or reinterpret the position, silhouette, or boundary of any wall, road, vehicle, or object — the overall layout, silhouettes, and color palette must stay exactly the same. Only the fine detail/texture should improve.',
    `Style: ${STYLE_LOCK}.`,
    'Recognizable objects, where present, should clearly read as modern Russian iconography: a UAZ-452 "Bukhanka" van, industrial boiler/pipework, a bust/head sculpture of Lenin, Soviet-era architectural details, a small gas station, a parking garage.',
    'Absolutely no text, logos, signage, numbers, or lettering of any kind anywhere in the image; if any lettering is truly unavoidable it must be in Russian Cyrillic only, never English or any other language.',
    tile.zoneHint,
  ]
    .filter(Boolean)
    .join(' ');
}
