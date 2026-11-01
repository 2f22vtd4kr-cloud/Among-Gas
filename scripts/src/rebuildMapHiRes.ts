import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = resolve(repoRoot, 'attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png');
const targetPath = resolve(repoRoot, 'artifacts/telegram-game/public/map-hires.png');
const targetWebpPath = resolve(repoRoot, 'artifacts/telegram-game/public/map-hires.webp');
const outputPath = resolve(repoRoot, 'artifacts/map-source-rebuild/map-hires.rebuilt.png');
const outputWebpPath = resolve(repoRoot, 'artifacts/map-source-rebuild/map-hires.rebuilt.webp');

const sourceMeta = await sharp(sourcePath).metadata();
const targetMeta = await sharp(targetPath).metadata();
const targetWebpMeta = await sharp(targetWebpPath).metadata();
if (!sourceMeta.width || !sourceMeta.height || !targetMeta.width || !targetMeta.height || !targetWebpMeta.width || !targetWebpMeta.height) {
  throw new Error('Map source or target raster is missing image dimensions');
}
if (sourceMeta.width !== 1652 || sourceMeta.height !== 952) {
  throw new Error(`Unexpected original map source dimensions: ${sourceMeta.width}×${sourceMeta.height}`);
}
if (targetMeta.width !== 3224 || targetMeta.height !== 1858) {
  throw new Error(`Unexpected canonical map raster dimensions: ${targetMeta.width}×${targetMeta.height}`);
}
if (targetWebpMeta.width !== 6608 || targetWebpMeta.height !== 3808) {
  throw new Error(`Unexpected high-resolution WebP dimensions: ${targetWebpMeta.width}×${targetWebpMeta.height}`);
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

const targetWebpBytes = await readFile(targetWebpPath);
const targetWebpRaw = await sharp(targetWebpPath).removeAlpha().raw().toBuffer();
const webpCandidates: { quality: number; effort: number; mae: number; bytes: Buffer }[] = [];
for (const quality of [80, 85, 88, 90, 92, 95]) {
  const bytes = await sharp(sourcePath)
    .resize(targetWebpMeta.width, targetWebpMeta.height, { fit: 'fill', kernel: 'lanczos3' })
    .webp({ quality, effort: 6 })
    .toBuffer();
  const decoded = await sharp(bytes).removeAlpha().raw().toBuffer();
  if (decoded.length !== targetWebpRaw.length) throw new Error('Generated WebP candidate has a different pixel buffer length');
  let error = 0;
  for (let i = 0; i < targetWebpRaw.length; i++) error += Math.abs(targetWebpRaw[i] - decoded[i]);
  webpCandidates.push({ quality, effort: 6, mae: error / targetWebpRaw.length, bytes });
}
webpCandidates.sort((a, b) => a.mae - b.mae);
const bestWebp = webpCandidates[0];
if (!bestWebp) throw new Error('No deterministic WebP derivative candidate was generated');
await writeFile(outputWebpPath, bestWebp.bytes);
const generatedWebpBytes = await readFile(outputWebpPath);

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
  transform: { fit: 'fill', kernel: 'lanczos3', alpha: 'preserve-if-present' },
  fullMeanAbsolutePixelError: Number(fullMae.toFixed(4)),
  webp: {
    sourceDimensions: [sourceMeta.width, sourceMeta.height],
    target: 'artifacts/telegram-game/public/map-hires.webp',
    targetDimensions: [targetWebpMeta.width, targetWebpMeta.height],
    targetSha256: createHash('sha256').update(targetWebpBytes).digest('hex'),
    generated: relative(repoRoot, outputWebpPath),
    generatedSha256: createHash('sha256').update(generatedWebpBytes).digest('hex'),
    scale: [targetWebpMeta.width / sourceMeta.width, targetWebpMeta.height / sourceMeta.height],
    transform: { fit: 'fill', kernel: 'lanczos3', quality: bestWebp.quality, effort: bestWebp.effort },
    fullMeanAbsolutePixelError: Number(bestWebp.mae.toFixed(4)),
    candidates: webpCandidates.map(candidate => ({ quality: candidate.quality, effort: candidate.effort, fullMae: Number(candidate.mae.toFixed(4)), bytes: candidate.bytes.length })),
  },
  runtimeAssetOverwritten: false,
};
console.log('MAP_HIRES_REPRODUCIBLE_DERIVATIVE ' + JSON.stringify(report));
if (fullMae >= 8) {
  throw new Error(`Rebuilt map raster differs from the committed canonical PNG beyond the approved provenance threshold (MAE ${fullMae.toFixed(4)} >= 8)`);
}
if (bestWebp.mae >= 4) {
  throw new Error(`Rebuilt map WebP differs from the committed high-resolution derivative beyond the approved provenance threshold (MAE ${bestWebp.mae.toFixed(4)} >= 4)`);
}
