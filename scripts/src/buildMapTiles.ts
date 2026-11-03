import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  generateMapMaster,
  sha256File,
  tileSetIsCurrent,
  writeMapTileSet,
} from "./mapTilePipeline.js";

const root = path.resolve(import.meta.dirname, "../..");
const publicDir = path.join(root, "artifacts/telegram-game/public");
const sourcePath = path.join(publicDir, "map-hires.webp");
const baselineDir = path.join(publicDir, "map-tiles");
const sharpenedDir = path.join(publicDir, "map-tiles-sharp");
const overviewPath = path.join(publicDir, "map-overview.webp");
const overviewManifestPath = path.join(publicDir, "map-overview.manifest.json");
const BASELINE_SIGMA = 0;
const SHARPENED_SIGMA = 2.2;

const sourceSha256 = await sha256File(sourcePath);
const [baselineCurrent, sharpenedCurrent, overviewCurrent] = await Promise.all([
  tileSetIsCurrent(baselineDir, sourceSha256, BASELINE_SIGMA),
  tileSetIsCurrent(sharpenedDir, sourceSha256, SHARPENED_SIGMA),
  fs.readFile(overviewManifestPath, "utf8").then(async raw => {
    const manifest = JSON.parse(raw) as { sourceSha256?: string; overviewSha256?: string; width?: number; height?: number };
    const overview = await sharp(overviewPath).metadata();
    const overviewSha256 = await sha256File(overviewPath);
    return manifest.sourceSha256 === sourceSha256 && manifest.overviewSha256 === overviewSha256 &&
      manifest.width === 1612 && manifest.height === 929 &&
      overview.width === 1612 && overview.height === 929;
  }).catch(() => false),
]);

if (baselineCurrent && sharpenedCurrent && overviewCurrent) {
  console.log("map tiles are current; exact 2× manifests and 56 WebP tiles verified");
} else {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "among-gas-map-tiles-"));
  const baselineMaster = path.join(tempDir, "baseline-master.png");
  const sharpenedMaster = path.join(tempDir, "sharpened-master.png");
  try {
    await generateMapMaster(sourcePath, BASELINE_SIGMA, baselineMaster);
    await generateMapMaster(sourcePath, SHARPENED_SIGMA, sharpenedMaster);
    if (!baselineCurrent) {
      const manifest = await writeMapTileSet(baselineMaster, baselineDir, sourceSha256, BASELINE_SIGMA);
      console.log(`baseline map tiles generated: ${manifest.tiles.length}`);
    }
    if (!sharpenedCurrent) {
      const manifest = await writeMapTileSet(sharpenedMaster, sharpenedDir, sourceSha256, SHARPENED_SIGMA);
      console.log(`optional sharpened map tiles generated: ${manifest.tiles.length}`);
    }
    if (!overviewCurrent) {
      await sharp(baselineMaster)
        .resize(1612, 929, { fit: "fill", kernel: "lanczos3" })
        .webp({ quality: 82, effort: 6 })
        .toFile(overviewPath);
      const overviewSha256 = await sha256File(overviewPath);
      await fs.writeFile(overviewManifestPath, JSON.stringify({
        sourceSha256, overviewSha256, width: 1612, height: 929, scale: 0.5,
      }, null, 2) + "\n");
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
