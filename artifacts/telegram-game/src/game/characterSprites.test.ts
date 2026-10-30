import assert from 'node:assert/strict';
import {
  CHARACTER_CELL_HEIGHT,
  CHARACTER_CELL_WIDTH,
  CHARACTER_COLORS,
  CHARACTER_POSES,
  CHARACTER_SHEET_COLS,
  CHARACTER_SHEET_HEIGHT,
  CHARACTER_SHEET_WIDTH,
  CHARACTER_SOURCE_SHEET_COLS,
  CHARACTER_SOURCE_SHEET_WIDTH,
  getCharacterClipNotch,
  getCharacterClipPath,
  getCharacterFrameRect,
} from './characterSprites';
import { FEET_OFFSET_Y, MAP_W, PLAYER_SPRITE_HALF_HEIGHT_PX } from '@workspace/shared/coords';

assert.equal(CHARACTER_COLORS.length, 18, 'all eighteen character palettes must be available');
assert.equal(new Set(CHARACTER_COLORS).size, 18, 'every character palette name must be unique');
assert.equal(CHARACTER_SHEET_COLS, 18, 'runtime atlas must expose eighteen integer columns');
assert.equal(CHARACTER_SOURCE_SHEET_COLS, 7, 'the seven authored source columns remain unchanged');
assert.equal(CHARACTER_SOURCE_SHEET_WIDTH, 1123, 'the original source atlas width remains measured');
assert.equal(CHARACTER_CELL_WIDTH, 161, 'integer runtime columns avoid fractional atlas sampling');
assert.equal(CHARACTER_SHEET_WIDTH, 2898, 'eighteen runtime columns must fit the generated atlas');
assert.equal(CHARACTER_POSES.length, 9, 'all nine authored animation and kill poses must remain');
assert.equal(CHARACTER_SHEET_HEIGHT, 1401);

const colorFrames = CHARACTER_COLORS.map(color => getCharacterFrameRect(color, 'idle'));
assert.equal(new Set(colorFrames.map(frame => frame.x)).size, 18,
  'every runtime palette must have a unique atlas column');
assert.equal(getCharacterFrameRect('red', 'idle').x, 7 * CHARACTER_CELL_WIDTH);
assert.equal(getCharacterFrameRect('rose', 'idle').x, 17 * CHARACTER_CELL_WIDTH);

for (const color of CHARACTER_COLORS) {
  for (const pose of CHARACTER_POSES) {
  const frame = getCharacterFrameRect(color, pose);
  assert.ok(frame.x >= 0 && frame.x + frame.width <= CHARACTER_SHEET_WIDTH,
    `${pose}: source X must remain within the atlas`);
  assert.ok(frame.y >= 0 && frame.y + frame.height <= CHARACTER_SHEET_HEIGHT,
    `${pose}: source Y must remain within the atlas`);
  assert.ok(frame.width > 0 && frame.height > 0);
  assert.ok(frame.displayHeight >= frame.height,
    `${color}/${pose}: diagnostic atlas baseline must remain separate from its measured crop`);
  }
}

assert.equal(getCharacterClipNotch('idle')?.rightLegStart, 0.68,
  'idle leg-gap mask must remove the stray black hook while preserving the right foot');
assert.match(getCharacterClipPath('idle') ?? '', /68%/,
  'idle DOM and canvas renderers must share the widened transparent gap');
assert.equal(getCharacterClipNotch('dead-body')?.rightLegStart, 0.67,
  'corpse leg-gap mask must remove the detached horizontal bridge');
assert.match(getCharacterClipPath('dead-body') ?? '', /67%/,
  'corpse DOM and canvas renderers must share the widened transparent gap');

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
