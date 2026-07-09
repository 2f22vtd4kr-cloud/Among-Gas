// Character sprite sheet: artifacts/telegram-game/public/sprites/characters.png
// Pixel-art sheet, 1123×1401px, transparent-background PNG.
//
// Grid: 7 columns (colors) × 9 rows (poses).
// Cells are NOT integer-sized:
//   width  = 1123 / 7 ≈ 160.43 px
//   height = 1401 / 9 ≈ 155.67 px
//
// IMPORTANT: the sheet has 9 pose rows, not 8. Using ROWS=8 produces a
// cell height of 175.125 px which bleeds the next row's character into the
// bottom of every source rect — the root cause of the "double ghost" bug.

export const CHARACTER_SHEET_PATH = "/sprites/characters.png";

export const CHARACTER_SHEET_COLS = 7;
export const CHARACTER_SHEET_ROWS = 9;   // was incorrectly 8; sheet has 9 pose rows
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
  "sit-crouch",     // row 8 — was missing; caused row bleed ghost artifact
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
