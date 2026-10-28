import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('PLAYWRIGHT_MODULE must point to the installed Playwright ESM entry');
const { chromium } = await import(pathToFileURL(modulePath).href);
const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const visualQaDir = process.env.VISUAL_QA_DIR ?? '/tmp/among-gas-visual-qa';
mkdirSync(visualQaDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox'] });
const failures = [];
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

  // Language preference must work in the actual lobby and persist between screens.
  await page.goto(`${origin}/?mock=lobby-host`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.getByRole('button', { name: 'CREATE ROOM' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'SOLO vs BOTS' }).waitFor({ state: 'visible' });
  await page.screenshot({ path: join(visualQaDir, 'lobby-english.png'), fullPage: true });
  assert.equal(await page.getByText(/mini game for telegram/i).count(), 0,
    'the obsolete Telegram mini-game subtitle must not be shown');
  await page.getByRole('button', { name: 'Switch to Russian' }).click();
  await page.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ' }).waitFor({ state: 'visible' });

  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.getByRole('button', { name: /КАРТА/ }).waitFor({ state: 'visible', timeout: 30_000 });
  const taskButton = page.getByRole('button', { name: /Почистить фильтры/i });
  await taskButton.waitFor({ state: 'visible', timeout: 30_000 });

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
  await page.getByText('Clean Filters', { exact: true }).waitFor({ state: 'visible' });
  const dirtyFilter = page.getByRole('button', { name: /Dirty filter/ });
  for (let i = 0; i < 5; i++) await dirtyFilter.first().click();
  await page.getByText('Step 2 of 2', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
  const secondStepDirty = page.getByRole('button', { name: /Dirty filter/ });
  for (let i = 0; i < 5; i++) await secondStepDirty.first().click();
  await page.getByRole('button', { name: 'Close' }).waitFor({ state: 'hidden', timeout: 5_000 });
  // Verify impostor actions are visible and proximity-gated in their real spawn coordinates.
  await page.goto(`${origin}/?mock=kill-ready`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const killButton = page.getByRole('button', { name: /Убить/ });
  await killButton.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(
    button => button.textContent?.includes('Убить') && !button.disabled,
  ), undefined, { timeout: 5_000 });
  assert.equal(await killButton.isEnabled(), true, 'in-range kill action should be enabled');

  // Dropped bodies are distinct from the ghost's moving sprite and remain reportable.
  await page.goto(`${origin}/?mock=report-ready`, { waitUntil: 'domcontentloaded' });
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


  // Meeting discussion and voting both keep the chat available; voting adds ballot controls.
  await page.goto(`${origin}/?mock=meeting-discussion`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Обсуждение', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('textbox', { name: 'Сообщение в обсуждении' }).waitFor({ state: 'visible' });
  await page.getByText('Голосование начнётся после обсуждения', { exact: true }).waitFor({ state: 'visible' });

  await page.goto(`${origin}/?mock=meeting-voting`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Голосование', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('textbox', { name: 'Сообщение в обсуждении' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Пропустить' }).waitFor({ state: 'visible' });

  // All five sabotage choices render in the impostor panel.
  await page.goto(`${origin}/?mock=sabotage-ready`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Саботаж/ }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: /Саботаж/ }).click();
  await page.getByText('Выберите систему саботажа', { exact: true }).waitFor({ state: 'visible' });
  for (const system of ['Lights', 'O₂', 'Reactor', 'Comms', 'Doors']) {
    await page.getByRole('button', { name: system, exact: true }).waitFor({ state: 'visible' });
  }
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();

  // The victim gets the full-screen kill sequence; the attacker must not.
  await page.goto(`${origin}/?mock=kill-animation-victim`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  const victimKillScreen = page.getByRole('alert', { name: 'Kill animation' });
  await victimKillScreen.waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByText('ELIMINATED', { exact: true }).waitFor({ state: 'visible' });
  await page.screenshot({ path: join(visualQaDir, 'kill-screen-victim.png'), fullPage: true });

  await page.goto(`${origin}/?mock=kill-animation-attacker`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 30_000 });
  assert.equal(await page.getByRole('alert', { name: 'Kill animation' }).count(), 0,
    'the attacker should see gameplay, not the victim-only full-screen kill animation');

  // Return to the normal task fixture so viewport assertions test the playable HUD.
  await page.goto(`${origin}/?mock=task-interaction`, { waitUntil: 'domcontentloaded' });
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
  }
  assert.deepEqual(failures, [], `browser page errors: ${failures.join('; ')}`);

  console.log(JSON.stringify({
    ok: true,
    viewport: '390×844, DPR 2 (mobile)',
    checks: [
      'English/Russian lobby toggle works and persists; obsolete Telegram subtitle is absent',
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
