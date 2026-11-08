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
    const corpseRowPixelCounts = [];
    const corpseRowSignatures = [];
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

      // The authored dead-body row starts at source y=1067 and is 93px tall.
      // Validate the generated palette columns too, not only the seven source colors.
      const corpsePixels = context.getImageData(column * cellWidth, 1067, cellWidth, 93).data;
      let corpseOpaque = 0;
      let corpseSignature = 2166136261;
      for (let offset = 0; offset < corpsePixels.length; offset++) {
        const value = corpsePixels[offset];
        if (offset % 4 === 3 && value > 0) corpseOpaque++;
        corpseSignature = Math.imul(corpseSignature ^ value, 16777619);
      }
      corpseRowPixelCounts.push(corpseOpaque);
      corpseRowSignatures.push(corpseSignature >>> 0);
    }
    return {
      width: atlas.width,
      height: atlas.height,
      cellWidth,
      columns: atlas.width / cellWidth,
      nonEmptyColumns: columnPixelCounts.filter(count => count > 0).length,
      distinctColumns: new Set(columnSignatures).size,
      corpseRowNonEmptyColumns: corpseRowPixelCounts.filter(count => count > 100).length,
      corpseRowDistinctColumns: new Set(corpseRowSignatures).size,
      elapsedMs: Math.round(performance.now() - window.__AG_ATLAS_LOAD_STARTED_AT),
    };
  });

  assert.equal(metrics.width, 2898, 'runtime atlas width must be 18 × 161px');
  assert.equal(metrics.height, 1401, 'runtime atlas must preserve the authored source height');
  assert.equal(metrics.columns, 18, 'runtime canvas must contain eighteen palette columns');
  assert.equal(metrics.nonEmptyColumns, 18, 'every runtime palette column must contain rendered sprite pixels');
  assert.equal(metrics.distinctColumns, 18, 'every runtime palette column must render distinct pixel colors, not a duplicate teal column');
  assert.equal(metrics.corpseRowNonEmptyColumns, 18,
    'all eighteen generated colors must retain the authored corpse and exposed-bone row');
  assert.equal(metrics.corpseRowDistinctColumns, 18,
    'the corpse row must be recolored for all eighteen palette columns, not only the seven source colors');
  // Inspect every generated color/pose pair, not only the palette columns and
  // corpse row. The contact sheet is a review artifact, not an auto-approval.
  const poseWindows = [
    { name: 'idle', top: 0, bottom: 136 },
    { name: 'walk-1', top: 172, bottom: 310 },
    { name: 'walk-2', top: 327, bottom: 458 },
    { name: 'run-lean', top: 471, bottom: 611 },
    { name: 'ghost', top: 636, bottom: 770 },
    { name: 'mask', top: 795, bottom: 896 },
    { name: 'hold-item', top: 915, bottom: 1041 },
    { name: 'dead-body', top: 1067, bottom: 1160 },
    { name: 'sit-crouch', top: 1198, bottom: 1326 },
  ];
  const colorNames = [
    'teal', 'maroon', 'navy', 'purple', 'brown', 'dark-gray', 'magenta',
    'red', 'blue', 'green', 'pink', 'orange', 'yellow', 'black', 'white',
    'lime', 'cyan', 'rose',
  ];
  const frameMetrics = await page.evaluate(({ poseWindows, colorNames }) => {
    const atlas = window.__AG_CHARACTER_ATLAS;
    if (!atlas) throw new Error('Runtime character atlas disappeared before pose QA');
    const context = atlas.getContext('2d');
    if (!context) throw new Error('Runtime character atlas has no readable context');
    const cellWidth = 161;
    const result = [];
    for (const pose of poseWindows) {
      const signatures = [];
      for (let column = 0; column < 18; column++) {
        const pixels = context.getImageData(column * cellWidth, pose.top, cellWidth, pose.bottom - pose.top).data;
        let opaque = 0;
        let signature = 2166136261;
        for (let offset = 0; offset < pixels.length; offset++) {
          const value = pixels[offset];
          if (offset % 4 === 3 && value > 0) opaque++;
          signature = Math.imul(signature ^ value, 16777619);
        }
        if (opaque <= 100) throw new Error(colorNames[column] + '/' + pose.name + ' must contain a visible sprite');
        signatures.push(signature >>> 0);
      }
      if (new Set(signatures).size !== 18) throw new Error(pose.name + ': all 18 palette frames must remain visually distinct');
      result.push({ pose: pose.name, colors: signatures.length, nonEmpty: signatures.length });
    }
    return result;
  }, { poseWindows, colorNames });
  assert.equal(frameMetrics.length, 9);
  assert.equal(frameMetrics.reduce((sum, item) => sum + item.colors, 0), 162,
    'all 18 palettes × 9 poses must be inspected');

  await page.evaluate(({ poseWindows, colorNames }) => {
    const atlas = window.__AG_CHARACTER_ATLAS;
    const panel = document.createElement('div');
    panel.id = 'character-atlas-contact-sheet';
    Object.assign(panel.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', overflow: 'auto',
      background: '#17212b', padding: '12px', boxSizing: 'border-box',
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1292;
    canvas.height = 696;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot create character contact sheet');
    context.fillStyle = '#17212b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '10px sans-serif';
    context.fillStyle = '#dbe5eb';
    context.fillText('18 palettes × 9 poses — generated runtime atlas review', 8, 14);
    const left = 136;
    const top = 32;
    const cellW = 64;
    const cellH = 72;
    colorNames.forEach((name, column) => {
      context.save();
      context.translate(left + column * cellW + cellW / 2, top - 2);
      context.rotate(-Math.PI / 3);
      context.textAlign = 'left';
      context.fillStyle = '#c8d6df';
      context.fillText(name, 0, 0);
      context.restore();
    });
    poseWindows.forEach((pose, row) => {
      const y = top + row * cellH;
      context.fillStyle = '#dbe5eb';
      context.textAlign = 'right';
      context.fillText(pose.name, left - 8, y + 38);
      for (let column = 0; column < 18; column++) {
        const sx = column * 161;
        const sh = pose.bottom - pose.top;
        const scale = Math.min(54 / 161, 56 / sh);
        const dw = 161 * scale;
        const dh = sh * scale;
        const dx = left + column * cellW + (cellW - dw) / 2;
        const dy = y + 6 + (56 - dh) / 2;
        context.fillStyle = 'rgba(255,255,255,0.045)';
        context.fillRect(left + column * cellW + 1, y + 1, cellW - 2, cellH - 2);
        context.drawImage(atlas, sx, pose.top, 161, sh, dx, dy, dw, dh);
      }
    });
    panel.appendChild(canvas);
    document.body.appendChild(panel);
  }, { poseWindows, colorNames });
  await page.locator('#character-atlas-contact-sheet').screenshot({
    path: (process.env.VISUAL_QA_DIR ?? '.') + '/character-atlas-18x9-contact-sheet.png',
  });
  console.log('18×9 character pose QA passed:', JSON.stringify(frameMetrics));
  console.log('Runtime character atlas browser contract passed:', JSON.stringify(metrics));
} finally {
  await browser.close();
}
