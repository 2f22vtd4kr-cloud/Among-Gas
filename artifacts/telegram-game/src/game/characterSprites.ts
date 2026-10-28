// Character sprite sheet: artifacts/telegram-game/public/sprites/characters.png
// Pixel-art sheet, 1123×1401px, transparent-background PNG.
//
// The sheet has 7 color columns and 9 pose bands, but the pose bands are NOT
// evenly spaced vertically. Dividing image height by 9 puts crop boundaries
// through real pixels in the mask, held-item, corpse and crouch art. Use the
// measured, non-overlapping windows below; each window contains its whole pose
// plus its inter-row padding, and excludes pixels from adjacent poses.

// Cache-busting version suffix. Bump this any time characters.png is
// regenerated — browsers (especially mobile Telegram webviews) can
// aggressively cache the previous PNG by URL even after a hard refresh,
// which shows stale artwork (e.g. an old shadow) that isn't actually on
// disk anymore. Appending ?v=N forces a fresh fetch.
const SPRITE_SHEET_VERSION = 4;
export const CHARACTER_SHEET_PATH = `/sprites/characters.png?v=${SPRITE_SHEET_VERSION}`;

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
  "dead-body",       // row 7 — existing cut-body sprite with exposed bone
  "sit-crouch",     // row 8 — was missing; caused row bleed ghost artifact
] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

/**
 * Vertical crop windows measured from the authored PNG. Bounds are between
 * adjacent pose silhouettes, rather than uniform divisions of sheet height.
 * [top, bottom) coordinates intentionally retain the blank padding around each
 * silhouette so canvas sprites preserve their authored scale.
 */
const POSE_ROW_WINDOWS: ReadonlyArray<{ top: number; bottom: number }> = [
  { top: 0, bottom: 172 },       // idle: visible pixels y=16–155
  { top: 172, bottom: 327 },     // walk-1: y=188–312
  { top: 327, bottom: 471 },     // walk-2: y=342–460
  { top: 471, bottom: 636 },     // run-lean: y=481–622
  { top: 636, bottom: 795 },     // ghost: y=650–777
  { top: 795, bottom: 915 },     // mask: y=811–905
  { top: 915, bottom: 1067 },    // hold-item: y=924–1053
  { top: 1067, bottom: 1198 },   // dead-body: y=1080–1187
  { top: 1198, bottom: 1350 },   // sit-crouch: y=1209–1336
];

/** Returns an isolated source window (px) for a given color and pose. */
export function getCharacterFrameRect(color: CharacterColor, pose: CharacterPose) {
  const col = CHARACTER_COLORS.indexOf(color);
  const row = CHARACTER_POSES.indexOf(pose);
  const window = POSE_ROW_WINDOWS[row];
  return {
    x: col * CHARACTER_CELL_WIDTH,
    y: window.top,
    width: CHARACTER_CELL_WIDTH,
    height: window.bottom - window.top,
    row,
  };
}
