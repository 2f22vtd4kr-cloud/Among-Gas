import assert from 'node:assert/strict';
import {
  CHARACTER_COLORS,
  GENERATED_CHARACTER_PALETTES,
} from '../artifacts/telegram-game/src/game/characterSprites';
import {
  isRecolorableSuitPixel,
  recolorSuitPixel,
  rgbToHsl,
} from '../artifacts/telegram-game/src/game/characterAtlas';

assert.equal(CHARACTER_COLORS.length, 18);
assert.equal(GENERATED_CHARACTER_PALETTES.length, 11);
assert.equal(new Set(GENERATED_CHARACTER_PALETTES.map(palette => palette.hue)).size, 11,
  'generated suit palettes must have distinct target hues');

const tealSuit: [number, number, number, number] = [40, 184, 170, 231];
assert.equal(isRecolorableSuitPixel(...tealSuit), true,
  'the authored saturated teal suit material must be eligible for recolouring');
const [, sourceSaturation, sourceLightness] = rgbToHsl(...tealSuit.slice(0, 3) as [number, number, number]);

for (const palette of GENERATED_CHARACTER_PALETTES) {
  const result = recolorSuitPixel(...tealSuit, palette);
  const [hue, saturation, lightness] = rgbToHsl(result[0], result[1], result[2]);
  const hueDelta = Math.min(Math.abs(hue - palette.hue), 360 - Math.abs(hue - palette.hue));
  assert.ok(hueDelta < 2, `${palette.color}: suit hue must match its palette`);
  assert.equal(result[3], tealSuit[3], `${palette.color}: original alpha must be preserved`);

  if (palette.color === 'black') {
    assert.ok(lightness < sourceLightness * 0.6, 'black suit must remain visibly dark');
  } else if (palette.color === 'white') {
    assert.ok(lightness > sourceLightness + 0.15, 'white suit must remain visibly light');
  } else {
    assert.ok(Math.abs(lightness - sourceLightness) < 0.01,
      `${palette.color}: original pixel shading/lightness must be retained`);
    assert.ok(Math.abs(saturation - sourceSaturation) < 0.01,
      `${palette.color}: original suit saturation must be retained`);
  }
}

// The visor, filter, mask fabric, dark outline and transparent pixels are not suit material.
for (const untouched of [
  [111, 174, 197, 255], // blue visor highlight
  [183, 214, 213, 255], // pale filter material
  [17, 27, 38, 255],    // dark outline
  [40, 184, 170, 0],    // transparent teal edge
] as const) {
  assert.equal(isRecolorableSuitPixel(...untouched), false);
  for (const palette of GENERATED_CHARACTER_PALETTES) {
    assert.deepEqual(recolorSuitPixel(...untouched, palette), untouched,
      `${palette.color}: non-suit pixels must remain byte-for-byte unchanged`);
  }
}

console.log('Character palette regression passed: 18 unique columns, 11 material-preserving generated colors, unchanged visor/outline/filter/alpha.');
