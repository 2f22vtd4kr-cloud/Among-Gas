// Character sprite sheet: artifacts/telegram-game/public/sprites/characters.png
// Generated pixel-art sheet, 1024x1024px, transparent background.
//
// Grid: 7 columns (colors) x 8 rows (poses). Cells are NOT integer-sized
// (1024 / 7 = ~146.29px, 1024 / 8 = 128px) -- when slicing frames in a
// canvas/WebGL renderer, sample with fractional source rects rather than
// assuming a clean pixel grid, or re-slice/pad the sheet to an integer
// grid (e.g. 7x8 cells of 150x128 on a 1050x1024 canvas) before shipping.

export const CHARACTER_SHEET_PATH = "/sprites/characters.png";

export const CHARACTER_SHEET_COLS = 7;
export const CHARACTER_SHEET_ROWS = 8;
export const CHARACTER_SHEET_WIDTH = 1024;
export const CHARACTER_SHEET_HEIGHT = 1024;
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
