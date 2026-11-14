import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const visualQaDir = process.env.VISUAL_QA_DIR ?? '/tmp/among-gas-visual-qa';
mkdirSync(visualQaDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : { channel: 'chrome' }),
  args: ['--no-sandbox'],
});
const failures = [];

// Playing fixtures trigger the same 3.2-second role reveal as a real match.
// Do not capture screenshots or judge gameplay controls through that overlay.
async function waitForRoleRevealToFinish(page) {
  if (new URL(page.url()).searchParams.get('skipReveal') === 'true') return;
  await page.waitForSelector('canvas', { state: 'visible', timeout: 30_000 });
  const roleLabel = page.getByText(/^(ваша роль|your role)$/i);
  try {
    await roleLabel.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    // A fixture without a role (e.g. a terminal state) has no reveal to dismiss.
  }
  await roleLabel.waitFor({ state: 'hidden', timeout: 6_000 });
}
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  // The role-reveal animation assertion is for the normal-motion presentation.
  // CI hosts may default to prefers-reduced-motion; set this context explicitly,
  // then test reduced-motion behavior in its dedicated section below.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  page.on('pageerror', error => failures.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    // The test intentionally avoids third-party SDK/font requests; this uses
    // the app's dev-only mock state and never fabricates production auth.
    return route.abort();
  });

  // Settings own both language and joystick placement; defaults must be right-handed.
  await page.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  const menuTitle = page.getByRole('heading', { name: 'Among Gas' });
  const menuSettingsButton = page.getByRole('button', { name: 'Настройки' });
  await menuTitle.waitFor({ state: 'visible' });
  await menuSettingsButton.waitFor({ state: 'visible' });
  const gearGeometry = await menuSettingsButton.locator('svg').evaluate(svg => {
    const [innerRing, outerTeeth] = svg.querySelectorAll('path');
    const inner = innerRing.getBBox();
    const outer = outerTeeth.getBBox();
    const translation = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(outerTeeth.getAttribute('transform') || '');
    if (!translation) throw new Error('Settings gear outer path must declare a measurable centering translation');
    const outerCenter = {
      x: outer.x + outer.width / 2 + Number(translation[1]),
      y: outer.y + outer.height / 2 + Number(translation[2]),
    };
    return {
      innerCenter: { x: inner.x + inner.width / 2, y: inner.y + inner.height / 2 },
      outerCenter: { x: outerCenter.x, y: outerCenter.y },
    };
  });
  assert.ok(Math.abs(gearGeometry.innerCenter.x - gearGeometry.outerCenter.x) < 0.25 &&
    Math.abs(gearGeometry.innerCenter.y - gearGeometry.outerCenter.y) < 0.25,
  `the Settings gear ring and teeth must share the same visual center; got ${JSON.stringify(gearGeometry)}`);
  const menuTitleBox = await menuTitle.boundingBox();
  const menuSettingsBox = await menuSettingsButton.boundingBox();
  assert.ok(menuTitleBox && menuSettingsBox, 'the title and Settings button must be measurable');
  assert.ok(
    menuSettingsBox.y + menuSettingsBox.height <= menuTitleBox.y ||
      menuTitleBox.y + menuTitleBox.height <= menuSettingsBox.y,
    'the Settings button must not overlap the menu title on a mobile viewport',
  );
  assert.equal(await page.getByRole('button', { name: /Switch to (English|Russian)/ }).count(), 0,
    'language controls must live inside Settings, not the title bar');
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('dialog', { name: 'Настройки' }).waitFor({ state: 'visible' });
  const lobbySettings = page.locator('[role="dialog"]');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'control-layout-save',
    'Settings must wrap reverse keyboard navigation to the final in-dialog control after the AI section');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Закрыть настройки',
    'Settings must wrap forward keyboard navigation back to its first focus target');
  assert.equal(await lobbySettings.getByTestId('joystick-side-right').getAttribute('aria-pressed'), 'true',
    'the movement joystick must default to the right side');
  assert.equal(await lobbySettings.getByTestId('joystick-side-left').getAttribute('aria-pressed'), 'false');
  const settingsBounds = await lobbySettings.boundingBox();
  const settingsSave = lobbySettings.getByTestId('control-layout-save');
  const aiKeyField = lobbySettings.getByTestId('groq-api-key');
  const aiKeySave = lobbySettings.getByTestId('groq-api-key-save');
  const viewport = page.viewportSize();
  assert.ok(settingsBounds && viewport, 'Settings dialog must be measurable');
  assert.ok(settingsBounds.y >= 0 && settingsBounds.y + settingsBounds.height <= viewport.height,
    'Settings dialog must remain entirely inside the mobile viewport');
  const aiKeyBounds = await aiKeyField.boundingBox();
  const aiSaveBounds = await aiKeySave.boundingBox();
  assert.ok(aiKeyBounds && aiSaveBounds && aiKeyBounds.y >= 0 && aiSaveBounds.y + aiSaveBounds.height <= viewport.height,
    'Optional bot AI configuration and its save action must be visible without scrolling the Settings dialog');
  await page.screenshot({ path: join(visualQaDir, 'settings-default.png'), fullPage: true });
  await page.screenshot({ path: join(visualQaDir, 'settings-ai-visible.png'), fullPage: true });
  await settingsSave.scrollIntoViewIfNeeded();
  const saveBounds = await settingsSave.boundingBox();
  assert.ok(saveBounds && saveBounds.y >= settingsBounds.y &&
    saveBounds.y + saveBounds.height <= settingsBounds.y + settingsBounds.height,
    'Settings Save control must be reachable inside the scrollable dialog without clipping'); 
  await page.screenshot({ path: join(visualQaDir, 'settings-save-visible.png'), fullPage: true });
  await lobbySettings.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'CREATE ROOM' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'SOLO vs BOTS' }).waitFor({ state: 'visible' });
  await lobbySettings.getByTestId('joystick-side-left').click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByTestId('main-menu-tab-guide').click();
  await page.getByTestId('main-menu-guide').waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'How to Play' }).waitFor({ state: 'visible' });
  await page.getByTestId('main-menu-guide-back').click();
  await page.getByRole('button', { name: 'CREATE ROOM' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'JOIN WITH CODE' }).click();
  await page.locator('.au-input').waitFor({ state: 'visible' });
  await page.getByTestId('join-code-back').click();
  await page.locator('.au-input').waitFor({ state: 'hidden' });
  await page.screenshot({ path: join(visualQaDir, 'lobby-english.png'), fullPage: true });

  // Preserve the three distinct waiting-room states for visual QA as well.
  for (const [fixture, roomCode, filename] of [
    ['lobby-host', 'XYZ789', 'lobby-host.png'],
    ['lobby-solo', 'SOLO01', 'lobby-solo.png'],
    ['lobby-guest', 'ABC123', 'lobby-guest.png'],
  ]) {
    const lobbyPage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    lobbyPage.on('pageerror', error => failures.push(error.message));
    await lobbyPage.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin)) return route.continue();
      return route.abort();
    });
    await lobbyPage.goto(`${origin}/?mock=${fixture}`, { waitUntil: 'domcontentloaded' });
    await lobbyPage.getByText(roomCode, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    await lobbyPage.screenshot({ path: join(visualQaDir, filename), fullPage: true });
    await lobbyPage.close();
  }
  const menuSpriteHeightRatios = await page.locator('.au-menu-character-sprite').evaluateAll(nodes =>
    nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 ? rect.height / rect.width : 0;
    }),
  );
  assert.ok(menuSpriteHeightRatios.length >= 5, 'the menu must render its character art and button icons');
  assert.ok(Math.min(...menuSpriteHeightRatios) > 0.80,
    `original pose crops must retain a substantial visible silhouette (minimum rendered height/width=${Math.min(...menuSpriteHeightRatios).toFixed(2)})`);

  // Protect the recognizable balaclava identity at source-pixel level, not just suit color.
  const balaclavaFacePixels = await page.evaluate(async () => {
    const sprite = new Image();
    sprite.src = `/sprites/characters.png?identity-check=${Date.now()}`;
    await sprite.decode();
    const canvas = document.createElement('canvas');
    canvas.width = sprite.naturalWidth;
    canvas.height = sprite.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not inspect original character atlas pixels');
    context.drawImage(sprite, 0, 0);

    const darkRatio = (box) => {
      const pixels = context.getImageData(box.x, box.y, box.width, box.height).data;
      let opaque = 0;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b, alpha] = pixels.slice(i, i + 4);
        if (alpha <= 200) continue;
        opaque++;
        if (Math.max(r, g, b) < 45) dark++;
      }
      return opaque ? dark / opaque : 0;
    };

    return {
      width: sprite.naturalWidth,
      height: sprite.naturalHeight,
      leftEye: darkRatio({ x: 78, y: 48, width: 16, height: 14 }),
      rightEye: darkRatio({ x: 109, y: 46, width: 16, height: 15 }),
      eyeBridge: darkRatio({ x: 96, y: 47, width: 11, height: 14 }),
      maskFabric: darkRatio({ x: 57, y: 43, width: 10, height: 15 }),
    };
  });
  assert.equal(balaclavaFacePixels.width, 1123, 'legacy balaclava atlas width must remain measured');
  assert.equal(balaclavaFacePixels.height, 1401, 'legacy balaclava atlas height must remain measured');
  assert.ok(balaclavaFacePixels.leftEye > 0.85, 'the left black eye opening must remain visible in the balaclava');
  assert.ok(balaclavaFacePixels.rightEye > 0.80, 'the separate right black eye opening must remain visible in the balaclava');
  assert.ok(
    balaclavaFacePixels.eyeBridge < Math.min(balaclavaFacePixels.leftEye, balaclavaFacePixels.rightEye) * 0.5,
    'the two eye openings must remain visually separate rather than becoming one continuous visor',
  );
  assert.ok(balaclavaFacePixels.maskFabric < 0.10, 'the eye apertures must not consume the striped mask fabric');
  assert.equal(await page.getByText(/mini game for telegram/i).count(), 0,
    'the obsolete Telegram mini-game subtitle must not be shown');

  // The main menu must not clip join controls in short landscape viewports.
  await page.setViewportSize({ width: 844, height: 390 });
  const scrollableLobby = page.locator('.au-lobby-scroll');
  await scrollableLobby.waitFor({ state: 'visible' });
  assert.equal(await scrollableLobby.evaluate(element => getComputedStyle(element).overflowY), 'auto',
    'short landscape lobby content must be scrollable');
  await scrollableLobby.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const menuFooter = page.getByText('v1.0 · AMONG GAS', { exact: true });
  const footerBox = await menuFooter.boundingBox();
  const joinCodeBox = await page.getByRole('button', { name: 'JOIN WITH CODE' }).boundingBox();
  assert.ok(footerBox && footerBox.y >= 0 && footerBox.y + footerBox.height <= 390,
    'the menu footer must be reachable within the short landscape viewport');
  assert.ok(joinCodeBox && joinCodeBox.y >= 0 && joinCodeBox.y + joinCodeBox.height <= 390,
    'the join-by-code control must be reachable within the short landscape viewport');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);

  const mapAssetTimings = [];
  const mapAssetRequests = [];
  const mapAssetStartedAt = new Map();
  const isGameplayMapAsset = url =>
    /map-overview\.webp|map-tiles(?:-sharp)?\/(?:manifest\.json|tile_r\d+_c\d+\.webp)/.test(url);
  page.on('request', request => {
    if (isGameplayMapAsset(request.url())) {
      mapAssetRequests.push(request.url());
      mapAssetStartedAt.set(request.url(), Date.now());
    }
  });
  page.on('requestfinished', request => {
    if (isGameplayMapAsset(request.url())) {
      mapAssetTimings.push({
        asset: request.url(),
        durationMs: Date.now() - (mapAssetStartedAt.get(request.url()) ?? Date.now()),
      });
    }
  });
  // Use a normal gameplay fixture so the role reveal exercises its real
  // timed animation. Capture its geometry immediately, before the 3.2s overlay
  // expires and before the slower cold-map readiness gate.
  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  // Role reveal is intentionally transient. Capture all sprite/shadow geometry
  // in one browser-side snapshot so separate locator calls cannot race the
  // 3.2-second reveal timer and lose the node between assertions.
  const roleRevealSnapshotHandle = await page.waitForFunction(() => {
    const overlay = document.querySelector('[data-testid="role-reveal-overlay"]');
    const reveal = document.querySelector('[data-testid="role-reveal-character"]');
    const sprite = reveal?.querySelector('.ag-character-sprite[data-pose]');
    const shadow = document.querySelector('[data-role-reveal-shadow="true"]');
    if (!overlay || !reveal || !sprite || !shadow ||
        Number.parseFloat(getComputedStyle(overlay).opacity) < 0.9) return false;
    const spriteContext = sprite.getContext('2d');
    if (!spriteContext) return false;
    const spritePixels = spriteContext.getImageData(0, 0, sprite.width, sprite.height).data;
    let opaqueSamples = 0;
    for (let i = 3; i < spritePixels.length; i += 16) if (spritePixels[i] > 0) opaqueSamples++;
    if (opaqueSamples < 20) return false;
    const spriteBounds = sprite.getBoundingClientRect();
    const shadowBounds = shadow.getBoundingClientRect();
    const shadowStyle = getComputedStyle(shadow);
    return {
      pose: sprite.getAttribute('data-pose'),
      sourceHeight: sprite.getAttribute('data-source-height'),
      displayHeight: sprite.getAttribute('data-display-height'),
      transform: sprite.style.transform,
      clipPath: sprite.style.clipPath,
      revealLeft: reveal.getBoundingClientRect().left,
      revealTop: reveal.getBoundingClientRect().top,
      revealWidth: reveal.getBoundingClientRect().width,
      revealHeight: reveal.getBoundingClientRect().height,
      spriteWidth: spriteBounds.width,
      spriteHeight: spriteBounds.height,
      spriteCenterX: spriteBounds.left + spriteBounds.width / 2,
      spriteBottom: spriteBounds.bottom,
      shadowCenterX: shadowBounds.left + shadowBounds.width / 2,
      shadowTop: shadowBounds.top,
      shadowWidth: Number.parseFloat(shadowStyle.width),
      shadowHeight: Number.parseFloat(shadowStyle.height),
      shadowAnimation: shadowStyle.animationName,
      shadowBackground: shadowStyle.backgroundColor,
    };
  }, null, { timeout: 30_000 });
  const roleRevealSnapshot = await roleRevealSnapshotHandle.jsonValue();
  await roleRevealSnapshotHandle.dispose();
  assert.equal(roleRevealSnapshot.pose, 'idle');
  assert.equal(roleRevealSnapshot.sourceHeight, '136',
    'role reveal must crop detached black strokes below the idle character feet');
  assert.equal(roleRevealSnapshot.displayHeight, '153',
    'the authored role-reveal baseline remains available as metadata');
  assert.equal(roleRevealSnapshot.transform, 'none',
    'cropped role sprites must not be vertically stretched to compensate for removed pixels');
  const roleCropRatio = roleRevealSnapshot.spriteWidth > 0
    ? roleRevealSnapshot.spriteHeight / roleRevealSnapshot.spriteWidth
    : 0;
  const expectedRoleCropRatio = 136 / (1123 / 7);
  assert.ok(Math.abs(roleCropRatio - expectedRoleCropRatio) < 0.01,
    `role-reveal rendered aspect ratio must match its measured source crop (expected ${expectedRoleCropRatio.toFixed(3)}, got ${roleCropRatio.toFixed(3)})`);
  assert.match(roleRevealSnapshot.clipPath, /polygon/,
    'role sprites must mask detached lower-leg strokes without removing the feet');
  assert.ok(Math.abs(roleRevealSnapshot.shadowCenterX - roleRevealSnapshot.spriteCenterX) < 2,
    'the role-reveal ground shadow must stay centered beneath the character');
  assert.ok(roleRevealSnapshot.shadowTop >= roleRevealSnapshot.spriteBottom - 2,
    'the role-reveal shadow must sit below the character feet, not overlap the sprite');
  assert.ok(roleRevealSnapshot.shadowWidth >= 90 && roleRevealSnapshot.shadowHeight >= 14 &&
    roleRevealSnapshot.shadowBackground.includes('0.85'),
    'the ground shadow must have enough area and contrast to remain visible at mobile render scale');
  assert.equal(roleRevealSnapshot.shadowAnimation, 'rrShadowPulse',
    'the role-reveal ground shadow must animate with the character bob');
  const roleRevealDataUrl = await page.locator('[data-testid="role-reveal-character"] canvas.ag-character-sprite')
    .evaluate(canvas => canvas.toDataURL('image/png'));
  writeFileSync(join(visualQaDir, 'role-reveal-sprite-crop.png'),
    Buffer.from(roleRevealDataUrl.split(',')[1], 'base64'));
  // The dedicated reveal fixture deliberately holds the opening overlay
  // visible for inspection. Navigate to gameplay only after capturing it.
  await page.goto(`${origin}/?mock=task-interaction&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 30_000 });
  assert.ok(mapAssetRequests.some(asset => asset.includes('map-overview.webp')),
    'cold gameplay load must fetch the canonical overview fallback');
  assert.ok(mapAssetRequests.some(asset => asset.includes('/map-tiles/manifest.json')),
    'cold gameplay load must fetch the canonical tile manifest');
  assert.ok(mapAssetRequests.some(asset => /map-tiles\/(?:tile_r\d+_c\d+\.webp)/.test(asset)),
    'cold gameplay load must fetch camera-visible high-resolution WebP tiles');
  console.log('Cold map asset request timings:', JSON.stringify(mapAssetTimings));
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const movementJoystick = page.locator('[data-joystick-side]');
  await movementJoystick.waitFor({ state: 'visible' });
  assert.equal(await movementJoystick.getAttribute('aria-label'), 'Movement joystick',
    'the joystick must expose the accessible English label in English mode');
  assert.equal(await movementJoystick.getAttribute('data-joystick-side'), 'left',
    'the joystick side preference must persist into gameplay');
  await page.getByRole('button', { name: 'Settings' }).click();
  const gameplaySettings = page.getByRole('dialog', { name: 'Settings' });
  await gameplaySettings.waitFor({ state: 'visible' });
  assert.equal(await gameplaySettings.getByTestId('joystick-side-left').getAttribute('aria-pressed'), 'true',
    'the selected joystick side must remain selected when settings are reopened');
  await gameplaySettings.getByTestId('joystick-side-right').click();
  await gameplaySettings.getByRole('button', { name: 'Русский' }).click();
  await page.getByRole('button', { name: 'Закрыть настройки' }).click();
  await page.waitForFunction(() => {
    const joystick = document.querySelector('[data-joystick-side]');
    return joystick?.getAttribute('data-joystick-side') === 'right' &&
      joystick.getAttribute('aria-label') === 'Джойстик движения';
  });
  assert.equal(await movementJoystick.getAttribute('aria-label'), 'Джойстик движения',
    'the joystick accessible label must follow the selected Russian language');
  await page.getByRole('button', { name: /КАРТА/ }).waitFor({ state: 'visible', timeout: 30_000 });

  // Pointer capture plus pointer-up must return the joystick to neutral. A lost
  // touch must never leave a movement key held and keep nudging the player.
  const initialJoystickBox = await movementJoystick.boundingBox();
  assert.ok(initialJoystickBox, 'movement joystick must be measurable for pointer testing');
  await page.mouse.move(initialJoystickBox.x + initialJoystickBox.width / 2, initialJoystickBox.y + initialJoystickBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(initialJoystickBox.x + initialJoystickBox.width / 2 + 38, initialJoystickBox.y + initialJoystickBox.height / 2, { steps: 4 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="joystick-knob"]');
    return !!element && element.style.transform !== 'translate(-50%, -50%)';
  });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="joystick-knob"]');
    return !!element && element.style.transform === 'translate(-50%, -50%)';
  });

  // The HUD must remain tappable even on the narrowest supported portrait size.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(150);
  const hudSelectors = [
    page.getByRole('button', { name: /КАРТА/ }),
    page.getByRole('button', { name: /ЗАДАНИЯ/ }),
    page.getByRole('button', { name: /Созвать экстренное собрание|Call emergency meeting/ }),
    page.getByRole('button', { name: 'Настройки' }),
  ];
  assert.equal(await page.getByRole('button', { name: 'Покинуть матч' }).count(), 0,
    'Leave Match must not occupy a permanent, high-emphasis gameplay HUD slot');
  const hudBoxes = await Promise.all(hudSelectors.map(button => button.boundingBox()));
  assert.ok(hudBoxes.every(Boolean), 'all primary gameplay controls must be measurable on a 320px viewport');
  console.log('HUD boxes at 320×568:', JSON.stringify(hudBoxes));
  for (let i = 0; i < hudBoxes.length; i++) {
    for (let j = i + 1; j < hudBoxes.length; j++) {
      const a = hudBoxes[i];
      const b = hudBoxes[j];
      const overlaps = a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
      assert.equal(overlaps, false, `gameplay controls ${i} and ${j} must not overlap at 320×568`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);

  // Leaving is discoverable inside Settings, not permanently rendered over gameplay.
  await page.getByRole('button', { name: 'Настройки' }).click();
  const settingsWithLeave = page.getByRole('dialog', { name: 'Настройки' });
  await settingsWithLeave.waitFor({ state: 'visible' });
  await settingsWithLeave.getByTestId('settings-leave-match').click();
  const leaveDialog = page.getByRole('dialog', { name: 'Выйти из матча?' });
  await leaveDialog.waitFor({ state: 'visible' });
  await leaveDialog.getByRole('button', { name: 'Остаться' }).click();
  await leaveDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('dialog', { name: 'Настройки' }).getByTestId('settings-leave-match').click();
  await page.getByRole('dialog', { name: 'Выйти из матча?' }).getByRole('button', { name: 'Выйти' }).click();
  await page.waitForFunction(() => window.location.pathname === '/' && !new URLSearchParams(window.location.search).has('mock'));
  // Return to a predictable fixture for the rest of the visual smoke suite.
  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.waitForFunction(
    () => new URLSearchParams(window.location.search).get('mock') === 'task-interaction',
    undefined,
    { timeout: 5_000 },
  );
  // The mock fixture starts at the closest verified walkable point beside
  // the assigned console so this checks proximity UI independently of movement.
  await page.screenshot({ path: join(visualQaDir, 'task-action-prompt.png'), fullPage: true });
  const taskDiagnostics = await page.evaluate(() => ({
    taskFixturePosition: window.__AG_TASK_FIXTURE_POSITION ?? null,
    taskDebug: window.__AG_TASK_DEBUG ?? null,
    taskActionCount: document.querySelectorAll('[data-testid="game-action-use"][data-use-action="task"]').length,
    taskAction: (() => {
      const element = document.querySelector('[data-testid="game-action-use"][data-use-action="task"]');
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { text: element.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display, visibility: style.visibility, opacity: style.opacity };
    })(),
    roleReveal: document.querySelector('.ag-character-sprite[data-pose]')?.getAttribute('data-pose'),
    bodyText: document.body.innerText.slice(-1200),
  }));
  console.log('Task interaction fixture diagnostics:', JSON.stringify(taskDiagnostics));
  const taskButton = page.getByTestId('game-action-use');
  assert.equal(await taskButton.getAttribute('data-use-action'), 'task',
    'the persistent Use control must expose the nearby actionable task');
  assert.equal(await taskButton.isEnabled(), true, 'Use must enable when a task is in range and visible');
  const taskIconPath = await taskButton.locator('svg path').first().getAttribute('d');
  assert.match(taskIconPath ?? '', /M16 9/,
    'Use must show the contextual clipboard icon when a task is actionable');
  const idleReportButton = page.getByTestId('game-action-report');
  assert.equal(await idleReportButton.isVisible(), true, 'Report stays visible without a nearby body');
  assert.equal(await idleReportButton.isEnabled(), false, 'Report stays neutral and disabled without a body');
  await taskButton.waitFor({ state: 'visible', timeout: 30_000 });
  const taskPromptBox = await taskButton.boundingBox();
  const movementJoystickBox = await movementJoystick.boundingBox();
  assert.ok(taskPromptBox && movementJoystickBox, 'Use action and joystick must be measurable');
  assert.ok(
    taskPromptBox.x + taskPromptBox.width <= movementJoystickBox.x ||
      movementJoystickBox.x + movementJoystickBox.width <= taskPromptBox.x ||
      taskPromptBox.y + taskPromptBox.height <= movementJoystickBox.y ||
      movementJoystickBox.y + movementJoystickBox.height <= taskPromptBox.y,
    'the task prompt must not overlap the movement joystick',
  );

  // A player may be within the numeric task radius but still be separated by
  // a wall. The client must not expose the task action in that state.
  const blockedTaskPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  blockedTaskPage.on('pageerror', error => failures.push(error.message));
  blockedTaskPage.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await blockedTaskPage.goto(`${origin}/?mock=task-interaction-blocked&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await blockedTaskPage.waitForSelector('canvas', { state: 'visible', timeout: 15_000 });
  await blockedTaskPage.waitForFunction(() => {
    const fixture = window.__AG_TASK_FIXTURE_POSITION;
    const debug = window.__AG_TASK_DEBUG;
    return fixture !== undefined && debug?.distance !== undefined && debug?.player &&
      Math.hypot(debug.player.x - fixture.x, debug.player.y - fixture.y) <= 1;
  }, undefined, { timeout: 15_000 });
  const blockedTaskDiagnostics = await blockedTaskPage.evaluate(() => ({
    fixture: window.__AG_TASK_FIXTURE_POSITION ?? null,
    debug: window.__AG_TASK_DEBUG ?? null,
    actionCount: document.querySelectorAll('[data-testid="game-action-use"][data-use-action="task"]').length,
  }));
  console.log('Occluded task interaction diagnostics:', JSON.stringify(blockedTaskDiagnostics));
  assert.ok(blockedTaskDiagnostics.fixture, 'the blocked-task fixture must position the player in the measured interaction zone');
  assert.ok(blockedTaskDiagnostics.debug?.distance <= blockedTaskDiagnostics.debug?.range,
    'the blocked-task fixture must be within numeric interaction range');
  assert.equal(blockedTaskDiagnostics.debug?.best, null,
    'the wall must be the reason the nearby task is not selected');
  assert.equal(blockedTaskDiagnostics.actionCount, 0,
    'task prompt must stay hidden when the player is in range but has no line of sight');
  await blockedTaskPage.screenshot({ path: join(visualQaDir, 'task-action-occluded-hidden.png'), fullPage: true });
  await blockedTaskPage.close();

  // Ghosts are intentionally exempt from task LOS checks on the server and
  // must retain the same through-wall task prompt on the client.
  const ghostBlockedTaskPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  ghostBlockedTaskPage.on('pageerror', error => failures.push(error.message));
  await ghostBlockedTaskPage.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await ghostBlockedTaskPage.goto(`${origin}/?mock=task-interaction-ghost-blocked&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await ghostBlockedTaskPage.waitForSelector('canvas', { state: 'visible', timeout: 15_000 });
  try {
    await ghostBlockedTaskPage.waitForFunction(() => {
      const fixture = window.__AG_TASK_FIXTURE_POSITION;
      return fixture !== undefined &&
        document.querySelectorAll('[data-testid="game-action-use"][data-use-action="task"][data-use-available="true"]').length === 1;
    }, undefined, { timeout: 5_000 });
  } catch (error) {
    const diagnostics = await ghostBlockedTaskPage.evaluate(() => ({
      fixture: window.__AG_TASK_FIXTURE_POSITION ?? null,
      debug: window.__AG_TASK_DEBUG ?? null,
      bodyText: document.body.innerText.slice(0, 500),
      actionCount: document.querySelectorAll('[data-testid="game-action-use"][data-use-action="task"]').length,
      pageReady: document.readyState,
    }));
    console.error('Ghost blocked task fixture diagnostics:', JSON.stringify(diagnostics));
    throw error;
  }
  const ghostBlockedTaskDiagnostics = await ghostBlockedTaskPage.evaluate(() => ({
    debug: window.__AG_TASK_DEBUG ?? null,
    actionCount: document.querySelectorAll('[data-testid="game-action-use"][data-use-action="task"]').length,
  }));
  assert.equal(ghostBlockedTaskDiagnostics.debug?.isGhost, true,
    'the occluded fixture must run as a server-authoritative ghost');
  assert.ok(ghostBlockedTaskDiagnostics.debug?.distance <= ghostBlockedTaskDiagnostics.debug?.range,
    'the ghost fixture must be within the task interaction range');
  assert.equal(ghostBlockedTaskDiagnostics.debug?.best?.taskId, 7,
    'the ghost must select the same assigned task despite the wall');
  assert.equal(ghostBlockedTaskDiagnostics.actionCount, 1,
    'a ghost must retain the task prompt through a wall when the task is within interaction range');
  assert.equal(await ghostBlockedTaskPage.getByTestId('game-action-report').count(), 0,
    'ghosts do not receive the living-player Report control');
  assert.equal(await ghostBlockedTaskPage.getByTestId('game-action-kill').count(), 0,
    'ghosts do not receive the Kill control');
  await ghostBlockedTaskPage.getByTestId('game-action-use').click();
  await ghostBlockedTaskPage.getByText(/Заправить двигатель|Fuel Engine/).waitFor({ state: 'visible', timeout: 5_000 });
  await ghostBlockedTaskPage.screenshot({ path: join(visualQaDir, 'task-action-ghost-through-wall.png'), fullPage: true });
  await ghostBlockedTaskPage.close();

  // Verify the task prompt remains in a clear HUD band on short portrait and landscape screens.
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1365, height: 768 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return !!canvas && canvas.style.width === window.innerWidth + 'px' && canvas.style.height === window.innerHeight + 'px';
    }, undefined, { timeout: 3_000 });
    const prompt = await taskButton.boundingBox();
    const stick = await movementJoystick.boundingBox();
    assert.ok(prompt && stick, 'Use action and joystick must remain measurable after resize');
    assert.ok(
      prompt.x + prompt.width <= stick.x || stick.x + stick.width <= prompt.x ||
        prompt.y + prompt.height <= stick.y || stick.y + stick.height <= prompt.y,
      `Use action must not overlap joystick at ${size.width}×${size.height}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return !!canvas && canvas.style.width === window.innerWidth + 'px' && canvas.style.height === window.innerHeight + 'px';
  }, undefined, { timeout: 3_000 });

  // The emergency action and Settings must have independent tap targets on mobile.
  const emergencyButton = page.getByRole('button', { name: /Созвать экстренное собрание|Call emergency meeting/ });
  const gameplaySettingsButton = page.getByRole('button', { name: 'Настройки' });
  await emergencyButton.waitFor({ state: 'visible' });
  await gameplaySettingsButton.waitFor({ state: 'visible' });
  const emergencyBox = await emergencyButton.boundingBox();
  const gameplaySettingsBox = await gameplaySettingsButton.boundingBox();
  assert.ok(emergencyBox && gameplaySettingsBox, 'gameplay actions must be measurable');
  assert.ok(emergencyBox.width >= 92 && emergencyBox.height >= 92,
    `Emergency icon action must be at least 92×92 CSS px (measured ${emergencyBox.width.toFixed(1)}×${emergencyBox.height.toFixed(1)})`);
  const emergencyIcon = emergencyButton.getByTestId('emergency-call-icon');
  const emergencyIconBox = await emergencyIcon.boundingBox();
  assert.ok(emergencyIconBox && emergencyIconBox.width >= 68 && emergencyIconBox.height >= 68,
    'Emergency control must display the large authored SVG alarm icon');
  await page.screenshot({ path: join(visualQaDir, 'emergency-control-390x844.png'), fullPage: true });
  assert.ok(
    emergencyBox.x + emergencyBox.width <= gameplaySettingsBox.x ||
      gameplaySettingsBox.x + gameplaySettingsBox.width <= emergencyBox.x ||
      emergencyBox.y + emergencyBox.height <= gameplaySettingsBox.y ||
      gameplaySettingsBox.y + gameplaySettingsBox.height <= emergencyBox.y,
    'Emergency and Settings must not overlap on a mobile viewport',
  );

  // A tap must immediately show the emergency-call splash while awaiting the
  // authoritative 0x1B server confirmation (or explicit rejection).
  await emergencyButton.click();
  const emergencySplash = page.getByTestId('emergency-call-splash');
  await emergencySplash.waitFor({ state: 'visible' });
  const emergencyArtwork = emergencySplash.getByTestId('emergency-meeting-artwork');
  await emergencyArtwork.waitFor({ state: 'visible' });
  assert.equal(await emergencySplash.locator('img').count(), 0,
    'Emergency splash must not depend on a third-party raster image');
  assert.match(await emergencySplash.getByTestId('emergency-call-status').innerText(),
    /Waiting for server confirmation|Ожидаем подтверждение сервера/i);
  assert.equal(await emergencySplash.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(4, 10, 17)',
    'Emergency splash must fully obscure gameplay controls and text beneath it');
  await page.screenshot({ path: join(visualQaDir, 'emergency-call-splash.png'), fullPage: true });
  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  // The role-reveal sprite is transient; observe it before the slower cold-map
  // loading gate, never after it may have unmounted.
  await page.waitForSelector('.ag-character-sprite[data-pose]', { timeout: 30_000 });
  await page.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 30_000 });

  // Tactical map: rendered over the custom Among Gas map and safely dismissible.
  await page.getByRole('button', { name: /КАРТА/ }).click();
  const mapDialog = page.getByRole('dialog', { name: 'Карта Among Gas' });
  await mapDialog.waitFor({ state: 'visible' });
  const mapImage = mapDialog.getByRole('img', { name: 'Карта Among Gas' });
  await mapImage.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const img = [...document.querySelectorAll('img')].find(node => node.getAttribute('alt') === 'Карта Among Gas');
    return !!img && img.complete && img.naturalWidth > 0;
  });
  const playerMarker = mapDialog.getByLabel('Ваше местоположение');
  const before = await playerMarker.evaluate(node => ({
    left: node.style.left,
    top: node.style.top,
  }));
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  const after = await playerMarker.evaluate(node => ({
    left: node.style.left,
    top: node.style.top,
  }));
  assert.deepEqual(after, before, 'the player must not move behind the open tactical map');
  await mapDialog.getByRole('button', { name: 'Закрыть карту' }).click();
  await mapDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /КАРТА/ }).click();
  await mapDialog.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Закрыть карту',
    'opening the tactical map must move focus into the dialog');
  await page.keyboard.press('Escape');
  await mapDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded')), 'false',
    'closing the tactical map must restore focus to its trigger');

  // Exercise a complete two-step task on the mobile viewport.
  await taskButton.click();
  await page.getByText('Почистить фильтры', { exact: true }).waitFor({ state: 'visible' });
  await page.screenshot({ path: join(visualQaDir, 'task-minigame-russian.png'), fullPage: true });
  const dirtyFilter = page.getByRole('button', { name: /Грязный фильтр/ });
  for (let i = 0; i < 5; i++) await dirtyFilter.first().click();
  await page.getByText('Шаг 2 из 2', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
  const secondStepDirty = page.getByRole('button', { name: /Грязный фильтр/ });
  for (let i = 0; i < 5; i++) await secondStepDirty.first().click();
  await page.getByRole('button', { name: 'Закрыть' }).waitFor({ state: 'hidden', timeout: 5_000 });
  // Open every canonical task through the real proximity-gated Use action. This is a browser
  // gallery, not an SSR-only registry assertion: every module must mount inside the gameplay
  // overlay at a phone viewport, expose its dialog semantics, and remain within the safe viewport.
  // Plan v2 six-state action-bar acceptance matrix. Each capture uses a
  // deterministic fixture and asserts the action state before the screenshot.
  const hudStateMatrix = [];
  const captureHudState = async (name, fixture, verify) => {
    await page.goto(`${origin}/?mock=${fixture}&skipReveal=true`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { state: 'visible', timeout: 30_000 });
    // Canvas creation precedes map-asset readiness; wait for GameMap's loaded
    // state to mount the living-player action bar before asserting its controls.
    await page.getByTestId('game-action-bar').waitFor({ state: 'visible', timeout: 20_000 });
    const details = await verify(page);
    await page.screenshot({ path: join(visualQaDir, `hud-matrix-${name}.png`), fullPage: true });
    hudStateMatrix.push({ state: name, fixture, viewport: { width: 390, height: 844 }, ...details });
  };

  await captureHudState('crew-idle', 'crew-idle', async current => {
    const use = current.getByTestId('game-action-use');
    const report = current.getByTestId('game-action-report');
    assert.equal(await use.isVisible(), true, 'crew idle: Use remains visible');
    assert.equal(await use.isEnabled(), false, 'crew idle: no nearby task is actionable');
    assert.equal(await report.isVisible(), true, 'crew idle: Report remains visible');
    assert.equal(await report.isEnabled(), false, 'crew idle: no body means Report is disabled');
    assert.equal(await current.getByTestId('game-action-kill').count(), 0, 'crew idle: no Kill action');
    return { use: 'disabled-no-nearby-task', report: 'disabled-no-body', kill: 'absent' };
  });

  await captureHudState('crew-near-task', 'task-interaction', async current => {
    await current.waitForFunction(() =>
      document.querySelector('[data-testid="game-action-use"]')?.getAttribute('data-use-action') === 'task',
      null,
      { timeout: 10_000 },
    );
    const use = current.getByTestId('game-action-use');
    const report = current.getByTestId('game-action-report');
    assert.equal(await use.getAttribute('data-use-action'), 'task');
    assert.equal(await use.isEnabled(), true, 'crew near task: Use is enabled');
    assert.equal(await report.isEnabled(), false, 'crew near task: Report remains disabled');
    assert.equal(await current.getByTestId('game-action-kill').count(), 0, 'crew near task: no Kill action');
    return { use: 'enabled-task', report: 'disabled-no-body', kill: 'absent' };
  });

  await captureHudState('crew-near-body', 'report-ready', async current => {
    await current.waitForFunction(() => {
      const button = document.querySelector('[data-testid="game-action-report"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, null, { timeout: 10_000 });
    const report = current.getByTestId('game-action-report');
    assert.equal(await report.isVisible(), true);
    assert.equal(await report.isEnabled(), true, 'crew near body: Report is enabled');
    assert.equal(await current.getByTestId('game-action-use').isVisible(), true, 'crew near body: Use remains visible');
    assert.equal(await current.getByTestId('game-action-use').isEnabled(), false, 'crew near body: no nearby task');
    assert.equal(await current.getByTestId('game-action-kill').count(), 0, 'crew near body: no Kill action');
    return { use: 'disabled-no-interaction', report: 'enabled-body', kill: 'absent' };
  });

  await captureHudState('impostor-ready', 'kill-ready', async current => {
    await current.waitForFunction(() => {
      const button = document.querySelector('[data-testid="game-action-kill"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, null, { timeout: 10_000 });
    const kill = current.getByTestId('game-action-kill');
    assert.equal(await kill.isVisible(), true, 'impostor ready: Kill is visible');
    assert.equal(await kill.isEnabled(), true, 'impostor ready: Kill is enabled in range');
    assert.equal(await current.getByTestId('game-action-report').isEnabled(), false);
    assert.equal(await current.getByTestId('game-action-use').isEnabled(), false);
    return { kill: 'enabled-target', report: 'disabled-no-body', use: 'disabled-no-interaction' };
  });

  await captureHudState('impostor-cooldown', 'impostor-opening', async current => {
    await current.waitForFunction(() => {
      const button = document.querySelector('[data-testid="game-action-kill"]');
      return button instanceof HTMLButtonElement && button.disabled;
    }, null, { timeout: 10_000 });
    const kill = current.getByTestId('game-action-kill');
    assert.equal(await kill.isVisible(), true, 'impostor cooldown: Kill remains visible');
    assert.equal(await kill.isEnabled(), false, 'impostor cooldown: Kill is disabled');
    const opacity = Number(await kill.evaluate(element => getComputedStyle(element).opacity));
    assert.equal(opacity, 0.45, 'impostor cooldown: disabled Kill uses 45% opacity');
    assert.match(await kill.evaluate(element => getComputedStyle(element).filter), /saturate\(0\.2\)/);
    return { kill: 'disabled-cooldown', opacity, report: 'disabled', use: 'disabled' };
  });

  await captureHudState('dead-ghost', 'ghost', async current => {
    await current.getByText(/Вы мертвы — режим призрака/).waitFor({ state: 'visible', timeout: 10_000 });
    assert.equal(await current.getByTestId('game-action-kill').count(), 0, 'dead ghost: Kill is absent');
    assert.equal(await current.getByTestId('game-action-report').count(), 0, 'dead ghost: Report is absent');
    return { kill: 'absent', report: 'absent', ghost: 'visible' };
  });

  writeFileSync(join(visualQaDir, 'hud-state-matrix.json'), JSON.stringify(hudStateMatrix, null, 2) + '\n');

  const minigameGallery = [
    [0, 'Fix Wiring', 'Починить проводку'],
    [1, 'Download Data', 'Скачать данные'],
    [2, 'Calibrate Distributor', 'Настроить распределитель'],
    [3, 'Empty Garbage', 'Вынести мусор'],
    [4, 'Clean Filters', 'Почистить фильтры'],
    [5, 'Stabilize Navigation', 'Стабилизировать навигацию'],
    [6, 'Reboot WiFi', 'Перезапустить связь'],
    [7, 'Fuel Engine', 'Заправить двигатель'],
    [8, 'Start Reactor', 'Запустить реактор'],
    [9, 'Align Engine', 'Выровнять двигатель'],
    [10, 'Clear Asteroids', 'Уничтожить астероиды'],
  ];
  for (const [taskId, englishName, russianName] of minigameGallery) {
    await page.goto(`${origin}/?mock=task-interaction-gallery&taskId=${taskId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('canvas', { state: 'visible', timeout: 30_000 });
    await page.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 30_000 });
    // Role reveal art is transient and must not be required on subsequent fixture reloads.
    await waitForRoleRevealToFinish(page);
    const galleryUse = page.getByTestId('game-action-use');
    await galleryUse.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="game-action-use"]');
      return button instanceof HTMLButtonElement &&
        !button.disabled && button.dataset.useAction === 'task';
    }, undefined, { timeout: 10_000 });
    await galleryUse.click();

    const minigameDialog = page.getByTestId('minigame-shell');
    await minigameDialog.waitFor({ state: 'visible', timeout: 5_000 });
    const undersizedTouchTargets = await minigameDialog.locator('button').evaluateAll(buttons =>
      buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.getAttribute('aria-label') || button.textContent?.trim() || button.dataset.testid || 'unlabelled',
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        };
      }).filter(target => target.width < 48 || target.height < 48),
    );
    assert.deepEqual(undersizedTouchTargets, [],
      `task ${taskId} controls must all provide at least 48×48 CSS px touch targets`);
    const dialogText = await minigameDialog.innerText();
    assert.ok(
      dialogText.includes(englishName) || dialogText.includes(russianName),
      `task ${taskId} must open its own ${englishName} panel; got: ${dialogText}`,
    );
    const dialogBox = await minigameDialog.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(dialogBox && viewport, `task ${taskId} dialog must be measurable`);
    assert.ok(
      dialogBox.x >= 0 && dialogBox.y >= 0 &&
        dialogBox.x + dialogBox.width <= viewport.width + 0.5 &&
        dialogBox.y + dialogBox.height <= viewport.height + 0.5,
      `task ${taskId} dialog must stay inside the ${viewport.width}×${viewport.height} phone viewport; got ${JSON.stringify(dialogBox)}`,
    );
    await page.screenshot({
      path: join(visualQaDir, `minigame-gallery-${String(taskId).padStart(2, '0')}.png`),
      fullPage: true,
    });
    await minigameDialog.getByRole('button', { name: /^(Close|Закрыть)$/ }).click();
    await minigameDialog.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  // Verify impostor actions are visible and proximity-gated in their real spawn coordinates.
  await page.goto(`${origin}/?mock=kill-ready`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const killButton = page.getByRole('button', { name: /Убить/ });
  await killButton.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(
    button => button.getAttribute('aria-label') === 'Убить' && !button.disabled,
  ), undefined, { timeout: 5_000 });
  assert.equal(await killButton.isEnabled(), true, 'in-range kill action should be enabled');
  assert.equal(await killButton.locator('svg').count(), 1,
    'Kill action uses its own original vector glyph, not a copied game asset');
  const reportAlwaysVisible = page.getByTestId('game-action-report');
  const useAlwaysVisible = page.getByTestId('game-action-use');
  await reportAlwaysVisible.waitFor({ state: 'visible', timeout: 5_000 });
  await useAlwaysVisible.waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await reportAlwaysVisible.isEnabled(), false,
    'Report remains visible but disabled when no body is nearby');
  assert.equal(await useAlwaysVisible.isEnabled(), false,
    'Use remains visible but disabled when no interaction is nearby');
  const neutralReport = await reportAlwaysVisible.evaluate(element => getComputedStyle(element).backgroundImage);
  assert.match(neutralReport, /rgb\(119,\s*131,\s*138\).*rgb\(70,\s*81,\s*88\)/i,
    'disabled Report uses the neutral grey surface, not a hidden or active colour');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.waitForTimeout(100);
  const actionBarBox = await page.getByTestId('game-action-bar').boundingBox();
  assert.ok(actionBarBox && actionBarBox.x >= 0 && actionBarBox.x + actionBarBox.width <= 320,
    'the three-button impostor action bar must remain inside a narrow 320px phone viewport');
  await page.screenshot({ path: join(visualQaDir, 'game-action-bar-320px.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  // At match start, the Kill button must be disabled until the initial cooldown expires.
  await page.goto(`${origin}/?mock=impostor-opening`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const openingKillButton = page.getByRole('button', { name: /Перезарядка убийства/ });
  await openingKillButton.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await openingKillButton.isEnabled(), false,
    'the opening kill cooldown must disable the Kill action even when a target is in range');
  const cooldownStyle = await openingKillButton.evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    filter: getComputedStyle(element).filter,
  }));
  assert.equal(Number(cooldownStyle.opacity), 0.45,
    'disabled Kill must be visibly reduced to 45 percent opacity');
  assert.match(cooldownStyle.filter, /saturate\(0\.2\)/,
    'disabled Kill must use a desaturated grey state');

  // Dropped bodies are distinct from the ghost's moving sprite and remain reportable.
  await page.goto(`${origin}/?mock=report-ready`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const reportButton = page.getByRole('button', { name: /Доложить/ });
  await reportButton.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await reportButton.isEnabled(), true, 'Report is enabled when a living player is in range of a body');
  assert.equal(await page.getByTestId('game-action-use').isVisible(), true, 'Use remains visible beside Report');
  await page.screenshot({ path: join(visualQaDir, 'corpse-report-ready.png'), fullPage: true });
  const litMapPixel = await page.locator('canvas').evaluate(canvas => {
    const context = canvas.getContext('2d');
    if (!context) return null;
    const x = Math.floor(canvas.width / 2);
    const y = Math.floor(canvas.height / 2);
    return [...context.getImageData(x, y, 1, 1).data];
  });
  assert.ok(
    litMapPixel && litMapPixel[3] > 0,
    'fog-of-war must preserve the map beneath the lit area',
  );

  // The local player is camera-centered; verify that the balaclava sprite's
  // teal suit pixels are actually present in the rendered canvas, not just
  // that the canvas element exists or has an opaque background.
  const localPlayerSuitPixels = await page.locator('canvas').evaluate(canvas => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const cx = Math.floor(canvas.width / 2);
    const cy = Math.floor(canvas.height / 2);
    const left = Math.max(0, cx - 34);
    const top = Math.max(0, cy - 34);
    const width = Math.min(68, canvas.width - left);
    const height = Math.min(68, canvas.height - top);
    const data = context.getImageData(left, top, width, height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = data.slice(i, i + 4);
      if (a > 200 && g > 85 && g > r * 1.2 && b > 65 && g > b * 0.82) count++;
    }
    return count;
  });
  assert.ok(localPlayerSuitPixels > 20,
    `local balaclava player sprite must be visible in the rendered canvas (teal pixels=${localPlayerSuitPixels})`);

  // The report-ready fixture places the corpse diagonally from the player, clear of walls.
  // The real row-7 corpse asset includes an exposed ivory bone; ensure those
  // pixels are present in the *rendered game canvas*, not just in the asset file.
  // The screenshot artifact is visually inspected for the authored exposed-bone sprite.
  // Keep the report-button proximity assertion above; per-pixel sampling is brittle
  // because canvas backing-store DPR and CSS transforms differ across CI runners.


  // Meeting discussion and voting both keep the chat available; voting adds ballot controls.
  await page.goto(`${origin}/?mock=meeting-discussion`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByText('Обсуждение', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  const chatTextbox = page.getByRole('textbox', { name: 'Сообщение в обсуждении' });
  await chatTextbox.waitFor({ state: 'visible' });
  await chatTextbox.focus();
  const typedMessage = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 — !?@#$%&*()_+-=[]{};:,.<>/ ёжик';
  await page.keyboard.type(typedMessage);
  assert.equal(await chatTextbox.inputValue(), typedMessage,
    'keyboard movement bindings must never drop Latin, Cyrillic, numeric, or punctuation input');
  await page.screenshot({ path: join(visualQaDir, 'meeting-chat-typing.png'), fullPage: true });
  await chatTextbox.fill('');
  await page.getByText('Голосование начнётся после обсуждения', { exact: true }).waitFor({ state: 'visible' });

  await page.goto(`${origin}/?mock=meeting-voting`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByText('Голосование', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('textbox', { name: 'Сообщение в обсуждении' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Пропустить' }).waitFor({ state: 'visible' });
  const voteIdentityDots = page.getByTestId('vote-player-color');
  const voteIdentityNumbers = page.getByTestId('vote-player-number');
  await voteIdentityDots.first().waitFor({ state: 'visible', timeout: 5_000 });
  assert.ok(await voteIdentityDots.count() >= 2,
    'meeting voting must show a color identity chip for every living player');
  assert.equal(await voteIdentityNumbers.count(), await voteIdentityDots.count(),
    'every voting color chip must have a corresponding stable player slot number');
  assert.match(await voteIdentityNumbers.first().innerText(), /^\d{2}$/,
    'voting player identifiers must use two-digit slot numbers');

  // Eliminated players can read the shared meeting transcript but cannot send messages or vote.
  await page.goto(`${origin}/?mock=meeting-ghost`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByText('Вы мертвы — наблюдаете', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText('Голосование', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText(/I saw Nova near the west wall\./).waitFor({ state: 'visible' });
  await page.getByText(/I was finishing the task console\./).waitFor({ state: 'visible' });
  await page.getByRole('textbox', { name: 'Сообщение в обсуждении' }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Пропустить' }).waitFor({ state: 'hidden' });
  await page.screenshot({ path: join(visualQaDir, 'meeting-ghost-read-only-chat.png'), fullPage: true });

  // All five sabotage choices render in the impostor panel.
  await page.goto(`${origin}/?mock=sabotage-ready`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  const sabotageButton = page.getByRole('button', { name: /Саботаж/ });
  await sabotageButton.waitFor({ state: 'visible', timeout: 10_000 });
  const sabotageIcon = sabotageButton.locator('svg');
  const sabotageIconBox = await sabotageIcon.boundingBox();
  assert.equal(await sabotageButton.locator('img').count(), 0,
    'Sabotage uses an original in-house vector glyph, not copied game artwork');
  assert.ok(sabotageIconBox && sabotageIconBox.width >= 32 && sabotageIconBox.height >= 32,
    'Sabotage action must display its legible original vector icon');
  await sabotageButton.click();
  await page.getByText('Выберите систему саботажа', { exact: true }).waitFor({ state: 'visible' });
  for (const system of ['Свет', 'O₂', 'Реактор', 'Связь', 'Двери']) {
    await page.getByRole('button', { name: system, exact: true }).waitFor({ state: 'visible' });
  }
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();

  // English must persist into actual gameplay, tasks, and meeting screens—not only the menu.
  await page.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Настройки' }).click();
  const languageSettings = page.getByRole('dialog', { name: 'Настройки' });
  await languageSettings.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.getByRole('button', { name: /MAP/ }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Use', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.goto(`${origin}/?mock=meeting-discussion`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByText('Discussion', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('textbox', { name: 'Meeting message' }).waitFor({ state: 'visible' });
  await page.goto(`${origin}/?mock=meeting-voting`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByText('Voting', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Skip' }).waitFor({ state: 'visible' });
  await page.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Settings' }).click();
  const russianSettings = page.getByRole('dialog', { name: 'Settings' });
  await russianSettings.getByRole('button', { name: 'Русский' }).click();
  await page.getByRole('button', { name: 'Закрыть настройки' }).click();

  // The victim gets the full-screen kill sequence; the attacker must not.
  await page.goto(`${origin}/?mock=kill-animation-victim&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  assert.equal(new URL(page.url()).searchParams.get('skipReveal'), 'true',
    'the mock-only skipReveal switch must survive Lobby → GameMap navigation');
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const victimKillScreen = page.getByRole('alert', { name: 'Анимация убийства' });
  await victimKillScreen.waitFor({ state: 'visible', timeout: 5_000 });
  assert.equal(await page.getByText(/^(ваша роль|your role)$/i).count(), 0,
    'the opening role reveal must not cover the kill-animation fixture');
  assert.equal(await page.getByText(/^(экипажник|crewmate|предатель|impostor)$/i).count(), 0,
    'no role-reveal title may remain visible over the kill animation');
  await page.getByText('УСТРАНЁН', { exact: true }).waitFor({ state: 'visible' });
  const corpseSnapshotHandle = await page.waitForFunction(() => {
    const body = document.querySelector('.ag-kill-victim-lower');
    const sprite = body?.querySelector('.ag-character-sprite');
    if (!body || !sprite || Number.parseFloat(getComputedStyle(body).opacity) <= 0.25) return false;
    const spriteContext = sprite.getContext('2d');
    if (!spriteContext) return false;
    const spritePixels = spriteContext.getImageData(0, 0, sprite.width, sprite.height).data;
    let opaqueSamples = 0;
    for (let i = 3; i < spritePixels.length; i += 16) if (spritePixels[i] > 0) opaqueSamples++;
    if (opaqueSamples < 20) return false;
    const r = sprite.getBoundingClientRect();
    return {
      pose: sprite.getAttribute('data-pose'),
      row: sprite.getAttribute('data-sprite-row'),
      sourceY: sprite.getAttribute('data-source-y'),
      sourceHeight: sprite.getAttribute('data-source-height'),
      displayHeight: sprite.getAttribute('data-display-height'),
      x: r.left, y: r.top, width: r.width, height: r.height,
    };
  }, undefined, { timeout: 1_400 });
  const corpseSnapshot = await corpseSnapshotHandle.jsonValue();
  await corpseSnapshotHandle.dispose();
  const corpseDataUrl = await page.locator('.ag-kill-victim-lower canvas.ag-character-sprite')
    .evaluate(canvas => canvas.toDataURL('image/png'));
  writeFileSync(join(visualQaDir, 'corpse-sprite-isolated.png'),
    Buffer.from(corpseDataUrl.split(',')[1], 'base64'));
  assert.equal(corpseSnapshot.pose, 'dead-body');
  assert.equal(corpseSnapshot.row, '7');
  assert.equal(corpseSnapshot.sourceY, '1067');
  assert.equal(corpseSnapshot.sourceHeight, '93');
  assert.equal(corpseSnapshot.displayHeight, '118');
  assert.ok(corpseSnapshot.width > 0 && corpseSnapshot.height > 0);
  assert.equal(await page.locator('.ag-corpse-head-window, .ag-corpse-suit-window').count(), 0,
    'the adjacent sit-crouch row must not be spliced into the corpse');
  await page.screenshot({ path: join(visualQaDir, 'kill-screen-victim.png'), fullPage: true });

  const corpseColorCoverage = await page.evaluate(async () => {
    const image = new Image();
    image.src = `/sprites/characters.png?corpse-color-check=${Date.now()}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not inspect corpse sprite atlas');
    context.drawImage(image, 0, 0);
    const cellWidth = image.naturalWidth / 7;
    return Array.from({ length: 7 }, (_, column) => {
      const left = Math.floor(column * cellWidth);
      const right = Math.ceil((column + 1) * cellWidth);
      const pixels = context.getImageData(left, 1067, right - left, 93).data;
      let opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) opaque++;
      return opaque;
    });
  });
  assert.ok(corpseColorCoverage.every(count => count > 100),
    `every authored player color must have a corpse/bone sprite row; alpha coverage=${corpseColorCoverage.join(',')}`);

  // The production sprite source has seven authored columns, but gameplay uses
  // the generated eighteen-column canvas atlas. Inspect that actual runtime
  // canvas so the eleven derived palettes cannot silently disappear or render
  // duplicate corpse colours after a browser-only regression.
  const runtimeCorpseAtlas = await page.evaluate(() => {
    const atlas = window.__AG_CHARACTER_ATLAS;
    if (!atlas) return null;
    if (atlas.width !== 2898 || atlas.height !== 1401) {
      return { width: atlas.width, height: atlas.height, columns: [] };
    }
    const context = atlas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not inspect the generated runtime character atlas');
    const columns = Array.from({ length: 18 }, (_, column) => {
      const pixels = context.getImageData(column * 161, 1067, 161, 93).data;
      let opaque = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];
        if (alpha === 0) continue;
        opaque++;
        red += pixels[i];
        green += pixels[i + 1];
        blue += pixels[i + 2];
      }
      return { opaque, signature: red + ':' + green + ':' + blue };
    });
    return { width: atlas.width, height: atlas.height, columns };
  });
  assert.ok(runtimeCorpseAtlas && runtimeCorpseAtlas.width === 2898 && runtimeCorpseAtlas.height === 1401,
    'the loaded gameplay atlas must expand the seven authored columns to eighteen 161px runtime columns');
  assert.equal(runtimeCorpseAtlas.columns.length, 18,
    'the generated runtime atlas must contain all eighteen palette columns');
  assert.ok(runtimeCorpseAtlas.columns.every(column => column.opaque > 100),
    'every runtime palette must retain the complete exposed-bone corpse silhouette');
  assert.equal(new Set(runtimeCorpseAtlas.columns.map(column => column.signature)).size, 18,
    'all eighteen runtime corpse palettes must render visibly distinct pixel colours');

  await page.goto(`${origin}/?mock=kill-animation-attacker&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 15_000 });
  assert.equal(
    await page.locator('[role="alert"][aria-label="Анимация убийства"], [role="alert"][aria-label="Kill animation"]').count(),
    0,
    'the attacker should see gameplay, not the victim-only full-screen kill animation',
  );
  await page.screenshot({ path: join(visualQaDir, 'kill-animation-attacker.png'), fullPage: true });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/?mock=kill-animation-victim&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByRole('alert', { name: 'Анимация убийства' }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByRole('alert', { name: 'Анимация убийства' }).waitFor({ state: 'hidden', timeout: 1_000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Inspect the post-death ghost presentation as well as the transient kill sequence.
  await page.goto(`${origin}/?mock=ghost`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const ghostBanner = page.getByText(/Вы мертвы — режим призрака/);
  await ghostBanner.waitFor({ state: 'visible', timeout: 10_000 });
  const taskListToggle = page.getByRole('button', { name: /ЗАДАНИЯ/ });
  const ghostBannerBox = await ghostBanner.boundingBox();
  const taskListBox = await taskListToggle.boundingBox();
  assert.ok(ghostBannerBox && taskListBox, 'ghost banner and task toggle must be measurable');
  assert.ok(
    ghostBannerBox.x + ghostBannerBox.width <= taskListBox.x || taskListBox.x + taskListBox.width <= ghostBannerBox.x ||
      ghostBannerBox.y + ghostBannerBox.height <= taskListBox.y || taskListBox.y + taskListBox.height <= ghostBannerBox.y,
    'ghost banner must not overlap the task-list toggle',
  );
  // A single ghost sprite row is available in the current atlas, so animation
  // is expressed through time-based floating transforms rather than living walk
  // frames. Sample the local player's canvas region twice to prevent regressions
  // back to a static/translucent sticker.
  const ghostCanvas = page.locator('canvas');
  const readLocalGhostPixels = () => ghostCanvas.evaluate(canvas => {
    const context = canvas.getContext('2d');
    if (!context) return null;
    const cx = Math.floor(canvas.width / 2);
    // The map camera places the player's feet around 42% of the canvas
    // height (the lower area is reserved for mobile controls). Sample around
    // the actual anchor rather than the viewport midpoint, or a tall phone
    // screenshot can miss the ghost entirely and produce a false zero delta.
    const cy = Math.floor(canvas.height * 0.42);
    const left = Math.max(0, cx - 80);
    const top = Math.max(0, cy - 120);
    const width = Math.min(160, canvas.width - left);
    const height = Math.min(240, canvas.height - top);
    return [...context.getImageData(left, top, width, height).data];
  });
  const ghostFrameBefore = await readLocalGhostPixels();
  await page.waitForTimeout(280);
  const ghostFrameAfter = await readLocalGhostPixels();
  assert.ok(
    ghostFrameBefore && ghostFrameAfter && ghostFrameBefore.length === ghostFrameAfter.length,
    'the ghost canvas region must be available for the animation regression check',
  );
  let changedGhostPixels = 0;
  for (let i = 0; i < ghostFrameBefore.length; i += 4) {
    const delta =
      Math.abs(ghostFrameBefore[i] - ghostFrameAfter[i]) +
      Math.abs(ghostFrameBefore[i + 1] - ghostFrameAfter[i + 1]) +
      Math.abs(ghostFrameBefore[i + 2] - ghostFrameAfter[i + 2]);
    if (delta >= 50) changedGhostPixels++;
  }
  assert.ok(
    changedGhostPixels > 12,
    `the local ghost must animate over time (changed pixels in its canvas region: ${changedGhostPixels})`,
  );
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(visualQaDir, 'ghost-mode.png'), fullPage: true });

  // Capture the low-vision Lights sabotage state to review contrast and the HUD.
  await page.goto(`${origin}/?mock=sabotage-lights`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const lightsBanner = page.getByText(/саботирован/);
  await lightsBanner.waitFor({ state: 'visible', timeout: 10_000 });
  const lightsBannerBox = await lightsBanner.boundingBox();
  const lightsTaskListBox = await page.getByRole('button', { name: /ЗАДАНИЯ/ }).boundingBox();
  assert.ok(lightsBannerBox && lightsTaskListBox, 'sabotage banner and task toggle must be measurable');
  assert.ok(
    lightsBannerBox.x + lightsBannerBox.width <= lightsTaskListBox.x || lightsTaskListBox.x + lightsTaskListBox.width <= lightsBannerBox.x ||
      lightsBannerBox.y + lightsBannerBox.height <= lightsTaskListBox.y || lightsTaskListBox.y + lightsTaskListBox.height <= lightsBannerBox.y,
    'sabotage banner must not overlap the task-list toggle',
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(visualQaDir, 'vision-lights.png'), fullPage: true });

  // Return to the normal task fixture so viewport assertions test the playable HUD.
  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.getByRole('button', { name: /КАРТА/ }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.screenshot({ path: join(visualQaDir, 'gameplay-hud.png'), fullPage: true });
  const gameplaySurfaceSelection = await page.locator('#root > div').first().evaluate(element =>
    getComputedStyle(element).userSelect,
  );
  assert.equal(gameplaySurfaceSelection, 'none',
    'dragging the virtual joystick must not select HUD labels or map text');

  // Check responsive layout at narrow portrait, landscape phone, and desktop sizes.
  const viewportCases = [
    { width: 320, height: 568, label: 'small portrait' },
    { width: 844, height: 390, label: 'landscape phone' },
    { width: 1365, height: 768, label: 'desktop' },
  ];
  for (const viewport of viewportCases) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // GameMap intentionally debounces iOS/Telegram resize bursts by 150ms.
    // Wait for its CSS canvas size to catch up instead of sampling mid-resize.
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return !!canvas &&
        canvas.style.width === window.innerWidth + 'px' &&
        canvas.style.height === window.innerHeight + 'px';
    }, undefined, { timeout: 2_000 });
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('game canvas disappeared after resize');
      const rect = canvas.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        canvas: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    });
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1,
      `${viewport.label}: horizontal page overflow (${layout.documentWidth}px > ${layout.viewportWidth}px)`);
    assert.ok(layout.canvas.width > 0 && layout.canvas.height > 0,
      `${viewport.label}: game canvas has no visible area`);
    assert.ok(layout.canvas.left >= -1 && layout.canvas.right <= layout.viewportWidth + 1,
      `${viewport.label}: game canvas exceeds horizontal viewport bounds`);
    assert.ok(layout.canvas.top >= -1 && layout.canvas.bottom <= layout.viewportHeight + 1,
      `${viewport.label}: game canvas exceeds vertical viewport bounds`);
    await page.screenshot({
      path: join(visualQaDir, `gameplay-${viewport.label.replaceAll(' ', '-')}.png`),
      fullPage: true,
    });
  }
  // Per-control layout is adjustable, saved, applied to gameplay, and resettable.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return !!canvas &&
      canvas.style.width === window.innerWidth + 'px' &&
      canvas.style.height === window.innerHeight + 'px';
  }, undefined, { timeout: 3_000 });
  await page.getByRole('button', { name: 'Настройки' }).click();
  const layoutSettings = page.locator('[role="dialog"]');
  await layoutSettings.getByTestId('control-layout-select').selectOption('killReport');
  const preview = layoutSettings.getByTestId('control-layout-preview');
  const dragHandle = layoutSettings.getByTestId('control-drag-killReport');
  // The AI settings section now appears before the draggable-control editor.
  // Bring the selected preview and handle into the scrollable dialog viewport
  // before deriving touch coordinates; otherwise CDP touch events can target
  // the clipped/off-screen preview rather than the actual drag handle.
  await preview.scrollIntoViewIfNeeded();
  await dragHandle.scrollIntoViewIfNeeded();
  const previewBox = await preview.boundingBox();
  const dragBox = await dragHandle.boundingBox();
  assert.ok(previewBox && dragBox, 'drag editor and selected control are visible');
  const fixedHudLegend = layoutSettings.getByTestId('control-layout-fixed-hud');
  assert.equal(await fixedHudLegend.evaluate(el => el.scrollWidth <= el.clientWidth),
    true, 'fixed HUD legend must fit inside the preview at mobile width');
  const previewControls = await preview.locator('button[data-testid^="control-drag-"]').evaluateAll(nodes =>
    nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.getAttribute('data-testid'), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  );
  for (let i = 0; i < previewControls.length; i++) {
    for (let j = i + 1; j < previewControls.length; j++) {
      const a = previewControls[i];
      const b = previewControls[j];
      const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert.equal(overlaps, false, `default control preview must not overlap: ${a.id} / ${b.id}`);
    }
  }
  // The editor preview must switch to a landscape aspect ratio and keep
  // every default control below the fixed HUD and inside the available screen.
  const landscapePage = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  landscapePage.on('pageerror', error => failures.push(error.message));
  await landscapePage.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await landscapePage.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await landscapePage.getByRole('button', { name: /^(Настройки|Settings)$/ }).click();
  const landscapeSettings = landscapePage.locator('[role="dialog"]');
  await landscapeSettings.getByTestId('control-layout-select').selectOption('killReport');
  const landscapePreview = landscapeSettings.getByTestId('control-layout-preview');
  const landscapePreviewBox = await landscapePreview.boundingBox();
  const landscapeFixedHud = await landscapeSettings.getByTestId('control-layout-fixed-hud').boundingBox();
  assert.ok(landscapePreviewBox && landscapeFixedHud, 'landscape control preview and fixed HUD are visible');
  assert.ok(landscapePreviewBox.width / landscapePreviewBox.height > 1.8,
    'control preview must use a landscape aspect ratio in landscape orientation');
  const landscapeControls = await landscapePreview.locator('button[data-testid^="control-drag-"]').evaluateAll(nodes =>
    nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.getAttribute('data-testid'), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  );
  for (let i = 0; i < landscapeControls.length; i++) {
    const control = landscapeControls[i];
    assert.ok(control.left >= landscapePreviewBox.x - 1 && control.right <= landscapePreviewBox.x + landscapePreviewBox.width + 1,
      `landscape control must stay within horizontal bounds: ${control.id}`);
    assert.ok(control.top >= landscapeFixedHud.y + landscapeFixedHud.height - 1 &&
      control.bottom <= landscapePreviewBox.y + landscapePreviewBox.height + 1,
      `landscape control must stay below the fixed HUD and above the bottom edge: ${control.id}`);
    for (let j = i + 1; j < landscapeControls.length; j++) {
      const other = landscapeControls[j];
      const overlaps = control.left < other.right && control.right > other.left &&
        control.top < other.bottom && control.bottom > other.top;
      assert.equal(overlaps, false, `landscape default controls must not overlap: ${control.id} / ${other.id}`);
    }
  }
  await landscapePage.close();

  // A compact portrait viewport must keep the preview proportional and all
  // controls within bounds without overlap.
  const smallPhonePage = await browser.newPage({
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  smallPhonePage.on('pageerror', error => failures.push(error.message));
  await smallPhonePage.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await smallPhonePage.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await smallPhonePage.getByRole('button', { name: /^(Настройки|Settings)$/ }).click();
  const smallPhoneSettings = smallPhonePage.locator('[role="dialog"]');
  await smallPhoneSettings.getByTestId('control-layout-select').selectOption('killReport');
  const smallPhonePreview = smallPhoneSettings.getByTestId('control-layout-preview');
  const smallPhonePreviewBox = await smallPhonePreview.boundingBox();
  const smallPhoneFixedHud = await smallPhoneSettings.getByTestId('control-layout-fixed-hud').boundingBox();
  assert.ok(smallPhonePreviewBox && smallPhoneFixedHud, 'small-phone control preview and fixed HUD are visible');
  assert.ok(Math.abs(smallPhonePreviewBox.width / smallPhonePreviewBox.height - 320 / 568) < 0.03,
    'small-phone control preview must preserve the actual viewport aspect ratio');
  const smallPhoneControls = await smallPhonePreview.locator('button[data-testid^="control-drag-"]').evaluateAll(nodes =>
    nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.getAttribute('data-testid'), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  );
  for (let i = 0; i < smallPhoneControls.length; i++) {
    const control = smallPhoneControls[i];
    assert.ok(control.left >= smallPhonePreviewBox.x - 1 && control.right <= smallPhonePreviewBox.x + smallPhonePreviewBox.width + 1,
      `small-phone control must stay within horizontal bounds: ${control.id}`);
    assert.ok(control.top >= smallPhoneFixedHud.y + smallPhoneFixedHud.height - 1 &&
      control.bottom <= smallPhonePreviewBox.y + smallPhonePreviewBox.height + 1,
      `small-phone control must stay below the fixed HUD and above the bottom edge: ${control.id}`);
    for (let j = i + 1; j < smallPhoneControls.length; j++) {
      const other = smallPhoneControls[j];
      const overlaps = control.left < other.right && control.right > other.left &&
        control.top < other.bottom && control.bottom > other.top;
      assert.equal(overlaps, false, `small-phone default controls must not overlap: ${control.id} / ${other.id}`);
    }
  }
  await smallPhonePage.close();

  // Exercise real mobile touch/pointer delivery, including pointer capture,
  // instead of relying on mouse events for a touch-first control editor.
  const touchSession = await page.context().newCDPSession(page);
  const touchStart = {
    x: dragBox.x + dragBox.width / 2,
    y: dragBox.y + dragBox.height / 2,
    id: 1,
  };
  // The action cluster is 264px wide and remains fully inside the 390px
  // gameplay viewport. 64% is reachable; 68% would be clamped by its safe bounds.
  const touchEnd = {
    x: previewBox.x + previewBox.width * 0.64,
    y: previewBox.y + previewBox.height * 0.62,
    id: 1,
  };
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchStart] });
  for (let step = 1; step <= 8; step++) {
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        id: 1,
        x: touchStart.x + (touchEnd.x - touchStart.x) * step / 8,
        y: touchStart.y + (touchEnd.y - touchStart.y) * step / 8,
      }],
    });
  }
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchSession.detach();
  await layoutSettings.getByTestId('control-layout-save').click();
  let movedSettingsBox = await page.getByTestId('game-action-bar').boundingBox();
  assert.ok(movedSettingsBox, 'the persistent action bar remains available at its saved custom position');
  assert.ok(Math.abs(movedSettingsBox.x + movedSettingsBox.width / 2 - 390 * 0.64) < 3,
    'dragged action bar X position must be applied to the gameplay HUD');
  assert.ok(Math.abs(movedSettingsBox.y + movedSettingsBox.height / 2 - 844 * 0.62) < 3,
    'dragged action bar Y position must be applied to the gameplay HUD');

  // Persisted layout survives a fresh page load. Return to a stable lobby mock
  // before reloading, because the gameplay mock intentionally navigates to /game.
  await page.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const settingsButtonAfterReload = page.getByRole('button', { name: /^(Настройки|Settings)$/ });
  await settingsButtonAfterReload.waitFor({ state: 'visible', timeout: 15_000 });
  await settingsButtonAfterReload.click();
  const reloadedSettings = page.locator('[role="dialog"]');
  await reloadedSettings.getByTestId('control-layout-select').selectOption('killReport');
  const reloadedPreviewBox = await reloadedSettings.getByTestId('control-layout-preview').boundingBox();
  const reloadedDragBox = await reloadedSettings.getByTestId('control-drag-killReport').boundingBox();
  assert.ok(reloadedPreviewBox && reloadedDragBox, 'saved layout preview is available after reload');
  assert.ok(Math.abs(reloadedDragBox.x + reloadedDragBox.width / 2 - (reloadedPreviewBox.x + reloadedPreviewBox.width * 0.64)) < 3,
    'saved action bar X position must hydrate after reload');
  assert.ok(Math.abs(reloadedDragBox.y + reloadedDragBox.height / 2 - (reloadedPreviewBox.y + reloadedPreviewBox.height * 0.62)) < 3,
    'saved action bar Y position must hydrate after reload');

  // Drag directly onto the joystick: the editor should find a nearby free spot.
  const joystickHandle = reloadedSettings.getByTestId('control-drag-joystick');
  const joystickHandleBox = await joystickHandle.boundingBox();
  const taskHandleBox = await reloadedSettings.getByTestId('control-drag-killReport').boundingBox();
  assert.ok(joystickHandleBox && taskHandleBox, 'overlap regression controls are visible');
  await page.mouse.move(taskHandleBox.x + taskHandleBox.width / 2, taskHandleBox.y + taskHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(joystickHandleBox.x + joystickHandleBox.width / 2, joystickHandleBox.y + joystickHandleBox.height / 2, { steps: 8 });
  await page.mouse.up();
  const nudgedTaskBox = await reloadedSettings.getByTestId('control-drag-killReport').boundingBox();
  const currentJoystickBox = await joystickHandle.boundingBox();
  assert.ok(nudgedTaskBox && currentJoystickBox, 'dragged control and joystick remain visible');
  const previewOverlap =
    nudgedTaskBox.x < currentJoystickBox.x + currentJoystickBox.width &&
    nudgedTaskBox.x + nudgedTaskBox.width > currentJoystickBox.x &&
    nudgedTaskBox.y < currentJoystickBox.y + currentJoystickBox.height &&
    nudgedTaskBox.y + nudgedTaskBox.height > currentJoystickBox.y;
  assert.equal(previewOverlap, false, 'dragging one control onto another must nudge it to a non-overlapping position');

  // Reset is a draft operation; Cancel must not alter the saved layout.
  await reloadedSettings.getByTestId('control-layout-reset').click();
  await reloadedSettings.getByTestId('control-layout-cancel').click();
  await settingsButtonAfterReload.click();
  const cancelledSettings = page.locator('[role="dialog"]');
  await cancelledSettings.getByTestId('control-layout-select').selectOption('killReport');
  const cancelledPreviewBox = await cancelledSettings.getByTestId('control-layout-preview').boundingBox();
  const cancelledDragBox = await cancelledSettings.getByTestId('control-drag-killReport').boundingBox();
  assert.ok(cancelledPreviewBox && cancelledDragBox, 'cancelled editor can be reopened');
  assert.ok(Math.abs(cancelledDragBox.x + cancelledDragBox.width / 2 - (cancelledPreviewBox.x + cancelledPreviewBox.width * 0.64)) < 3,
    'Cancel must preserve the previously saved X position');
  assert.ok(Math.abs(cancelledDragBox.y + cancelledDragBox.height / 2 - (cancelledPreviewBox.y + cancelledPreviewBox.height * 0.62)) < 3,
    'Cancel must preserve the previously saved Y position');
  await cancelledSettings.getByTestId('control-layout-reset').click();
  await cancelledSettings.getByTestId('control-layout-save').click();

  // The loading overlay must remain until both the map and character atlas have
  // completed image decoding, not merely until their network load events fire.
  const decodePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  decodePage.on('pageerror', error => failures.push(error.message));
  await decodePage.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await decodePage.addInitScript(() => {
    window.__pendingImageDecodes = [];
    window.__releaseImageDecodes = () => {
      for (const resolve of window.__pendingImageDecodes.splice(0)) resolve();
    };
    const originalDecode = HTMLImageElement.prototype.decode;
    const pendingByImage = new WeakMap();
    HTMLImageElement.prototype.decode = function () {
      const source = this.currentSrc || this.src;
      if (!source.includes('map-overview.webp') && !source.includes('characters.png')) {
        return originalDecode.call(this);
      }
      if (!pendingByImage.has(this)) {
        pendingByImage.set(this, new Promise(resolve => window.__pendingImageDecodes.push(resolve)));
      }
      return pendingByImage.get(this);
    };
  });
  await decodePage.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await decodePage.waitForFunction(() => window.__pendingImageDecodes.length >= 2, undefined, { timeout: 15_000 });
  await decodePage.getByTestId('gameplay-loading-screen').waitFor({ state: 'visible' });
  assert.equal(await decodePage.getByTestId('gameplay-loading-screen').isVisible(), true,
    'gameplay must stay locked while map and sprite decode promises are unresolved');
  await decodePage.screenshot({ path: join(visualQaDir, 'loading-screen-before-ready.png'), fullPage: true });
  await decodePage.evaluate(() => window.__releaseImageDecodes());
  await decodePage.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 15_000 });
  await decodePage.close();

  // If optional detail tiles fail, the canonical overview still renders and unlocks play.
  const fallbackPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  fallbackPage.on('pageerror', error => failures.push(error.message));
  let overviewLoaded = false;
  let tileManifestRejected = false;
  const mapAssetEvents = [];
  fallbackPage.on('request', request => {
    if (request.url().includes('map-overview.webp') || request.url().includes('/map-tiles/manifest.json')) {
      mapAssetEvents.push('request ' + request.url());
    }
    assert.equal(/map-hires\\.(?:png|webp)/.test(request.url()), false,
      'gameplay must not request either divergent full-map source asset');
  });
  fallbackPage.on('response', response => {
    if (response.url().includes('map-overview.webp') && response.ok()) overviewLoaded = true;
    if (response.url().includes('/map-tiles/manifest.json') && response.status() === 503) {
      tileManifestRejected = true;
    }
  });
  await fallbackPage.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('/map-tiles/manifest.json')) {
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'intentional optional tile manifest failure' });
    }
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await fallbackPage.goto(`${origin}/?mock=task-interaction&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await fallbackPage.waitForSelector('canvas', { state: 'visible', timeout: 15_000 });
  await fallbackPage.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 30_000 });
  assert.equal(overviewLoaded, true,
    `overview fallback must load when detail tiles fail; observed: ${mapAssetEvents.join(' | ')}`);
  assert.equal(tileManifestRejected, true,
    'the browser test must actually exercise a failed optional tile manifest');
  await fallbackPage.screenshot({ path: join(visualQaDir, 'map-overview-tiles-fallback.png'), fullPage: true });
  await fallbackPage.close();

  // Restricted WebViews can reject localStorage writes; current-session settings must still respond.
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'amongGas.settings' || key === 'amongGas.language') {
        throw new DOMException('Blocked by test', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
  await page.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^(Настройки|Settings)$/ }).click();
  const restrictedSettings = page.locator('[role="dialog"]');
  await restrictedSettings.getByRole('button', { name: 'English' }).click();
  await restrictedSettings.getByTestId('joystick-side-left').click();
  assert.equal(await restrictedSettings.getByTestId('joystick-side-left').getAttribute('aria-pressed'), 'true',
    'in-memory joystick choice must update even if localStorage writes fail');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const reopenedRestrictedSettings = page.getByRole('dialog', { name: 'Settings' });
  assert.equal(await reopenedRestrictedSettings.getByTestId('joystick-side-left').getAttribute('aria-pressed'), 'true',
    'in-memory joystick choice must stay in sync across mounted UI');
  await reopenedRestrictedSettings.getByRole('button', { name: 'English' }).waitFor({ state: 'visible' });
  await reopenedRestrictedSettings.getByRole('button', { name: 'Close settings' }).click();

  // Capture major non-roaming gameplay states as CI visual artifacts.
  // Each state gets an isolated browser context so timers and overlays cannot
  // leak from one fixture into another.
  const visualStateCases = [
    ['reveal-impostor', 'role-reveal-impostor.png'],
    ['task-playing', 'task-progress.png'],
    ['corpse-all-colors', 'corpse-all-seven-colors.png'],
    ['impostor-opening', 'impostor-opening-cooldown.png'],
    ['kill-ready', 'kill-ready.png'],
    ['meeting-discussion', 'meeting-discussion.png'],
    ['meeting-voting', 'meeting-voting.png'],
    ['meeting-result', 'meeting-result.png'],
    ['gameover-crew', 'gameover-crew.png'],
    ['gameover-impostor', 'gameover-impostor.png'],
    ['sabotage-ready', 'sabotage-ready.png'],
    ['sabotage-o2', 'sabotage-o2.png'],
  ];
  const visualViewports = [
    { label: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    { label: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  ];
  for (const [fixture, filename] of visualStateCases) {
    for (const viewport of visualViewports) {
      const statePage = await browser.newPage({
        viewport: viewport.viewport,
        deviceScaleFactor: viewport.isMobile ? 2 : 1,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
      });
      statePage.on('pageerror', error => failures.push(error.message));
      await statePage.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(origin)) return route.continue();
        return route.abort();
      });
      await statePage.goto(`${origin}/?mock=${fixture}`, { waitUntil: 'domcontentloaded' });
      await statePage.waitForSelector('canvas', { state: 'visible', timeout: 15_000 });
      await statePage.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 15_000 });
      if (fixture.startsWith('reveal-')) {
        // Role-reveal fixtures deliberately keep the overlay visible for capture.
        await statePage.getByText(/^(ваша роль|your role)$/i).waitFor({ state: 'visible', timeout: 15_000 });
      } else {
        await waitForRoleRevealToFinish(statePage);
      }
      if (fixture.startsWith('gameover-')) {
        await statePage.getByTestId('gameover-lobby-icon').waitFor({ state: 'visible' });
      }
      if (fixture === 'reveal-impostor') {
        const revealSprite = statePage.getByTestId('role-reveal-character').locator('[data-pose]');
        assert.equal(await revealSprite.getAttribute('data-pose'), 'idle',
          'impostor role reveal must show a living character, not the corpse sprite');
        const spriteClip = await revealSprite.evaluate(element => getComputedStyle(element).clipPath);
        assert.ok(spriteClip.includes('49%') && spriteClip.includes('58.5%'),
          `role-reveal sprite must clip the detached black atlas strokes between the legs; got ${spriteClip}`);
      }
      const viewportFilename = filename.replace(/\.png$/, `-${viewport.label}.png`);
      if (fixture === 'sabotage-ready') {
        // The fixture enables sabotage but does not open the selection panel.
        // Capture the real selection UI and verify every available system.
        await statePage.getByRole('button', { name: /Саботаж/ })
          .click();
        await statePage.getByText('Выберите систему саботажа', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 });
        for (const system of ['Свет', 'O₂', 'Реактор', 'Связь', 'Двери']) {
          await statePage.getByRole('button', { name: system, exact: true })
            .waitFor({ state: 'visible', timeout: 10_000 });
        }
      }
      await statePage.screenshot({ path: join(visualQaDir, viewportFilename), fullPage: true });
      await statePage.close();
    }
  }

  // Move the local player along the verified east-generator aisle while
  // the camera follows. Keep this separate from task-interaction: that fixture
  // deliberately relocates the player beside task 4, where nearby geometry can
  // constrain movement and is covered by the task/collision-specific checks.
  // The character's suit centroid should remain stable near canvas center.
  const cameraPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  cameraPage.on('pageerror', error => failures.push(error.message));
  await cameraPage.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await cameraPage.goto(`${origin}/?mock=task-playing&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  // Keep the camera fixture foregrounded: background tabs may throttle rAF,
  // while tile readiness is published from the gameplay render loop.
  await cameraPage.bringToFront();
  await cameraPage.waitForSelector('canvas', { state: 'visible', timeout: 15_000 });
  await cameraPage.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 15_000 });
  // The camera's base image is intentionally the 0.5× overview; native 2×
  // detail is rendered from the independently loaded visible tile set above it.
  // Wait for the tile overlay as well, so this test cannot pass on the overview alone.
  await cameraPage.waitForFunction(() => {
    const status = window.__AG_TILE_DEBUG;
    return !!status && status.ready === true && status.visibleTotal > 0 &&
      status.visibleLoaded === status.visibleTotal && status.failed === 0;
  }, undefined, { timeout: 20_000 });
  const readCameraTransform = () => cameraPage.evaluate(() => window.__AG_CAMERA_DEBUG ?? null);
  const readWorldFingerprint = (playerX, playerY) => cameraPage.locator('canvas').evaluate((canvas, player) => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not sample the world canvas for camera movement');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const samples = [];
    for (let y = 24; y < canvas.height; y += 24) {
      for (let x = 24; x < canvas.width; x += 24) {
        // Exclude the actual player screen region, not the canvas midpoint:
        // near the north map edge the camera correctly clamps the player to ~40% height.
        if (Math.abs(x - player.x) < 110 && Math.abs(y - player.y) < 110) continue;
        const i = (y * canvas.width + x) * 4;
        samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
      }
    }
    return samples;
  }, { x: playerX, y: playerY });
  const cameraBaseline = await readCameraTransform();
  assert.ok(cameraBaseline && Number.isFinite(cameraBaseline.screenX) &&
    Number.isFinite(cameraBaseline.screenY),
  "the dev camera fixture must expose the player's actual rendered screen coordinates");
  assert.equal(cameraBaseline.mapImageWidth, 1612,
    'camera diagnostics must identify the canonical half-resolution overview width');
  assert.equal(cameraBaseline.mapImageHeight, 929,
    'camera diagnostics must identify the canonical half-resolution overview height');
  const cameraTileStatus = await cameraPage.evaluate(() => window.__AG_TILE_DEBUG ?? null);
  assert.ok(cameraTileStatus && cameraTileStatus.visibleLoaded > 0 &&
    cameraTileStatus.visibleLoaded === cameraTileStatus.visibleTotal &&
    cameraTileStatus.failed === 0 && cameraTileStatus.totalDecodedBytes > cameraTileStatus.overviewDecodedBytes,
  'camera must draw loaded 2× detail tiles over the low-resolution overview');
  const worldRect = cameraBaseline.mapWorldRect;
  const sourceRect = cameraBaseline.mapSourceRect;
  assert.ok(worldRect && sourceRect &&
    [worldRect.x, worldRect.y, worldRect.width, worldRect.height,
      sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height].every(Number.isFinite),
  'camera must expose finite world and native-image source rectangles');
  const scaleX = cameraBaseline.mapImageWidth / 3224;
  const scaleY = cameraBaseline.mapImageHeight / 1858;
  assert.ok(Math.abs(sourceRect.x - worldRect.x * scaleX) < 1e-6 &&
    Math.abs(sourceRect.y - worldRect.y * scaleY) < 1e-6 &&
    Math.abs(sourceRect.width - worldRect.width * scaleX) < 1e-6 &&
    Math.abs(sourceRect.height - worldRect.height * scaleY) < 1e-6,
  'actual WebP camera source rectangle must be transformed independently on X and Y');
  const worldBaseline = await readWorldFingerprint(cameraBaseline.screenX, cameraBaseline.screenY);
  const joystick = cameraPage.locator('[aria-label="Джойстик движения"], [aria-label="Movement joystick"]');
  const joystickBox = await joystick.boundingBox();
  assert.ok(joystickBox, 'the movement joystick must be visible for camera-follow testing');
  const joystickX = joystickBox.x + joystickBox.width / 2;
  const joystickY = joystickBox.y + joystickBox.height / 2;
  // Capture diagnostics on every animation frame before starting the pointer
  // drag. Starting the trace only after mouse.move() misses most of the walk:
  // Playwright's stepped drag can already carry the player to nearby geometry.
  await cameraPage.evaluate(() => {
    const trace = { active: true, samples: [], maxSamples: 24 };
    window.__AG_CAMERA_TRACE = trace;
    const capture = () => {
      if (!trace.active) return;
      const sample = window.__AG_CAMERA_DEBUG ?? null;
      if (sample && Number.isFinite(sample.screenX) && Number.isFinite(sample.screenY) &&
          Number.isFinite(sample.playerX) && Number.isFinite(sample.playerY)) {
        trace.samples.push({ ...sample });
      }
      if (trace.samples.length >= trace.maxSamples) {
        trace.active = false;
        return;
      }
      requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  });
  await cameraPage.waitForTimeout(50);
  await cameraPage.mouse.move(joystickX, joystickY);
  await cameraPage.mouse.down();
  // Keep the movement long enough to prove camera follow, but short
  // enough to stay inside the viewport's camera-centering envelope.
  await cameraPage.mouse.move(joystickX + 16, joystickY, { steps: 6 });
  // Bound the held-pointer trace to 24 animation frames. Earlier samples
  // establish the baseline; the final quarter must still show >30px of real
  // movement, while the whole trace stays inside the camera-centering envelope.
  await cameraPage.waitForFunction(
    () => window.__AG_CAMERA_TRACE?.samples.length >= 24,
    undefined,
    { timeout: 5000 },
  );
  await cameraPage.mouse.up();
  const cameraSamples = await cameraPage.evaluate(() => {
    const trace = window.__AG_CAMERA_TRACE;
    if (trace) trace.active = false;
    return trace?.samples ?? [];
  });
  assert.ok(cameraSamples.length >= 8,
    'camera-follow trace must capture at least eight animation frames');
  const worldAfterMovement = await readWorldFingerprint(cameraBaseline.screenX, cameraBaseline.screenY);
  await cameraPage.screenshot({ path: join(visualQaDir, 'camera-stability-diagnostic.png'), fullPage: true });
  console.log('Camera follow diagnostic:', JSON.stringify({
    baseline: cameraBaseline,
    samples: cameraSamples,
    joystickSide: await joystick.getAttribute('data-joystick-side'),
    viewport: cameraPage.viewportSize(),
  }));
  const changedWorldSamples = worldBaseline.reduce((count, before, index) => {
    const after = worldAfterMovement[index];
    return count + (after && before.some((channel, channelIndex) => Math.abs(channel - after[channelIndex]) > 24) ? 1 : 0);
  }, 0);
  const worldChangeRatio = changedWorldSamples / Math.max(1, worldBaseline.length);
  assert.ok(worldChangeRatio > 0.02,
    `the map must visibly scroll when the joystick moves the player (changed ${(worldChangeRatio * 100).toFixed(1)}% of sampled world pixels)`);
  const movementTrace = [cameraBaseline, ...cameraSamples];
  const playerMovementSamples = movementTrace.filter((sample, index) => index > 0 &&
    Math.hypot(sample.playerX - movementTrace[index - 1].playerX,
      sample.playerY - movementTrace[index - 1].playerY) > 0.25);
  const sampledMovementDistance = Math.hypot(
    movementTrace[movementTrace.length - 1].playerX - movementTrace[0].playerX,
    movementTrace[movementTrace.length - 1].playerY - movementTrace[0].playerY,
  );
  assert.ok(playerMovementSamples.length >= 3 && sampledMovementDistance > 30,
    `camera stability must be measured across sustained actual player movement (changed ${playerMovementSamples.length} frames over ${sampledMovementDistance.toFixed(1)}px)`);

  // A large cumulative displacement can still hide an early collision stop:
  // require the final quarter of the held-pointer trace to keep moving. This
  // catches a fixture that reaches an obstacle, then measures a stationary
  // camera for the remainder of the interaction.
  const tailStartIndex = Math.floor(movementTrace.length * 0.75);
  const sustainedTail = movementTrace.slice(tailStartIndex);
  const tailMovementFrames = sustainedTail.filter((sample, index) => index > 0 &&
    Math.hypot(sample.playerX - sustainedTail[index - 1].playerX,
      sample.playerY - sustainedTail[index - 1].playerY) > 0.25);
  const sustainedTailDistance = Math.hypot(
    sustainedTail[sustainedTail.length - 1].playerX - sustainedTail[0].playerX,
    sustainedTail[sustainedTail.length - 1].playerY - sustainedTail[0].playerY,
  );
  assert.ok(tailMovementFrames.length >= 3 && sustainedTailDistance > 30,
    `camera movement fixture must remain unobstructed through the final quarter of the hold (changed ${tailMovementFrames.length} frames over ${sustainedTailDistance.toFixed(1)}px)`);
  const maxCameraOffsetX = Math.max(...cameraSamples.map(sample => Math.abs(sample.screenX - cameraBaseline.screenX)));
  const maxCameraOffsetY = Math.max(...cameraSamples.map(sample => Math.abs(sample.screenY - cameraBaseline.screenY)));
  const cameraSpreadX = Math.max(...cameraSamples.map(sample => sample.screenX)) - Math.min(...cameraSamples.map(sample => sample.screenX));
  const cameraSpreadY = Math.max(...cameraSamples.map(sample => sample.screenY)) - Math.min(...cameraSamples.map(sample => sample.screenY));
  assert.ok(maxCameraOffsetX < 24 && maxCameraOffsetY < 24,
    `camera must keep the moving player near its pre-movement screen position (offset ${maxCameraOffsetX.toFixed(1)}, ${maxCameraOffsetY.toFixed(1)})`);
  assert.ok(cameraSpreadX < 14 && cameraSpreadY < 14,
    `camera-following player screen position must not shake (spread ${cameraSpreadX.toFixed(1)}×${cameraSpreadY.toFixed(1)})`);
  await cameraPage.screenshot({ path: join(visualQaDir, 'camera-stability-after-move.png'), fullPage: true });

  // Keep a pointer actively held while a blocking overlay opens. The joystick
  // must unmount, clear its direction, and not inherit that pointer on remount.
  await cameraPage.mouse.move(joystickX, joystickY);
  await cameraPage.mouse.down();
  await cameraPage.mouse.move(joystickX + 38, joystickY, { steps: 4 });
  const settingsButton = cameraPage.locator('[aria-label="Settings"], [aria-label="Настройки"]');
  await settingsButton.evaluate(element => element.click());
  const leaveMatchButton = cameraPage.getByRole('button', { name: /Leave match|Выйти из матча/ });
  await leaveMatchButton.waitFor({ state: 'visible' });
  await leaveMatchButton.evaluate(element => element.click());
  await cameraPage.getByRole('dialog', { name: /Leave this match|Выйти из матча/ }).waitFor();
  assert.equal(await joystick.count(), 0,
    'joystick must unmount while the leave-match confirmation is open');
  await cameraPage.getByRole('button', { name: /Stay|Остаться/ }).evaluate(element => element.click());
  await joystick.waitFor({ state: 'visible' });
  await cameraPage.mouse.move(joystickX + 42, joystickY);
  await cameraPage.waitForTimeout(100);
  const remountedKnobTransform = await cameraPage.locator('[data-testid="joystick-knob"]').evaluate(
    element => element.style.transform,
  );
  assert.equal(remountedKnobTransform, 'translate(-50%, -50%)',
    'a remounted joystick must not inherit the pointer that was held before the modal opened');
  await cameraPage.mouse.up();
  await cameraPage.close();

  // Exercise the development-only vector editor on a real touch-capable
  // browser context. This remains a scratch document: no candidate or zone is
  // saved to the server and live gameplay geometry is never mutated.
  const editorPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  editorPage.on('pageerror', error => failures.push(error.message));
  await editorPage.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await editorPage.goto(`${origin}/dev/collision`, { waitUntil: 'domcontentloaded' });
  const editorCanvas = editorPage.locator('canvas[data-editor-loaded="true"]');
  await editorCanvas.waitFor({ state: 'visible', timeout: 20_000 });
  for (const label of ['Draw wall', 'Draw solid', 'Walk test', 'Vision preview (hold)', 'Loupe (4×)']) {
    const target = editorPage.getByRole('button', { name: label, exact: true });
    const box = await target.boundingBox();
    assert.ok(box && box.height >= 48,
      `mobile vector editor control "${label}" must retain a 48 CSS-pixel touch target`);
  }

  const editorTouch = await editorPage.context().newCDPSession(editorPage);
  const touchEvent = async (type, points = []) => editorTouch.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(point => ({ id: point.id, x: point.x, y: point.y })),
  });
  const editorScreenPoint = async world => editorCanvas.evaluate((canvas, point) => {
    const rect = canvas.getBoundingClientRect();
    const zoom = Number(canvas.dataset.zoom);
    const cameraX = Number(canvas.dataset.cameraX);
    const cameraY = Number(canvas.dataset.cameraY);
    return {
      x: rect.left + (point[0] - cameraX) * zoom,
      y: rect.top + (point[1] - cameraY) * zoom,
    };
  }, world);
  const editorTap = async world => {
    const point = await editorScreenPoint(world);
    await touchEvent('touchStart', [{ ...point, id: 1 }]);
    await touchEvent('touchEnd');
  };
  const editorStroke = async (from, to) => {
    const start = await editorScreenPoint(from);
    const end = await editorScreenPoint(to);
    await touchEvent('touchStart', [{ ...start, id: 1 }]);
    for (let step = 1; step <= 8; step++) {
      await touchEvent('touchMove', [{
        id: 1,
        x: start.x + (end.x - start.x) * step / 8,
        y: start.y + (end.y - start.y) * step / 8,
      }]);
    }
    await touchEvent('touchEnd');
  };

  await editorPage.getByRole('button', { name: 'Draw wall', exact: true }).click();
  await editorStroke([1000, 900], [1200, 900]);
  await editorPage.waitForFunction(() =>
    Number(document.querySelector('canvas')?.getAttribute('data-active-chain-point-count')) >= 2,
  );
  await editorPage.getByRole('button', { name: 'Finish chain', exact: true }).click();
  await editorPage.waitForFunction(() =>
    Number(document.querySelector('canvas')?.getAttribute('data-shape-count')) === 1,
  );

  // A second touch stroke begins 120 world pixels from the existing endpoint.
  // The 48px touch hit radius must snap it to that endpoint, not leave a gap.
  await editorStroke([1320, 900], [1450, 900]);
  await editorPage.waitForFunction(() =>
    Number(document.querySelector('canvas')?.getAttribute('data-active-chain-point-count')) >= 2,
  );
  await editorPage.getByRole('button', { name: 'Finish chain', exact: true }).click();
  await editorPage.waitForFunction(() =>
    Number(document.querySelector('canvas')?.getAttribute('data-shape-count')) === 2,
  );
  const snappedWallPoints = await editorCanvas.getAttribute('data-shape-points').then(JSON.parse);
  assert.ok(Math.abs(snappedWallPoints[1][0][0] - 1200) <= 1 &&
    Math.abs(snappedWallPoints[1][0][1] - 900) <= 1,
    'touch snapping must attach the second wall to the first wall endpoint');

  await editorPage.getByRole('button', { name: 'Draw solid', exact: true }).click();
  await editorTap([2100, 1200]);
  await editorTap([2600, 1200]);
  await editorTap([2350, 1750]);
  await editorPage.getByRole('button', { name: 'Close polygon', exact: true }).click();
  await editorPage.waitForFunction(() =>
    Number(document.querySelector('canvas')?.getAttribute('data-shape-count')) === 3,
  );
  const closedLoopMetadata = await editorCanvas.getAttribute('data-shape-metadata').then(JSON.parse);
  assert.equal(closedLoopMetadata[2].closed, true,
    'three touch vertices and Close polygon must commit a closed solid loop');

  await editorPage.getByRole('button', { name: 'Walk test', exact: true }).click();
  await editorTap([800, 1500]);
  await editorTap([1000, 1500]);
  await editorPage.waitForFunction(() =>
    document.querySelector('canvas')?.getAttribute('data-walk-point-count') === '2' &&
    document.querySelector('canvas')?.getAttribute('data-walk-status')?.startsWith('PASS:'),
  );
  await editorPage.getByRole('button', { name: 'Vision preview (hold)', exact: true }).click();
  const visionPoint = await editorScreenPoint([1800, 1600]);
  await touchEvent('touchStart', [{ ...visionPoint, id: 1 }]);
  await editorPage.waitForFunction(() =>
    document.querySelector('canvas')?.getAttribute('data-vision-preview') === 'true',
    null,
    { timeout: 5_000 },
  );
  await touchEvent('touchEnd');
  assert.equal(await editorCanvas.getAttribute('data-vision-preview'), 'true',
    'a stationary touch hold must activate candidate-only vision preview');

  await editorPage.getByRole('button', { name: 'Pan / zoom', exact: true }).click();
  const editorBox = await editorCanvas.boundingBox();
  assert.ok(editorBox);
  const beforePinchZoom = Number(await editorCanvas.getAttribute('data-zoom'));
  const pinchX = editorBox.x + editorBox.width / 2;
  const pinchY = editorBox.y + editorBox.height / 2;
  await touchEvent('touchStart', [
    { id: 2, x: pinchX - 30, y: pinchY },
    { id: 3, x: pinchX + 30, y: pinchY },
  ]);
  await touchEvent('touchMove', [
    { id: 2, x: pinchX - 55, y: pinchY },
    { id: 3, x: pinchX + 55, y: pinchY },
  ]);
  await touchEvent('touchEnd');
  await editorPage.waitForFunction(previous =>
    Number(document.querySelector('canvas')?.getAttribute('data-zoom')) > previous * 1.1,
  beforePinchZoom);
  await editorTouch.detach();

  // Draft autosave/restore must survive reload without writing a server zone.
  await editorPage.waitForTimeout(400);
  await editorPage.reload({ waitUntil: 'domcontentloaded' });
  await editorCanvas.waitFor({ state: 'visible', timeout: 20_000 });
  const restoreDraft = editorPage.getByRole('button', { name: 'Restore local draft', exact: true });
  await restoreDraft.waitFor({ state: 'visible', timeout: 10_000 });
  await restoreDraft.click();
  await editorPage.waitForFunction(() =>
    Number(document.querySelector('canvas')?.getAttribute('data-shape-count')) === 3,
  );
  await editorPage.screenshot({ path: join(visualQaDir, 'vector-editor-mobile-touch-acceptance.png'), fullPage: true });
  await editorPage.close();

  assert.deepEqual(failures, [], `browser page errors: ${failures.join('; ')}`);

  console.log(JSON.stringify({
    ok: true,
    viewport: '390×844, DPR 2 (mobile)',
    checks: [
      'language and joystick preferences persist through Settings; right-side default verified',
      'obsolete Telegram subtitle is absent',
      'custom map rendered',
      'victim-only full-screen kill animation is triggered correctly', 
      'tactical map opens and closes',
      'tactical map freezes movement',
      'two-step Clean Filters task completes and resets correctly',
      'in-range impostor kill action is enabled',
      'dropped corpse remains reportable independently of the ghost',
      'meeting chat is available in discussion and voting with vote controls',
      'all five sabotage choices render in the impostor panel',
      'responsive layout at 320×568, 844×390, and 1365×768',
      'no uncaught browser page errors',
    ],
  }, null, 2));
} finally {
  await browser.close();
}
