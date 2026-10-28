/**
 * BotAgent — abstract base class for server-side bot AI agents.
 *
 * Bots occupy real LobbyPlayer slots (with a NullWebSocket sentinel) and
 * update their x/y directly. The existing 25Hz delta-broadcast loop picks
 * up those position changes automatically — no extra broadcast code needed.
 *
 * Subclasses implement tick() and chooseVote().
 */
import { CELL_X, CELL_Y, COLS, ROWS, buildCollisionGrid, canMoveTo, type Grid } from '@workspace/shared/collisionMap';
import { PLAYER_RADIUS, FEET_OFFSET_Y, MAP_W, MAP_H } from '@workspace/shared/coords';
import { PathCache } from '@workspace/shared';
import type { Point } from '@workspace/shared';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';
import { SPAWN_X, SPAWN_Y } from '../ws/lobby.js';
import { NO_TARGET } from '@workspace/shared/coords';

export { NO_TARGET };

/** Collision grid shared across all bot agents (built once at module load). */
export const grid = buildCollisionGrid();

/**
 * Pathfinding uses grid cells, while live movement validates the character's
 * actual collision radius. Trace a clearance-aware navigation grid so A*
 * doesn't repeatedly send bots to cell-centres the real collision check
 * rejects (the old failure mode left a bot stationary forever at a task).
 */
function buildNavigationGrid(collision: Grid): Grid {
  const result = new Uint8Array(collision.length);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const index = row * COLS + col;
      if (collision[index] !== 0) {
        result[index] = 1;
        continue;
      }
      const x = (col + 0.5) * CELL_X;
      const y = (row + 0.5) * CELL_Y;
      result[index] = canMoveTo(collision, x, y, PLAYER_RADIUS) ? 0 : 1;
    }
  }
  return result;
}

const navigationGrid = buildNavigationGrid(grid);

/** Precompute the walkable component connected to the real spawn point. */
function buildSpawnReachability(): Uint8Array {
  const reachable = new Uint8Array(COLS * ROWS);
  const startCol = Math.floor(SPAWN_X / CELL_X);
  const startRow = Math.floor((SPAWN_Y + FEET_OFFSET_Y) / CELL_Y);
  if (startCol < 0 || startCol >= COLS || startRow < 0 || startRow >= ROWS) return reachable;
  const startIndex = startRow * COLS + startCol;
  if (navigationGrid[startIndex] !== 0) return reachable;

  const queue = [startIndex];
  reachable[startIndex] = 1;
  const directions: readonly [number, number, boolean][] = [
    [0, -1, false], [0, 1, false], [-1, 0, false], [1, 0, false],
    [-1, -1, true], [-1, 1, true], [1, -1, true], [1, 1, true],
  ];
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const row = Math.floor(index / COLS);
    const col = index - row * COLS;
    for (const [dc, dr, diagonal] of directions) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS) continue;
      const nextIndex = nextRow * COLS + nextCol;
      if (reachable[nextIndex] || navigationGrid[nextIndex] !== 0) continue;
      if (diagonal) {
        if (navigationGrid[row * COLS + nextCol] !== 0 ||
            navigationGrid[nextRow * COLS + col] !== 0) continue;
      }
      reachable[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }
  return reachable;
}

const spawnReachability = buildSpawnReachability();

function isSpawnReachable(feetX: number, feetY: number): boolean {
  const col = Math.floor(feetX / CELL_X);
  const row = Math.floor(feetY / CELL_Y);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return spawnReachability[row * COLS + col] === 1;
}

/** Ensure a candidate movement segment stays clear, not just its endpoint. */
function canTraverse(from: Point, to: Point): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const samples = Math.max(1, Math.ceil(distance / 8));
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    if (!canMoveTo(
      grid,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      PLAYER_RADIUS,
    )) return false;
  }
  return true;
}

/** Pixel distance per 200ms tick ≈ 400px/s — legacy movement basis used by ghost tasks. */
export const BOT_SPEED_PX = 80;
/** Living bots tick at 10Hz, so use half the legacy 200ms step each tick. */
// Match the human player's roughly 200px/s walk speed on the custom map.
export const BOT_MOVEMENT_STEP_PX = BOT_SPEED_PX / 4;

/** Arrive when squared distance to goal is ≤ this (25px radius). */
const ARRIVAL_SQ = 25 * 25;

export abstract class BotAgent {
  protected readonly pathCache = new PathCache();

  // ── Abstract interface ──────────────────────────────────────────────────

  /** Called every 100ms while the lobby phase is ROAMING. */
  abstract roamingTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void;

  /**
   * Ghosts can still complete tasks, but cannot kill, report bodies, or repair
   * sabotage. Subclasses opt in; the default intentionally does nothing.
   */
  ghostTick(_lobby: Lobby, _self: LobbyPlayer, _manager: LobbyManager): void {}

  /**
   * Choose a vote target slot.  Called once per meeting, after votingOpen.
   * Return NO_TARGET (0xFF) to skip.
   */
  abstract chooseVote(lobby: Lobby, self: LobbyPlayer): number;

  // ── Main dispatch ───────────────────────────────────────────────────────

  tick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    if (!self.alive) {
      // In the base game, dead crewmates become ghosts but keep doing tasks.
      // Impostor ghosts have no assigned tasks and remain inert.
      if (self.role === 'crewmate' && lobby.phase === 'ROAMING') {
        this.ghostTick(lobby, self, manager);
      }
      return;
    }

    if (lobby.phase === 'ROAMING') {
      this.roamingTick(lobby, self, manager);
      return;
    }

    if (lobby.phase === 'MEETING') {
      const meeting = lobby.meeting;
      if (!meeting || !meeting.votingOpen) return;
      if (meeting.votes.has(self.slot)) return; // already voted
      const target = this.chooseVote(lobby, self);
      manager.castVote(lobby, self.slot, target);
    }
  }

  // ── Shared movement helpers ─────────────────────────────────────────────

  /**
   * Move the bot one step along the path to `goal` (pixel coords).
   * Directly mutates self.x / self.y — picked up by the 25Hz delta loop.
   * Returns true when the bot has arrived within the arrival threshold.
   *
   * Offset handling: `self.x/y` and `goal` are stored in sprite-anchor space
   * (matching the client/wsServer convention — see coords.ts), but the
   * collision grid's walls were traced at the character's *feet*, offset
   * FEET_OFFSET_Y below the anchor. Every other collision check in this
   * codebase (client movement, wsServer 0x11, randomWalkablePoint below)
   * adds that offset right before touching the grid. `findPath` previously
   * did not, so it validated walkability at the raw anchor position while
   * this method separately re-validated the resulting waypoint at
   * anchor+offset — often a *different* grid cell — which silently blocked
   * nearly every real path (see .agents/memory/ for the investigation).
   * Fix: do the whole search in feet-space, then shift back once at the end.
   */
  protected navigateTo(self: LobbyPlayer, goal: Point): boolean {
    const dxGoal = goal.x - self.x;
    const dyGoal = goal.y - self.y;
    if (dxGoal * dxGoal + dyGoal * dyGoal <= ARRIVAL_SQ) return true;

    const feetStart: Point = { x: self.x, y: self.y + FEET_OFFSET_Y };
    const feetGoal: Point = { x: goal.x, y: goal.y + FEET_OFFSET_Y };
    const result = this.pathCache.find(navigationGrid, feetStart, feetGoal);
    const waypoint = result?.waypoints[0] ?? feetGoal;
    const dx = waypoint.x - feetStart.x;
    const dy = waypoint.y - feetStart.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(BOT_MOVEMENT_STEP_PX, distance);
    const direct = distance > 0
      ? { x: feetStart.x + (dx / distance) * step, y: feetStart.y + (dy / distance) * step }
      : feetGoal;

    let next: Point | null = canTraverse(feetStart, direct) ? direct : null;
    if (next === null) {
      // A smoothed waypoint may still be unsafe near a thin wall or corner.
      // Probe short, collision-safe detours rather than caching the rejected
      // waypoint forever. The next tick will run A* from the new cell.
      const baseAngle = Math.atan2(dyGoal, dxGoal);
      const angleOffsets = [
        0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4,
        3 * Math.PI / 8, -3 * Math.PI / 8, Math.PI / 2, -Math.PI / 2,
        5 * Math.PI / 8, -5 * Math.PI / 8, 3 * Math.PI / 4, -3 * Math.PI / 4,
        7 * Math.PI / 8, -7 * Math.PI / 8, Math.PI,
      ];
      const stepLengths = [
        Math.min(BOT_MOVEMENT_STEP_PX, Math.hypot(dxGoal, dyGoal)),
        BOT_MOVEMENT_STEP_PX * 0.75, BOT_MOVEMENT_STEP_PX * 0.5, BOT_MOVEMENT_STEP_PX * 0.25, 8,
      ];
      let bestScore = -Infinity;
      for (const length of stepLengths) {
        for (const offset of angleOffsets) {
          const angle = baseAngle + offset;
          const candidate = {
            x: feetStart.x + Math.cos(angle) * length,
            y: feetStart.y + Math.sin(angle) * length,
          };
          if (!canTraverse(feetStart, candidate)) continue;
          const remaining = Math.hypot(feetGoal.x - candidate.x, feetGoal.y - candidate.y);
          const progress = Math.hypot(feetGoal.x - feetStart.x, feetGoal.y - feetStart.y) - remaining;
          // Prefer progress, with a small penalty for wide detours and tiny steps.
          const score = progress - Math.abs(offset) * 2 - (BOT_MOVEMENT_STEP_PX - length) * 0.05;
          if (score > bestScore) {
            bestScore = score;
            next = candidate;
          }
        }
        if (next !== null && bestScore > 0) break;
      }
      // A blocked path must not stay cached against the same start cell.
      this.pathCache.clear();
    }

    if (next !== null) {
      self.x = next.x;
      self.y = next.y - FEET_OFFSET_Y;
    }
    return false;
  }

  /**
   * Clear cached path state.  Call when the bot switches strategy so the next
   * navigateTo doesn't follow a stale path towards the old destination.
   */
  protected clearPath(): void {
    this.pathCache.clear();
  }

  /** Pick a random walkable position in the spawn-connected component. */
  protected randomWalkablePoint(): Point {
    for (let i = 0; i < 100; i++) {
      const x = 80 + Math.random() * (MAP_W - 160);
      const y = 80 + Math.random() * (MAP_H - 160);
      if (
        canMoveTo(grid, x, y + FEET_OFFSET_Y, PLAYER_RADIUS) &&
        isSpawnReachable(x, y + FEET_OFFSET_Y)
      ) return { x, y };
    }
    // Spawn is verified walkable; it is safer than a potentially disconnected map centre.
    return { x: SPAWN_X, y: SPAWN_Y };
  }

  /**
   * Find the nearest walkable point to `target`, searching outward in rings
   * up to `maxRadius`. Interactive props (task consoles, sabotage pads) are
   * often placed against a wall, so their exact pixel can be unwalkable —
   * bots only need to stand within interaction range of them, not on top of
   * them (matches the server's own proximity check, which uses a range, not
   * an exact-position match).
   *
   * A candidate must also be *reachable* from the shared spawn point, not
   * merely locally walkable: the collision grid (traced pixel-accurately
   * from reference artwork) has isolated one-cell walkable pockets fully
   * enclosed by blocked cells — a downsampling artifact, not a real room
   * (confirmed via BFS; see .agents/memory/). Picking one of those as an
   * approach point would strand the bot permanently, since no path to it
   * exists from anywhere else on the map. All live players originate from
   * the same spawn point and can only ever occupy its connected component,
   * so spawn-reachability here is equivalent to "reachable at all".
   *
   * Results are memoized per target since both the grid and spawn point are
   * static for the lifetime of the process.
   */
  protected nearestApproachPoint(target: Point, maxRadius: number): Point {
    const key = `${target.x},${target.y}`;
    const cached = BotAgent._approachCache.get(key);
    if (cached) return cached;

    const reachable = (p: Point): boolean =>
      canMoveTo(grid, p.x, p.y + FEET_OFFSET_Y, PLAYER_RADIUS) &&
      isSpawnReachable(p.x, p.y + FEET_OFFSET_Y);

    let result = target;
    if (!reachable(target)) {
      const step = 8;
      outer: for (let r = step; r <= maxRadius; r += step) {
        const samples = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
        for (let i = 0; i < samples; i++) {
          const angle = (i / samples) * Math.PI * 2;
          const candidate = { x: target.x + Math.cos(angle) * r, y: target.y + Math.sin(angle) * r };
          if (reachable(candidate)) {
            result = candidate;
            break outer;
          }
        }
      }
    }
    BotAgent._approachCache.set(key, result);
    return result;
  }

  private static _approachCache = new Map<string, Point>();

  /** Squared pixel distance between two positions. */
  protected static distSq(ax: number, ay: number, bx: number, by: number): number {
    return (ax - bx) ** 2 + (ay - by) ** 2;
  }
}
