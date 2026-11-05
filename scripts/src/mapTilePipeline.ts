import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

export const MAP_TILE_WORLD_W = 3224;
export const MAP_TILE_WORLD_H = 1858;
export const MAP_TILE_SCALE = 2;
export const MAP_TILE_TEX_W = MAP_TILE_WORLD_W * MAP_TILE_SCALE;
export const MAP_TILE_TEX_H = MAP_TILE_WORLD_H * MAP_TILE_SCALE;
export const MAP_TILE_PX = 1024;
export const MAP_TILE_COLS = Math.ceil(MAP_TILE_TEX_W / MAP_TILE_PX);
export const MAP_TILE_ROWS = Math.ceil(MAP_TILE_TEX_H / MAP_TILE_PX);
export const MAP_TILE_PIPELINE_VERSION = 1;

export interface MapTileMeta {
  file: string;
  row: number;
  col: number;
  tex: [number, number, number, number];
  world: [number, number, number, number];
}

export interface MapTileManifest {
  version: 1;
  pipelineVersion: number;
  sourceSha256: string;
  sharpenSigma: number;
  worldW: number;
  worldH: number;
  scale: number;
  texW: number;
  texH: number;
  tilePx: number;
  cols: number;
  rows: number;
  format: "webp";
  tiles: MapTileMeta[];
}

export async function sha256File(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function generateMapMaster(
  sourcePath: string,
  sigma: number,
  outputPath: string,
): Promise<void> {
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Map source dimensions are unavailable");
  const sourceScaleX = metadata.width / MAP_TILE_WORLD_W;
  const sourceScaleY = metadata.height / MAP_TILE_WORLD_H;
  if (Math.abs(sourceScaleX - sourceScaleY) > 0.002) {
    throw new Error(`Map source aspect ratio mismatch: ${metadata.width}×${metadata.height}`);
  }
  let pipeline = sharp(sourcePath)
    .removeAlpha()
    .resize(MAP_TILE_TEX_W, MAP_TILE_TEX_H, { fit: "fill", kernel: "lanczos3" });
  // Sigma zero is the faithful baseline: resampling only, no edge invention.
  if (sigma > 0) pipeline = pipeline.sharpen({ sigma });
  await pipeline.png({ compressionLevel: 1 }).toFile(outputPath);
}

export async function writeMapTileSet(
  masterPath: string,
  outputDir: string,
  sourceSha256: string,
  sharpenSigma: number,
): Promise<MapTileManifest> {
  const stagingDir = outputDir + ".staging-" + process.pid;
  const backupDir = outputDir + ".backup-" + process.pid;
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });
  const tiles: MapTileMeta[] = [];

  try {
    for (let row = 0; row < MAP_TILE_ROWS; row++) {
      for (let col = 0; col < MAP_TILE_COLS; col++) {
        const x = col * MAP_TILE_PX;
        const y = row * MAP_TILE_PX;
        const width = Math.min(MAP_TILE_PX, MAP_TILE_TEX_W - x);
        const height = Math.min(MAP_TILE_PX, MAP_TILE_TEX_H - y);
        const file = "tile_r" + row + "_c" + col + ".webp";
        await sharp(masterPath)
          .extract({ left: x, top: y, width, height })
          .webp({ quality: 90, effort: 6 })
          .toFile(path.join(stagingDir, file));
        tiles.push({
          file, row, col,
          tex: [x, y, width, height],
          world: [x / MAP_TILE_SCALE, y / MAP_TILE_SCALE, width / MAP_TILE_SCALE, height / MAP_TILE_SCALE],
        });
      }
    }

    const manifest: MapTileManifest = {
      version: 1, pipelineVersion: MAP_TILE_PIPELINE_VERSION, sourceSha256, sharpenSigma,
      worldW: MAP_TILE_WORLD_W, worldH: MAP_TILE_WORLD_H, scale: MAP_TILE_SCALE,
      texW: MAP_TILE_TEX_W, texH: MAP_TILE_TEX_H, tilePx: MAP_TILE_PX,
      cols: MAP_TILE_COLS, rows: MAP_TILE_ROWS, format: "webp", tiles,
    };
    await fs.writeFile(path.join(stagingDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    let movedExisting = false;
    try {
      await fs.rename(outputDir, backupDir);
      movedExisting = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(stagingDir, outputDir);
    } catch (error) {
      if (movedExisting) await fs.rename(backupDir, outputDir);
      throw error;
    }
    if (movedExisting) await fs.rm(backupDir, { recursive: true, force: true });
    return manifest;
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}
export async function tileSetIsCurrent(outputDir: string, sourceSha256: string, sharpenSigma: number): Promise<boolean> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8")) as MapTileManifest;
    if (manifest.pipelineVersion !== MAP_TILE_PIPELINE_VERSION ||
        manifest.sourceSha256 !== sourceSha256 ||
        manifest.sharpenSigma !== sharpenSigma ||
        manifest.worldW !== MAP_TILE_WORLD_W ||
        manifest.worldH !== MAP_TILE_WORLD_H ||
        manifest.scale !== MAP_TILE_SCALE ||
        manifest.texW !== MAP_TILE_TEX_W ||
        manifest.texH !== MAP_TILE_TEX_H ||
        manifest.tiles.length !== MAP_TILE_COLS * MAP_TILE_ROWS) return false;
    for (let index = 0; index < manifest.tiles.length; index++) {
      const tile = manifest.tiles[index];
      const row = Math.floor(index / MAP_TILE_COLS);
      const col = index % MAP_TILE_COLS;
      const x = col * MAP_TILE_PX;
      const y = row * MAP_TILE_PX;
      const width = Math.min(MAP_TILE_PX, MAP_TILE_TEX_W - x);
      const height = Math.min(MAP_TILE_PX, MAP_TILE_TEX_H - y);
      if (tile.row !== row || tile.col !== col ||
          tile.tex.join(",") !== [x, y, width, height].join(",") ||
          tile.world.join(",") !== [x / MAP_TILE_SCALE, y / MAP_TILE_SCALE, width / MAP_TILE_SCALE, height / MAP_TILE_SCALE].join(",")) return false;
      const metadata = await sharp(path.join(outputDir, tile.file)).metadata();
      if (metadata.width !== width || metadata.height !== height) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function meanAbsoluteError(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}
