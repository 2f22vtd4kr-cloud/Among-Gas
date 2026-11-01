import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = resolve(repoRoot, 'attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png');
const targetPath = resolve(repoRoot, 'artifacts/telegram-game/public/map-hires.png');
const outputPath = resolve(repoRoot, 'artifacts/map-source-rebuild/map-hires.rebuilt.png');

const sourceMeta = await sharp(sourcePath).metadata();
const targetMeta = await sharp(targetPath).metadata();
if (!sourceMeta.width || !sourceMeta.height || !targetMeta.width || !targetMeta.height) {
  throw new Error('Map source or target raster is missing image dimensions');
}
if (sourceMeta.width !== 1652 || sourceMeta.height !== 952) {
  throw new Error(`Unexpected original map source dimensions: ${sourceMeta.width}×${sourceMeta.height}`);
}
if (targetMeta.width !== 3224 || targetMeta.height !== 1858) {
  throw new Error(`Unexpected canonical map raster dimensions: ${targetMeta.width}×${targetMeta.height}`);
}

await mkdir(dirname(outputPath), { recursive: true });
await sharp(sourcePath)
  .resize(targetMeta.width, targetMeta.height, { fit: 'fill', kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

const [sourceBytes, targetBytes, generatedBytes] = await Promise.all([
  readFile(sourcePath),
  readFile(targetPath),
  readFile(outputPath),
]);
const targetRaw = await sharp(targetPath).removeAlpha().raw().toBuffer();
const generatedRaw = await sharp(outputPath).removeAlpha().raw().toBuffer();
if (targetRaw.length !== generatedRaw.length) throw new Error('Rebuilt map raster has a different pixel buffer length');
let absoluteError = 0;
for (let i = 0; i < targetRaw.length; i++) absoluteError += Math.abs(targetRaw[i] - generatedRaw[i]);
const fullMae = absoluteError / targetRaw.length;

const report = {
  source: relative(repoRoot, sourcePath),
  sourceDimensions: [sourceMeta.width, sourceMeta.height],
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  target: relative(repoRoot, targetPath),
  targetDimensions: [targetMeta.width, targetMeta.height],
  targetSha256: createHash('sha256').update(targetBytes).digest('hex'),
  generated: relative(repoRoot, outputPath),
  generatedSha256: createHash('sha256').update(generatedBytes).digest('hex'),
  scale: [targetMeta.width / sourceMeta.width, targetMeta.height / sourceMeta.height],
  transform: { fit: 'fill', kernel: 'lanczos3', alpha: 'preserve-sharp-default' },
  fullMeanAbsolutePixelError: Number(fullMae.toFixed(4)),
  runtimeAssetOverwritten: false,
};
console.log('MAP_HIRES_REPRODUCIBLE_DERIVATIVE ' + JSON.stringify(report));
if (fullMae >= 8) {
  throw new Error(`Rebuilt map raster differs from the committed canonical PNG beyond the approved provenance threshold (MAE ${fullMae.toFixed(4)} >= 8)`);
}
