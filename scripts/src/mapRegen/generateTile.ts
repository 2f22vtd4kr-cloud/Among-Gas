// Generates one detail-enhanced map tile via OpenAI's gpt-image-1 image-edit
// endpoint (image-to-image, not blind text-to-image) and saves it to WORK_DIR.
//
// Usage: tsx src/mapRegen/generateTile.ts <tileIndex>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import OpenAI, { toFile } from 'openai';
import { buildTileGrid, buildPrompt, SOURCE_WEBP, WORK_DIR, type TileSpec } from './config';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set.');
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function pickSize(w: number, h: number): '1024x1024' | '1536x1024' | '1024x1536' {
  const ratio = w / h;
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 1 / 1.2) return '1024x1536';
  return '1024x1024';
}

export async function generateTile(tile: TileSpec): Promise<string> {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const cropPath = path.join(WORK_DIR, `tile-${tile.index}-crop.png`);
  const outPath = path.join(WORK_DIR, `tile-${tile.index}-out.png`);

  await sharp(SOURCE_WEBP)
    .extract({ left: tile.crop.x, top: tile.crop.y, width: tile.crop.w, height: tile.crop.h })
    .png()
    .toFile(cropPath);

  const size = pickSize(tile.crop.w, tile.crop.h);
  const prompt = buildPrompt(tile);

  const response = await openai.images.edit({
    model: 'gpt-image-1',
    image: await toFile(fs.createReadStream(cropPath), 'crop.png', { type: 'image/png' }),
    prompt,
    size,
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Tile ${tile.index}: no image data in response`);
  const rawOutPath = path.join(WORK_DIR, `tile-${tile.index}-raw.png`);
  fs.writeFileSync(rawOutPath, Buffer.from(b64, 'base64'));

  // Force back to the exact crop pixel size so the stitch step's math holds,
  // regardless of which fixed enum size the model returned.
  await sharp(rawOutPath).resize(tile.crop.w, tile.crop.h, { fit: 'fill' }).png().toFile(outPath);

  return outPath;
}

async function main() {
  const idxArg = process.argv[2];
  if (idxArg === undefined) {
    console.error('Usage: tsx src/mapRegen/generateTile.ts <tileIndex>');
    process.exit(1);
  }
  const tiles = buildTileGrid();
  const idx = Number(idxArg);
  const tile = tiles[idx];
  if (!tile) throw new Error(`No tile at index ${idx} (grid has ${tiles.length} tiles)`);
  console.log(`Tile ${idx}: core=${JSON.stringify(tile.core)} crop=${JSON.stringify(tile.crop)}`);
  console.log(`Prompt: ${buildPrompt(tile)}`);
  const outPath = await generateTile(tile);
  console.log(`Saved: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
