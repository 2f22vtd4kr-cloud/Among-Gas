import assert from "node:assert/strict";
import { join } from "node:path";

const modulePath = process.env.PLAYWRIGHT_MODULE;
assert.ok(modulePath, "PLAYWRIGHT_MODULE must point to the installed Playwright module");
const { chromium } = await import(modulePath);
const base = (process.env.VECTOR_COLLISION_EDITOR_BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const visualQaDir = process.env.VISUAL_QA_DIR || ".";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];
const completed = [];

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  page.on("pageerror", error => errors.push(error.message));

  for (let taskId = 0; taskId < 11; taskId++) {
    await page.goto(base + "/dev/minigame-test?task=" + taskId, { waitUntil: "domcontentloaded" });
    const pageRoot = page.getByTestId("minigame-test-page");
    await pageRoot.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await pageRoot.getAttribute("data-task-id"), String(taskId),
      "gallery route must render the requested canonical task ID");

    const shell = page.getByTestId("minigame-shell");
    await shell.waitFor({ state: "visible", timeout: 10_000 });
    const panel = page.getByTestId("minigame-panel");
    const content = page.getByTestId("minigame-content");
    assert.equal(await panel.isVisible(), true);
    assert.equal(await content.isVisible(), true);

    const close = shell.getByRole("button", { name: /Close|Закрыть/ });
    const closeBox = await close.boundingBox();
    assert.ok(closeBox && closeBox.width >= 48 && closeBox.height >= 48,
      "task " + taskId + " must retain the shared 48px accessible close target");

    const controls = content.locator("button, [role='application']");
    assert.ok(await controls.count() > 0,
      "task " + taskId + " must render at least one interactive control");

    // Exercise each module's actual event handler once. Reactor pads unlock
    // after the authored sequence preview; all other controls are immediately active.
    if (taskId === 8) {
      await content.locator("button:not([disabled])").first().waitFor({ state: "visible", timeout: 5_000 });
    }
    const activeControl = taskId === 8
      ? content.locator("button:not([disabled])").first()
      : controls.first();
    await activeControl.click({ force: true });
    await page.waitForTimeout(80);
    assert.equal(await shell.isVisible(), true,
      "task " + taskId + " must remain mounted after its primary interaction");

    await page.screenshot({
      path: join(visualQaDir, "minigame-gallery-task-" + taskId + ".png"),
      fullPage: true,
    });

    await close.click();
    await page.getByTestId("minigame-closed").waitFor({ state: "visible", timeout: 3_000 });
    assert.equal(await page.getByTestId("minigame-shell").count(), 0,
      "task " + taskId + " close callback must unmount its panel");
    completed.push(taskId);
  }

  await page.goto(base + "/dev/minigame-test?task=99", { waitUntil: "domcontentloaded" });
  await page.getByTestId("minigame-invalid").waitFor({ state: "visible" });
  assert.deepEqual(errors, [], "all eleven minigame modules must remain free of browser runtime errors");
  assert.deepEqual(completed, Array.from({ length: 11 }, (_, index) => index));
  console.log("MINIGAME BROWSER GALLERY PASSED: 11/11 modules rendered, primary control dispatched, 48px close target and close callback verified");
} finally {
  await browser.close();
}
