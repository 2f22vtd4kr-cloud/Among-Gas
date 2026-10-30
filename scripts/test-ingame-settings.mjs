import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const origin = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const visualDir = process.env.VISUAL_QA_DIR;
if (visualDir) mkdirSync(visualDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : { channel: 'chrome' }),
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`${origin}/?mock=playing`, { waitUntil: 'domcontentloaded' });

  const settingsButton = page.getByRole('button', { name: /Settings|Настройки/ });
  await settingsButton.waitFor({ state: 'visible', timeout: 30_000 });
  const standaloneLeaveButtons = page.getByRole('button', { name: /Leave match|Выйти из матча/ });
  assert.equal(await standaloneLeaveButtons.count(), 0,
    'the game must not expose an oversized standalone Leave match button outside settings');
  await settingsButton.click();

  const settingsDialog = page.locator('[role="dialog"][aria-labelledby="ag-settings-title"]');
  await settingsDialog.waitFor({ state: 'visible', timeout: 10_000 });
  const leaveButton = settingsDialog.getByTestId('settings-leave-match');
  await leaveButton.waitFor({ state: 'visible', timeout: 15_000 });
  await leaveButton.scrollIntoViewIfNeeded();

  const geometry = await leaveButton.evaluate(element => {
    const button = element.getBoundingClientRect();
    const dialog = element.closest('[role="dialog"]')?.getBoundingClientRect();
    return {
      buttonHeight: button.height,
      buttonWidth: button.width,
      insideSettingsDialog: Boolean(dialog),
      withinDialogWidth: Boolean(dialog && button.left >= dialog.left && button.right <= dialog.right + 1),
    };
  });
  assert.ok(geometry.insideSettingsDialog,
    'Leave match must be a secondary action inside the in-game settings dialog');
  assert.ok(geometry.withinDialogWidth,
    'Leave match must remain inside the settings dialog bounds');
  assert.ok(geometry.buttonHeight <= 56,
    `Leave match must be a compact secondary action, got ${geometry.buttonHeight}px high`);

  if (visualDir) {
    await page.screenshot({ path: join(visualDir, 'in-game-settings-leave.png'), fullPage: false });
  }

  await leaveButton.click();
  const confirmDialog = page.locator('[role="dialog"][aria-labelledby="ag-leave-match-title"]');
  await confirmDialog.waitFor({ state: 'visible', timeout: 10_000 });
  assert.match(await confirmDialog.innerText(), /Leave this match\?|Выйти из матча\?/,
    'Leave match must require an explicit confirmation step');
  if (visualDir) {
    await page.screenshot({ path: join(visualDir, 'in-game-leave-confirm.png'), fullPage: false });
  }

  await confirmDialog.getByRole('button', { name: /Stay|Остаться/ }).click();
  await confirmDialog.waitFor({ state: 'hidden', timeout: 5_000 });
  assert.ok(await settingsButton.isVisible(),
    'Canceling leave confirmation must keep the player in the current match');
  console.log('In-game leave action is contained in settings, compact, and confirmation-gated:', geometry);
} finally {
  await browser.close();
}
