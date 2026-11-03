import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  MAP_TILE_COLS,
  MAP_TILE_PX,
  MAP_TILE_ROWS,
  MAP_TILE_SCALE,
  MAP_TILE_TEX_H,
  MAP_TILE_TEX_W,
  MAP_TILE_WORLD_H,
  MAP_TILE_WORLD_W,
  generateMapMaster,
  meanAbsoluteError,
  sha256File,
  type MapTileManifest,
} from "./mapTilePipeline.js";

const root = path.resolve(import.meta.dirname, "../..");
const publicDir = path.join(root, "artifacts/telegram-game/public");
const sourcePath = path.join(publicDir, "map-hires.webp");
const sourceSha256 = await sha256File(sourcePath);
const variants = [
  { name: "baseline", dir: path.join(publicDir, "map-tiles"), sigma: 1.2 },
  { name: "sharpened", dir: path.join(publicDir, "map-tiles-sharp"), sigma: 2.2 },
] as const;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "among-gas-map-tile-qa-"));
const MAX_TILE_MAE = 4.5;
const MAX_EDGE_MAE = 5.5;

function accepted(candidate: Uint8Array, reference: Uint8Array): boolean {
  return meanAbsoluteError(candidate, reference) <= MAX_TILE_MAE;
}

function shifted(source: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fromX = Math.min(width - 1, x + 1);
      for (let c = 0; c < 3; c++) out[(y * width + x) * 3 + c] = source[(y * width + fromX) * 3 + c];
    }
  }
  return out;
}

function recolored(source: Buffer): Buffer {
  const out = Buffer.from(source);
  for (let index = 0; index < out.length; index++) out[index] = Math.min(255, out[index] + 36);
  return out;
}

function seamDamaged(source: Buffer, width: number, height: number): Buffer {
  const out = Buffer.from(source);
  for (let y = 0; y < height; y++) {
    for (let x = Math.max(0, width - 4); x < width; x++) {
      for (let c = 0; c < 3; c++) out[(y * width + x) * 3 + c] = 0;
    }
  }
  return out;
}

function edgeStrip(data: Buffer, width: number, height: number, side: "left" | "right" | "top" | "bottom"): Buffer {
  const horizontal = side === "left" || side === "right";
  const out = Buffer.alloc((horizontal ? height : width) * 3);
  for (let i = 0; i < (horizontal ? height : width); i++) {
    const x = side === "left" ? 0 : side === "right" ? width - 1 : i;
    const y = side === "top" ? 0 : side === "bottom" ? height - 1 : i;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = data[(y * width + x) * 3 + c];
  }
  return out;
}

try {
  for (const variant of variants) {
    const manifestPath = path.join(variant.dir, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as MapTileManifest;
    assert.equal(manifest.sourceSha256, sourceSha256, `${variant.name}: source digest must match the live WebP master`);
    assert.equal(manifest.worldW, MAP_TILE_WORLD_W);
    assert.equal(manifest.worldH, MAP_TILE_WORLD_H);
    assert.equal(manifest.scale, MAP_TILE_SCALE, "texture scale must be exactly 2×");
    assert.equal(manifest.texW, MAP_TILE_TEX_W);
    assert.equal(manifest.texH, MAP_TILE_TEX_H);
    assert.equal(manifest.tilePx, MAP_TILE_PX);
    assert.equal(manifest.cols, MAP_TILE_COLS);
    assert.equal(manifest.rows, MAP_TILE_ROWS);
    assert.equal(manifest.tiles.length, MAP_TILE_COLS * MAP_TILE_ROWS, "tile manifest must cover the complete world");

    const masterPath = path.join(tempDir, `${variant.name}-master.png`);
    await generateMapMaster(sourcePath, variant.sigma, masterPath);
    let totalMae = 0;
    let worstEdgeMae = 0;

    for (let index = 0; index < manifest.tiles.length; index++) {
      const tile = manifest.tiles[index];
      const row = Math.floor(index / MAP_TILE_COLS);
      const col = index % MAP_TILE_COLS;
      const x = col * MAP_TILE_PX;
      const y = row * MAP_TILE_PX;
      const width = Math.min(MAP_TILE_PX, MAP_TILE_TEX_W - x);
      const height = Math.min(MAP_TILE_PX, MAP_TILE_TEX_H - y);
      assert.equal(tile.row, row);
      assert.equal(tile.col, col);
      assert.deepEqual(tile.tex, [x, y, width, height], `${variant.name}: tile ${tile.file} must not shift`);
      assert.deepEqual(tile.world, [x / MAP_TILE_SCALE, y / MAP_TILE_SCALE, width / MAP_TILE_SCALE, height / MAP_TILE_SCALE]);

      const tilePath = path.join(variant.dir, tile.file);
      const actual = await sharp(tilePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const expected = await sharp(masterPath).extract({ left: x, top: y, width, height }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(actual.info.width, width, `${variant.name}: ${tile.file} width`);
      assert.equal(actual.info.height, height, `${variant.name}: ${tile.file} height`);
      const mae = meanAbsoluteError(actual.data, expected.data);
      assert.ok(mae <= MAX_TILE_MAE, `${variant.name}: ${tile.file} drifted (MAE ${mae.toFixed(3)})`);
      totalMae += mae;

      for (const side of ["left", "right", "top", "bottom"] as const) {
        const actualEdge = edgeStrip(actual.data, width, height, side);
        const expectedEdge = edgeStrip(expected.data, width, height, side);
        const edgeMae = meanAbsoluteError(actualEdge, expectedEdge);
        worstEdgeMae = Math.max(worstEdgeMae, edgeMae);
        assert.ok(edgeMae <= MAX_EDGE_MAE, `${variant.name}: ${tile.file} ${side} edge drifted (MAE ${edgeMae.toFixed(3)})`);
      }
    }

    const meanTileMae = totalMae / manifest.tiles.length;
    assert.ok(meanTileMae <= MAX_TILE_MAE, `${variant.name}: mean tile drift exceeded the QA threshold`);
    console.log(`${variant.name}: ${manifest.tiles.length} tiles, mean MAE ${meanTileMae.toFixed(3)}, worst edge MAE ${worstEdgeMae.toFixed(3)}`);
  }

  // Exercise the checker itself: a faithful image passes; a one-pixel shift,
  // recolour and damaged tile seam all fail the same measurable fidelity gate.
  const synthetic = Buffer.alloc(32 * 32 * 3);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const value = (x + y) % 2 === 0 ? 240 : 12;
    const offset = (y * 32 + x) * 3;
    synthetic[offset] = value;
    synthetic[offset + 1] = 255 - value;
    synthetic[offset + 2] = (x % 4) * 60;
  }
  assert.equal(accepted(synthetic, synthetic), true, "faithful synthetic tile must pass");
  assert.equal(accepted(shifted(synthetic, 32, 32), synthetic), false, "one-pixel shift must fail");
  assert.equal(accepted(recolored(synthetic), synthetic), false, "recolour must fail");
  assert.equal(accepted(seamDamaged(synthetic, 32, 32), synthetic), false, "seam damage must fail");

  const overview = await sharp(path.join(publicDir, "map-overview.webp")).metadata();
  assert.equal(overview.width, 1612);
  assert.equal(overview.height, 929);
  console.log("MAP TILE QA PASSED: 2× world scale, full coverage, pixel fidelity, edge fidelity, shift/recolour/seam rejection");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
