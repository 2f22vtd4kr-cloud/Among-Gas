export interface MapVisionPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapVisionFogOptions {
  readonly context: CanvasRenderingContext2D;
  readonly fogContext: CanvasRenderingContext2D;
  readonly fogCanvas: HTMLCanvasElement;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly scale: number;
  readonly playerScreenX: number;
  readonly playerScreenY: number;
  readonly visionRadiusScreenPx: number;
  readonly visiblePolygon: readonly MapVisionPoint[];
}

/**
 * Composite an already-computed visibility polygon into the map's fog layer.
 * Vision policy and ray casting remain in GameMap/visibility.ts; this helper
 * owns only the offscreen buffer lifecycle and fog composition.
 */
export function drawVisionFogOverlay({
  context,
  fogContext,
  fogCanvas,
  canvasWidth,
  canvasHeight,
  cameraX,
  cameraY,
  scale,
  playerScreenX,
  playerScreenY,
  visionRadiusScreenPx,
  visiblePolygon,
}: MapVisionFogOptions): void {
  if (fogCanvas.width !== canvasWidth || fogCanvas.height !== canvasHeight) {
    fogCanvas.width = canvasWidth;
    fogCanvas.height = canvasHeight;
  }

  fogContext.setTransform(1, 0, 0, 1, 0, 0);
  fogContext.globalAlpha = 1;
  fogContext.globalCompositeOperation = 'source-over';
  fogContext.filter = 'none';
  fogContext.clearRect(0, 0, canvasWidth, canvasHeight);
  // Keep distant rooms legible while the polygon strictly enforces radius and occlusion.
  fogContext.fillStyle = 'rgba(3,8,14,0.86)';
  fogContext.fillRect(0, 0, canvasWidth, canvasHeight);

  // Reveal only inside the ray-cast polygon; destination-out acts on this
  // offscreen fog buffer, never the map/player pixels on the main canvas.
  fogContext.save();
  fogContext.globalCompositeOperation = 'destination-out';
  fogContext.beginPath();
  for (let i = 0; i < visiblePolygon.length; i++) {
    const point = visiblePolygon[i];
    const x = (point.x - cameraX) * scale;
    const y = (point.y - cameraY) * scale;
    if (i === 0) fogContext.moveTo(x, y);
    else fogContext.lineTo(x, y);
  }
  if (visiblePolygon.length > 2) {
    fogContext.closePath();
    fogContext.clip();
    const gradient = fogContext.createRadialGradient(
      playerScreenX,
      playerScreenY,
      visionRadiusScreenPx * 0.55,
      playerScreenX,
      playerScreenY,
      visionRadiusScreenPx,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.82, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    fogContext.fillStyle = gradient;
    fogContext.beginPath();
    fogContext.arc(playerScreenX, playerScreenY, visionRadiusScreenPx, 0, Math.PI * 2);
    fogContext.fill();
  }
  fogContext.restore();

  // iOS Safari may retain filters across canvas state resets; never leak one
  // into the next frame or the next canvas pass.
  fogContext.filter = 'none';
  context.drawImage(fogCanvas, 0, 0);
}
