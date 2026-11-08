import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

  const sourceAssetPath = 'artifacts/telegram-game/public/sprites/characters.png';
  const sourceAsset = readFileSync(sourceAssetPath);
  const sourceAssetGitBlobSha = createHash('sha1')
    .update(`blob ${sourceAsset.length}\0`)
    .update(sourceAsset)
    .digest('hex');
  assert.equal(sourceAssetGitBlobSha, '5e2562defd86b956d6a75dc1136c8298443f93c4',
    'character source art changed: review the new authored asset before updating its golden baseline');

  const poseWindows = [
    { pose: 'idle', top: 0, bottom: 136 },
    { pose: 'walk-1', top: 172, bottom: 310 },
    { pose: 'walk-2', top: 327, bottom: 458 },
    { pose: 'run-lean', top: 471, bottom: 611 },
    { pose: 'ghost', top: 636, bottom: 770 },
    { pose: 'mask', top: 795, bottom: 896 },
    { pose: 'hold-item', top: 915, bottom: 1041 },
    { pose: 'dead-body', top: 1067, bottom: 1160 },
    { pose: 'sit-crouch', top: 1198, bottom: 1326 },
  ];
  const metrics = await page.evaluate(async ({ poseWindows, sourceAssetGitBlobSha }) => {
    const atlas = window.__AG_CHARACTER_ATLAS;
    if (!atlas) throw new Error('Runtime character atlas was not exposed in the development build');
    const context = atlas.getContext('2d');
    if (!context) throw new Error('Runtime character atlas has no readable 2D context');
    const cellWidth = 161;
    const colors = [
      'teal', 'maroon', 'navy', 'purple', 'brown', 'dark-gray', 'magenta', 'red', 'blue',
      'green', 'pink', 'orange', 'yellow', 'black', 'white', 'lime', 'cyan', 'rose',
    ];
    const frames = [];
    const matrix = document.createElement('canvas');
    const cellW = 84;
    const cellH = 72;
    matrix.width = colors.length * cellW;
    matrix.height = poseWindows.length * cellH;
    const matrixContext = matrix.getContext('2d');
    if (!matrixContext) throw new Error('Could not allocate character golden matrix');
    matrixContext.fillStyle = '#202a35';
    matrixContext.fillRect(0, 0, matrix.width, matrix.height);
    matrixContext.imageSmoothingEnabled = false;

    for (let row = 0; row < poseWindows.length; row++) {
      const pose = poseWindows[row];
      for (let column = 0; column < colors.length; column++) {
        const x = column * cellWidth;
        const height = pose.bottom - pose.top;
        const pixels = context.getImageData(x, pose.top, cellWidth, height).data;
        let opaquePixels = 0;
        let minX = cellWidth;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] === 0) continue;
          opaquePixels++;
          const pixel = offset / 4;
          const px = pixel % cellWidth;
          const py = Math.floor(pixel / cellWidth);
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        const digest = await crypto.subtle.digest('SHA-256', pixels);
        const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
        frames.push({
          color: colors[column],
          pose: pose.pose,
          hash,
          opaquePixels,
          alphaBounds: opaquePixels > 0 ? { minX, minY, maxX, maxY } : null,
        });

        // Render a compact 18-colour × 9-pose visual reference without resampling the atlas.
        const scale = Math.min((cellW - 10) / cellWidth, (cellH - 10) / height);
        const drawWidth = Math.max(1, Math.round(cellWidth * scale));
        const drawHeight = Math.max(1, Math.round(height * scale));
        const dx = column * cellW + Math.round((cellW - drawWidth) / 2);
        const dy = row * cellH + Math.round((cellH - drawHeight) / 2);
        matrixContext.drawImage(atlas, x, pose.top, cellWidth, height, dx, dy, drawWidth, drawHeight);
      }
    }
    const alphaHashesByPose = poseWindows.map(pose => {
      const source = frames.find(frame => frame.color === 'teal' && frame.pose === pose.pose);
      return { pose: pose.pose, hash: source?.alphaBounds ? source.hash : null };
    });
    return {
      width: atlas.width,
      height: atlas.height,
      cellWidth,
      columns: atlas.width / cellWidth,
      sourceAssetGitBlobSha,
      poseWindows,
      frames,
      matrixDataUrl: matrix.toDataURL('image/png'),
      alphaHashesByPose,
    };
  }, { poseWindows, sourceAssetGitBlobSha });

  assert.equal(metrics.width, 2898, 'runtime atlas width must be 18 × 161px');
  assert.equal(metrics.height, 1401, 'runtime atlas must preserve the authored source height');
  assert.equal(metrics.columns, 18, 'runtime canvas must contain eighteen palette columns');
  assert.equal(metrics.frames.length, 18 * poseWindows.length, 'all 162 palette/pose cells must be sampled');
  for (const pose of poseWindows) {
    const poseFrames = metrics.frames.filter(frame => frame.pose === pose.pose);
    assert.equal(poseFrames.length, 18, `${pose.pose}: all eighteen colors must be captured`);
    assert.ok(poseFrames.every(frame => frame.opaquePixels > 50),
      `${pose.pose}: every color/pose crop must contain real sprite pixels`);
    assert.equal(new Set(poseFrames.map(frame => frame.hash)).size, 18,
      `${pose.pose}: all eighteen palette renders must remain visually distinct`);
  }
  for (const color of ['teal', 'red', 'blue', 'green', 'pink', 'orange', 'yellow', 'black', 'white', 'lime', 'cyan', 'rose']) {
    const colorFrames = metrics.frames.filter(frame => frame.color === color);
    assert.equal(new Set(colorFrames.map(frame => frame.pose)).size, 9,
      `${color}: all nine animation and kill poses must remain distinct`);
  }

  const corpseFrames = metrics.frames.filter(frame => frame.pose === 'dead-body');
  assert.equal(corpseFrames.length, 18);
  assert.ok(corpseFrames.every(frame => frame.opaquePixels > 100),
    'all eighteen generated colors must retain the authored corpse and exposed-bone row');

  const visualQaDir = process.env.VISUAL_QA_DIR;
  if (visualQaDir) {
    mkdirSync(visualQaDir, { recursive: true });
    const matrixBase64 = metrics.matrixDataUrl.slice('data:image/png;base64,'.length);
    writeFileSync(join(visualQaDir, 'character-atlas-golden-matrix.png'), Buffer.from(matrixBase64, 'base64'));
    const manifest = {
      sourceAssetGitBlobSha,
      width: metrics.width,
      height: metrics.height,
      cellWidth: metrics.cellWidth,
      colors: [
        'teal', 'maroon', 'navy', 'purple', 'brown', 'dark-gray', 'magenta', 'red', 'blue',
        'green', 'pink', 'orange', 'yellow', 'black', 'white', 'lime', 'cyan', 'rose',
      ],
      poseWindows,
      frames: metrics.frames.map(({ color, pose, hash, opaquePixels, alphaBounds }) => ({
        color, pose, hash, opaquePixels, alphaBounds,
      })),
    };
    writeFileSync(join(visualQaDir, 'character-atlas-frame-metrics.json'), JSON.stringify(manifest, null, 2) + '\\n');
  }

  console.log('Runtime character atlas frame matrix passed:', JSON.stringify({
    width: metrics.width,
    height: metrics.height,
    sourceAssetGitBlobSha,
    frameCount: metrics.frames.length,
    poseCount: poseWindows.length,
    colorCount: metrics.columns,
    frames: metrics.frames,
  }));
} finally {
  await browser.close();
}
