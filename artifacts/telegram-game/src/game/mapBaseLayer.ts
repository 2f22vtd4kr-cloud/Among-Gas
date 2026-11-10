import type { TiledMap } from "./TiledMap";

export interface MapBaseLayerOptions {
  context: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  mapImage: CanvasImageSource;
  mapSourceRect: { x: number; y: number; width: number; height: number };
  cameraWorldRect: { x: number; y: number; w: number; h: number };
  zoom: number;
  dpr: number;
  tiledMap?: TiledMap | null;
}

/**
 * Draw the stable map underlay for a gameplay frame: clear the viewport,
 * paint the overview fallback, then let visible high-resolution tiles cover it.
 *
 * Keep this pass free of camera calculations and debug side effects so its
 * draw order and source/destination coordinate contract can be tested alone.
 */
export function drawMapBaseLayer({
  context,
  canvasWidth,
  canvasHeight,
  mapImage,
  mapSourceRect,
  cameraWorldRect,
  zoom,
  dpr,
  tiledMap,
}: MapBaseLayerOptions): boolean | null {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    mapImage,
    mapSourceRect.x,
    mapSourceRect.y,
    mapSourceRect.width,
    mapSourceRect.height,
    0,
    0,
    canvasWidth,
    canvasHeight,
  );

  return tiledMap ? tiledMap.draw(context, cameraWorldRect, zoom, dpr) : null;
}
