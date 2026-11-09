import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  CHARACTER_COLORS,
  CHARACTER_POSES,
  GENERATED_CHARACTER_PALETTES,
  getCharacterFrameRect,
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
const [, sourceSaturation, sourceLightness] = rgbToHsl(tealSuit[0], tealSuit[1], tealSuit[2]);

for (const palette of GENERATED_CHARACTER_PALETTES) {
  const result = recolorSuitPixel(...tealSuit, palette);
  const [hue, saturation, lightness] = rgbToHsl(result[0], result[1], result[2]);
  const hueDelta = Math.min(Math.abs(hue - palette.hue), 360 - Math.abs(hue - palette.hue));
  assert.ok(hueDelta < 2, `${palette.color}: suit hue must match its palette`);
  assert.equal(result[3], tealSuit[3], `${palette.color}: original alpha must be preserved`);

  const expectedLightness = Math.max(0.04, Math.min(
    0.96,
    sourceLightness * (palette.lightnessScale ?? 1) + (palette.lightnessOffset ?? 0),
  ));
  const expectedSaturation = sourceSaturation * (palette.saturationScale ?? 1);
  assert.ok(Math.abs(lightness - expectedLightness) < 0.01,
    `${palette.color}: palette brightness must retain the authored pixel's relative shading`);
  assert.ok(Math.abs(saturation - expectedSaturation) < 0.01,
    `${palette.color}: palette saturation must follow its explicit material transform`);
  if (palette.color === 'black') assert.ok(lightness < 0.3, 'black suit must remain visibly dark');
  if (palette.color === 'white') assert.ok(lightness > 0.7, 'white suit must remain visibly light');
}

// The visor, filter, mask fabric, dark outline and transparent pixels are not suit material.
for (const untouched of [
  [111, 174, 197, 255], // blue visor highlight
  [183, 214, 213, 255], // low-saturation pale filter material
  [174, 224, 222, 255], // high-saturation pale cyan filter highlight (lightness mask)
  [17, 27, 38, 255],    // dark outline
  [40, 184, 170, 0],    // transparent teal edge
] as const) {
  assert.equal(isRecolorableSuitPixel(...untouched), false);
  for (const palette of GENERATED_CHARACTER_PALETTES) {
    assert.deepEqual(recolorSuitPixel(...untouched, palette), untouched,
      `${palette.color}: non-suit pixels must remain byte-for-byte unchanged`);
  }
}


const spriteBytes = await readFile(new URL('../artifacts/telegram-game/public/sprites/characters.png', import.meta.url));
const { data: spritePixels, info: spriteInfo } = await sharp(spriteBytes)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
assert.equal(spriteInfo.width, 1123);
assert.equal(spriteInfo.height, 1401);

const sourceBands: Record<string, readonly [number, number]> = {
  idle: [0, 156],
  'walk-1': [156, 311],
  'walk-2': [311, 467],
  'run-lean': [467, 623],
  ghost: [623, 778],
  mask: [778, 934],
  'hold-item': [934, 1090],
  'dead-body': [1060, 1180],
  'sit-crouch': [1190, 1401],
};

function largestOpaqueComponentBounds(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): { top: number; bottom: number; pixels: number } {
  const width = x1 - x0;
  const height = y1 - y0;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let best = { top: y1, bottom: y0, pixels: 0 };
  for (let start = 0; start < width * height; start++) {
    if (visited[start]) continue;
    const sy = Math.floor(start / width);
    const sx = start % width;
    const alphaOffset = ((y0 + sy) * spriteInfo.width + x0 + sx) * 4 + 3;
    if (spritePixels[alphaOffset] === 0) {
      visited[start] = 1;
      continue;
    }
    let tail = 0;
    let head = 0;
    stack[tail++] = start;
    visited[start] = 1;
    let minY = sy;
    let maxY = sy;
    let count = 0;
    while (head < tail) {
      const current = stack[head++];
      const cy = Math.floor(current / width);
      const cx = current % width;
      count++;
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next]) continue;
          visited[next] = 1;
          const nextAlpha = ((y0 + ny) * spriteInfo.width + x0 + nx) * 4 + 3;
          if (spritePixels[nextAlpha] > 0) stack[tail++] = next;
        }
      }
    }
    if (count > best.pixels) {
      best = { top: y0 + minY, bottom: y0 + maxY + 1, pixels: count };
    }
  }
  return best;
}

// Prove that every crop contains the entire largest authored silhouette in
// each of the seven source columns. This catches crops that still render but
// silently shave off feet, the corpse body or a pose's lower contour.
const sourceCellWidth = spriteInfo.width / 7;
for (let column = 0; column < 7; column++) {
  const color = CHARACTER_COLORS[column];
  const x0 = Math.ceil(column * sourceCellWidth);
  const x1 = Math.floor((column + 1) * sourceCellWidth);
  for (const pose of CHARACTER_POSES) {
    const band = sourceBands[pose];
    const bounds = largestOpaqueComponentBounds(x0, x1, band[0], band[1]);
    const frame = getCharacterFrameRect(color, pose);
    assert.ok(bounds.pixels > 100, `${color}/${pose}: expected an authored sprite component`);
    assert.ok(frame.y <= bounds.top,
      `${color}/${pose}: crop starts below the source silhouette (crop ${frame.y}, source ${bounds.top})`);
    assert.ok(frame.y + frame.height >= bounds.bottom,
      `${color}/${pose}: crop cuts off the source silhouette (crop ends ${frame.y + frame.height}, source ends ${bounds.bottom})`);
  }
}
console.log('Source-pixel crop audit passed: all nine pose silhouettes are fully retained across all seven authored colors.');

console.log('Character palette regression passed: 18 unique columns, 11 material-preserving generated colors, unchanged visor/outline/filter/alpha.');
