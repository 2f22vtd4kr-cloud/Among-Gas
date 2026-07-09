// ─────────────────────────────────────────────────────────────────────────────
// Pure player movement/animation logic for the test character.
//
// Kept separate from rendering (GameMap.tsx) so the movement + collision
// resolution can be reasoned about (and unit-tested) independently of React
// and canvas concerns, matching the collisionMap.ts pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { canMoveTo, resolveMovement, type Grid } from './collisionMap';
import type { CharacterPose } from './characterSprites';

export const PLAYER_COLOR = 'teal' as const;
export const PLAYER_RADIUS = 9;
export const PLAYER_SPEED_PX_PER_SEC = 130;
export const PLAYER_ANIM_INTERVAL_MS = 140;

/** Spawn point inside the main lobby — verified walkable with margin for PLAYER_RADIUS. */
export const PLAYER_SPAWN = { x: 350, y: 150 };

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
 */
export function stepPlayer(
  grid: Grid,
  state: PlayerState,
  keys: ReadonlySet<string>,
  dtMs: number,
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
    [x, y] = resolveMovement(grid, x, y, nx, ny, PLAYER_RADIUS);
  }

  const facingLeft = dx !== 0 ? dx < 0 : state.facingLeft;

  const animElapsedMs = moving ? state.animElapsedMs + dtMs : 0;
  const pose: CharacterPose = moving
    ? Math.floor(animElapsedMs / PLAYER_ANIM_INTERVAL_MS) % 2 === 0
      ? 'walk-1'
      : 'walk-2'
    : 'idle';

  return { x, y, pose, facingLeft, animElapsedMs };
}

/** Whether the player's current spawn/position is actually walkable — used for a startup sanity check. */
export function isSpawnWalkable(grid: Grid): boolean {
  return canMoveTo(grid, PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_RADIUS);
}
