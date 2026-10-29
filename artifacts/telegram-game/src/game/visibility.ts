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

/**
 * Smooth visual occlusion only by locally averaging ray distances. A smoothed
 * ray is never allowed to extend beyond its original hit distance, so this can
 * round stair-step silhouettes without opening new lines of sight through walls.
 * The movement grid and the visibility ray hits remain unchanged.
 */
export function smoothVisibilityPolygon(
  points: readonly VisionPoint[],
  origin: VisionPoint,
  windowRadius = 3,
): VisionPoint[] {
  if (points.length < 3 || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
    return [...points];
  }
  const radius = Math.max(1, Math.min(8, Math.floor(windowRadius)));
  const distances = points.map(point => Math.hypot(point.x - origin.x, point.y - origin.y));

  return points.map((point, index) => {
    const distance = distances[index];
    if (distance <= 0) return point;
    let sum = 0;
    let samples = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const wrapped = (index + offset + points.length) % points.length;
      sum += distances[wrapped];
      samples++;
    }
    const smoothedDistance = Math.min(distance, sum / samples);
    const dx = (point.x - origin.x) / distance;
    const dy = (point.y - origin.y) / distance;
    return {
      x: origin.x + dx * smoothedDistance,
      y: origin.y + dy * smoothedDistance,
    };
  });
}

/**
 * Build a vision-only occlusion grid from collision data.
 *
 * The movement mask is intentionally more inclusive than the vision mask:
 * furniture and other low props still block player movement, but small props
 * do not cast hard, room-sized shadows. The map's upper atrium also has an
 * explicit furniture carve-out because its benches/table sit inside a connected
 * collision component; connected-component filtering alone cannot distinguish
 * those pieces from the surrounding architecture.
 *
 * This function returns a new grid and never mutates the movement collision grid.
 */
const MIN_OCCLUDER_COMPONENT_CELLS = 4;

// Cell coordinates in the 104 × 58 red-line reference grid. These cells contain
// low furniture in the open upper atrium, not the room's enclosing walls.
const NON_OCCLUDING_REGIONS = [
  { minCol: 47, maxCol: 50, minRow: 8, maxRow: 11 },
  { minCol: 62, maxCol: 66, minRow: 8, maxRow: 11 },
] as const;

function isNonOccludingFurniture(index: number): boolean {
  const row = Math.floor(index / COLS);
  const col = index - row * COLS;
  return NON_OCCLUDING_REGIONS.some(region =>
    col >= region.minCol && col <= region.maxCol &&
    row >= region.minRow && row <= region.maxRow
  );
}

export function buildShadowGrid(collisionGrid: Grid): Grid {
  if (collisionGrid.length !== COLS * ROWS) {
    throw new RangeError(
      `Collision grid has ${collisionGrid.length} cells; expected ${COLS * ROWS}.`
    );
  }

  const shadowGrid = new Uint8Array(COLS * ROWS);
  const visited = new Uint8Array(COLS * ROWS);

  // Connected regions smaller than this are isolated props or details, not
  // architectural partitions. Leave those solid in collision but transparent
  // to visibility ray casting.
  for (let start = 0; start < collisionGrid.length; start++) {
    if (collisionGrid[start] !== 1 || visited[start]) continue;

    const component: number[] = [];
    const queue = [start];
    visited[start] = 1;

    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      component.push(index);
      const row = Math.floor(index / COLS);
      const col = index - row * COLS;
      const neighbors = [
        col > 0 ? index - 1 : -1,
        col + 1 < COLS ? index + 1 : -1,
        row > 0 ? index - COLS : -1,
        row + 1 < ROWS ? index + COLS : -1,
      ];

      for (const next of neighbors) {
        if (next < 0 || visited[next] || collisionGrid[next] !== 1) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    if (component.length < MIN_OCCLUDER_COMPONENT_CELLS) continue;

    // Filter individual low-furniture cells even if a red outline connects them
    // to a much larger wall component. Collision remains untouched.
    for (const index of component) {
      if (!isNonOccludingFurniture(index)) shadowGrid[index] = 1;
    }
  }

  return shadowGrid as Grid;
}
