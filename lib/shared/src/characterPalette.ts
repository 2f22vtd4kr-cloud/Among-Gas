export const CHARACTER_SOURCE_SHEET_COLS = 7;
export const CHARACTER_SOURCE_SHEET_WIDTH = 1123;
export const CHARACTER_SHEET_COLS = 18;
export const CHARACTER_SHEET_ROWS = 9;
export const CHARACTER_SHEET_WIDTH = 2898;
export const CHARACTER_SHEET_HEIGHT = 1401;
export const CHARACTER_CELL_WIDTH = 161;
export const CHARACTER_CELL_HEIGHT = CHARACTER_SHEET_HEIGHT / CHARACTER_SHEET_ROWS;

export const CHARACTER_COLORS = [
  "teal", "maroon", "navy", "purple", "brown", "dark-gray", "magenta",
  "red", "blue", "green", "pink", "orange", "yellow", "black", "white",
  "lime", "cyan", "rose",
] as const;
export type CharacterColor = (typeof CHARACTER_COLORS)[number];

export interface GeneratedCharacterPalette {
  readonly color: CharacterColor;
  readonly hue: number;
  readonly saturationScale?: number;
  readonly lightnessScale?: number;
  readonly lightnessOffset?: number;
}

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

type Hsl = readonly [hue: number, saturation: number, lightness: number];
type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const SUIT_HUE_MIN = 155;
const SUIT_HUE_MAX = 186;
const SUIT_MIN_SATURATION = 0.3;

export function rgbToHsl(red: number, green: number, blue: number): Hsl {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  return [hue, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): readonly [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function isRecolorableSuitHsl(hue: number, saturation: number, lightness: number, alpha: number): boolean {
  if (alpha === 0) return false;
  const filterLike = hue >= 174 && hue <= 183 && lightness >= 0.72;
  return !filterLike && hue >= SUIT_HUE_MIN && hue <= SUIT_HUE_MAX &&
    saturation >= SUIT_MIN_SATURATION && lightness >= 0.1 && lightness <= 0.95;
}

export function isRecolorableSuitPixel(red: number, green: number, blue: number, alpha: number): boolean {
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  return isRecolorableSuitHsl(hue, saturation, lightness, alpha);
}

export function recolorSuitPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  palette: GeneratedCharacterPalette,
): Rgba {
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  if (!isRecolorableSuitHsl(hue, saturation, lightness, alpha)) return [red, green, blue, alpha];
  const nextSaturation = Math.max(0, Math.min(1, saturation * (palette.saturationScale ?? 1)));
  const nextLightness = Math.max(0.04, Math.min(
    0.96,
    lightness * (palette.lightnessScale ?? 1) + (palette.lightnessOffset ?? 0),
  ));
  const [nextRed, nextGreen, nextBlue] = hslToRgb(palette.hue, nextSaturation, nextLightness);
  return [nextRed, nextGreen, nextBlue, alpha];
}
