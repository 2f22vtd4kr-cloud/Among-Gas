import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');

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
  const audioRequests = [];
  const pageErrors = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/au-sounds/')) audioRequests.push(url.pathname);
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__amongGasAudioContextsCreated = 0;
    if (NativeAudioContext) {
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          window.__amongGasAudioContextsCreated += 1;
        }
      };
    }
  });

  await page.goto(origin + '/?mock=lobby-empty', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Among Gas' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  assert.deepEqual(audioRequests, [],
    'loading the lobby must not download any audio assets before a user gesture');

  await page.mouse.click(5, 5);
  await page.waitForFunction(() => window.__amongGasAudioContextsCreated > 0, null, { timeout: 5000 });
  await page.waitForTimeout(650);
  assert.equal(window.__amongGasAudioContextsCreated, 1,
    'all game sounds and menu music must share one lazily-created AudioContext');
  assert.deepEqual(audioRequests, [],
    'procedural effects and menu music must not request copied or remote audio assets');
  assert.deepEqual(pageErrors, [], 'procedural Web Audio playback must not emit browser runtime errors');
  console.log('Original procedural audio passed: one lazy AudioContext, zero audio network requests.');
} finally {
  await browser.close();
}
