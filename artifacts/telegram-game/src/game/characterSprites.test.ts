import assert from 'node:assert/strict';
import {
  CHARACTER_CELL_HEIGHT,
  CHARACTER_COLORS,
  CHARACTER_POSES,
  CHARACTER_SHEET_HEIGHT,
  CHARACTER_SHEET_WIDTH,
  getCharacterFrameRect,
  getCharacterFrameDisplayScale,
} from './characterSprites';
import { FEET_OFFSET_Y, MAP_W, PLAYER_SPRITE_HALF_HEIGHT_PX } from '@workspace/shared/coords';

assert.equal(CHARACTER_COLORS.length, 7, 'all seven balaclava colors must remain');
assert.equal(CHARACTER_POSES.length, 9, 'all nine authored poses must remain');
assert.equal(CHARACTER_SHEET_WIDTH, 1123);
assert.equal(CHARACTER_SHEET_HEIGHT, 1401);

for (const pose of CHARACTER_POSES) {
  const frame = getCharacterFrameRect('teal', pose);
  assert.ok(frame.x >= 0 && frame.x + frame.width <= CHARACTER_SHEET_WIDTH,
    `${pose}: source X must remain within the atlas`);
  assert.ok(frame.y >= 0 && frame.y + frame.height <= CHARACTER_SHEET_HEIGHT,
    `${pose}: source Y must remain within the atlas`);
  assert.ok(frame.displayHeight >= frame.height,
    `${pose}: display height must not shrink below its isolated source crop`);
  assert.ok(getCharacterFrameDisplayScale(pose) > 0);
}

const baseHeight = Math.round(36 * MAP_W / 1652);
const expectedIdleHalfHeight = baseHeight * getCharacterFrameDisplayScale('idle') / 2;
assert.equal(FEET_OFFSET_Y, Math.round(expectedIdleHalfHeight),
  'shared movement feet offset must match the rendered idle baseline');
assert.equal(PLAYER_SPRITE_HALF_HEIGHT_PX, Math.ceil(expectedIdleHalfHeight),
  'spawn clearance must enclose the complete rendered idle sprite');
assert.equal(
  getCharacterFrameDisplayScale('dead-body'),
  getCharacterFrameRect('teal', 'dead-body').displayHeight / CHARACTER_CELL_HEIGHT,
  'corpse scale must use its authored display height, not the reduced crop height',
);

console.log('Character atlas geometry passed: nine pose windows, authored render scale and shared feet anchor.');
