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
   */
  protected navigateTo(self: LobbyPlayer, goal: Point): boolean {
    const dxGoal = goal.x - self.x;
    const dyGoal = goal.y - self.y;
    if (dxGoal * dxGoal + dyGoal * dyGoal <= ARRIVAL_SQ) return true;

    const result = this.pathCache.find(grid, { x: self.x, y: self.y }, goal);
    if (!result || result.waypoints.length === 0) return false;

    const wp = result.waypoints[0];
    const dx = wp.x - self.x;
    const dy = wp.y - self.y;
    const dist = Math.hypot(dx, dy);

    let nx: number;
    let ny: number;
    if (dist <= BOT_SPEED_PX) {
      nx = wp.x;
      ny = wp.y;
    } else {
      const t = BOT_SPEED_PX / dist;
      nx = self.x + dx * t;
      ny = self.y + dy * t;
    }

    // Collision-validate the step (same geometry as the server's 0x11 handler)
    if (canMoveTo(grid, nx, ny + FEET_OFFSET_Y, PLAYER_RADIUS)) {
      self.x = nx;
      self.y = ny;
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

  /** Squared pixel distance between two positions. */
  protected static distSq(ax: number, ay: number, bx: number, by: number): number {
    return (ax - bx) ** 2 + (ay - by) ** 2;
  }
}
