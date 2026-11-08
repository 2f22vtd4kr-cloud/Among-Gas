// ─────────────────────────────────────────────────────────────────────────────
// Pure player movement/animation logic for the test character.
//
// Kept separate from rendering (GameMap.tsx) so the movement + collision
// resolution can be reasoned about (and unit-tested) independently of React
// and canvas concerns, matching the collisionMap.ts pattern.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isPlayerSpawnPositionClear,
  isPlayerPathWalkable,
  resolvePlayerMovement,
  clampPlayerPositionToMapBounds,
  type Grid,
} from './collisionMap';
import type { CollisionWorld } from '@workspace/shared/collision';
import {
  PLAYER_SPEED_PX_PER_SEC,
  FEET_OFFSET_Y,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from '@workspace/shared/coords';
import type { CharacterPose } from './characterSprites';
import { getMovementAxes } from './gameInput';

export { PLAYER_SPEED_PX_PER_SEC } from '@workspace/shared/coords';

export const PLAYER_COLOR = 'teal' as const;

// Collision is checked at the character's feet (bottom-center of sprite).
// The world position is the sprite centre; shared collision geometry offsets
// the footprint down to the visible feet baseline for both client and server.
// 11 fps two-frame walk cycle: responsive at 200ms bot position updates without flicker.
export const PLAYER_ANIM_INTERVAL_MS = 90;

// Public wrapper retained for the existing movement regression suite.
export function isMovementPathWalkableWide(
  grid: Grid, x: number, y: number, nx: number, ny: number,
): boolean {
  return isPlayerPathWalkable(grid, x, y, nx, ny);
}

/** Spawn point in open main-lobby floor — validated against the full visible sprite rectangle. */
export const PLAYER_SPAWN = {
  x: PLAYER_SPAWN_X,
  y: PLAYER_SPAWN_Y,
};

export interface PlayerState {
  x: number;
  y: number;
  pose: CharacterPose;
  facingLeft: boolean;
  /** ms accumulator used to drive the walk-cycle frame swap */
  animElapsedMs: number;
}

export function createInitialPlayerState(): PlayerState {
  return {
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    pose: 'idle',
    facingLeft: false,
    animElapsedMs: 0,
  };
}

/**
 * Advance the player one frame: reads currently-held keys, resolves the
 * intended move against the collision grid (with wall-sliding), and updates
 * the walk-cycle animation. Returns a new state object.
 *
 * `ghost` (Phase 5 — GAME_SPEC.md §9): a killed player enters ghost mode and
 * walks through walls (collision is skipped, clamped only to map bounds),
 * and always renders the single static "ghost" pose instead of walk-cycling.
 */
export function stepPlayer(
  grid: Grid | CollisionWorld,
  state: PlayerState,
  keys: ReadonlySet<string>,
  dtMs: number,
  ghost = false,
): PlayerState {
  const { dx, dy } = getMovementAxes(keys);
  const moving = dx !== 0 || dy !== 0;

  let { x, y } = state;
  if (moving) {
    // Normalize diagonal movement so it isn't faster than cardinal movement.
    const len = Math.hypot(dx, dy) || 1;
    const dist = (PLAYER_SPEED_PX_PER_SEC * dtMs) / 1000;
    const nx = x + (dx / len) * dist;
    const ny = y + (dy / len) * dist;
    if (ghost) {
      // Ghosts phase through walls but their complete foot base stays inside the map.
      [x, y] = clampPlayerPositionToMapBounds(nx, ny);
    } else {
      if ('movePlayerAtFeet' in grid) {
        const [feetX, feetY] = grid.movePlayerAtFeet(
          x, y + FEET_OFFSET_Y, nx - x, ny - y,
        );
        x = feetX;
        y = feetY - FEET_OFFSET_Y;
      } else {
        [x, y] = resolvePlayerMovement(grid, x, y, nx, ny);
      }
    }
  }

  const facingLeft = dx !== 0 ? dx < 0 : state.facingLeft;

  // Input alone is not movement: pressing into a wall or map boundary must
  // not animate a walk cycle or emit footsteps while the world position is fixed.
  const actuallyMoving = x !== state.x || y !== state.y;
  const animElapsedMs = actuallyMoving ? state.animElapsedMs + dtMs : 0;
  const pose: CharacterPose = ghost
    ? 'ghost'
    : actuallyMoving
      ? Math.floor(animElapsedMs / PLAYER_ANIM_INTERVAL_MS) % 2 === 0
        ? 'walk-1'
        : 'walk-2'
      : 'idle';

  return { x, y, pose, facingLeft, animElapsedMs };
}

/** Whether the player's current spawn/position is actually walkable — used for a startup sanity check. */
export function isSpawnWalkable(grid: Grid | CollisionWorld): boolean {
  return 'isPlayerSpawnPositionClear' in grid
    ? grid.isPlayerSpawnPositionClear(PLAYER_SPAWN.x, PLAYER_SPAWN.y)
    : isPlayerSpawnPositionClear(grid, PLAYER_SPAWN.x, PLAYER_SPAWN.y);
}
