import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  CHARACTER_CELL_WIDTH,
  CHARACTER_COLORS,
  CHARACTER_SHEET_HEIGHT,
  CHARACTER_SHEET_WIDTH,
  CHARACTER_SOURCE_SHEET_COLS,
  CHARACTER_SOURCE_SHEET_WIDTH,
  GENERATED_CHARACTER_PALETTES,
  recolorSuitPixel,
} from "@workspace/shared";

const root = path.resolve(import.meta.dirname, "../..");
const publicDir = path.join(root, "artifacts/telegram-game/public");
const sourcePath = path.join(publicDir, "sprites/characters.png");
const outputPath = path.join(publicDir, "sprites/characters-18.png");

const sourceMetadata = await sharp(sourcePath).metadata();
if (sourceMetadata.width !== CHARACTER_SOURCE_SHEET_WIDTH ||
    sourceMetadata.height !== CHARACTER_SHEET_HEIGHT) {
  throw new Error(
    `Unexpected character source dimensions: ${sourceMetadata.width}×${sourceMetadata.height}`,
  );
}

const sourceCellWidth = CHARACTER_SOURCE_SHEET_WIDTH / CHARACTER_SOURCE_SHEET_COLS;
const paletteByColor = new Map(GENERATED_CHARACTER_PALETTES.map(palette => [palette.color, palette]));
const atlas = Buffer.alloc(CHARACTER_SHEET_WIDTH * CHARACTER_SHEET_HEIGHT * 4);

for (let column = 0; column < CHARACTER_COLORS.length; column++) {
  const color = CHARACTER_COLORS[column];
  const sourceColumn = column < CHARACTER_SOURCE_SHEET_COLS ? column : 0;
  const sourceLeft = Math.ceil(sourceColumn * sourceCellWidth);
  const sourceRight = Math.floor((sourceColumn + 1) * sourceCellWidth);
  const sourceColumnWidth = sourceRight - sourceLeft;
  if (sourceColumnWidth <= 0) throw new Error(`Invalid source column ${sourceColumn}`);

  const { data: sourceData, info } = await sharp(sourcePath)
    .extract({ left: sourceLeft, top: 0, width: sourceColumnWidth, height: CHARACTER_SHEET_HEIGHT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== sourceColumnWidth || info.height !== CHARACTER_SHEET_HEIGHT || info.channels !== 4) {
    throw new Error(`Unexpected source ${color} column shape: ${info.width}×${info.height}×${info.channels}`);
  }

  // Match Canvas drawImage(..., imageSmoothingEnabled=false): sample the
  // nearest source pixel at each destination pixel centre. Sharp's resize
  // kernel uses a different phase for this 159/160→161 mapping, which made
  // the pre-baked PNG differ from the legacy runtime renderer.
  const columnData = Buffer.alloc(CHARACTER_CELL_WIDTH * CHARACTER_SHEET_HEIGHT * 4);
  for (let row = 0; row < CHARACTER_SHEET_HEIGHT; row++) {
    for (let x = 0; x < CHARACTER_CELL_WIDTH; x++) {
      const sourceX = Math.min(
        sourceColumnWidth - 1,
        Math.floor((x + 0.5) * sourceColumnWidth / CHARACTER_CELL_WIDTH),
      );
      const sourceOffset = (row * sourceColumnWidth + sourceX) * 4;
      const targetOffset = (row * CHARACTER_CELL_WIDTH + x) * 4;
      sourceData.copy(columnData, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }

  const palette = paletteByColor.get(color);
  if (palette) {
    for (let offset = 0; offset < columnData.length; offset += 4) {
      const [red, green, blue, alpha] = recolorSuitPixel(
        columnData[offset], columnData[offset + 1], columnData[offset + 2], columnData[offset + 3], palette,
      );
      columnData[offset] = red;
      columnData[offset + 1] = green;
      columnData[offset + 2] = blue;
      columnData[offset + 3] = alpha;
    }
  }

  const columnBytes = CHARACTER_CELL_WIDTH * 4;
  for (let row = 0; row < CHARACTER_SHEET_HEIGHT; row++) {
    const sourceOffset = row * columnBytes;
    const targetOffset = (row * CHARACTER_SHEET_WIDTH + column * CHARACTER_CELL_WIDTH) * 4;
    columnData.copy(atlas, targetOffset, sourceOffset, sourceOffset + columnBytes);
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(atlas, {
  raw: {
    width: CHARACTER_SHEET_WIDTH,
    height: CHARACTER_SHEET_HEIGHT,
    channels: 4,
  },
}).png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(outputPath);

console.log(
  `Baked 18×9 character atlas ${CHARACTER_SHEET_WIDTH}×${CHARACTER_SHEET_HEIGHT} from ${path.relative(root, sourcePath)} → ${path.relative(root, outputPath)}`,
);
