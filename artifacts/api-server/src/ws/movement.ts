import {
  isPlayerPositionWalkable,
  isPlayerPathWalkable,
  clampPlayerPositionToMapBounds,
  type Grid,
} from '@workspace/shared/collisionMap';
import {
  FEET_OFFSET_Y,
  PLAYER_SPEED_PX_PER_SEC,
} from '@workspace/shared/coords';
import type { CollisionWorld } from '@workspace/shared/collision';

export const MAX_MOVEMENT_CREDIT_MS = 200;
export const MOVEMENT_PACKET_BURST_CAPACITY = 16;
export const MOVEMENT_PACKET_REFILL_PER_SECOND = 50;
export const MOVEMENT_POSITION_TOLERANCE_PX = 0.75;
const CORRECTION_MIN_INTERVAL_MS = 40;

type MovementCollision = Grid | CollisionWorld;

export interface MovementBudgetState {
  x: number; y: number; alive: boolean;
  movementCreditPx?: number; movementCreditUpdatedAtMs?: number;
  lastMovementPacketAtMs?: number; lastMovementCorrectionAtMs?: number;
  movementPacketTokens?: number; movementPacketTokensUpdatedAtMs?: number;
}

export interface MovementDecision {
  x: number; y: number; accepted: boolean; corrected: boolean; rateLimited: boolean; sendCorrection: boolean;
  movementCreditPx: number; movementCreditUpdatedAtMs: number;
  lastMovementPacketAtMs: number | undefined; lastMovementCorrectionAtMs: number | undefined;
  movementPacketTokens: number; movementPacketTokensUpdatedAtMs: number;
}

export function isWalkableMovementPoint(grid: MovementCollision, x: number, y: number): boolean { return isPlayerPositionWalkable(grid, x, y); }
export function isMovementPathWalkable(grid: MovementCollision, fromX: number, fromY: number, toX: number, toY: number): boolean { return isPlayerPathWalkable(grid, fromX, fromY, toX, toY); }
function correctionDue(state: MovementBudgetState, nowMs: number): boolean { return state.lastMovementCorrectionAtMs === undefined || nowMs - state.lastMovementCorrectionAtMs >= CORRECTION_MIN_INTERVAL_MS; }

function vectorMove(world: CollisionWorld, state: MovementBudgetState, targetX: number, targetY: number): [number, number] {
  if (!state.alive) return clampPlayerPositionToMapBounds(targetX, targetY);
  const feet = world.movePlayerAtFeet(state.x, state.y + FEET_OFFSET_Y, targetX - state.x, targetY - state.y);
  return [feet[0], feet[1] - FEET_OFFSET_Y];
}

export function validateMovementIntent(
  state: MovementBudgetState, targetX: number, targetY: number, nowMs: number, collision: MovementCollision,
): MovementDecision {
  const packetTokensUpdatedAt = state.movementPacketTokensUpdatedAtMs ?? nowMs;
  const packetTokenElapsedMs = Math.max(0, nowMs - packetTokensUpdatedAt);
  const packetTokens = Math.min(MOVEMENT_PACKET_BURST_CAPACITY, (state.movementPacketTokens ?? MOVEMENT_PACKET_BURST_CAPACITY) + MOVEMENT_PACKET_REFILL_PER_SECOND * packetTokenElapsedMs / 1000);
  if (packetTokens < 1) return {
    x: state.x, y: state.y, accepted: false, corrected: false, rateLimited: true, sendCorrection: false,
    movementCreditPx: state.movementCreditPx ?? 0, movementCreditUpdatedAtMs: state.movementCreditUpdatedAtMs ?? nowMs,
    lastMovementPacketAtMs: state.lastMovementPacketAtMs, lastMovementCorrectionAtMs: state.lastMovementCorrectionAtMs,
    movementPacketTokens: packetTokens, movementPacketTokensUpdatedAtMs: nowMs,
  };
  const remainingPacketTokens = packetTokens - 1;
  const creditUpdatedAt = state.movementCreditUpdatedAtMs ?? nowMs;
  const elapsedMs = Math.max(0, nowMs - creditUpdatedAt);
  const maxCredit = PLAYER_SPEED_PX_PER_SEC * MAX_MOVEMENT_CREDIT_MS / 1000;
  const credit = Math.min(maxCredit, (state.movementCreditPx ?? 0) + PLAYER_SPEED_PX_PER_SEC * elapsedMs / 1000);
  const dx = targetX - state.x, dy = targetY - state.y;
  const requestedDistance = Math.hypot(dx, dy);
  const finish = (x: number, y: number, accepted: boolean, corrected: boolean, creditAfter: number): MovementDecision => {
    const shouldSend = corrected && correctionDue(state, nowMs);
    return {
      x, y, accepted, corrected, sendCorrection: shouldSend, rateLimited: false,
      movementCreditPx: creditAfter, movementCreditUpdatedAtMs: nowMs,
      lastMovementPacketAtMs: nowMs, lastMovementCorrectionAtMs: shouldSend ? nowMs : state.lastMovementCorrectionAtMs,
      movementPacketTokens: remainingPacketTokens, movementPacketTokensUpdatedAtMs: nowMs,
    };
  };
  if (requestedDistance > credit + MOVEMENT_POSITION_TOLERANCE_PX) return finish(state.x, state.y, false, true, credit);

  let nextX = targetX, nextY = targetY, corrected = false;
  if (!state.alive) {
    [nextX, nextY] = clampPlayerPositionToMapBounds(targetX, targetY);
    corrected = nextX !== targetX || nextY !== targetY;
  } else if ('movePlayerAtFeet' in collision) {
    [nextX, nextY] = vectorMove(collision, state, targetX, targetY);
    corrected = Math.hypot(nextX - targetX, nextY - targetY) > MOVEMENT_POSITION_TOLERANCE_PX;
  } else if (!isMovementPathWalkable(collision, state.x, state.y, targetX, targetY)) {
    const horizontalClear = isMovementPathWalkable(collision, state.x, state.y, targetX, state.y);
    const verticalClear = isMovementPathWalkable(collision, state.x, state.y, state.x, targetY);
    if (horizontalClear) { nextX = targetX; nextY = state.y; }
    else if (verticalClear) { nextX = state.x; nextY = targetY; }
    else { nextX = state.x; nextY = state.y; }
    corrected = true;
  }
  const appliedDistance = Math.hypot(nextX - state.x, nextY - state.y);
  return finish(nextX, nextY, true, corrected, Math.max(-MOVEMENT_POSITION_TOLERANCE_PX, credit - appliedDistance));
}

export function buildMovementCorrectionPacket(wireX: number, wireY: number): Buffer {
  const packet = Buffer.alloc(5); packet.writeUInt8(0x22, 0); packet.writeUInt16LE(wireX, 1); packet.writeUInt16LE(wireY, 3); return packet;
}
