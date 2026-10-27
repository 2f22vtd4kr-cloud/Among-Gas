import type { Grid } from '@workspace/shared/collisionMap';
import { CELL_X, CELL_Y, COLS, ROWS } from '@workspace/shared/collisionMap';

export interface VisionPoint {
  x: number;
  y: number;
}

// A half-degree angular step keeps wall silhouettes smooth without the
// quadratic segment-intersection cost of testing every ray against every wall.
const VISION_RAY_COUNT = 720;
const VISION_DIRECTIONS = Array.from({ length: VISION_RAY_COUNT }, (_, index) => {
  const angle = -Math.PI + (index / VISION_RAY_COUNT) * Math.PI * 2;
  return { dx: Math.cos(angle), dy: Math.sin(angle) };
});

function isBlocked(grid: Grid, col: number, row: number): boolean {
  return col < 0 || col >= COLS || row < 0 || row >= ROWS || grid[row * COLS + col] === 1;
}

/**
 * Build the local player's visibility polygon by grid DDA ray casting.
 * Rays visit collision cells in order and stop at the first blocked cell,
 * making wall shadows match the canonical custom-map collision geometry.
 * Cost is O(rays × cells crossed), not O(rays × all wall edges), so it stays
 * appropriate for the requestAnimationFrame loop on mobile devices.
 */
export function computeVisibilityPolygon(
  px: number,
  py: number,
  radius: number,
  grid: Grid,
): VisionPoint[] {
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(radius) || radius <= 0) {
    return [];
  }

  const points: VisionPoint[] = [];
  const startCol = Math.floor(px / CELL_X);
  const startRow = Math.floor(py / CELL_Y);

  for (const { dx, dy } of VISION_DIRECTIONS) {
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const deltaX = stepX === 0 ? Infinity : CELL_X / Math.abs(dx);
    const deltaY = stepY === 0 ? Infinity : CELL_Y / Math.abs(dy);

    let col = startCol;
    let row = startRow;
    let maxX = stepX === 0
      ? Infinity
      : ((stepX > 0 ? (col + 1) * CELL_X : col * CELL_X) - px) / dx;
    let maxY = stepY === 0
      ? Infinity
      : ((stepY > 0 ? (row + 1) * CELL_Y : row * CELL_Y) - py) / dy;
    let hitDistance = radius;

    while (true) {
      const next = Math.min(maxX, maxY);
      if (!Number.isFinite(next) || next >= radius) break;

      // At exact grid corners, treat a blocked side cell as an occluder. This
      // avoids diagonal rays leaking sight through touching wall corners.
      if (Math.abs(maxX - maxY) < 1e-7) {
        const nextCol = col + stepX;
        const nextRow = row + stepY;
        if (isBlocked(grid, nextCol, row) || isBlocked(grid, col, nextRow)) {
          hitDistance = next;
          break;
        }
        col = nextCol;
        row = nextRow;
        maxX += deltaX;
        maxY += deltaY;
        if (isBlocked(grid, col, row)) {
          hitDistance = next;
          break;
        }
      } else if (maxX < maxY) {
        col += stepX;
        const boundaryDistance = maxX;
        maxX += deltaX;
        if (isBlocked(grid, col, row)) {
          hitDistance = boundaryDistance;
          break;
        }
      } else {
        row += stepY;
        const boundaryDistance = maxY;
        maxY += deltaY;
        if (isBlocked(grid, col, row)) {
          hitDistance = boundaryDistance;
          break;
        }
      }
    }

    points.push({ x: px + dx * hitDistance, y: py + dy * hitDistance });
  }

  return points;
}
