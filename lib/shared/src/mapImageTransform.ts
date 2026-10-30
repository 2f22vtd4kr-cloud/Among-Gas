/**
 * Convert camera crops from canonical map-world coordinates to the native
 * source-pixel coordinates of the raster image selected by the asset loader.
 * The canonical PNG is world-sized; the mobile-first WebP is higher resolution.
 */
export interface MapRect { x: number; y: number; width: number; height: number }
export interface MapSize { width: number; height: number }

export function mapWorldRectToImagePixels(
  worldRect: MapRect,
  worldSize: MapSize,
  imageSize: MapSize,
): MapRect {
  const values = [
    worldRect.x, worldRect.y, worldRect.width, worldRect.height,
    worldSize.width, worldSize.height, imageSize.width, imageSize.height,
  ];
  if (!values.every(Number.isFinite) ||
      worldRect.width <= 0 || worldRect.height <= 0 ||
      worldSize.width <= 0 || worldSize.height <= 0 ||
      imageSize.width <= 0 || imageSize.height <= 0) {
    throw new RangeError('Map world rect and image dimensions must be finite and positive.');
  }

  // Keep independent X/Y ratios: image upscaling need not be perfectly uniform.
  const scaleX = imageSize.width / worldSize.width;
  const scaleY = imageSize.height / worldSize.height;
  return {
    x: worldRect.x * scaleX,
    y: worldRect.y * scaleY,
    width: worldRect.width * scaleX,
    height: worldRect.height * scaleY,
  };
}
