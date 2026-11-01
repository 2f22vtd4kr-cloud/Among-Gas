import { readdir } from 'node:fs/promises';
import { extname, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const searchRoots = ['attached_assets', 'artifacts/telegram-game'];
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const targetPath = resolve(repoRoot, 'artifacts/telegram-game/public/map-hires.png');
const targetMeta = await sharp(targetPath).metadata();
if (!targetMeta.width || !targetMeta.height) throw new Error('map-hires.png has no dimensions');
const target = await sharp(targetPath).removeAlpha().raw().toBuffer();
const targetRatio = targetMeta.width / targetMeta.height;

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

const candidates: {
  path: string;
  width: number;
  height: number;
  ratioDelta: number;
  sampledMae: number;
  kernel: string;
}[] = [];

for (const root of searchRoots) {
  const absoluteRoot = resolve(repoRoot, root);
  let files: string[] = [];
  try { files = await walk(absoluteRoot); } catch { continue; }
  for (const path of files) {
    if (path === targetPath) continue;
    const metadata = await sharp(path).metadata();
    if (!metadata.width || !metadata.height) continue;
    const ratio = metadata.width / metadata.height;
    const ratioDelta = Math.abs(ratio - targetRatio);
    if (metadata.width < 1000 || metadata.height < 550 || ratioDelta > 0.025) continue;

    let bestMae = Number.POSITIVE_INFINITY;
    let bestKernel = 'lanczos3';
    for (const kernel of ['lanczos3', 'cubic', 'nearest'] as const) {
      const resized = await sharp(path)
        .resize(targetMeta.width, targetMeta.height, { fit: 'fill', kernel })
        .removeAlpha()
        .raw()
        .toBuffer();
      const stride = 97;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < target.length; i += stride) {
        sum += Math.abs(target[i] - resized[i]);
        count++;
      }
      const mae = sum / count;
      if (mae < bestMae) {
        bestMae = mae;
        bestKernel = kernel;
      }
    }
    candidates.push({
      path: relative(repoRoot, path),
      width: metadata.width,
      height: metadata.height,
      ratioDelta,
      sampledMae: Number(bestMae.toFixed(3)),
      kernel: bestKernel,
    });
  }
}

candidates.sort((a, b) => a.sampledMae - b.sampledMae);
console.log('MAP_SOURCE_DIMENSION_CANDIDATES ' + JSON.stringify(candidates.slice(0, 20)));
console.log('MAP_SOURCE_EXACT_DIMENSION_MATCHES ' + JSON.stringify(
  candidates.filter(candidate => candidate.width === 1652 && candidate.height === 952),
));
