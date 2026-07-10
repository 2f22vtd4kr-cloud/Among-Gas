// ─────────────────────────────────────────────────────────────────────────────
// Pure player movement/animation logic for the test character.
//
// Kept separate from rendering (GameMap.tsx) so the movement + collision
// resolution can be reasoned about (and unit-tested) independently of React
// and canvas concerns, matching the collisionMap.ts pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { canMoveTo, MAP_W, MAP_H, type Grid } from './collisionMap';
import type { CharacterPose } from './characterSprites';

export const PLAYER_COLOR = 'teal' as const;
// Scale from original 1040×580 canvas to the current MAP_W×MAP_H canvas.
// Speed uses the geometric mean of the two axis scale factors.
const _SCALE = Math.sqrt((MAP_W / 1040) * (MAP_H / 580));
export const PLAYER_SPEED_PX_PER_SEC = Math.round(130 * _SCALE);

// Collision is checked at the character's feet (bottom-center of sprite),
// not the sprite center. FEET_OFFSET_Y shifts the test point down to the
// base of the sprite; PLAYER_RADIUS is intentionally tiny (just the feet).
// PLAYER_HALF_WIDTH adds two extra side test points (left & right of feet
// center) so the character can't clip into walls horizontally. It is wider
// than PLAYER_RADIUS intentionally — the sprite is much wider than it is tall
// at its base, and pure radius alone lets the sides pass through thin walls.
const _SPRITE_H_MAP_PX = Math.round(36 * (MAP_W / 1652));
export const FEET_OFFSET_Y     = Math.round(_SPRITE_H_MAP_PX * 0.25);
export const PLAYER_RADIUS     = 4;
export const PLAYER_HALF_WIDTH = 10; // extra left/right collision extension (px)
export const PLAYER_ANIM_INTERVAL_MS = 140;

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

function resolveMovementWide(
  grid: Grid,
  x: number,  y: number,
  nx: number, ny: number,
): [number, number] {
  if (canMoveToWide(grid, nx, ny)) return [nx, ny];
  if (canMoveToWide(grid, nx, y))  return [nx, y];
  if (canMoveToWide(grid, x,  ny)) return [x, ny];
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
