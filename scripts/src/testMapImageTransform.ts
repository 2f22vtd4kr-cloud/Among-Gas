import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MAP_W, MAP_H } from '@workspace/shared/collisionMap';
import { mapWorldRectToImagePixels } from '@workspace/shared/mapImageTransform';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [png, webp] = await Promise.all([
  sharp(resolve(repoRoot, 'artifacts/telegram-game/public/map-hires.png')).metadata(),
  sharp(resolve(repoRoot, 'artifacts/telegram-game/public/map-hires.webp')).metadata(),
]);
assert.equal(png.width, MAP_W, 'canonical PNG width must equal collision world width');
assert.equal(png.height, MAP_H, 'canonical PNG height must equal collision world height');
assert.ok(webp.width && webp.height, 'WebP metadata must include native dimensions');

function near(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-7,
    `${label}: expected ${expected}, received ${actual}`);
}
const worldSize = { width: MAP_W, height: MAP_H };
const fullWorld = { x: 0, y: 0, width: MAP_W, height: MAP_H };
for (const [label, size] of [
  ['PNG', { width: png.width!, height: png.height! }],
  ['WebP', { width: webp.width!, height: webp.height! }],
] as const) {
  const full = mapWorldRectToImagePixels(fullWorld, worldSize, size);
  near(full.x, 0, `${label} full left`);
  near(full.y, 0, `${label} full top`);
  near(full.width, size.width, `${label} full width`);
  near(full.height, size.height, `${label} full height`);

  const crop = { x: 317, y: 229, width: 813, height: 477 };
  const actual = mapWorldRectToImagePixels(crop, worldSize, size);
  near(actual.x, crop.x * size.width / MAP_W, `${label} crop X`);
  near(actual.y, crop.y * size.height / MAP_H, `${label} crop Y`);
  near(actual.width, crop.width * size.width / MAP_W, `${label} crop width`);
  near(actual.height, crop.height * size.height / MAP_H, `${label} crop height`);
}
assert.throws(() => mapWorldRectToImagePixels(fullWorld, worldSize, { width: 0, height: 10 }),
  RangeError, 'invalid image dimensions must be rejected');

console.log(`Map raster transform passed: world ${MAP_W}×${MAP_H}, PNG ${png.width}×${png.height}, WebP ${webp.width}×${webp.height}; full-map and interior crops checked.`);
