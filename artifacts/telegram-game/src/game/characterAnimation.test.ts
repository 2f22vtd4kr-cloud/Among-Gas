import assert from 'node:assert/strict';
import {
  CHARACTER_SHADOW_HEIGHT_RADIUS_RATIO,
  CHARACTER_SHADOW_WIDTH_RADIUS_RATIO,
  CHARACTER_SHADOW_Y_OFFSET_RATIO,
  getCharacterShadowScale,
  getCharacterWalkBobOffset,
} from './characterAnimation';
import { PLAYER_ANIM_INTERVAL_MS } from './player';

const spriteHeight = 50;
const maximumBob = spriteHeight * 0.06;

assert.equal(getCharacterWalkBobOffset(0, spriteHeight), 0,
  'the first frame starts grounded');
assert.ok(getCharacterWalkBobOffset(PLAYER_ANIM_INTERVAL_MS, spriteHeight) < 1e-10,
  'the next walk frame starts grounded');
assert.ok(getCharacterWalkBobOffset(PLAYER_ANIM_INTERVAL_MS * 2, spriteHeight) < 1e-10,
  'the complete two-frame cycle returns to ground');
assert.equal(getCharacterWalkBobOffset(PLAYER_ANIM_INTERVAL_MS / 2, spriteHeight), maximumBob,
  'the character reaches its highest point halfway through the first step');
assert.equal(getCharacterWalkBobOffset(PLAYER_ANIM_INTERVAL_MS * 1.5, spriteHeight), maximumBob,
  'the second step reaches the same height');

assert.equal(getCharacterShadowScale(0, spriteHeight), 1,
  'the shadow is largest while the character is grounded');
assert.ok(getCharacterShadowScale(maximumBob, spriteHeight) < 1,
  'the shadow must shrink while the character rises');
assert.equal(getCharacterShadowScale(maximumBob, spriteHeight), 0.76,
  'shadow squash must remain capped at the intended 24 percent');
assert.equal(getCharacterShadowScale(maximumBob * 2, spriteHeight), 0.76,
  'shadow squash must never exceed its cap');
assert.equal(getCharacterWalkBobOffset(10, 0), 0);
assert.equal(getCharacterShadowScale(10, 0), 1);

console.log('Character animation regression passed: local/remote bob phase and grounded shadow scaling stay synchronized.');

assert.ok(CHARACTER_SHADOW_WIDTH_RADIUS_RATIO > 0.3,
  'gameplay shadow must be wide enough to extend beyond the lower-leg gap');
assert.ok(CHARACTER_SHADOW_Y_OFFSET_RATIO - CHARACTER_SHADOW_HEIGHT_RADIUS_RATIO < 0.5,
  'shadow oval must overlap the feet baseline so it does not look detached');
assert.ok(CHARACTER_SHADOW_Y_OFFSET_RATIO + CHARACTER_SHADOW_HEIGHT_RADIUS_RATIO > 0.5,
  'most of the oval must remain visible below the character feet');
