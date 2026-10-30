import {
  CHARACTER_CELL_WIDTH,
  CHARACTER_COLORS,
  GENERATED_CHARACTER_PALETTES,
  CHARACTER_SHEET_HEIGHT,
  CHARACTER_SHEET_PATH,
  CHARACTER_SHEET_WIDTH,
  CHARACTER_SOURCE_SHEET_COLS,
  CHARACTER_SOURCE_SHEET_WIDTH,
  type GeneratedCharacterPalette,
} from './characterSprites';

type Hsl = readonly [hue: number, saturation: number, lightness: number];
type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const SUIT_HUE_MIN = 155;
const SUIT_HUE_MAX = 190;
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

/** True only for the saturated teal suit material, not visor/filter/outline pixels. */
export function isRecolorableSuitPixel(red: number, green: number, blue: number, alpha: number): boolean {
  if (alpha === 0) return false;
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  // The pale breathing/filter disk shares a cyan hue with the suit but is
  // both much lighter and more neutral. Keep that hardware untouched.
  const filterLike = hue >= 174 && hue <= 183 && lightness >= 0.72;
  return !filterLike && hue >= SUIT_HUE_MIN && hue <= SUIT_HUE_MAX &&
    saturation >= SUIT_MIN_SATURATION && lightness >= 0.1 && lightness <= 0.95;
}

/**
 * Hue-shift one suit pixel while preserving its authored per-pixel shading.
 * Low-saturation outline/filter pixels and the blue visor are returned unchanged.
 */
export function recolorSuitPixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
  palette: GeneratedCharacterPalette,
): Rgba {
  if (!isRecolorableSuitPixel(red, green, blue, alpha)) return [red, green, blue, alpha];

  const [, saturation, lightness] = rgbToHsl(red, green, blue);
  const nextSaturation = Math.max(0, Math.min(1, saturation * (palette.saturationScale ?? 1)));
  const nextLightness = Math.max(0.04, Math.min(
    0.96,
    lightness * (palette.lightnessScale ?? 1) + (palette.lightnessOffset ?? 0),
  ));
  const [nextRed, nextGreen, nextBlue] = hslToRgb(palette.hue, nextSaturation, nextLightness);
  return [nextRed, nextGreen, nextBlue, alpha];
}

/**
 * Build an in-memory 18-column atlas from the original seven-column PNG.
 * The seven authored columns are retained; eleven new suit palettes are
 * derived from teal without tinting the visor, mask, filter, outlines or alpha.
 */
export function createCharacterAtlas(source: HTMLImageElement): HTMLCanvasElement {
  if (source.naturalWidth !== CHARACTER_SOURCE_SHEET_WIDTH ||
      source.naturalHeight !== CHARACTER_SHEET_HEIGHT) {
    throw new Error(
      `Unexpected character source atlas dimensions: ${source.naturalWidth}×${source.naturalHeight}`,
    );
  }

  const atlas = document.createElement('canvas');
  atlas.width = CHARACTER_SHEET_WIDTH;
  atlas.height = CHARACTER_SHEET_HEIGHT;
  const context = atlas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not allocate the character palette canvas');

  context.imageSmoothingEnabled = false;
  const sourceCellWidth = CHARACTER_SOURCE_SHEET_WIDTH / CHARACTER_SOURCE_SHEET_COLS;
  const paletteByColor = new Map(CHARACTER_GENERATED_PALETTES.map(palette => [palette.color, palette]));

  for (let column = 0; column < CHARACTER_COLORS.length; column++) {
    const color = CHARACTER_COLORS[column];
    const sourceColumn = column < CHARACTER_SOURCE_SHEET_COLS ? column : 0;
    const sourceLeft = Math.ceil(sourceColumn * sourceCellWidth);
    const sourceRight = Math.floor((sourceColumn + 1) * sourceCellWidth);
    const destinationLeft = column * CHARACTER_CELL_WIDTH;

    context.drawImage(
      source,
      sourceLeft, 0, sourceRight - sourceLeft, CHARACTER_SHEET_HEIGHT,
      destinationLeft, 0, CHARACTER_CELL_WIDTH, CHARACTER_SHEET_HEIGHT,
    );

    const palette = paletteByColor.get(color);
    if (!palette) continue;

    const pixels = context.getImageData(destinationLeft, 0, CHARACTER_CELL_WIDTH, CHARACTER_SHEET_HEIGHT);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const recolored = recolorSuitPixel(
        pixels.data[offset],
        pixels.data[offset + 1],
        pixels.data[offset + 2],
        pixels.data[offset + 3],
        palette,
      );
      pixels.data[offset] = recolored[0];
      pixels.data[offset + 1] = recolored[1];
      pixels.data[offset + 2] = recolored[2];
      pixels.data[offset + 3] = recolored[3];
    }
    context.putImageData(pixels, destinationLeft, 0);
  }

  return atlas;
}

let cachedSourceUrl: string | null = null;
let cachedAtlasPromise: Promise<HTMLCanvasElement> | null = null;

/** Load and palette-expand the source once per application session. */
export function loadCharacterAtlas(baseUrl = '/'): Promise<HTMLCanvasElement> {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const sourceUrl = `${normalizedBase}${CHARACTER_SHEET_PATH.replace(/^\\/+/, '')}`;

  if (cachedSourceUrl === sourceUrl && cachedAtlasPromise) return cachedAtlasPromise;
  cachedSourceUrl = sourceUrl;
  cachedAtlasPromise = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image();
    let processing = false;

    const fail = () => {
      if (processing) return;
      processing = true;
      reject(new Error(`Unable to load character atlas: ${sourceUrl}`));
    };
    const ready = async () => {
      if (processing || !image.complete || image.naturalWidth <= 0) return;
      processing = true;
      try {
        if (typeof image.decode === 'function') {
          try { await image.decode(); } catch { /* a successful load remains a usable decode fallback */ }
        }
        resolve(createCharacterAtlas(image));
      } catch (error) {
        reject(error);
      }
    };

    image.onload = () => { void ready(); };
    image.onerror = fail;
    image.src = sourceUrl;
    if (image.complete && image.naturalWidth > 0) void ready();
  });

  cachedAtlasPromise.catch(() => {
    if (cachedSourceUrl === sourceUrl) {
      cachedSourceUrl = null;
      cachedAtlasPromise = null;
    }
  });
  return cachedAtlasPromise;
}
