// ─────────────────────────────────────────────────────────────────────────────
// Pure player movement/animation logic for the test character.
//
// Kept separate from rendering (GameMap.tsx) so the movement + collision
// resolution can be reasoned about (and unit-tested) independently of React
// and canvas concerns, matching the collisionMap.ts pattern.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isPlayerPositionWalkable,
  isPlayerPathWalkable,
  resolvePlayerMovement,
  clampPlayerPositionToMapBounds,
  type Grid,
} from './collisionMap';
import {
  PLAYER_SPEED_PX_PER_SEC,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from '@workspace/shared/coords';
import type { CharacterPose } from './characterSprites';

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

/** Spawn point inside the main lobby — verified walkable with margin for PLAYER_RADIUS. */
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

const MOVE_KEYS = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
};

function isKeyDown(keys: ReadonlySet<string>, aliases: string[]): boolean {
  return aliases.some((k) => keys.has(k));
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
  grid: Grid,
  state: PlayerState,
  keys: ReadonlySet<string>,
  dtMs: number,
  ghost = false,
): PlayerState {
  let dx = 0;
  let dy = 0;
  if (isKeyDown(keys, MOVE_KEYS.up)) dy -= 1;
  if (isKeyDown(keys, MOVE_KEYS.down)) dy += 1;
  if (isKeyDown(keys, MOVE_KEYS.left)) dx -= 1;
  if (isKeyDown(keys, MOVE_KEYS.right)) dx += 1;

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
      [x, y] = resolvePlayerMovement(grid, x, y, nx, ny);
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
export function isSpawnWalkable(grid: Grid): boolean {
  return isPlayerPositionWalkable(grid, PLAYER_SPAWN.x, PLAYER_SPAWN.y);
}
