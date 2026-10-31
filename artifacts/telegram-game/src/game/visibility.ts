import type { Grid } from '@workspace/shared/collisionMap';
import { CELL_X, CELL_Y, COLS, ROWS, FINE_COLS, FINE_ROWS, FINE_CELL_X, FINE_CELL_Y, MANUAL_BLOCKED_POLYGONS } from '@workspace/shared/collisionMap';

export interface VisionPoint {
  x: number;
  y: number;
}

export interface VisualOccluderCircle {
  x: number;
  y: number;
  radius: number;
}

// A half-degree angular step keeps wall silhouettes smooth without the
// quadratic segment-intersection cost of testing every ray against every wall.
const VISION_RAY_COUNT = 720;
const VISION_DIRECTIONS = Array.from({ length: VISION_RAY_COUNT }, (_, index) => {
  const angle = -Math.PI + (index / VISION_RAY_COUNT) * Math.PI * 2;
  return { dx: Math.cos(angle), dy: Math.sin(angle) };
});

interface VisibilityGridGeometry { cols: number; rows: number; cellX: number; cellY: number }

function getVisibilityGridGeometry(grid: Grid): VisibilityGridGeometry {
  if (grid.length === FINE_COLS * FINE_ROWS) {
    return { cols: FINE_COLS, rows: FINE_ROWS, cellX: FINE_CELL_X, cellY: FINE_CELL_Y };
  }
  if (grid.length === COLS * ROWS) {
    return { cols: COLS, rows: ROWS, cellX: CELL_X, cellY: CELL_Y };
  }
  throw new RangeError('Visibility grid has unexpected size ' + grid.length);
}

function isBlocked(grid: Grid, col: number, row: number, geometry: VisibilityGridGeometry): boolean {
  return col < 0 || col >= geometry.cols || row < 0 || row >= geometry.rows ||
    grid[row * geometry.cols + col] === 1;
}

/** Exact ray/circle hit used for narrow visual-only props such as light poles. */
function rayCircleHitDistance(
  px: number,
  py: number,
  dx: number,
  dy: number,
  circle: VisualOccluderCircle,
  maxDistance: number,
): number | null {
  const vx = circle.x - px;
  const vy = circle.y - py;
  const along = vx * dx + vy * dy;
  if (along < -circle.radius || along > maxDistance + circle.radius) return null;

  const perpendicularSquared = vx * vx + vy * vy - along * along;
  const radiusSquared = circle.radius * circle.radius;
  if (perpendicularSquared > radiusSquared) return null;

  const halfChord = Math.sqrt(Math.max(0, radiusSquared - perpendicularSquared));
  const near = along - halfChord;
  if (near >= 0 && near < maxDistance) return near;
  const far = along + halfChord;
  if (near < 0 && far >= 0) return 0;
  return null;
}

/** First ray/segment hit for an authored vector outline. */
function rayPolygonHitDistance(px: number, py: number, dx: number, dy: number,
  points: readonly (readonly [number, number])[], maxDistance: number): number | null {
  let closest = maxDistance;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
    const sx = bx - ax, sy = by - ay, qx = ax - px, qy = ay - py;
    const denominator = dx * sy - dy * sx;
    if (Math.abs(denominator) < 1e-9) continue;
    const distance = (qx * sy - qy * sx) / denominator;
    const t = (qx * dy - qy * dx) / denominator;
    if (distance >= 0 && distance < closest && t >= 0 && t <= 1) closest = distance;
  }
  return closest < maxDistance ? closest : null;
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
  narrowOccluders: readonly VisualOccluderCircle[] = [],
  includeManualMapPolygons = false,
): VisionPoint[] {
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(radius) || radius <= 0) {
    return [];
  }

  const points: VisionPoint[] = [];
  const geometry = getVisibilityGridGeometry(grid);
  const { cellX, cellY } = geometry;
  const startCol = Math.floor(px / cellX);
  const startRow = Math.floor(py / cellY);

  for (const { dx, dy } of VISION_DIRECTIONS) {
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const deltaX = stepX === 0 ? Infinity : cellX / Math.abs(dx);
    const deltaY = stepY === 0 ? Infinity : cellY / Math.abs(dy);

    let col = startCol;
    let row = startRow;
    let maxX = stepX === 0
      ? Infinity
      : ((stepX > 0 ? (col + 1) * cellX : col * cellX) - px) / dx;
    let maxY = stepY === 0
      ? Infinity
      : ((stepY > 0 ? (row + 1) * cellY : row * cellY) - py) / dy;
    let hitDistance = radius;

    while (true) {
      const next = Math.min(maxX, maxY);
      if (!Number.isFinite(next) || next >= radius) break;

      // At exact grid corners, treat a blocked side cell as an occluder. This
      // avoids diagonal rays leaking sight through touching wall corners.
      if (Math.abs(maxX - maxY) < 1e-7) {
        const nextCol = col + stepX;
        const nextRow = row + stepY;
        if (isBlocked(grid, nextCol, row, geometry) || isBlocked(grid, col, nextRow, geometry)) {
          hitDistance = next;
          break;
        }
        col = nextCol;
        row = nextRow;
        maxX += deltaX;
        maxY += deltaY;
        if (isBlocked(grid, col, row, geometry)) {
          hitDistance = next;
          break;
        }
      } else if (maxX < maxY) {
        col += stepX;
        const boundaryDistance = maxX;
        maxX += deltaX;
        if (isBlocked(grid, col, row, geometry)) {
          hitDistance = boundaryDistance;
          break;
        }
      } else {
        row += stepY;
        const boundaryDistance = maxY;
        maxY += deltaY;
        if (isBlocked(grid, col, row, geometry)) {
          hitDistance = boundaryDistance;
          break;
        }
      }
    }

    // Narrow props use authored visual circles rather than the wider square
    // collision cells. They can shorten a ray but can never reveal through a wall.
    for (const occluder of narrowOccluders) {
      const circleHit = rayCircleHitDistance(px, py, dx, dy, occluder, hitDistance);
      if (circleHit !== null && circleHit < hitDistance) hitDistance = circleHit;
    }
    if (includeManualMapPolygons) {
      for (const polygon of MANUAL_BLOCKED_POLYGONS) {
        const hit = rayPolygonHitDistance(px, py, dx, dy, polygon.points, hitDistance);
        if (hit !== null && hit < hitDistance) hitDistance = hit;
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
  const sigma = Math.max(1, radius / 1.6);
  const distances = points.map(point => Math.hypot(point.x - origin.x, point.y - origin.y));

  return points.map((point, index) => {
    const distance = distances[index];
    if (distance <= 0) return point;
    let weightedSum = 0;
    let weightSum = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const wrapped = (index + offset + points.length) % points.length;
      const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
      weightedSum += distances[wrapped] * weight;
      weightSum += weight;
    }
    // Gaussian weights soften corners more naturally than a box average. Clamp
    // to the original ray hit so smoothing can only darken, never leak through walls.
    const smoothedDistance = Math.min(distance, weightedSum / weightSum);
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
const MIN_OCCLUDER_COMPONENT_CELLS = 5;

// Cell coordinates in the 104 × 58 red-line reference grid. These cells contain
// low furniture in the open upper atrium, not the room's enclosing walls.
const NON_OCCLUDING_REGIONS = [
  { minCol: 47, maxCol: 50, minRow: 8, maxRow: 11 },
  { minCol: 62, maxCol: 66, minRow: 8, maxRow: 11 },
] as const;

// The small upper-atrium lamp is partly merged with the adjacent furniture
// mask in the coarse collision grid. Keep its measured visual silhouette as
// an explicit circle rather than losing it during connected-component filtering.
const MANUAL_NARROW_OCCLUDERS: readonly VisualOccluderCircle[] = [
  {
    x: 62 * CELL_X,
    y: 8 * CELL_Y,
    radius: Math.min(CELL_X, CELL_Y) * 0.2,
  },
  // Tall central statue: the decorative garden perimeter is walkable and
  // does not occlude vision. Only the statue's small physical base blocks sight.
  { x: 1735, y: 556, radius: 26 },
];

function isNonOccludingFurniture(index: number): boolean {
  const row = Math.floor(index / COLS);
  const col = index - row * COLS;
  return NON_OCCLUDING_REGIONS.some(region =>
    col >= region.minCol && col <= region.maxCol &&
    row >= region.minRow && row <= region.maxRow
  );
}

/**
 * Trace four-cell 2×2 props as narrow circular vision occluders.
 * Their collision cells remain unchanged and are deliberately omitted from the
 * coarse shadow grid; this avoids projecting their square collision footprint
 * as a wide shadow while still letting poles and similarly narrow props block
 * the sight rays behind their actual visual silhouette.
 */
export function buildNarrowShadowOccluders(
  collisionGrid: Grid,
  includeManualMapOccluders = false,
): VisualOccluderCircle[] {
  if (collisionGrid.length === FINE_COLS * FINE_ROWS) {
    return includeManualMapOccluders ? [...MANUAL_NARROW_OCCLUDERS] : [];
  }
  if (collisionGrid.length !== COLS * ROWS) {
    throw new RangeError('Collision grid has unexpected size ' + collisionGrid.length);
  }

  const visited = new Uint8Array(COLS * ROWS);
  const occluders: VisualOccluderCircle[] = [];
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
    // A prop is excluded as furniture only when its entire footprint is
    // inside a known furniture region. A compact pole straddling that region's
    // edge must retain its narrow silhouette occluder.
    if (component.length !== 4 || component.every(isNonOccludingFurniture)) continue;
    const cols = component.map(index => index % COLS);
    const rows = component.map(index => Math.floor(index / COLS));
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    if (maxCol - minCol !== 1 || maxRow - minRow !== 1) continue;
    occluders.push({
      x: (minCol + 1) * CELL_X,
      y: (minRow + 1) * CELL_Y,
      radius: Math.min(CELL_X, CELL_Y) * 0.2,
    });
  }
  // These manually measured circles belong only to the canonical map.
  // Synthetic grids in unit tests must remain fully data-driven.
  if (includeManualMapOccluders) {
    for (const manual of MANUAL_NARROW_OCCLUDERS) {
      if (!occluders.some(item => Math.hypot(item.x - manual.x, item.y - manual.y) < 1)) {
        occluders.push(manual);
      }
    }
  }
  return occluders;
}

/**
 * Fine vision mask: large architectural components stay opaque while small
 * isolated low props remain movement blockers but do not cast square shadows.
 * The garden ring is walkable in the fine collision source; the statue is
 * represented separately by its measured narrow visual occluder.
 */
export function buildFineShadowGrid(collisionGrid: Grid): Grid {
  const total = FINE_COLS * FINE_ROWS;
  if (collisionGrid.length !== total) {
    throw new RangeError('Fine shadow grid expected ' + total + ' cells; received ' + collisionGrid.length);
  }
  const shadowGrid = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  // 1,800 fine cells ≈ 7,200 source-reference pixels; this excludes isolated
  // benches/props and the statue base while retaining substantial wall geometry.
  const minComponentCells = 1_800;
  for (let start = 0; start < total; start++) {
    if (collisionGrid[start] !== 1 || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const row = Math.floor(index / FINE_COLS);
      const col = index - row * FINE_COLS;
      const neighbors = [
        col > 0 ? index - 1 : -1,
        col + 1 < FINE_COLS ? index + 1 : -1,
        row > 0 ? index - FINE_COLS : -1,
        row + 1 < FINE_ROWS ? index + FINE_COLS : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || visited[next] || collisionGrid[next] !== 1) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (tail >= minComponentCells) {
      for (let i = 0; i < tail; i++) shadowGrid[queue[i]] = 1;
    }
  }
  return shadowGrid;
}

export function buildShadowGrid(collisionGrid: Grid): Grid {
  if (collisionGrid.length === FINE_COLS * FINE_ROWS) return buildFineShadowGrid(collisionGrid);
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
