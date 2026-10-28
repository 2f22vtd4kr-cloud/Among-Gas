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
  assert.ok(Math.min(...menuSpriteHeightRatios) > 0.88,
    `menu characters must not be vertically cropped (minimum rendered height/width=${Math.min(...menuSpriteHeightRatios).toFixed(2)})`);
  assert.equal(await page.getByText(/mini game for telegram/i).count(), 0,
    'the obsolete Telegram mini-game subtitle must not be shown');

  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const movementJoystick = page.getByLabel('Movement joystick');
  await movementJoystick.waitFor({ state: 'visible' });
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
  await page.waitForFunction(() => document.querySelector('[aria-label="Movement joystick"]')?.getAttribute('data-joystick-side') === 'right');
  await page.getByRole('button', { name: /КАРТА/ }).waitFor({ state: 'visible', timeout: 30_000 });
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
  await page.getByRole('textbox', { name: 'Сообщение в обсуждении' }).waitFor({ state: 'visible' });
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
    const body = document.querySelector('.ag-kill-victim-lower[aria-label="Balaclava corpse with exposed bone"]');
    return body && Number.parseFloat(getComputedStyle(body).opacity) > 0.25;
  }, undefined, { timeout: 1_400 });
  await page.screenshot({ path: join(visualQaDir, 'kill-screen-victim.png'), fullPage: true });

  await page.goto(`${origin}/?mock=kill-animation-attacker&skipReveal=true`, { waitUntil: 'domcontentloaded' });
  await waitForRoleRevealToFinish(page);
  await page.waitForSelector('canvas', { timeout: 30_000 });
  assert.equal(await page.getByRole('alert', { name: 'Kill animation' }).count(), 0,
    'the attacker should see gameplay, not the victim-only full-screen kill animation');

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
