import assert from 'node:assert/strict';
import {
  applyJoystickDirection,
  clearMovementInput,
  clearJoystickMovementInput,
  getMovementAxes,
  setMovementInputKey,
  shouldCaptureMovementKey,
} from './gameInput';

const keys = new Set<string>();
assert.equal(setMovementInputKey(keys, 'W', true), true);
assert.equal(keys.has('w'), true, 'keyboard input is normalized to lowercase');
assert.deepEqual(getMovementAxes(keys), { dx: 0, dy: -1 });
assert.equal(setMovementInputKey(keys, 'ArrowRight', true), true);
assert.deepEqual(getMovementAxes(keys), { dx: 1, dy: -1 }, 'WASD and arrow aliases combine as the same axes');
assert.equal(setMovementInputKey(keys, 'Space', true), false, 'non-movement keys are ignored');
assert.equal(setMovementInputKey(keys, 'ArrowRight', false), true);
assert.deepEqual(getMovementAxes(keys), { dx: 0, dy: -1 });
assert.equal(shouldCaptureMovementKey('w', false, false), true);
assert.equal(shouldCaptureMovementKey('ArrowLeft', false, false), true);
assert.equal(shouldCaptureMovementKey('w', true, false), false, 'editable fields retain text input');
assert.equal(shouldCaptureMovementKey('w', false, true), false, 'open modal suppresses movement');
assert.equal(shouldCaptureMovementKey('Enter', false, false), false, 'untracked key is not captured');

setMovementInputKey(keys, 's', true);
assert.deepEqual(getMovementAxes(keys), { dx: 0, dy: 0 }, 'opposing vertical keys cancel without accelerating');
clearMovementInput(keys);
assert.deepEqual(getMovementAxes(keys), { dx: 0, dy: 0 }, 'focus-loss cleanup releases held movement');

applyJoystickDirection(keys, 20, 20);
assert.deepEqual(getMovementAxes(keys), { dx: 1, dy: 1 }, 'diagonal joystick displacement outside the dead zone activates both axes');
applyJoystickDirection(keys, 52, 0);
assert.deepEqual(getMovementAxes(keys), { dx: 1, dy: 0 }, 'horizontal joystick displacement is cardinal');
applyJoystickDirection(keys, 0, -52);
assert.deepEqual(getMovementAxes(keys), { dx: 0, dy: -1 }, 'vertical joystick displacement is cardinal');
applyJoystickDirection(keys, 2, 2);
assert.deepEqual(getMovementAxes(keys), { dx: 0, dy: 0 }, 'dead-zone displacement clears joystick keys');
applyJoystickDirection(keys, 52, 52, 52, 0.18, 0.8);
assert.deepEqual(getMovementAxes(keys), { dx: 0, dy: 0 }, 'axis threshold suppresses diagonal noise');
assert.throws(() => applyJoystickDirection(keys, 1, 1, 0), RangeError);

// Releasing the touch joystick must not discard independently-held arrow keys.
setMovementInputKey(keys, 'ArrowRight', true);
setMovementInputKey(keys, 'w', true);
clearJoystickMovementInput(keys);
assert.deepEqual(getMovementAxes(keys), { dx: 1, dy: 0 },
  'joystick release clears only its WASD directions and preserves arrow-key input');
console.log('Shared keyboard and joystick movement input contracts passed.');
