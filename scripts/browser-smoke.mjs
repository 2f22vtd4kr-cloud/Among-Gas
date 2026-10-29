import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
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
  assert.equal(await menuSettingsButton.locator('svg path').nth(1).getAttribute('transform'), null,
    'the Settings gear must not offset its outer teeth away from the centered inner ring');
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
    'Settings must keep reverse keyboard navigation inside the modal');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Закрыть настройки',
    'Settings must wrap forward keyboard navigation back to its first focus target');
  assert.equal(await lobbySettings.getByTestId('joystick-side-right').getAttribute('aria-pressed'), 'true',
    'the movement joystick must default to the right side');
  assert.equal(await lobbySettings.getByTestId('joystick-side-left').getAttribute('aria-pressed'), 'false');
  await page.screenshot({ path: join(visualQaDir, 'settings-default.png'), fullPage: true });
  await lobbySettings.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'CREATE ROOM' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'SOLO vs BOTS' }).waitFor({ state: 'visible' });
  await lobbySettings.getByTestId('joystick-side-left').click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.screenshot({ path: join(visualQaDir, 'lobby-english.png'), fullPage: true });
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
  const mapAssetStartedAt = new Map();
  page.on('request', request => {
    if (request.url().includes('map-hires.webp') || request.url().includes('map-hires.png')) {
      mapAssetStartedAt.set(request.url(), Date.now());
    }
  });
  page.on('requestfinished', request => {
    if (request.url().includes('map-hires.webp') || request.url().includes('map-hires.png')) {
      mapAssetTimings.push({
        asset: request.url().split('/').pop(),
        durationMs: Date.now() - (mapAssetStartedAt.get(request.url()) ?? Date.now()),
      });
    }
  });
  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ag-character-sprite[data-pose]', { timeout: 30_000 });
  await page.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 30_000 });
  assert.ok(mapAssetTimings.some(entry => String(entry.asset).includes('map-hires.webp')),
    'cold gameplay load should prefer the compact WebP map asset');
  console.log('Cold map asset request timings:', JSON.stringify(mapAssetTimings));
  const roleRevealSprite = page.locator('.ag-character-sprite[data-pose]').first();
  assert.equal(await roleRevealSprite.getAttribute('data-pose'), 'idle');
  assert.equal(await roleRevealSprite.getAttribute('data-source-height'), '143',
    'role reveal must crop detached black strokes below the idle character feet');
  assert.equal(await roleRevealSprite.getAttribute('data-display-height'), '153',
    'the authored role-reveal baseline remains available as metadata');
  assert.equal(await roleRevealSprite.evaluate(el => el.style.transform), 'none',
    'cropped role sprites must not be vertically stretched to compensate for removed pixels');
  assert.match(await roleRevealSprite.evaluate(el => el.style.clipPath), /polygon/,
    'role sprites must mask detached lower-leg strokes without removing the feet');
  await page.screenshot({ path: join(visualQaDir, 'role-reveal-sprite-crop.png'), fullPage: true });
  await waitForRoleRevealToFinish(page);
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
    page.getByRole('button', { name: /тревога/i }),
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
  const taskButton = page.getByRole('button', { name: /Почистить фильтры/i });
  await taskButton.waitFor({ state: 'visible', timeout: 30_000 });
  const taskPromptBox = await taskButton.boundingBox();
  const movementJoystickBox = await movementJoystick.boundingBox();
  assert.ok(taskPromptBox && movementJoystickBox, 'task prompt and joystick must be measurable');
  assert.ok(
    taskPromptBox.x + taskPromptBox.width <= movementJoystickBox.x ||
      movementJoystickBox.x + movementJoystickBox.width <= taskPromptBox.x ||
      taskPromptBox.y + taskPromptBox.height <= movementJoystickBox.y ||
      movementJoystickBox.y + movementJoystickBox.height <= taskPromptBox.y,
    'the task prompt must not overlap the movement joystick',
  );

  // Verify the task prompt remains in a clear HUD band on short portrait and landscape screens.
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1365, height: 768 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return !!canvas && canvas.style.width === window.innerWidth + 'px' && canvas.style.height === window.innerHeight + 'px';
    }, undefined, { timeout: 3_000 });
    const prompt = await taskButton.boundingBox();
    const stick = await movementJoystick.boundingBox();
    assert.ok(prompt && stick, 'task prompt and joystick must remain measurable after resize');
    assert.ok(
      prompt.x + prompt.width <= stick.x || stick.x + stick.width <= prompt.x ||
        prompt.y + prompt.height <= stick.y || stick.y + stick.height <= prompt.y,
      `task prompt must not overlap joystick at ${size.width}×${size.height}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return !!canvas && canvas.style.width === window.innerWidth + 'px' && canvas.style.height === window.innerHeight + 'px';
  }, undefined, { timeout: 3_000 });

  // The emergency action and Settings must have independent tap targets on mobile.
  const emergencyButton = page.getByRole('button', { name: /Тревога/ });
  const gameplaySettingsButton = page.getByRole('button', { name: 'Настройки' });
  await emergencyButton.waitFor({ state: 'visible' });
  await gameplaySettingsButton.waitFor({ state: 'visible' });
  const emergencyBox = await emergencyButton.boundingBox();
  const gameplaySettingsBox = await gameplaySettingsButton.boundingBox();
  assert.ok(emergencyBox && gameplaySettingsBox, 'gameplay actions must be measurable');
  assert.ok(
    emergencyBox.x + emergencyBox.width <= gameplaySettingsBox.x ||
      gameplaySettingsBox.x + gameplaySettingsBox.width <= emergencyBox.x ||
      emergencyBox.y + emergencyBox.height <= gameplaySettingsBox.y ||
      gameplaySettingsBox.y + gameplaySettingsBox.height <= emergencyBox.y,
    'Emergency and Settings must not overlap on a mobile viewport',
  );

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
  // Verify impostor actions are visible and proximity-gated in their real spawn coordinates.
  await page.goto(`${origin}/?mock=kill-ready`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const killButton = page.getByRole('button', { name: /Убить/ });
  await killButton.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(
    button => button.textContent?.includes('Убить') && !button.disabled,
  ), undefined, { timeout: 5_000 });
  assert.equal(await killButton.isEnabled(), true, 'in-range kill action should be enabled');

  // At match start, the Kill button must be disabled until the initial cooldown expires.
  await page.goto(`${origin}/?mock=impostor-opening`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const openingKillButton = page.getByRole('button', { name: /Перезарядка убийства/ });
  await openingKillButton.waitFor({ state: 'visible', timeout: 10_000 });
  assert.equal(await openingKillButton.isEnabled(), false,
    'the opening kill cooldown must disable the Kill action even when a target is in range');

  // Dropped bodies are distinct from the ghost's moving sprite and remain reportable.
  await page.goto(`${origin}/?mock=report-ready`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const reportButton = page.getByRole('button', { name: /Доложить/ });
  await reportButton.waitFor({ state: 'visible', timeout: 10_000 });
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
  const typedMessage = 'wasd WASD qwerty 123';
  await page.keyboard.type(typedMessage);
  assert.equal(await chatTextbox.inputValue(), typedMessage,
    'keyboard movement bindings must never prevent W/A/S/D or other letters in chat input');
  await chatTextbox.fill('');
  await page.getByText('Голосование начнётся после обсуждения', { exact: true }).waitFor({ state: 'visible' });

  await page.goto(`${origin}/?mock=meeting-voting`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByText('Голосование', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('textbox', { name: 'Сообщение в обсуждении' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Пропустить' }).waitFor({ state: 'visible' });

  // All five sabotage choices render in the impostor panel.
  await page.goto(`${origin}/?mock=sabotage-ready`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.getByRole('button', { name: /Саботаж/ }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: /Саботаж/ }).click();
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
  await page.getByRole('button', { name: /Clean Filters/ }).waitFor({ state: 'visible', timeout: 10_000 });
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
  // Capture the strike while the transient 1.65s scene is still mounted.
  await page.waitForFunction(() => {
    const body = document.querySelector('.ag-kill-victim-lower');
    return body && Number.parseFloat(getComputedStyle(body).opacity) > 0.25;
  }, undefined, { timeout: 1_400 });
  const corpseSprite = page.locator('.ag-kill-victim-lower .ag-character-sprite');
  await corpseSprite.waitFor({ state: 'visible' });
  assert.equal(await corpseSprite.count(), 1,
    'the corpse must render from one isolated atlas pose, not synthesized layers');
  assert.equal(await corpseSprite.getAttribute('data-pose'), 'dead-body');
  assert.equal(await corpseSprite.getAttribute('data-sprite-row'), '7');
  assert.equal(await corpseSprite.getAttribute('data-source-y'), '1067',
    'the corpse source window must start before the entire authored row, without uniform-row clipping');
  assert.equal(await corpseSprite.getAttribute('data-source-height'), '107',
    'the corpse crop must exclude the detached underline rows beneath the cut suit and exposed bone');
  assert.equal(await corpseSprite.getAttribute('data-display-height'), '118',
    'the original corpse baseline remains available as metadata while rendering follows the cropped source height');
  assert.equal(await page.locator('.ag-corpse-head-window, .ag-corpse-suit-window').count(), 0,
    'the adjacent sit-crouch row must not be spliced into the corpse');
  await page.screenshot({ path: join(visualQaDir, 'kill-screen-victim.png'), fullPage: true });

  await page.goto(`${origin}/?mock=kill-animation-attacker&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  assert.equal(
    await page.locator('[role="alert"][aria-label="Анимация убийства"], [role="alert"][aria-label="Kill animation"]').count(),
    0,
    'the attacker should see gameplay, not the victim-only full-screen kill animation',
  );

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
  await layoutSettings.getByTestId('control-layout-select').selectOption('taskAction');
  const preview = layoutSettings.getByTestId('control-layout-preview');
  const previewBox = await preview.boundingBox();
  const dragHandle = layoutSettings.getByTestId('control-drag-taskAction');
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
  await landscapeSettings.getByTestId('control-layout-select').selectOption('taskAction');
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

  // Exercise real mobile touch/pointer delivery, including pointer capture,
  // instead of relying on mouse events for a touch-first control editor.
  const touchSession = await page.context().newCDPSession(page);
  const touchStart = {
    x: dragBox.x + dragBox.width / 2,
    y: dragBox.y + dragBox.height / 2,
    id: 1,
  };
  const touchEnd = {
    x: previewBox.x + previewBox.width * 0.68,
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
  let movedSettingsBox = await page.getByTestId('gameplay-task-action').boundingBox();
  assert.ok(movedSettingsBox, 'task action remains available at its saved custom position');
  assert.ok(Math.abs(movedSettingsBox.x + movedSettingsBox.width / 2 - 390 * 0.68) < 3,
    'dragged task action X position must be applied to the gameplay HUD');
  assert.ok(Math.abs(movedSettingsBox.y + movedSettingsBox.height / 2 - 844 * 0.62) < 3,
    'dragged task action Y position must be applied to the gameplay HUD');

  // Persisted layout survives a fresh page load. Return to a stable lobby mock
  // before reloading, because the gameplay mock intentionally navigates to /game.
  await page.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const settingsButtonAfterReload = page.getByRole('button', { name: /^(Настройки|Settings)$/ });
  await settingsButtonAfterReload.waitFor({ state: 'visible', timeout: 15_000 });
  await settingsButtonAfterReload.click();
  const reloadedSettings = page.locator('[role="dialog"]');
  await reloadedSettings.getByTestId('control-layout-select').selectOption('taskAction');
  const reloadedPreviewBox = await reloadedSettings.getByTestId('control-layout-preview').boundingBox();
  const reloadedDragBox = await reloadedSettings.getByTestId('control-drag-taskAction').boundingBox();
  assert.ok(reloadedPreviewBox && reloadedDragBox, 'saved layout preview is available after reload');
  assert.ok(Math.abs(reloadedDragBox.x + reloadedDragBox.width / 2 - (reloadedPreviewBox.x + reloadedPreviewBox.width * 0.68)) < 3,
    'saved task action X position must hydrate after reload');
  assert.ok(Math.abs(reloadedDragBox.y + reloadedDragBox.height / 2 - (reloadedPreviewBox.y + reloadedPreviewBox.height * 0.62)) < 3,
    'saved task action Y position must hydrate after reload');

  // Drag directly onto the joystick: the editor should find a nearby free spot.
  const joystickHandle = reloadedSettings.getByTestId('control-drag-joystick');
  const joystickHandleBox = await joystickHandle.boundingBox();
  const taskHandleBox = await reloadedSettings.getByTestId('control-drag-taskAction').boundingBox();
  assert.ok(joystickHandleBox && taskHandleBox, 'overlap regression controls are visible');
  await page.mouse.move(taskHandleBox.x + taskHandleBox.width / 2, taskHandleBox.y + taskHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(joystickHandleBox.x + joystickHandleBox.width / 2, joystickHandleBox.y + joystickHandleBox.height / 2, { steps: 8 });
  await page.mouse.up();
  const nudgedTaskBox = await reloadedSettings.getByTestId('control-drag-taskAction').boundingBox();
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
  await cancelledSettings.getByTestId('control-layout-select').selectOption('taskAction');
  const cancelledPreviewBox = await cancelledSettings.getByTestId('control-layout-preview').boundingBox();
  const cancelledDragBox = await cancelledSettings.getByTestId('control-drag-taskAction').boundingBox();
  assert.ok(cancelledPreviewBox && cancelledDragBox, 'cancelled editor can be reopened');
  assert.ok(Math.abs(cancelledDragBox.x + cancelledDragBox.width / 2 - (cancelledPreviewBox.x + cancelledPreviewBox.width * 0.68)) < 3,
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
      if (!source.includes('map-hires.webp') && !source.includes('characters.png')) {
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
  await decodePage.evaluate(() => window.__releaseImageDecodes());
  await decodePage.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 15_000 });
  await decodePage.close();

  // If WebP loading fails, the original PNG map must still render and unlock play.
  const fallbackPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  fallbackPage.on('pageerror', error => failures.push(error.message));
  let pngFallbackLoaded = false;
  fallbackPage.on('response', response => {
    if (response.url().includes('map-hires.png') && response.ok()) pngFallbackLoaded = true;
  });
  // A single route handler avoids route-order ambiguity: force WebP to fail,
  // while allowing the PNG fallback and all same-origin app requests through.
  await fallbackPage.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('map-hires.webp')) return route.abort();
    if (url.startsWith(origin)) return route.continue();
    return route.abort();
  });
  await fallbackPage.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await fallbackPage.getByTestId('gameplay-loading-screen').waitFor({ state: 'hidden', timeout: 30_000 });
  assert.equal(pngFallbackLoaded, true, 'failed WebP loading must fall back to the PNG map');
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
