// ─────────────────────────────────────────────────────────────────────────────
// A* Pathfinding on the shared collision grid
//
// Accepts pixel coordinates, converts to grid cells, runs A* with diagonal
// movement, and returns a smoothed sequence of waypoint pixel positions
// (cell centres). Cell sizes are non-square (CELL_X ≠ CELL_Y), so the
// heuristic accounts for the actual per-axis cell dimensions.
//
// Designed to be imported by both the server bot loop and any future
// client-side debug overlay.
// ─────────────────────────────────────────────────────────────────────────────

import { COLS, ROWS, CELL_X, CELL_Y } from './collisionMap.js';
import type { Grid } from './collisionMap.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A 2-D point in pixel space. */
export interface Point {
  x: number;
  y: number;
}

/** A 2-D point in grid-cell space. */
interface Cell {
  col: number;
  row: number;
}

export interface PathGridGeometry {
  cols: number;
  rows: number;
  cellX: number;
  cellY: number;
}

const DEFAULT_PATH_GRID_GEOMETRY: PathGridGeometry = { cols: COLS, rows: ROWS, cellX: CELL_X, cellY: CELL_Y };

// ─── Coordinate conversion ────────────────────────────────────────────────────

/** Pixel → grid cell. Callers must validate bounds before conversion. */
function pixelToCell(px: number, py: number, geometry: PathGridGeometry): Cell {
  return {
    col: Math.floor(px / geometry.cellX),
    row: Math.floor(py / geometry.cellY),
  };
}

function isValidGridGeometry(geometry: PathGridGeometry): boolean {
  return Number.isInteger(geometry.cols) && geometry.cols > 0 &&
    Number.isInteger(geometry.rows) && geometry.rows > 0 &&
    Number.isFinite(geometry.cellX) && geometry.cellX > 0 &&
    Number.isFinite(geometry.cellY) && geometry.cellY > 0;
}

function isValidGeometry(grid: Grid, geometry: PathGridGeometry): boolean {
  return isValidGridGeometry(geometry) && grid.length === geometry.cols * geometry.rows;
}

function isPointInsideGrid(point: Point, geometry: PathGridGeometry): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.y >= 0 &&
    point.x < geometry.cols * geometry.cellX &&
    point.y < geometry.rows * geometry.cellY;
}

function isValidPathInput(
  grid: Grid, start: Point, goal: Point, geometry: PathGridGeometry,
): boolean {
  return isValidGeometry(grid, geometry) &&
    isPointInsideGrid(start, geometry) &&
    isPointInsideGrid(goal, geometry);
}

/** Grid cell → pixel centre. */
function cellCentre(col: number, row: number, geometry: PathGridGeometry): Point {
  return {
    x: (col + 0.5) * geometry.cellX,
    y: (row + 0.5) * geometry.cellY,
  };
}

function cellIndex(col: number, row: number, geometry: PathGridGeometry): number {
  return row * geometry.cols + col;
}

function isWalkable(grid: Grid, col: number, row: number, geometry: PathGridGeometry): boolean {
  if (col < 0 || col >= geometry.cols || row < 0 || row >= geometry.rows) return false;
  return grid[cellIndex(col, row, geometry)] === 0;
}

// ─── Heuristic ────────────────────────────────────────────────────────────────

/**
 * Obstacle-free shortest-path lower bound for 8-directional movement.
 * Uses the true Euclidean diagonal cost, including non-square cell dimensions.
 */
function heuristic(ac: number, ar: number, bc: number, br: number, geometry: PathGridGeometry): number {
  const columns = Math.abs(ac - bc);
  const rows = Math.abs(ar - br);
  const diagonalSteps = Math.min(columns, rows);
  const straightColumns = columns - diagonalSteps;
  const straightRows = rows - diagonalSteps;
  // A diagonal step spans one cell on each axis, so its cost is the actual
  // Euclidean diagonal of this (possibly non-square) grid cell.
  return diagonalSteps * Math.hypot(geometry.cellX, geometry.cellY) +
    straightColumns * geometry.cellX +
    straightRows * geometry.cellY;
}

// ─── Min-heap (priority queue) ────────────────────────────────────────────────

interface HeapNode {
  f: number;
  g: number;
  idx: number; // cellIndex
}

class MinHeap {
  private data: HeapNode[] = [];

  push(node: HeapNode): void {
    this.data.push(node);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | undefined {
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size(): number { return this.data.length; }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].f <= this.data[i].f) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.data.length;
    for (;;) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
      if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ─── A* core ─────────────────────────────────────────────────────────────────

/**
 * 8-directional A* on the collision grid.
 * Diagonal moves cost the Euclidean distance across one cell on each axis.
 * Diagonal cuts through corners are not allowed (both axis-aligned
 * neighbours must be walkable).
 *
 * Returns null if no path exists.
 */
function astar(
  grid: Grid,
  startCol: number, startRow: number,
  goalCol:  number, goalRow:  number,
  geometry: PathGridGeometry,
  validateStep?: (from: Point, to: Point) => boolean,
): Cell[] | null {
  if (!isWalkable(grid, startCol, startRow, geometry) ||
      !isWalkable(grid, goalCol,  goalRow, geometry)) {
    return null;
  }

  if (startCol === goalCol && startRow === goalRow) {
    return [{ col: startCol, row: startRow }];
  }

  const N = geometry.cols * geometry.rows;
  const gScore  = new Float32Array(N).fill(Infinity);
  const fScore  = new Float32Array(N).fill(Infinity);
  const parent  = new Int32Array(N).fill(-1);
  const closed  = new Uint8Array(N);

  const startIdx = cellIndex(startCol, startRow, geometry);
  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(startCol, startRow, goalCol, goalRow, geometry);

  const open = new MinHeap();
  open.push({ f: fScore[startIdx], g: 0, idx: startIdx });

  const DIRS: [number, number, boolean][] = [
    [ 0, -1, false], [ 0,  1, false],
    [-1,  0, false], [ 1,  0, false],
    [-1, -1, true ], [-1,  1, true ],
    [ 1, -1, true ], [ 1,  1, true ],
  ];

  while (open.size > 0) {
    const { idx: curIdx } = open.pop()!;
    if (closed[curIdx]) continue;
    closed[curIdx] = 1;

    const curRow = Math.floor(curIdx / geometry.cols);
    const curCol = curIdx - curRow * geometry.cols;

    if (curCol === goalCol && curRow === goalRow) {
      // Reconstruct
      const path: Cell[] = [];
      let i = curIdx;
      while (i !== -1) {
        const r = Math.floor(i / geometry.cols);
        const c = i - r * geometry.cols;
        path.push({ col: c, row: r });
        i = parent[i];
      }
      return path.reverse();
    }

    for (const [dc, dr, diagonal] of DIRS) {
      const nc = curCol + dc;
      const nr = curRow + dr;
      if (!isWalkable(grid, nc, nr, geometry)) continue;

      // For the coarse grid, require both side cells to prevent corner cuts.
      // With an exact swept-footprint validator, that geometric check is the
      // stronger authority and may safely admit a diagonal whose side-cell
      // centres are blocked but whose complete player footprint clears the edge.
      if (diagonal && !validateStep &&
          (!isWalkable(grid, curCol + dc, curRow, geometry) ||
           !isWalkable(grid, curCol,      curRow + dr, geometry))) continue;
      // A walkable cell centre does not guarantee the swept player footprint
      // can cross the edge to its neighbour. Let callers validate the exact
      // continuous edge against their authoritative collision world.
      if (validateStep && !validateStep(
        cellCentre(curCol, curRow, geometry),
        cellCentre(nc, nr, geometry),
      )) continue;
      const ni = cellIndex(nc, nr, geometry);
      if (closed[ni]) continue;

      const moveCost = diagonal
        ? Math.sqrt((dc * geometry.cellX) ** 2 + (dr * geometry.cellY) ** 2)
        : (dc !== 0 ? geometry.cellX : geometry.cellY);

      const tentativeG = gScore[curIdx] + moveCost;
      if (tentativeG < gScore[ni]) {
        gScore[ni]  = tentativeG;
        fScore[ni]  = tentativeG + heuristic(nc, nr, goalCol, goalRow, geometry);
        parent[ni]  = curIdx;
        open.push({ f: fScore[ni], g: tentativeG, idx: ni });
      }
    }
  }

  return null; // No path
}

// ─── Line-of-sight (string-pulling) ──────────────────────────────────────────

/**
 * Does the straight line between two cells cross any blocked cell?
 * Uses Bresenham's line algorithm.
 *
 * Diagonal Bresenham steps must reject corner-cutting the same way the A*
 * neighbour expansion does (both axis-aligned cells adjacent to the step
 * must be walkable) — otherwise this reports line-of-sight through a
 * blocked corner that two individually-walkable diagonal cells straddle,
 * producing a smoothed waypoint whose straight-line chord actually clips a
 * wall. That silently broke a large fraction of in-game bot navigation
 * (see .agents/memory/ for the investigation) even though the raw
 * (unsmoothed) A* path was always correct.
 */
function hasLineOfSight(
  grid: Grid,
  c0: number, r0: number,
  c1: number, r1: number,
  geometry: PathGridGeometry,
): boolean {
  let dc = Math.abs(c1 - c0);
  let dr = Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1;
  const sr = r0 < r1 ? 1 : -1;
  let err = dc - dr;
  let c = c0;
  let r = r0;

  for (;;) {
    if (!isWalkable(grid, c, r, geometry)) return false;
    if (c === c1 && r === r1) return true;
    const e2 = 2 * err;
    const stepC = e2 > -dr;
    const stepR = e2 < dc;
    if (stepC && stepR) {
      // Diagonal Bresenham step — no corner-cutting through a blocked pair.
      if (!isWalkable(grid, c + sc, r, geometry) || !isWalkable(grid, c, r + sr, geometry)) return false;
    }
    if (stepC) { err -= dr; c += sc; }
    if (stepR) { err += dc; r += sr; }
  }
}

/**
 * Greedy path-smoothing: skip waypoints that can be reached directly
 * with line-of-sight from the current anchor.
 */
function smooth(
  grid: Grid,
  raw: Cell[],
  geometry: PathGridGeometry,
  validateStep?: (from: Point, to: Point) => boolean,
): Cell[] {
  if (raw.length <= 2) return raw;
  const result: Cell[] = [raw[0]];
  let anchor = 0;

  // Greedy string-pulling: try the farthest remaining cell first, then walk
  // backward only as far as needed to find a safe chord. This avoids checking
  // every progressively longer segment in a long open corridor.
  while (anchor < raw.length - 1) {
    let candidate = raw.length - 1;
    while (candidate > anchor + 1) {
      const visible = hasLineOfSight(
        grid, raw[anchor].col, raw[anchor].row, raw[candidate].col, raw[candidate].row, geometry,
      );
      const collisionSafe = visible && (!validateStep || validateStep(
        cellCentre(raw[anchor].col, raw[anchor].row, geometry),
        cellCentre(raw[candidate].col, raw[candidate].row, geometry),
      ));
      // A clear raster chord is not enough for hand-traced vector walls:
      // validate the entire swept player footprint against the live collision
      // world before skipping any intermediate A* cells.
      if (visible && collisionSafe) break;
      candidate--;
    }
    result.push(raw[candidate]);
    anchor = candidate;
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PathResult {
  /** Sequence of pixel-space waypoints (cell centres), including goal. */
  waypoints: Point[];
  /** Total pixel-space path length. */
  length: number;
}

/**
 * Find a smoothed path from `start` to `goal` in pixel coordinates.
 *
 * Returns `null` when no path exists (either point is inside a wall).
 *
 * Usage (bot tick):
 * ```ts
 * const result = findPath(grid, botPos, targetPos);
 * if (result) {
 *   const next = result.waypoints[0]; // first waypoint to walk towards
 * }
 * ```
 */
export function findPath(
  grid: Grid,
  start: Point,
  goal:  Point,
  geometry: PathGridGeometry = DEFAULT_PATH_GRID_GEOMETRY,
  smoothPath = true,
  validateStep?: (from: Point, to: Point) => boolean,
): PathResult | null {
  if (!isValidPathInput(grid, start, goal, geometry)) return null;

  const sc = pixelToCell(start.x, start.y, geometry);
  const gc = pixelToCell(goal.x,  goal.y, geometry);

  const raw = astar(grid, sc.col, sc.row, gc.col, gc.row, geometry, validateStep);
  if (!raw) return null;

  // A* validates centre-to-centre edges. Also validate the two partial edges
  // between the caller's exact anchors and their containing cell centres;
  // otherwise trimming the start cell can make the follower cut a blocked
  // corner on its very first segment.
  if (validateStep) {
    const startCentre = cellCentre(sc.col, sc.row, geometry);
    const goalCentre = cellCentre(gc.col, gc.row, geometry);
    if ((Math.hypot(startCentre.x - start.x, startCentre.y - start.y) > 0.75 &&
         !validateStep(start, startCentre)) ||
        (Math.hypot(goalCentre.x - goal.x, goalCentre.y - goal.y) > 0.75 &&
         !validateStep(goalCentre, goal))) return null;
  }

  const routed = smoothPath ? smooth(grid, raw, geometry, validateStep) : raw;
  const waypoints = routed.map(cell => cellCentre(cell.col, cell.row, geometry));

  // Drop the first waypoint if it's effectively the start position's cell centre
  // (bots should move *towards* the next meaningful cell, not stand still).
  const start_wp = waypoints[0];
  const distSq = (start_wp.x - start.x) ** 2 + (start_wp.y - start.y) ** 2;
  const cellDiagSq = geometry.cellX ** 2 + geometry.cellY ** 2;
  const trimmed = !validateStep && distSq < cellDiagSq * 0.25 && waypoints.length > 1
    ? waypoints.slice(1)
    : waypoints;

  let length = 0;
  for (let i = 1; i < trimmed.length; i++) {
    length += Math.hypot(trimmed[i].x - trimmed[i - 1].x, trimmed[i].y - trimmed[i - 1].y);
  }
  // Add distance from start to first waypoint
  if (trimmed.length > 0) {
    length += Math.hypot(trimmed[0].x - start.x, trimmed[0].y - start.y);
  }

  return { waypoints: trimmed, length };
}

/**
 * Same as `findPath` but caches the result per `(startCell, goalCell)` key.
 * Bots can use this to avoid recomputing the same path every tick when the
 * destination hasn't changed. The cache is intentionally unbounded but small
 * (grid is ~6000 cells, paths share cells, cache eviction is left to callers).
 *
 * Pass `forceRefresh = true` to recompute even if a cached path exists.
 */
export class PathCache {
  private cache = new Map<string, PathResult | null>();
  private cachedGrid: Grid | null = null;
  private cachedStepValidator: ((from: Point, to: Point) => boolean) | undefined;

  find(
    grid: Grid,
    start: Point,
    goal:  Point,
    forceRefresh = false,
    geometry: PathGridGeometry = DEFAULT_PATH_GRID_GEOMETRY,
    smoothPath = true,
    validateStep?: (from: Point, to: Point) => boolean,
  ): PathResult | null {
    if (!isValidPathInput(grid, start, goal, geometry)) return null;
    // A cache key made only from coordinates is unsafe across distinct map
    // grids: the same cells can be walkable in one map and blocked in another.
    if (this.cachedGrid !== grid || this.cachedStepValidator !== validateStep) {
      this.cache.clear();
      this.cachedGrid = grid;
      this.cachedStepValidator = validateStep;
    }

    const sc  = pixelToCell(start.x, start.y, geometry);
    const gc  = pixelToCell(goal.x,  goal.y, geometry);
    const key = `${geometry.cols}x${geometry.rows}@${geometry.cellX},${geometry.cellY}:${smoothPath ? "smooth" : "raw"}:${sc.col},${sc.row}→${gc.col},${gc.row}`;

    if (!forceRefresh && this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const result = findPath(grid, start, goal, geometry, smoothPath, validateStep);
    this.cache.set(key, result);
    return result;
  }

  invalidate(goal: Point, geometry: PathGridGeometry = DEFAULT_PATH_GRID_GEOMETRY): void {
    if (!isValidGridGeometry(geometry) || !isPointInsideGrid(goal, geometry)) return;
    const gc  = pixelToCell(goal.x, goal.y, geometry);
    const suffix = `→${gc.col},${gc.row}`;
    for (const key of this.cache.keys()) {
      if (key.endsWith(suffix)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.cachedGrid = null;
    this.cachedStepValidator = undefined;
  }

  get size(): number { return this.cache.size; }
}
