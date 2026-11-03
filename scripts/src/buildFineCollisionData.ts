import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = path.join(ROOT, 'attached_assets/IMG_2907_1783632830477.jpeg');
const TARGET = path.join(ROOT, 'lib/shared/src/collisionDataFine.ts');
const COLS = 680;
const ROWS = 392;

function encodeVarint(value: number): number[] { const bytes: number[] = []; do { const low = value % 128; value = Math.floor(value / 128); bytes.push(low | (value ? 0x80 : 0)); } while (value); return bytes; }
function toBase64(bytes: number[]): string { return Buffer.from(bytes).toString('base64').replace(/=+$/,''); }
function isRed(r:number,g:number,b:number):boolean { return r>110 && r-g>28 && r-b>28 && g<170 && b<170; }

async function main(): Promise<void> {
  const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 1359 || info.height !== 784) throw new Error(`Unexpected reference size ${info.width}×${info.height}`);
  const runs: number[] = []; let value = 0, run = 0;
  const blocked = (x: number, y: number): number => {
    const x0 = Math.floor(x * info.width / COLS), x1 = Math.max(x0 + 1, Math.floor((x + 1) * info.width / COLS));
    const y0 = Math.floor(y * info.height / ROWS), y1 = Math.max(y0 + 1, Math.floor((y + 1) * info.height / ROWS));
    for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) { const i=(sy*info.width+sx)*3; if(isRed(data[i],data[i+1],data[i+2])) return 1; }
    return 0;
  };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const next=blocked(x,y); if(next===value)run++; else {runs.push(run);value=next;run=1;} }
  runs.push(run); const bytes:number[]=[]; for(const length of runs)bytes.push(...encodeVarint(length));
  const output=`/** Generated from the canonical source red-line reference by buildFineCollisionData.ts. */\nexport const FINE_COLS=${COLS};\nexport const FINE_ROWS=${ROWS};\nexport const FINE_RLE_BASE64=${JSON.stringify(toBase64(bytes))};\n`;
  fs.writeFileSync(TARGET, output); console.log(`collision: generated ${COLS}×${ROWS} fine compatibility raster (${runs.length} runs)`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
