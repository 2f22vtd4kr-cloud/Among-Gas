/**
 * Minimal structural canvas surface used by the map underlay.
 *
 * Deliberately avoids DOM-library types: this module is also imported by the
 * Node-based scripts typecheck, while browser-specific types belong at the
 * GameMap/TiledMap integration boundary.
 */
export interface MapBaseLayerContext {
  clearRect(x: number, y: number, width: number, height: number): void;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: "low" | "medium" | "high";
  drawImage(
    image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

export interface MapBaseLayerTileRenderer {
  draw(
    context: any,
    camera: { x: number; y: number; w: number; h: number },
    zoom: number,
    dpr: number,
  ): boolean;
}

export interface MapBaseLayerOptions {
  context: MapBaseLayerContext;
  canvasWidth: number;
  canvasHeight: number;
  mapImage: unknown;
  mapSourceRect: { x: number; y: number; width: number; height: number };
  cameraWorldRect: { x: number; y: number; w: number; h: number };
  zoom: number;
  dpr: number;
  tiledMap?: MapBaseLayerTileRenderer | null;
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
