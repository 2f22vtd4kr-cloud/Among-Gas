// Character sprite source: artifacts/telegram-game/public/sprites/characters.png
// Pixel-art source atlas, 1123×1401px, transparent-background PNG.
//
// The source atlas has 7 authored color columns. characterAtlas.ts expands
// those into 18 runtime palettes. The 9 pose bands are NOT
// evenly spaced vertically. Dividing image height by 9 puts crop boundaries
// through real pixels in the mask, held-item, corpse and crouch art. Use the
// measured, non-overlapping windows below; each window contains its whole pose
// and excludes detached strokes that cross the transparent gap between the legs.

// Cache-busting version suffix. Bump this any time characters.png is
// regenerated — browsers (especially mobile Telegram webviews) can
// aggressively cache the previous PNG by URL even after a hard refresh,
// which shows stale artwork (e.g. an old shadow) that isn't actually on
// disk anymore. Appending ?v=N forces a fresh fetch.
const SPRITE_SHEET_VERSION = 6;
export const CHARACTER_SHEET_PATH = `/sprites/characters.png?v=${SPRITE_SHEET_VERSION}`;

// The authored source atlas remains seven columns. The runtime canvas atlas
// expands those seven columns to eighteen while preserving the original poses.
export const CHARACTER_SOURCE_SHEET_COLS = 7;
export const CHARACTER_SOURCE_SHEET_WIDTH = 1123;
export const CHARACTER_SHEET_COLS = 18;
export const CHARACTER_SHEET_ROWS = 9;
export const CHARACTER_SHEET_WIDTH = 2898; // 18 × 161px integer columns
export const CHARACTER_SHEET_HEIGHT = 1401;
export const CHARACTER_CELL_WIDTH = 161;
export const CHARACTER_CELL_HEIGHT = CHARACTER_SHEET_HEIGHT / CHARACTER_SHEET_ROWS;

export const CHARACTER_COLORS = [
  "teal",
  "maroon",
  "navy",
  "purple",
  "brown",
  "dark-gray",
  "magenta",
  "red",
  "blue",
  "green",
  "pink",
  "orange",
  "yellow",
  "black",
  "white",
  "lime",
  "cyan",
  "rose",
] as const;
export type CharacterColor = (typeof CHARACTER_COLORS)[number];

/** One deterministic palette lookup shared by lobby, HUD, and gameplay renderers. */
export function getCharacterColorForSlot(slot: number): CharacterColor {
  const safeSlot = Number.isFinite(slot) ? Math.trunc(slot) : 0;
  return CHARACTER_COLORS[Math.abs(safeSlot) % CHARACTER_COLORS.length];
}

export interface GeneratedCharacterPalette {
  readonly color: CharacterColor;
  /** Target suit hue in degrees; all original shading and alpha are retained. */
  readonly hue: number;
  readonly saturationScale?: number;
  readonly lightnessScale?: number;
  readonly lightnessOffset?: number;
}

/**
 * Additional palettes are generated from the authored teal suit column.
 * Only saturated teal suit pixels are hue-shifted; the balaclava, visor,
 * filter, dark outlines, highlights and transparent pixels remain intact.
 */
export const GENERATED_CHARACTER_PALETTES: readonly GeneratedCharacterPalette[] = [
  { color: "red", hue: 4, lightnessScale: 1.15, lightnessOffset: 0.04 },
  { color: "blue", hue: 218, lightnessScale: 1.18, lightnessOffset: 0.04 },
  { color: "green", hue: 132, lightnessScale: 1.08, lightnessOffset: 0.02 },
  { color: "pink", hue: 330, saturationScale: 0.85, lightnessScale: 1.15, lightnessOffset: 0.05 },
  { color: "orange", hue: 28, lightnessScale: 1.15, lightnessOffset: 0.05 },
  { color: "yellow", hue: 50, saturationScale: 0.85, lightnessScale: 1.2, lightnessOffset: 0.08 },
  { color: "black", hue: 220, saturationScale: 0.24, lightnessScale: 0.55, lightnessOffset: -0.02 },
  { color: "white", hue: 210, saturationScale: 0.12, lightnessScale: 0.35, lightnessOffset: 0.58 },
  { color: "lime", hue: 95, lightnessScale: 1.1, lightnessOffset: 0.04 },
  { color: "cyan", hue: 190, lightnessScale: 1.08, lightnessOffset: 0.03 },
  { color: "rose", hue: 345, saturationScale: 0.82, lightnessScale: 1.16, lightnessOffset: 0.05 },
];

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
 * silhouette while rendered pixels keep their native scale.
 */
const POSE_ROW_WINDOWS: ReadonlyArray<{ top: number; bottom: number; displayHeight: number }> = [
  // Crop just beyond each measured silhouette. The source sheet has stray
  // horizontal strokes through the otherwise transparent leg gap and below the feet;
  // the pose-specific notch removes the bridges while retaining the outer feet.
  { top: 0, bottom: 136, displayHeight: 153 }, // idle: trim only the final detached baseline pixels while retaining the foot tips
  { top: 172, bottom: 310, displayHeight: 138 }, // walk-1: measured silhouette
  { top: 327, bottom: 458, displayHeight: 131 }, // walk-2: measured silhouette
  { top: 471, bottom: 611, displayHeight: 149 }, // run-lean: trim detached underline pixels below the feet
  { top: 636, bottom: 770, displayHeight: 139 }, // ghost: trim detached underline pixels below the float
  { top: 795, bottom: 896, displayHeight: 108 }, // mask: trim the detached black strokes below the pose
  { top: 915, bottom: 1041, displayHeight: 136 }, // hold-item: trim detached underline pixels
  { top: 1067, bottom: 1160, displayHeight: 118 }, // dead-body: preserve the cut suit and bone, exclude detached underline pixels
  { top: 1198, bottom: 1326, displayHeight: 136 }, // sit-crouch: trim detached underline pixels
];

/** Returns an isolated runtime-atlas window (px) for a given color and pose. */
export function getCharacterFrameRect(color: CharacterColor, pose: CharacterPose) {
  const col = CHARACTER_COLORS.indexOf(color);
  const row = CHARACTER_POSES.indexOf(pose);
  const window = POSE_ROW_WINDOWS[row];
  return {
    x: col * CHARACTER_CELL_WIDTH,
    y: window.top,
    width: CHARACTER_CELL_WIDTH,
    height: window.bottom - window.top,
    /** Original atlas baseline retained for diagnostics; rendering never stretches cropped pixels. */
    displayHeight: window.displayHeight,
    row,
  };
}

export interface CharacterClipNotch {
  /** Normalized bounds of the left and right lower-leg silhouettes. */
  leftLegStart: number;
  leftLegEnd: number;
  rightLegStart: number;
  rightLegEnd: number;
  /** Normalized vertical point where only the leg silhouettes remain. */
  top: number;
}

/**
 * The source atlas contains stray horizontal strokes below the torso. Keep the
 * full upper silhouette but clip the lower region to the actual two leg shapes.
 * The same normalized polygon is shared by DOM and canvas renderers.
 */
export function getCharacterClipNotch(pose: CharacterPose): CharacterClipNotch | undefined {
  if (pose === 'idle') {
    // The original idle frame has a short black hook inside the leg gap.
    // Extend the transparent notch to the actual right-leg silhouette edge.
    return { leftLegStart: 0.31, leftLegEnd: 0.49, rightLegStart: 0.68, rightLegEnd: 0.73, top: 0.79 };
  }
  if (pose === 'dead-body') {
    // The corpse frame contains the same detached horizontal bridge; remove
    // the full gap bridge without cutting into either outer leg silhouette.
    return { leftLegStart: 0.34, leftLegEnd: 0.49, rightLegStart: 0.67, rightLegEnd: 0.77, top: 0.66 };
  }
  return undefined;
}

export function getCharacterClipPath(pose: CharacterPose): string | undefined {
  const notch = getCharacterClipNotch(pose);
  if (!notch) return undefined;
  const leftStart = notch.leftLegStart * 100;
  const leftEnd = notch.leftLegEnd * 100;
  const rightStart = notch.rightLegStart * 100;
  const rightEnd = notch.rightLegEnd * 100;
  const top = notch.top * 100;
  return `polygon(0 0, 100% 0, 100% ${top}%, ${rightEnd}% ${top}%, ${rightEnd}% 100%, ${rightStart}% 100%, ${rightStart}% ${top}%, ${leftEnd}% ${top}%, ${leftEnd}% 100%, ${leftStart}% 100%, ${leftStart}% ${top}%, 0 ${top}%)`;
}
