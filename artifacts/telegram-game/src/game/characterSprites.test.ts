import assert from 'node:assert/strict';
import {
  CHARACTER_CELL_HEIGHT,
  CHARACTER_COLORS,
  CHARACTER_POSES,
  CHARACTER_SHEET_HEIGHT,
  CHARACTER_SHEET_WIDTH,
  getCharacterFrameRect,
} from './characterSprites';
import { FEET_OFFSET_Y, MAP_W, PLAYER_SPRITE_HALF_HEIGHT_PX } from '@workspace/shared/coords';

assert.equal(CHARACTER_COLORS.length, 7, 'all seven balaclava colors must remain');
assert.equal(CHARACTER_POSES.length, 9, 'all nine authored animation and kill poses must remain');
assert.equal(CHARACTER_SHEET_WIDTH, 1123);
assert.equal(CHARACTER_SHEET_HEIGHT, 1401);

for (const pose of CHARACTER_POSES) {
  const frame = getCharacterFrameRect('teal', pose);
  assert.ok(frame.x >= 0 && frame.x + frame.width <= CHARACTER_SHEET_WIDTH,
    `${pose}: source X must remain within the atlas`);
  assert.ok(frame.y >= 0 && frame.y + frame.height <= CHARACTER_SHEET_HEIGHT,
    `${pose}: source Y must remain within the atlas`);
  assert.ok(frame.width > 0 && frame.height > 0);
  assert.ok(frame.displayHeight >= frame.height,
    `${pose}: diagnostic atlas baseline must remain separate from its measured crop`);
}

const idle = getCharacterFrameRect('teal', 'idle');
assert.equal(idle.height, 136, 'idle source crop retains its detached-stroke trim');
assert.equal(idle.displayHeight, 153, 'original atlas baseline remains diagnostic metadata');
const corpse = getCharacterFrameRect('teal', 'dead-body');
assert.equal(corpse.height, 93, 'cut-body source crop retains its exposed-bone frame');
assert.equal(corpse.displayHeight, 118, 'cut-body atlas baseline remains diagnostic metadata');

const baseHeight = Math.round(36 * MAP_W / 1652);
const expectedFeetOffset = Math.round(baseHeight * (idle.height / CHARACTER_CELL_HEIGHT) / 2);
assert.equal(FEET_OFFSET_Y, expectedFeetOffset,
  'shared movement feet offset must match the actual uncorrrected idle crop');
assert.equal(PLAYER_SPRITE_HALF_HEIGHT_PX, Math.ceil(expectedFeetOffset),
  'spawn clearance must use the same rendered idle crop height as movement geometry');
console.log('Character atlas geometry passed: nine bounded crops, diagnostic baselines, exposed-bone corpse crop and uncropped feet anchor.');
