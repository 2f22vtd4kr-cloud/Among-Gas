/**
 * BotAgent — abstract base class for server-side bot AI agents.
 *
 * Bots occupy real LobbyPlayer slots (with a NullWebSocket sentinel) and
 * update their x/y directly. The existing 25Hz delta-broadcast loop picks
 * up those position changes automatically — no extra broadcast code needed.
 *
 * Subclasses implement tick() and chooseVote().
 */
import { buildCollisionGrid, canMoveTo } from '@workspace/shared/collisionMap';
import { PLAYER_RADIUS, FEET_OFFSET_Y, MAP_W, MAP_H } from '@workspace/shared/coords';
import { findPath, PathCache } from '@workspace/shared';
import type { Point } from '@workspace/shared';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';
import { SPAWN_X, SPAWN_Y } from '../ws/lobby.js';
import { NO_TARGET } from '@workspace/shared/coords';

export { NO_TARGET };

/** Collision grid shared across all bot agents (built once at module load). */
export const grid = buildCollisionGrid();

/** Pixel distance per 200ms tick ≈ 400px/s — a comfortable walking pace. */
export const BOT_SPEED_PX = 80;

/** Arrive when squared distance to goal is ≤ this (25px radius). */
const ARRIVAL_SQ = 25 * 25;

export abstract class BotAgent {
  protected readonly pathCache = new PathCache();

  // ── Abstract interface ──────────────────────────────────────────────────

  /** Called every 200ms while the lobby phase is ROAMING. */
  abstract roamingTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void;

  /**
   * Choose a vote target slot.  Called once per meeting, after votingOpen.
   * Return NO_TARGET (0xFF) to skip.
   */
  abstract chooseVote(lobby: Lobby, self: LobbyPlayer): number;

  // ── Main dispatch ───────────────────────────────────────────────────────

  tick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    if (!self.alive) return;

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
    const result = this.pathCache.find(grid, feetStart, feetGoal);
    if (!result || result.waypoints.length === 0) return false;

    const wp = result.waypoints[0];
    const dx = wp.x - feetStart.x;
    const dy = wp.y - feetStart.y;
    const dist = Math.hypot(dx, dy);

    let nx: number;
    let nyFeet: number;
    if (dist <= BOT_SPEED_PX) {
      nx = wp.x;
      nyFeet = wp.y;
    } else {
      const t = BOT_SPEED_PX / dist;
      nx = feetStart.x + dx * t;
      nyFeet = feetStart.y + dy * t;
    }

    // Collision-validate the step in the same feet-space the path was found in.
    if (canMoveTo(grid, nx, nyFeet, PLAYER_RADIUS)) {
      self.x = nx;
      self.y = nyFeet - FEET_OFFSET_Y;
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

  /** Pick a random walkable pixel position on the map. */
  protected randomWalkablePoint(): Point {
    for (let i = 0; i < 100; i++) {
      const x = 80 + Math.random() * (MAP_W - 160);
      const y = 80 + Math.random() * (MAP_H - 160);
      if (canMoveTo(grid, x, y + FEET_OFFSET_Y, PLAYER_RADIUS)) return { x, y };
    }
    // Fallback: map centre
    return { x: MAP_W / 2, y: MAP_H / 2 };
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
      findPath(
        grid,
        { x: SPAWN_X, y: SPAWN_Y + FEET_OFFSET_Y },
        { x: p.x, y: p.y + FEET_OFFSET_Y },
      ) !== null;

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
