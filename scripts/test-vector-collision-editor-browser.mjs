import assert from "node:assert/strict";

const modulePath = process.env.PLAYWRIGHT_MODULE;
assert.ok(modulePath, "PLAYWRIGHT_MODULE must point to the installed Playwright module");
const { chromium } = await import(modulePath);
const base = (process.env.VECTOR_COLLISION_EDITOR_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/dev/collision", { waitUntil: "domcontentloaded" });
  await page.getByText("VECTOR GEOMETRY WORKSPACE").waitFor({ timeout: 15000 });
  const canvas = page.locator("canvas[data-editor-loaded='true']");
  await canvas.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => {
    const element = document.querySelector("canvas[data-editor-loaded='true']");
    return !!element && Number(element.getAttribute("width")) > 0 && Number(element.getAttribute("height")) > 0;
  });

  // Draw an open wall with a real pointer drag.
  await page.getByRole("button", { name: "Draw wall" }).click();
  let bounds = await canvas.boundingBox();
  assert.ok(bounds && bounds.width > 250 && bounds.height > 180, "mobile canvas occupies a usable viewport");
  await page.mouse.move(bounds.x + 45, bounds.y + 70);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 165, bounds.y + 76, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "1");

  // Draw and close a solid polygon with three taps.
  await page.getByRole("button", { name: "Draw solid" }).click();
  bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + 220, bounds.y + 95);
  await page.mouse.click(bounds.x + 280, bounds.y + 95);
  await page.mouse.click(bounds.x + 250, bounds.y + 150);
  await page.getByRole("button", { name: "Close polygon" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");

  // Undo and redo must preserve the shape count and stay interactive on mobile.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "1");
  await page.getByRole("button", { name: "Redo" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");

  // Export remains available offline; no save is performed by this UI smoke.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "collision.v1.json");

  // Walk test is explicitly identified as a 12px candidate preview, not live parity.
  await page.getByRole("button", { name: "Walk test" }).click();
  bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + 40, bounds.y + 40);
  await page.getByText(/Start selected\. Tap a destination/).waitFor();
  await page.mouse.click(bounds.x + 100, bounds.y + 40);
  await page.getByText(/candidate 12px circular route|BLOCKED \/ SLID/).waitFor();

  assert.deepEqual(errors, [], "vector editor should not emit browser runtime errors");
  console.log("VECTOR COLLISION MOBILE EDITOR BROWSER TESTS PASSED");
} finally {
  await browser.close();
}
