import {
  isPlayerPositionWalkable,
  isPlayerPathWalkable,
  clampPlayerPositionToMapBounds,
  type Grid,
} from '@workspace/shared/collisionMap';
import {
  PLAYER_SPEED_PX_PER_SEC,
} from '@workspace/shared/coords';

/**
 * Movement intent is a target coordinate, not a trusted movement command.
 * The client predicts locally, but the server must constrain each target to
 * the distance that could have been travelled since the prior accepted packet.
 *
 * A 200ms credit cap absorbs short event-loop/network stalls without allowing
 * an idle client to bank seconds of movement. A separate token bucket limits
 * packet-processing work while allowing ordered WebSocket frames to arrive in
 * a tight burst after TCP/event-loop buffering.
 */
export const MAX_MOVEMENT_CREDIT_MS = 200;
export const MOVEMENT_PACKET_BURST_CAPACITY = 16;
export const MOVEMENT_PACKET_REFILL_PER_SECOND = 50;
export const MOVEMENT_POSITION_TOLERANCE_PX = 0.75;
const CORRECTION_MIN_INTERVAL_MS = 40;

export interface MovementBudgetState {
  x: number;
  y: number;
  alive: boolean;
  movementCreditPx?: number;
  movementCreditUpdatedAtMs?: number;
  lastMovementPacketAtMs?: number;
  lastMovementCorrectionAtMs?: number;
  movementPacketTokens?: number;
  movementPacketTokensUpdatedAtMs?: number;
}

export interface MovementDecision {
  x: number;
  y: number;
  accepted: boolean;
  corrected: boolean;
  rateLimited: boolean;
  sendCorrection: boolean;
  movementCreditPx: number;
  movementCreditUpdatedAtMs: number;
  lastMovementPacketAtMs: number | undefined;
  lastMovementCorrectionAtMs: number | undefined;
  movementPacketTokens: number;
  movementPacketTokensUpdatedAtMs: number;
}

export function isWalkableMovementPoint(grid: Grid, x: number, y: number): boolean {
  return isPlayerPositionWalkable(grid, x, y);
}

/** Server and client share the same complete-footprint segment test. */
export function isMovementPathWalkable(
  grid: Grid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  return isPlayerPathWalkable(grid, fromX, fromY, toX, toY);
}

function correctionDue(state: MovementBudgetState, nowMs: number): boolean {
  return state.lastMovementCorrectionAtMs === undefined ||
    nowMs - state.lastMovementCorrectionAtMs >= CORRECTION_MIN_INTERVAL_MS;
}

/**
 * Validate one client position target against a time-based movement budget.
 * The returned coordinates may be axis-slid if a legal diagonal target crosses
 * a wall. Speed and collision rejections request an explicit correction packet,
 * because an ordinary 0xFF position echo is intentionally treated as a normal
 * acknowledgement by local prediction.
 */
export function validateMovementIntent(
  state: MovementBudgetState,
  targetX: number,
  targetY: number,
  nowMs: number,
  grid: Grid,
): MovementDecision {
  const packetTokensUpdatedAt = state.movementPacketTokensUpdatedAtMs ?? nowMs;
  const packetTokenElapsedMs = Math.max(0, nowMs - packetTokensUpdatedAt);
  const packetTokens = Math.min(
    MOVEMENT_PACKET_BURST_CAPACITY,
    (state.movementPacketTokens ?? MOVEMENT_PACKET_BURST_CAPACITY) +
      MOVEMENT_PACKET_REFILL_PER_SECOND * packetTokenElapsedMs / 1000,
  );
  if (packetTokens < 1) {
    return {
      x: state.x,
      y: state.y,
      accepted: false,
      corrected: false,
      rateLimited: true,
      sendCorrection: false,
      movementCreditPx: state.movementCreditPx ?? 0,
      movementCreditUpdatedAtMs: state.movementCreditUpdatedAtMs ?? nowMs,
      lastMovementPacketAtMs: state.lastMovementPacketAtMs,
      lastMovementCorrectionAtMs: state.lastMovementCorrectionAtMs,
      movementPacketTokens: packetTokens,
      movementPacketTokensUpdatedAtMs: nowMs,
    };
  }
  const remainingPacketTokens = packetTokens - 1;

  const creditUpdatedAt = state.movementCreditUpdatedAtMs ?? nowMs;
  const elapsedMs = Math.max(0, nowMs - creditUpdatedAt);
  const maxCredit = PLAYER_SPEED_PX_PER_SEC * MAX_MOVEMENT_CREDIT_MS / 1000;
  const credit = Math.min(
    maxCredit,
    (state.movementCreditPx ?? 0) + PLAYER_SPEED_PX_PER_SEC * elapsedMs / 1000,
  );
  const dx = targetX - state.x;
  const dy = targetY - state.y;
  const requestedDistance = Math.hypot(dx, dy);

  const finish = (
    x: number,
    y: number,
    accepted: boolean,
    corrected: boolean,
    creditAfter: number,
  ): MovementDecision => {
    const shouldSend = corrected && correctionDue(state, nowMs);
    return {
      x,
      y,
      accepted,
      corrected,
      rateLimited: false,
      sendCorrection: shouldSend,
      movementCreditPx: creditAfter,
      movementCreditUpdatedAtMs: nowMs,
      lastMovementPacketAtMs: nowMs,
      lastMovementCorrectionAtMs: shouldSend ? nowMs : state.lastMovementCorrectionAtMs,
      movementPacketTokens: remainingPacketTokens,
      movementPacketTokensUpdatedAtMs: nowMs,
    };
  };

  if (requestedDistance > credit + MOVEMENT_POSITION_TOLERANCE_PX) {
    return finish(state.x, state.y, false, true, credit);
  }

  let nextX = targetX;
  let nextY = targetY;
  let corrected = false;

  // Ghosts skip wall collision but still obey map bounds and movement speed.
  if (!state.alive) {
    [nextX, nextY] = clampPlayerPositionToMapBounds(nextX, nextY);
    corrected = nextX !== targetX || nextY !== targetY;
  } else if (!isMovementPathWalkable(grid, state.x, state.y, targetX, targetY)) {
    // Match the client's x-first wall sliding, but test every intermediate point
    // so a long or forged target cannot jump over a blocked segment.
    const horizontalClear = isMovementPathWalkable(grid, state.x, state.y, targetX, state.y);
    const verticalClear = isMovementPathWalkable(grid, state.x, state.y, state.x, targetY);
    if (horizontalClear) {
      nextX = targetX;
      nextY = state.y;
    } else if (verticalClear) {
      nextX = state.x;
      nextY = targetY;
    } else {
      nextX = state.x;
      nextY = state.y;
    }
    corrected = true;
  }

  const appliedDistance = Math.hypot(nextX - state.x, nextY - state.y);
  const creditAfter = Math.max(-MOVEMENT_POSITION_TOLERANCE_PX, credit - appliedDistance);
  return finish(nextX, nextY, true, corrected, creditAfter);
}

/** Server → client authoritative correction: [0x22, wireX(UInt16LE), wireY(UInt16LE)]. */
export function buildMovementCorrectionPacket(wireX: number, wireY: number): Buffer {
  const packet = Buffer.alloc(5);
  packet.writeUInt8(0x22, 0);
  packet.writeUInt16LE(wireX, 1);
  packet.writeUInt16LE(wireY, 3);
  return packet;
}
