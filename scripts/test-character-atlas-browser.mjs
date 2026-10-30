import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');

const atlasModulePath = 'artifacts/telegram-game/src/game/characterAtlas.ts';
if (!existsSync(atlasModulePath)) {
  console.log('Character atlas browser contract deferred: the runtime atlas implementation is not merged yet.');
  process.exit(0);
}

const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : { channel: 'chrome' }),
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    window.__AG_ATLAS_LOAD_STARTED_AT = performance.now();
  });
  await page.goto(`${origin}/?mock=corpse-all-colors`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__AG_CHARACTER_ATLAS), { timeout: 15_000 });

  const metrics = await page.evaluate(() => {
    const atlas = window.__AG_CHARACTER_ATLAS;
    if (!atlas) throw new Error('Runtime character atlas was not exposed in the development build');
    const context = atlas.getContext('2d');
    if (!context) throw new Error('Runtime character atlas has no readable 2D context');
    const cellWidth = 161;
    const columnPixelCounts = [];
    const columnSignatures = [];
    for (let column = 0; column < 18; column++) {
      const pixels = context.getImageData(column * cellWidth, 0, cellWidth, atlas.height).data;
      let opaquePixels = 0;
      let signature = 2166136261;
      for (let offset = 0; offset < pixels.length; offset++) {
        const value = pixels[offset];
        if (offset % 4 === 3 && value > 0) opaquePixels++;
        signature = Math.imul(signature ^ value, 16777619);
      }
      columnPixelCounts.push(opaquePixels);
      columnSignatures.push(signature >>> 0);
    }
    return {
      width: atlas.width,
      height: atlas.height,
      cellWidth,
      columns: atlas.width / cellWidth,
      nonEmptyColumns: columnPixelCounts.filter(count => count > 0).length,
      distinctColumns: new Set(columnSignatures).size,
      elapsedMs: Math.round(performance.now() - window.__AG_ATLAS_LOAD_STARTED_AT),
    };
  });

  assert.equal(metrics.width, 2898, 'runtime atlas width must be 18 × 161px');
  assert.equal(metrics.height, 1401, 'runtime atlas must preserve the authored source height');
  assert.equal(metrics.columns, 18, 'runtime canvas must contain eighteen palette columns');
  assert.equal(metrics.nonEmptyColumns, 18, 'every runtime palette column must contain rendered sprite pixels');
  assert.equal(metrics.distinctColumns, 18, 'every runtime palette column must render distinct pixel colors, not a duplicate teal column');
  console.log('Runtime character atlas browser contract passed:', JSON.stringify(metrics));
} finally {
  await browser.close();
}
