/**
 * Per-slot state used to interpolate remote players between authoritative
 * network snapshots and keep their walk animation continuous between updates.
 *
 * This module is deliberately independent of React, the canvas, and transport
 * state. It returns a new state object and never mutates the caller's snapshot.
 */
export interface RemotePlayerAnimationState {
  /** Most recently received authoritative position. */
  x: number;
  y: number;
  /** Interpolated world position used for drawing. */
  renderX: number;
  renderY: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  segmentStartTs: number;
  segmentDurationMs: number;
  lastTargetTs: number;
  animMs: number;
  facingLeft: boolean;
  lastMovedTs: number;
}

export interface RemotePlayerAnimationStep {
  state: RemotePlayerAnimationState;
  moving: boolean;
}

const REMOTE_MOVING_WINDOW_MS = 260;
const REMOTE_INTERPOLATION_MIN_MS = 40;
const REMOTE_INTERPOLATION_MAX_MS = 220;
const REMOTE_POSITION_EPSILON_SQ = 0.25;
const REMOTE_FACING_EPSILON = 0.1;

/**
 * Advance one remote player's render state for the current animation frame.
 *
 * The interpolation segment starts at the last rendered position so less
 * frequent bot snapshots do not cause visible jumps. Segment duration follows
 * the time between authoritative snapshots and is clamped to 40–220ms.
 */
export function stepRemotePlayerAnimation(
  current: RemotePlayerAnimationState | undefined,
  targetX: number,
  targetY: number,
  nowMs: number,
  deltaMs: number,
): RemotePlayerAnimationStep {
  const state: RemotePlayerAnimationState = current
    ? { ...current }
    : {
        x: targetX,
        y: targetY,
        renderX: targetX,
        renderY: targetY,
        fromX: targetX,
        fromY: targetY,
        targetX,
        targetY,
        segmentStartTs: nowMs,
        segmentDurationMs: REMOTE_INTERPOLATION_MIN_MS,
        lastTargetTs: nowMs,
        animMs: 0,
        facingLeft: false,
        lastMovedTs: -1e9,
      };

  if (current) {
    const dx = targetX - state.x;
    const dy = targetY - state.y;
    if (dx * dx + dy * dy > REMOTE_POSITION_EPSILON_SQ) {
      // Continue from the current rendered position, not the previous sample.
      state.fromX = state.renderX;
      state.fromY = state.renderY;
      state.targetX = targetX;
      state.targetY = targetY;
      state.segmentStartTs = nowMs;
      state.segmentDurationMs = Math.max(
        REMOTE_INTERPOLATION_MIN_MS,
        Math.min(REMOTE_INTERPOLATION_MAX_MS, nowMs - state.lastTargetTs),
      );
      state.lastTargetTs = nowMs;
      state.lastMovedTs = nowMs;
      if (Math.abs(dx) > REMOTE_FACING_EPSILON) state.facingLeft = dx < 0;
    }
  }

  state.x = targetX;
  state.y = targetY;

  const segmentT = Math.max(0, Math.min(
    1,
    (nowMs - state.segmentStartTs) / state.segmentDurationMs,
  ));
  const easedT = segmentT * segmentT * (3 - 2 * segmentT);
  state.renderX = state.fromX + (state.targetX - state.fromX) * easedT;
  state.renderY = state.fromY + (state.targetY - state.fromY) * easedT;

  const moving = nowMs - state.lastMovedTs < REMOTE_MOVING_WINDOW_MS;
  state.animMs = moving ? state.animMs + deltaMs : 0;

  return { state, moving };
}
