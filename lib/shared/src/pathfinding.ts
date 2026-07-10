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

// ─── Coordinate conversion ────────────────────────────────────────────────────

/** Pixel → grid cell (clamped to valid range). */
function pixelToCell(px: number, py: number): Cell {
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor(px / CELL_X))),
    row: Math.max(0, Math.min(ROWS - 1, Math.floor(py / CELL_Y))),
  };
}

/** Grid cell → pixel centre. */
function cellCentre(col: number, row: number): Point {
  return {
    x: (col + 0.5) * CELL_X,
    y: (row + 0.5) * CELL_Y,
  };
}

function cellIndex(col: number, row: number): number {
  return row * COLS + col;
}

function isWalkable(grid: Grid, col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return grid[cellIndex(col, row)] === 0;
}

// ─── Heuristic ────────────────────────────────────────────────────────────────

/**
 * Octile (diagonal) heuristic in pixel space.
 * Accounts for non-square cells (CELL_X ≠ CELL_Y).
 */
function heuristic(ac: number, ar: number, bc: number, br: number): number {
  const dx = Math.abs(ac - bc) * CELL_X;
  const dy = Math.abs(ar - br) * CELL_Y;
  const D  = 1;
  const D2 = Math.SQRT2;
  return D * (dx + dy) + (D2 - 2 * D) * Math.min(dx, dy);
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
 * Diagonal moves cost √2 × the longer axis (pixel-space distance).
 * Diagonal cuts through corners are not allowed (both axis-aligned
 * neighbours must be walkable).
 *
 * Returns null if no path exists.
 */
function astar(
  grid: Grid,
  startCol: number, startRow: number,
  goalCol:  number, goalRow:  number,
): Cell[] | null {
  if (!isWalkable(grid, startCol, startRow) ||
      !isWalkable(grid, goalCol,  goalRow)) {
    return null;
  }

  if (startCol === goalCol && startRow === goalRow) {
    return [{ col: startCol, row: startRow }];
  }

  const N = COLS * ROWS;
  const gScore  = new Float32Array(N).fill(Infinity);
  const fScore  = new Float32Array(N).fill(Infinity);
  const parent  = new Int32Array(N).fill(-1);
  const closed  = new Uint8Array(N);

  const startIdx = cellIndex(startCol, startRow);
  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(startCol, startRow, goalCol, goalRow);

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

    const curRow = Math.floor(curIdx / COLS);
    const curCol = curIdx - curRow * COLS;

    if (curCol === goalCol && curRow === goalRow) {
      // Reconstruct
      const path: Cell[] = [];
      let i = curIdx;
      while (i !== -1) {
        const r = Math.floor(i / COLS);
        const c = i - r * COLS;
        path.push({ col: c, row: r });
        i = parent[i];
      }
      return path.reverse();
    }

    for (const [dc, dr, diagonal] of DIRS) {
      const nc = curCol + dc;
      const nr = curRow + dr;
      if (!isWalkable(grid, nc, nr)) continue;

      // No corner-cutting: both axis-aligned neighbours must be free
      if (diagonal &&
          (!isWalkable(grid, curCol + dc, curRow) ||
           !isWalkable(grid, curCol,      curRow + dr))) continue;

      const ni = cellIndex(nc, nr);
      if (closed[ni]) continue;

      const moveCost = diagonal
        ? Math.sqrt((dc * CELL_X) ** 2 + (dr * CELL_Y) ** 2)
        : (dc !== 0 ? CELL_X : CELL_Y);

      const tentativeG = gScore[curIdx] + moveCost;
      if (tentativeG < gScore[ni]) {
        gScore[ni]  = tentativeG;
        fScore[ni]  = tentativeG + heuristic(nc, nr, goalCol, goalRow);
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
 */
function hasLineOfSight(
  grid: Grid,
  c0: number, r0: number,
  c1: number, r1: number,
): boolean {
  let dc = Math.abs(c1 - c0);
  let dr = Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1;
  const sr = r0 < r1 ? 1 : -1;
  let err = dc - dr;
  let c = c0;
  let r = r0;

  for (;;) {
    if (!isWalkable(grid, c, r)) return false;
    if (c === c1 && r === r1) return true;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 <  dc) { err += dc; r += sr; }
  }
}

/**
 * Greedy path-smoothing: skip waypoints that can be reached directly
 * with line-of-sight from the current anchor.
 */
function smooth(grid: Grid, raw: Cell[]): Cell[] {
  if (raw.length <= 2) return raw;
  const result: Cell[] = [raw[0]];
  let anchor = 0;

  for (let i = 2; i < raw.length; i++) {
    if (!hasLineOfSight(grid, raw[anchor].col, raw[anchor].row, raw[i].col, raw[i].row)) {
      result.push(raw[i - 1]);
      anchor = i - 1;
    }
  }
  result.push(raw[raw.length - 1]);
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
): PathResult | null {
  const sc = pixelToCell(start.x, start.y);
  const gc = pixelToCell(goal.x,  goal.y);

  const raw = astar(grid, sc.col, sc.row, gc.col, gc.row);
  if (!raw) return null;

  const smoothed = smooth(grid, raw);
  const waypoints = smoothed.map(cell => cellCentre(cell.col, cell.row));

  // Drop the first waypoint if it's effectively the start position's cell centre
  // (bots should move *towards* the next meaningful cell, not stand still).
  const start_wp = waypoints[0];
  const distSq = (start_wp.x - start.x) ** 2 + (start_wp.y - start.y) ** 2;
  const cellDiagSq = CELL_X ** 2 + CELL_Y ** 2;
  const trimmed = distSq < cellDiagSq * 0.25 && waypoints.length > 1
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

  find(
    grid: Grid,
    start: Point,
    goal:  Point,
    forceRefresh = false,
  ): PathResult | null {
    const sc  = pixelToCell(start.x, start.y);
    const gc  = pixelToCell(goal.x,  goal.y);
    const key = `${sc.col},${sc.row}→${gc.col},${gc.row}`;

    if (!forceRefresh && this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const result = findPath(grid, start, goal);
    this.cache.set(key, result);
    return result;
  }

  invalidate(goal: Point): void {
    const gc  = pixelToCell(goal.x, goal.y);
    const suffix = `→${gc.col},${gc.row}`;
    for (const key of this.cache.keys()) {
      if (key.endsWith(suffix)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number { return this.cache.size; }
}
