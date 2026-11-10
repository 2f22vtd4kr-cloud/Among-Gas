import assert from 'node:assert/strict';
import { stepRemotePlayerAnimation } from './remotePlayerAnimation';

function near(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

// First observation initializes at the authoritative point without inventing
// movement or advancing the walk cycle.
const initialStep = stepRemotePlayerAnimation(undefined, 100, 200, 100, 16);
assert.deepEqual(initialStep.state, {
  x: 100,
  y: 200,
  renderX: 100,
  renderY: 200,
  fromX: 100,
  fromY: 200,
  targetX: 100,
  targetY: 200,
  segmentStartTs: 100,
  segmentDurationMs: 40,
  lastTargetTs: 100,
  animMs: 0,
  facingLeft: false,
  lastMovedTs: -1e9,
});
assert.equal(initialStep.moving, false);

// A new snapshot starts an interpolation segment from the displayed position,
// and records movement/facing without immediately teleporting the render point.
const movingStep = stepRemotePlayerAnimation(initialStep.state, 200, 240, 150, 16);
assert.equal(movingStep.state.segmentDurationMs, 50);
assert.equal(movingStep.state.segmentStartTs, 150);
assert.equal(movingStep.state.lastTargetTs, 150);
assert.equal(movingStep.state.lastMovedTs, 150);
assert.equal(movingStep.state.facingLeft, false);
assert.equal(movingStep.moving, true);
near(movingStep.state.renderX, 100, 'new segment begins at prior rendered X');
near(movingStep.state.renderY, 200, 'new segment begins at prior rendered Y');
assert.equal(movingStep.state.animMs, 16);

// Smoothstep interpolation reaches the midpoint at t=.5, and animation time
// accumulates while the 260ms moving window remains active.
const midpoint = stepRemotePlayerAnimation(movingStep.state, 200, 240, 175, 16);
near(midpoint.state.renderX, 150, 'smoothstep midpoint X');
near(midpoint.state.renderY, 220, 'smoothstep midpoint Y');
assert.equal(midpoint.state.animMs, 32);
assert.equal(midpoint.moving, true);

// A newer target interrupts the previous segment from its current rendered
// position, and a leftward target flips facing immediately.
const redirected = stepRemotePlayerAnimation(midpoint.state, 100, 240, 180, 16);
near(redirected.state.fromX, 150, 'replacement segment starts at current rendered X');
near(redirected.state.fromY, 220, 'replacement segment starts at current rendered Y');
assert.equal(redirected.state.targetX, 100);
assert.equal(redirected.state.targetY, 240);
assert.equal(redirected.state.segmentDurationMs, 40, 'short snapshot interval clamps to 40ms');
assert.equal(redirected.state.facingLeft, true);
near(redirected.state.renderX, 150, 'redirect does not teleport at segment start');

// Large snapshot gaps clamp to the 220ms maximum.
const slowSnapshot = stepRemotePlayerAnimation(initialStep.state, 300, 200, 700, 16);
assert.equal(slowSnapshot.state.segmentDurationMs, 220);

// Position deltas at or below the original squared-distance threshold do not
// start a new segment or mark the player as moving.
const stillBase = stepRemotePlayerAnimation(undefined, 0, 0, 0, 16);
const subThreshold = stepRemotePlayerAnimation(stillBase.state, 0.5, 0, 40, 16);
assert.equal(subThreshold.state.x, 0.5);
assert.equal(subThreshold.state.targetX, 0);
assert.equal(subThreshold.state.lastMovedTs, -1e9);
assert.equal(subThreshold.state.facingLeft, false);
assert.equal(subThreshold.moving, false);
assert.equal(subThreshold.state.animMs, 0);

// Purely vertical movement leaves horizontal facing unchanged.
const vertical = stepRemotePlayerAnimation(stillBase.state, 0, 5, 40, 16);
assert.equal(vertical.state.facingLeft, false);
assert.equal(vertical.moving, true);

// The moving window uses a strict <260ms comparison and resets walk time once
// the window expires.
const lastMotion = stepRemotePlayerAnimation(stillBase.state, 10, 0, 100, 16);
const beforeExpiry = stepRemotePlayerAnimation(lastMotion.state, 10, 0, 359, 16);
assert.equal(beforeExpiry.moving, true);
assert.equal(beforeExpiry.state.animMs, 32);
const atExpiry = stepRemotePlayerAnimation(beforeExpiry.state, 10, 0, 360, 16);
assert.equal(atExpiry.moving, false);
assert.equal(atExpiry.state.animMs, 0);

// The helper does not mutate a previously stored frame snapshot.
assert.equal(initialStep.state.renderX, 100);
assert.equal(initialStep.state.targetX, 100);

console.log('REMOTE PLAYER ANIMATION TESTS PASSED: initialization, interpolation, retargeting, clamps, facing and moving window');
