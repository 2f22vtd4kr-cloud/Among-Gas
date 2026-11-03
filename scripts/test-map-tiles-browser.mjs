import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const playwright = process.env.PLAYWRIGHT_MODULE
  ? await import(process.env.PLAYWRIGHT_MODULE)
  : await import("playwright-core");
const { chromium } = playwright;

const origin = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.VISUAL_QA_DIR ?? "/tmp/among-gas-visual-qa";
mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : process.env.PLAYWRIGHT_MODULE ? {} : { channel: "chrome" }),
  args: ["--no-sandbox"],
});

try {
  const cases = [
    { name: "mobile-baseline", viewport: { width: 390, height: 844 }, dpr: 2, mobile: true, variant: "baseline", query: "" },
    { name: "desktop-sharpened", viewport: { width: 1280, height: 720 }, dpr: 1, mobile: false, variant: "sharpened", query: "&map-art=sharp" },
  ];

  for (const testCase of cases) {
    const context = await browser.newContext({
      viewport: testCase.viewport,
      deviceScaleFactor: testCase.dpr,
      isMobile: testCase.mobile,
      hasTouch: testCase.mobile,
    });
    const page = await context.newPage();
    const requests = [];
    const pageErrors = [];
    page.on("request", request => requests.push(request.url()));
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/*", route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      return route.abort();
    });

    const startedAt = Date.now();
    await page.goto(`${origin}/?mock=task-interaction&skipReveal=true${testCase.query}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("canvas", { state: "visible", timeout: 30_000 });
    await page.waitForFunction(() => {
      const status = window.__AG_TILE_DEBUG;
      return !!status && (status.visibleTotal ?? 0) > 0 &&
        status.visibleLoaded === status.visibleTotal && status.failed === 0;
    }, undefined, { timeout: 25_000 });

    const status = await page.evaluate(() => window.__AG_TILE_DEBUG);
    const tileRequests = requests.filter(url => /\/map-tiles(?:-sharp)?\/tile_r\d+_c\d+\.webp(?:\?|$)/.test(url));
    assert.ok(tileRequests.length >= 4, `${testCase.name}: camera must load several independent map tiles`);
    assert.equal(requests.some(url => /map-hires\.(png|webp)(?:\?|$)/.test(url)), false,
      `${testCase.name}: the game must not load the divergent full-size PNG/WebP paths`);
    assert.ok(!pageErrors.length, `${testCase.name}: browser errors: ${pageErrors.join("; ")}`);
    assert.ok(status && typeof status === "object", `${testCase.name}: tile status must be observable`);
    assert.ok(status.totalDecodedBytes <= 72 * 1024 * 1024,
      `${testCase.name}: overview plus visible tile decoded memory must stay below 72 MiB (observed ${status.totalDecodedBytes})`);
    const tileReadyMs = Date.now() - startedAt;

    await page.screenshot({ path: join(outputDir, `map-tiles-${testCase.name}.png`), fullPage: true });
    console.log(`${testCase.name}: ${tileRequests.length} tile requests; tile-ready ${tileReadyMs}ms; ${JSON.stringify(status)}`);
    await context.close();
  }

  console.log("MAP TILE BROWSER TESTS PASSED");
} finally {
  await browser.close();
}
