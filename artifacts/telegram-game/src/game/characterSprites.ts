// Character sprite sheet: artifacts/telegram-game/public/sprites/characters.png
// User-supplied higher-res pixel-art sheet, 1123x1401px, background removed
// (transparent PNG).
//
// Grid: 7 columns (colors) x 8 rows (poses), same layout/order as the
// previous sheet. Cells are NOT integer-sized (1123 / 7 ≈ 160.43px,
// 1401 / 8 ≈ 175.125px) -- slicing uses fractional source rects, matching
// the pattern from the original sheet.

export const CHARACTER_SHEET_PATH = "/sprites/characters.png";

export const CHARACTER_SHEET_COLS = 7;
export const CHARACTER_SHEET_ROWS = 8;
export const CHARACTER_SHEET_WIDTH = 1123;
export const CHARACTER_SHEET_HEIGHT = 1401;
export const CHARACTER_CELL_WIDTH = CHARACTER_SHEET_WIDTH / CHARACTER_SHEET_COLS;
export const CHARACTER_CELL_HEIGHT = CHARACTER_SHEET_HEIGHT / CHARACTER_SHEET_ROWS;

export const CHARACTER_COLORS = [
  "teal",
  "maroon",
  "navy",
  "purple",
  "brown",
  "dark-gray",
  "magenta",
] as const;
export type CharacterColor = (typeof CHARACTER_COLORS)[number];

export const CHARACTER_POSES = [
  "idle",
  "walk-1",
  "walk-2",
  "run-lean",
  "ghost",
  "mask",
  "hold-item",
  "sit-hug-knees",
] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

/** Returns the source rect (px) for a given color + pose cell in the sheet. */
export function getCharacterFrameRect(color: CharacterColor, pose: CharacterPose) {
  const col = CHARACTER_COLORS.indexOf(color);
  const row = CHARACTER_POSES.indexOf(pose);
  return {
    x: col * CHARACTER_CELL_WIDTH,
    y: row * CHARACTER_CELL_HEIGHT,
    width: CHARACTER_CELL_WIDTH,
    height: CHARACTER_CELL_HEIGHT,
  };
}
