export interface CameraPoint {
  x: number;
  y: number;
}

export interface CameraViewportInput {
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  zoom: number;
  centerX: number;
  centerY: number;
  mapWidth: number;
  mapHeight: number;
}

export interface CameraViewport {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  scale: number;
}

const CAMERA_LAG_MS = 16;

/** Exponential camera easing, independent of frame rate. */
export function stepCameraCenter(
  current: CameraPoint,
  target: CameraPoint,
  deltaMs: number,
  lagMs = CAMERA_LAG_MS,
): CameraPoint {
  const values = [current.x, current.y, target.x, target.y, deltaMs, lagMs];
  if (!values.every(Number.isFinite) || lagMs <= 0) {
    throw new RangeError("Camera positions and timing must be finite; lag must be positive");
  }
  const blend = 1 - Math.exp(-Math.max(0, deltaMs) / lagMs);
  return {
    x: current.x + (target.x - current.x) * blend,
    y: current.y + (target.y - current.y) * blend,
  };
}

/** Convert a canvas/DPR/zoom tuple into a clamped logical-world camera window. */
export function getCameraViewport(input: CameraViewportInput): CameraViewport {
  const {
    canvasWidth,
    canvasHeight,
    dpr,
    zoom,
    centerX,
    centerY,
    mapWidth,
    mapHeight,
  } = input;
  const values = [canvasWidth, canvasHeight, dpr, zoom, centerX, centerY, mapWidth, mapHeight];
  if (!values.every(Number.isFinite) ||
      canvasWidth <= 0 || canvasHeight <= 0 || dpr <= 0 || zoom <= 0 ||
      mapWidth <= 0 || mapHeight <= 0) {
    throw new RangeError("Canvas, DPR, zoom and map dimensions must be finite and positive");
  }

  const srcW = (canvasWidth / dpr) / zoom;
  const srcH = (canvasHeight / dpr) / zoom;
  const srcX = Math.max(0, Math.min(mapWidth - srcW, centerX - srcW / 2));
  const srcY = Math.max(0, Math.min(mapHeight - srcH, centerY - srcH / 2));
  return {
    srcX,
    srcY,
    srcW,
    srcH,
    scale: zoom * dpr,
  };
}
