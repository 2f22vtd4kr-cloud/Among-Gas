import {
  CELL_X, CELL_Y, COLS, ROWS,
  buildPreciseCollisionGrid,
  isPlayerFootprintWalkableAtFeet,
  isPlayerPathWalkable,
} from "../collisionMap.js";
import {
  FEET_OFFSET_Y,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from "../coords.js";

export interface BotNavigationGeometry {
  cols: number;
  rows: number;
  cellX: number;
  cellY: number;
}

/**
 * Shared bot A* navigation raster. Values follow PathCache's convention:
 * 0 is walkable and 1 is blocked. Each cell is sampled using the exact
 * production player footprint, not a circular approximation.
 */
export const BOT_NAVIGATION_GEOMETRY: BotNavigationGeometry = {
  cols: COLS * 2,
  rows: ROWS * 2,
  cellX: CELL_X / 2,
  cellY: CELL_Y / 2,
};

// Diagnostic parity experiment: keep bots on the already-accepted fine-grid
// route topology while their actual steps are still validated by the vector
// production world in BotAgent. This isolates whether newly opened vector
// corridors are reducing encounters by separating bots from visible players.
// Do not promote this bridge to production without a passing exact-head balance
// run and the required 12-zone source/reviewer approvals.
const navigationCollisionGrid = buildPreciseCollisionGrid();
export const BOT_NAVIGATION_GRID = (() => {
  const { cols, rows, cellX, cellY } = BOT_NAVIGATION_GEOMETRY;
  const walk = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const feetX = (col + 0.5) * cellX;
      const feetY = (row + 0.5) * cellY;
      walk[index] = isPlayerFootprintWalkableAtFeet(
        navigationCollisionGrid,
        feetX,
        feetY,
      ) ? 0 : 1;
    }
  }
  return walk;
})();

function buildSpawnReachability(): Uint8Array {
  const { cols, rows, cellX, cellY } = BOT_NAVIGATION_GEOMETRY;
  const reachable = new Uint8Array(cols * rows);
  const startCol = Math.floor(PLAYER_SPAWN_X / cellX);
  const startRow = Math.floor((PLAYER_SPAWN_Y + FEET_OFFSET_Y) / cellY);
  if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) {
    return reachable;
  }

  const startIndex = startRow * cols + startCol;
  if (BOT_NAVIGATION_GRID[startIndex] !== 0) return reachable;

  const centre = (col: number, row: number) => ({
    x: (col + 0.5) * cellX,
    y: (row + 0.5) * cellY,
  });
  const canSweep = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    isPlayerPathWalkable(
      navigationCollisionGrid,
      from.x,
      from.y - FEET_OFFSET_Y,
      to.x,
      to.y - FEET_OFFSET_Y,
    );
  const spawnFeet = {
    x: PLAYER_SPAWN_X,
    y: PLAYER_SPAWN_Y + FEET_OFFSET_Y,
  };
  if (!canSweep(spawnFeet, centre(startCol, startRow))) return reachable;

  const queue = [startIndex];
  reachable[startIndex] = 1;
  const directions: readonly [number, number][] = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const row = Math.floor(index / cols);
    const col = index - row * cols;
    const from = centre(col, row);

    for (const [dc, dr] of directions) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) continue;

      const nextIndex = nextRow * cols + nextCol;
      if (reachable[nextIndex] || BOT_NAVIGATION_GRID[nextIndex] !== 0) continue;
      // The exact swept player footprint is authoritative for graph edges.
      // This is stronger than rejecting every diagonal whose side-cell centres
      // happen to be blocked.
      if (!canSweep(from, centre(nextCol, nextRow))) continue;

      reachable[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }

  return reachable;
}

const spawnReachability = buildSpawnReachability();

/** True only when the position's navigation cell belongs to the spawn graph. */
export function isBotNavigationReachable(feetX: number, feetY: number): boolean {
  if (!Number.isFinite(feetX) || !Number.isFinite(feetY)) return false;
  const { cols, rows, cellX, cellY } = BOT_NAVIGATION_GEOMETRY;
  const col = Math.floor(feetX / cellX);
  const row = Math.floor(feetY / cellY);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
  return spawnReachability[row * cols + col] === 1;
}
