// ─────────────────────────────────────────────────────────────────────────────
// Pure player movement/animation logic for the test character.
//
// Kept separate from rendering (GameMap.tsx) so the movement + collision
// resolution can be reasoned about (and unit-tested) independently of React
// and canvas concerns, matching the collisionMap.ts pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { canMoveTo, MAP_W, MAP_H, type Grid } from './collisionMap';
import {
  FEET_OFFSET_Y,
  PLAYER_HALF_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPEED_PX_PER_SEC,
} from '@workspace/shared/coords';
import type { CharacterPose } from './characterSprites';

export { PLAYER_SPEED_PX_PER_SEC } from '@workspace/shared/coords';

export const PLAYER_COLOR = 'teal' as const;

// Collision is checked at the character's feet (bottom-center of sprite).
// Movement speed, feet offset, radius, and horizontal clearance are shared
// with the server so client prediction and authoritative validation stay in sync.
// 11 fps two-frame walk cycle: responsive at 200ms bot position updates without flicker.
export const PLAYER_ANIM_INTERVAL_MS = 90;

// ── Wide collision helpers (client-only) ─────────────────────────────────────
// Tests three feet points: left, center, right. This gives the character a
// wider effective hitbox horizontally without changing the vertical feel.

function canMoveToWide(grid: Grid, cx: number, cy: number): boolean {
  return (
    canMoveTo(grid, cx,                      cy, PLAYER_RADIUS) &&
    canMoveTo(grid, cx - PLAYER_HALF_WIDTH,  cy, PLAYER_RADIUS) &&
    canMoveTo(grid, cx + PLAYER_HALF_WIDTH,  cy, PLAYER_RADIUS)
  );
}

/** Sample the whole segment so local prediction cannot step over a thin wall
 * that the authoritative server correctly rejects. Both sides sample at 2px.
 */
/** Public for regression coverage: a path can be blocked even when both endpoints are walkable. */
export function isMovementPathWalkableWide(
  grid: Grid, x: number, y: number, nx: number, ny: number,
): boolean {
  const distance = Math.hypot(nx - x, ny - y);
  const steps = Math.max(1, Math.ceil(distance / 2));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    if (!canMoveToWide(grid, x + (nx - x) * t, y + (ny - y) * t)) return false;
  }
  return true;
}

function resolveMovementWide(
  grid: Grid,
  x: number,  y: number,
  nx: number, ny: number,
): [number, number] {
  if (isMovementPathWalkableWide(grid, x, y, nx, ny)) return [nx, ny];
  // Preserve the established x-first sliding order, but validate the entire
  // axis segment so player prediction agrees with the server at wall corners.
  if (isMovementPathWalkableWide(grid, x, y, nx, y)) return [nx, y];
  if (isMovementPathWalkableWide(grid, x, y, x, ny)) return [x, ny];
  return [x, y];
}

/** Spawn point inside the main lobby — verified walkable with margin for PLAYER_RADIUS. */
export const PLAYER_SPAWN = {
  x: Math.round(350 * (MAP_W / 1040)),
  y: Math.round(150 * (MAP_H / 580)),
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
      // No collision — clamp to map bounds only.
      x = Math.max(0, Math.min(MAP_W, nx));
      y = Math.max(0, Math.min(MAP_H, ny));
    } else {
      // Collision is tested at the feet (offset down from sprite centre).
      const [fx, fy] = resolveMovementWide(grid, x, y + FEET_OFFSET_Y, nx, ny + FEET_OFFSET_Y);
      x = fx;
      y = fy - FEET_OFFSET_Y;
    }
  }

  const facingLeft = dx !== 0 ? dx < 0 : state.facingLeft;

  const animElapsedMs = moving ? state.animElapsedMs + dtMs : 0;
  const pose: CharacterPose = ghost
    ? 'ghost'
    : moving
      ? Math.floor(animElapsedMs / PLAYER_ANIM_INTERVAL_MS) % 2 === 0
        ? 'walk-1'
        : 'walk-2'
      : 'idle';

  return { x, y, pose, facingLeft, animElapsedMs };
}

/** Whether the player's current spawn/position is actually walkable — used for a startup sanity check. */
export function isSpawnWalkable(grid: Grid): boolean {
  return canMoveToWide(grid, PLAYER_SPAWN.x, PLAYER_SPAWN.y + FEET_OFFSET_Y);
}
