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


export interface CameraFrameInput {
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  zoom: number;
  mapWidth: number;
  mapHeight: number;
}

export interface CameraFrame {
  center: CameraPoint;
  viewport: CameraViewport;
}

/** Stateful camera boundary around the pure smoothing and viewport functions. */
export class MapCameraController {
  private center: CameraPoint;

  constructor(initialCenter: CameraPoint) {
    this.assertPoint(initialCenter);
    this.center = { ...initialCenter };
  }

  /** Snap only for an authoritative correction or an explicit fixture position. */
  snap(center: CameraPoint): CameraPoint {
    this.assertPoint(center);
    this.center = { ...center };
    return this.getCenter();
  }

  /** Smoothly follow the locally predicted player position. */
  follow(target: CameraPoint, deltaMs: number): CameraPoint {
    this.center = stepCameraCenter(this.center, target, deltaMs);
    return this.getCenter();
  }

  getCenter(): CameraPoint {
    return { ...this.center };
  }

  getViewport(input: CameraFrameInput): CameraViewport {
    return getCameraViewport({
      ...input,
      centerX: this.center.x,
      centerY: this.center.y,
    });
  }

  update(target: CameraPoint, deltaMs: number, input: CameraFrameInput): CameraFrame {
    const center = this.follow(target, deltaMs);
    return {
      center,
      viewport: this.getViewport(input),
    };
  }

  private assertPoint(point: CameraPoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError("Camera center coordinates must be finite");
    }
  }
}
