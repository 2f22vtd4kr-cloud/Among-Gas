// Original Among Gas vector character atlas.
// Each pose occupies one clean 320×300 source cell in the high-resolution SVG.
// Ground shadows are intentionally drawn by GameMap, not baked into the art.
export const CHARACTER_SHEET_PATH = '/sprites/characters.svg?v=1';

export const CHARACTER_SHEET_COLS = 7;
export const CHARACTER_SHEET_ROWS = 9;
export const CHARACTER_SHEET_WIDTH = 2240;
export const CHARACTER_SHEET_HEIGHT = 2700;
export const CHARACTER_CELL_WIDTH = CHARACTER_SHEET_WIDTH / CHARACTER_SHEET_COLS;
export const CHARACTER_CELL_HEIGHT = CHARACTER_SHEET_HEIGHT / CHARACTER_SHEET_ROWS;

export const CHARACTER_COLORS = [
  'teal',
  'maroon',
  'navy',
  'purple',
  'brown',
  'dark-gray',
  'magenta',
] as const;
export type CharacterColor = (typeof CHARACTER_COLORS)[number];

export const CHARACTER_POSES = [
  'idle',
  'walk-1',
  'walk-2',
  'run-lean',
  'ghost',
  'mask',
  'hold-item',
  'dead-body',
  'sit-crouch',
] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

/** Every SVG cell has a fixed intrinsic size: no guessed crop boundaries. */
export function getCharacterFrameRect(color: CharacterColor, pose: CharacterPose) {
  const col = CHARACTER_COLORS.indexOf(color);
  const row = CHARACTER_POSES.indexOf(pose);
  return {
    x: col * CHARACTER_CELL_WIDTH,
    y: row * CHARACTER_CELL_HEIGHT,
    width: CHARACTER_CELL_WIDTH,
    height: CHARACTER_CELL_HEIGHT,
    row,
  };
}
