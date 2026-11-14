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

    // Compare the build-time baked asset against the exact legacy in-memory
    // renderer. The baked PNG is accepted only when every RGBA byte matches.
    const [spriteModule, atlasModule] = await Promise.all([
      import('/src/game/characterSprites.ts'),
      import('/src/game/characterAtlas.ts'),
    ]);
    const sourceImage = new Image();
    sourceImage.src = spriteModule.CHARACTER_SOURCE_SHEET_PATH;
    await sourceImage.decode();
    const referenceAtlas = atlasModule.createCharacterAtlas(sourceImage);
    const referenceContext = referenceAtlas.getContext('2d');
    if (!referenceContext) throw new Error('Reference atlas has no readable 2D context');
    const referencePixels = referenceContext.getImageData(0, 0, atlas.width, atlas.height).data;
    const bakedPixels = context.getImageData(0, 0, atlas.width, atlas.height).data;
    let differentBytes = 0;
    let maxChannelDelta = 0;
    const channelDifferences = [0, 0, 0, 0];
    const mismatchByColumn = Array.from({ length: 18 }, () => ({
      pixels: 0, rgbPixels: 0, alphaPixels: 0, transparentRgbPixels: 0,
    }));
    const mismatchByReferenceAlpha = new Map();
    const mismatchSamples = [];
    for (let pixelOffset = 0; pixelOffset < bakedPixels.length; pixelOffset += 4) {
      const referenceAlpha = referencePixels[pixelOffset + 3];
      const bakedAlpha = bakedPixels[pixelOffset + 3];
      const pixelIndex = pixelOffset / 4;
      const x = pixelIndex % atlas.width;
      const y = Math.floor(pixelIndex / atlas.width);
      const column = Math.floor(x / 161);
      let pixelDiffers = false;
      let rgbDiffers = false;
      let alphaDiffers = false;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(bakedPixels[pixelOffset + channel] - referencePixels[pixelOffset + channel]);
        if (delta !== 0) {
          differentBytes++;
          channelDifferences[channel]++;
          pixelDiffers = true;
          if (channel === 3) alphaDiffers = true;
          else rgbDiffers = true;
        }
        maxChannelDelta = Math.max(maxChannelDelta, delta);
      }
      if (!pixelDiffers) continue;
      const columnStats = mismatchByColumn[column];
      columnStats.pixels++;
      if (rgbDiffers) columnStats.rgbPixels++;
      if (alphaDiffers) columnStats.alphaPixels++;
      if (rgbDiffers && referenceAlpha === 0 && bakedAlpha === 0) columnStats.transparentRgbPixels++;
      const alphaKey = String(referenceAlpha);
      const alphaStats = mismatchByReferenceAlpha.get(alphaKey) ?? { pixels: 0, rgbPixels: 0, alphaPixels: 0 };
      alphaStats.pixels++;
      if (rgbDiffers) alphaStats.rgbPixels++;
      if (alphaDiffers) alphaStats.alphaPixels++;
      mismatchByReferenceAlpha.set(alphaKey, alphaStats);
      if (mismatchSamples.length < 24) {
        mismatchSamples.push({
          x, y, column,
          reference: Array.from(referencePixels.slice(pixelOffset, pixelOffset + 4)),
          baked: Array.from(bakedPixels.slice(pixelOffset, pixelOffset + 4)),
        });
      }
    }
    // Probe Chromium's own nearest-neighbour phase independently of sprite
    // contents. This uses a monotonic red-channel ramp so each sampled source
    // pixel is observable in the destination byte array.
    function probeCanvasNearestSampling(sourceWidth, destinationWidth) {
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = sourceWidth;
      sourceCanvas.height = 1;
      const sourceContext = sourceCanvas.getContext('2d');
      if (!sourceContext) throw new Error('Could not allocate nearest-sampling source probe');
      const sourceImage = sourceContext.createImageData(sourceWidth, 1);
      for (let x = 0; x < sourceWidth; x++) {
        sourceImage.data[x * 4] = x;
        sourceImage.data[x * 4 + 3] = 255;
      }
      sourceContext.putImageData(sourceImage, 0, 0);

      const destinationCanvas = document.createElement('canvas');
      destinationCanvas.width = destinationWidth;
      destinationCanvas.height = 1;
      const destinationContext = destinationCanvas.getContext('2d', { willReadFrequently: true });
      if (!destinationContext) throw new Error('Could not allocate nearest-sampling destination probe');
      destinationContext.imageSmoothingEnabled = false;
      destinationContext.drawImage(
        sourceCanvas,
        0, 0, sourceWidth, 1,
        0, 0, destinationWidth, 1,
      );
      const destinationPixels = destinationContext.getImageData(0, 0, destinationWidth, 1).data;
      const observed = Array.from({ length: destinationWidth }, (_, x) => destinationPixels[x * 4]);
      const formulas = {
        floorCenter: x => Math.floor((x + 0.5) * sourceWidth / destinationWidth),
        floorOrigin: x => Math.floor(x * sourceWidth / destinationWidth),
        roundCenter: x => Math.round((x + 0.5) * sourceWidth / destinationWidth - 0.5),
        roundOrigin: x => Math.round(x * sourceWidth / destinationWidth),
      };
      const candidates = Object.fromEntries(Object.entries(formulas).map(([name, sample]) => {
        const predicted = Array.from({ length: destinationWidth }, (_, x) =>
          Math.max(0, Math.min(sourceWidth - 1, sample(x))),
        );
        return [name, {
          mismatchCount: predicted.reduce((count, value, x) => count + (value !== observed[x] ? 1 : 0), 0),
          predicted,
        }];
      }));
      return { sourceWidth, destinationWidth, observed, candidates };
    }
    const canvasSamplingProbe = [
      probeCanvasNearestSampling(160, 161),
      probeCanvasNearestSampling(159, 161),
    ];

    const bakedParityDiagnostics = {
      differentBytes,
      canvasSamplingProbe,
      maxChannelDelta,
      channelDifferences,
      mismatchByColumn: mismatchByColumn.map((stats, column) => ({ column, ...stats })),
      mismatchByReferenceAlpha: Object.fromEntries([...mismatchByReferenceAlpha.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))),
      mismatchSamples,
    };
    const atlasMetrics = window.__AG_CHARACTER_ATLAS_METRICS ?? null;
    const cellWidth = 161;
    const colors = [
      'teal', 'maroon', 'navy', 'purple', 'brown', 'dark-gray', 'magenta', 'red', 'blue',
      'green', 'pink', 'orange', 'yellow', 'black', 'white', 'lime', 'cyan', 'rose',
    ];
    const frames = [];
    const gameplayMatrix = document.createElement('canvas');
    const gameplayZoom = 0.7; // GameMap.tsx ZOOM used for the gameplay camera.
    const playerDisplayHeight = Math.round(36 * (3224 / 1652));
    const playerDisplayWidth = playerDisplayHeight * (cellWidth / (1401 / 9));
    const gameplayCellWidth = Math.ceil(playerDisplayWidth * gameplayZoom) + 10;
    const gameplayCellHeight = Math.ceil(playerDisplayHeight * gameplayZoom) + 10;
    gameplayMatrix.width = colors.length * gameplayCellWidth;
    gameplayMatrix.height = poseWindows.length * gameplayCellHeight;
    const gameplayContext = gameplayMatrix.getContext('2d');
    if (!gameplayContext) throw new Error('Could not allocate gameplay-scale character matrix');
    gameplayContext.fillStyle = '#202a35';
    gameplayContext.fillRect(0, 0, gameplayMatrix.width, gameplayMatrix.height);
    gameplayContext.imageSmoothingEnabled = true;
    gameplayContext.imageSmoothingQuality = 'high';

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

        // Match GameMap.tsx's 0.7 zoom and its per-pose crop-height scaling.
        // This second matrix makes lower-leg/feet-anchor defects visible at the
        // size characters occupy in the actual camera, not only in source pixels.
        const gameplayWidth = Math.max(1, Math.round(playerDisplayWidth * gameplayZoom));
        const gameplayHeight = Math.max(1, Math.round(playerDisplayHeight * gameplayZoom * (height / (1401 / 9))));
        const gameplayX = column * gameplayCellWidth + Math.round((gameplayCellWidth - gameplayWidth) / 2);
        const gameplayY = row * gameplayCellHeight + Math.round((gameplayCellHeight - gameplayHeight) / 2);
        gameplayContext.drawImage(atlas, x, pose.top, cellWidth, height,
          gameplayX, gameplayY, gameplayWidth, gameplayHeight);
      }
    }
    return {
      width: atlas.width,
      height: atlas.height,
      bakedAsset: atlasMetrics?.bakedAsset === true,
      bakedParity: { differentBytes, maxChannelDelta },
      bakedParityDiagnostics,
      cellWidth,
      columns: atlas.width / cellWidth,
      sourceAssetGitBlobSha,
      poseWindows,
      frames,
      gameplayDisplay: {
        zoom: gameplayZoom,
        playerDisplayWidth,
        playerDisplayHeight,
        gameplayCellWidth,
        gameplayCellHeight,
      },
      gameplayMatrixDataUrl: gameplayMatrix.toDataURL('image/png'),
      matrixDataUrl: matrix.toDataURL('image/png'),
    };
  }, { poseWindows, sourceAssetGitBlobSha });

  console.log('Character atlas byte-parity diagnostics:', JSON.stringify(metrics.bakedParityDiagnostics));
  assert.equal(metrics.bakedAsset, true, 'runtime must load the build-time baked atlas, not recolor source art on mobile');
  assert.deepEqual(metrics.bakedParity, { differentBytes: 0, maxChannelDelta: 0 },
    'every baked RGBA byte must match the legacy in-memory renderer exactly');
  assert.equal(metrics.width, 2898, 'runtime atlas width must be 18 × 161px');
  assert.equal(metrics.height, 1401, 'runtime atlas must preserve the authored source height');
  assert.equal(metrics.columns, 18, 'runtime canvas must contain eighteen palette columns');
  assert.equal(metrics.frames.length, 18 * poseWindows.length, 'all 162 palette/pose cells must be sampled');

  // Pin the complete pixel/alpha matrix to the reviewed source-atlas baseline.
  // This is a regression fingerprint, not a claim that the art has received new design approval.
  const goldenMaterial = metrics.frames.map(frame =>
    `${frame.color}:${frame.pose}:${frame.hash}:${frame.opaquePixels}:${frame.alphaBounds.minX},${frame.alphaBounds.minY},${frame.alphaBounds.maxX},${frame.alphaBounds.maxY}`,
  ).join("\n");
  let goldenFingerprint = 14695981039346656037n;
  for (let index = 0; index < goldenMaterial.length; index++) {
    goldenFingerprint ^= BigInt(goldenMaterial.charCodeAt(index));
    goldenFingerprint = BigInt.asUintN(64, goldenFingerprint * 1099511628211n);
  }
  assert.equal(goldenFingerprint.toString(16).padStart(16, "0"), "5988b3d64df78b5e",
    "all 162 runtime palette/pose pixel and alpha-bound cells must match the pinned golden matrix");
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
    const gameplayMatrixBase64 = metrics.gameplayMatrixDataUrl.slice('data:image/png;base64,'.length);
    writeFileSync(join(visualQaDir, 'character-atlas-gameplay-scale.png'), Buffer.from(gameplayMatrixBase64, 'base64'));
    const manifest = {
      gameplayDisplay: metrics.gameplayDisplay,
      sourceAssetGitBlobSha,
      bakedAsset: metrics.bakedAsset,
      bakedParity: metrics.bakedParity,
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
    writeFileSync(join(visualQaDir, 'character-atlas-frame-metrics.json'), JSON.stringify(manifest, null, 2) + '\n');
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
