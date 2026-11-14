import {
  CHARACTER_CELL_WIDTH,
  CHARACTER_COLORS,
  GENERATED_CHARACTER_PALETTES,
  CHARACTER_SHEET_HEIGHT,
  CHARACTER_SHEET_PATH,
  CHARACTER_SHEET_WIDTH,
  CHARACTER_SOURCE_SHEET_COLS,
  CHARACTER_SOURCE_SHEET_WIDTH,
} from './characterSprites';
import { recolorSuitPixel } from '@workspace/shared';
export { isRecolorableSuitPixel, recolorSuitPixel, rgbToHsl } from '@workspace/shared';

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
  const paletteByColor = new Map(GENERATED_CHARACTER_PALETTES.map(palette => [palette.color, palette]));

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

let cachedAtlasUrl: string | null = null;
let cachedAtlasPromise: Promise<HTMLCanvasElement> | null = null;

/** Load the build-time baked 18-palette atlas; no palette generation runs on mobile. */
export function loadCharacterAtlas(baseUrl = '/'): Promise<HTMLCanvasElement> {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const atlasUrl = `${normalizedBase}${CHARACTER_SHEET_PATH.replace(/^\/+/, '')}`;

  if (cachedAtlasUrl === atlasUrl && cachedAtlasPromise) return cachedAtlasPromise;
  cachedAtlasUrl = atlasUrl;
  cachedAtlasPromise = new Promise<HTMLCanvasElement>((resolve, reject) => {
    const loadStartedAt = performance.now();
    const image = new Image();
    let processing = false;

    const fail = () => {
      if (processing) return;
      processing = true;
      reject(new Error(`Unable to load baked character atlas: ${atlasUrl}`));
    };
    const ready = async () => {
      if (processing || !image.complete || image.naturalWidth <= 0) return;
      processing = true;
      try {
        if (typeof image.decode === 'function') {
          try { await image.decode(); } catch { /* a successful load remains a usable decode fallback */ }
        }
        if (image.naturalWidth !== CHARACTER_SHEET_WIDTH || image.naturalHeight !== CHARACTER_SHEET_HEIGHT) {
          throw new Error(`Unexpected baked character atlas dimensions: ${image.naturalWidth}×${image.naturalHeight}`);
        }
        const atlas = document.createElement('canvas');
        atlas.width = CHARACTER_SHEET_WIDTH;
        atlas.height = CHARACTER_SHEET_HEIGHT;
        const context = atlas.getContext('2d');
        if (!context) throw new Error('Could not allocate the baked character atlas canvas');
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        const atlasReadyAt = performance.now();
        if (import.meta.env.DEV) {
          (window as Window & {
            __AG_CHARACTER_ATLAS_METRICS?: {
              sourceLoadMs: number;
              generationMs: number;
              totalMs: number;
              sourceWidth: number;
              sourceHeight: number;
              atlasWidth: number;
              atlasHeight: number;
              generatedPaletteCount: number;
              bakedAsset: boolean;
            };
          }).__AG_CHARACTER_ATLAS_METRICS = {
            sourceLoadMs: atlasReadyAt - loadStartedAt,
            generationMs: 0,
            totalMs: atlasReadyAt - loadStartedAt,
            sourceWidth: image.naturalWidth,
            sourceHeight: image.naturalHeight,
            atlasWidth: atlas.width,
            atlasHeight: atlas.height,
            generatedPaletteCount: GENERATED_CHARACTER_PALETTES.length,
            bakedAsset: true,
          };
        }
        resolve(atlas);
      } catch (error) {
        reject(error);
      }
    };

    image.onload = () => { void ready(); };
    image.onerror = fail;
    image.src = atlasUrl;
    if (image.complete && image.naturalWidth > 0) void ready();
  });

  cachedAtlasPromise.catch(() => {
    if (cachedAtlasUrl === atlasUrl) {
      cachedAtlasUrl = null;
      cachedAtlasPromise = null;
    }
  });
  return cachedAtlasPromise;
}
