import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

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
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/au-sounds/')) audioRequests.push(url.pathname);
  });

  await page.goto(`${origin}/?mock=lobby-empty`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Among Gas' }).waitFor({ state: 'visible' });
  // Give eager HTMLAudio preload enough time to appear before asserting the
  // first-interaction network budget.
  await page.waitForTimeout(500);
  assert.deepEqual(audioRequests, [],
    'loading the lobby must not download sound effects, victory tracks, or menu music before a user gesture');

  const menuMusicRequest = page.waitForRequest(request => request.url().endsWith('/au-sounds/menu_music.mp3'));
  const killRequest = page.waitForRequest(request => request.url().endsWith('/au-sounds/kill.wav'));
  await page.mouse.click(5, 5);
  await Promise.all([menuMusicRequest, killRequest]);
  await page.waitForTimeout(250);

  const requested = [...new Set(audioRequests)].sort();
  assert.deepEqual(requested, ['/au-sounds/kill.wav', '/au-sounds/menu_music.mp3'],
    'the first trusted gesture may prime only the latency-sensitive kill sound and start menu music');
  console.log('Audio preload budget passed:', requested.join(', '));
} finally {
  await browser.close();
}
