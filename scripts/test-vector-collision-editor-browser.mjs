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

  // Draw a freehand wall stroke. It remains an explicit active chain until Finish chain.
  await page.getByRole("button", { name: "Draw wall" }).click();
  let bounds = await canvas.boundingBox();
  assert.ok(bounds && bounds.width > 250 && bounds.height > 180, "mobile canvas occupies a usable viewport");
  await page.mouse.move(bounds.x + 45, bounds.y + 70);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 165, bounds.y + 76, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.getAttribute("data-active-chain-point-count")) >= 2);
  assert.equal(Number(await canvas.getAttribute("data-shape-count")), 0, "unfinished chain is not yet part of the saved document");

  // Active chains survive reload via local autosave and have explicit endpoint navigation.
  await page.reload({ waitUntil: "domcontentloaded" });
  await canvas.waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Restore local draft" }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Restore local draft" }).click();
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.getAttribute("data-active-chain-point-count")) >= 2);
  await page.getByRole("button", { name: "Jump to end" }).click();
  await page.getByText(/Camera moved to the active wall-chain endpoint/).waitFor();
  // A reload resets the editor tool to Pan / zoom; explicitly re-enter Draw wall
  // before attempting to append to the restored chain.
  await page.getByRole("button", { name: "Draw wall" }).click();

  // Jump to end centers the chain endpoint under the canvas; continue from there.
  bounds = await canvas.boundingBox();
  const chainEndX = bounds.x + bounds.width / 2;
  const chainEndY = bounds.y + bounds.height / 2;
  await page.mouse.move(chainEndX, chainEndY);
  await page.mouse.down();
  await page.mouse.move(chainEndX + 45, chainEndY + 35, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.getAttribute("data-active-chain-point-count")) >= 3);
  await page.getByRole("button", { name: "Finish chain" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "1");
  assert.equal(Number(await canvas.getAttribute("data-active-chain-point-count")), 0);

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

  // Walk preview uses the production three-circle feet footprint, but remains a straight-line editor test, not live joystick/pathfinding parity.
  await page.getByRole("button", { name: "Walk test" }).click();
  bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + 40, bounds.y + 40);
  await page.waitForFunction(
    () => document.querySelector("canvas")?.getAttribute("data-walk-point-count") === "1",
    null,
    { timeout: 10000 },
  );
  await page.getByText(/Start selected\\. Tap a destination/).waitFor();
  await page.mouse.move(bounds.x + 100, bounds.y + 40);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector("canvas");
      return canvas?.getAttribute("data-walk-point-count") === "2" &&
        Boolean(canvas.getAttribute("data-walk-status"));
    },
    null,
    { timeout: 10000 },
  );

  // Use real Chromium touch input (not mouse events) to verify pinch takeover
  // in every non-destructive tool. A second finger must cancel an active wall
  // drag rather than accidentally committing a stray segment.
  const touch = await page.context().newCDPSession(page);
  const pinchModes = ["Pan / zoom", "Draw wall", "Draw solid", "Edit vertices", "Delete shape", "Walk test"];
  for (const mode of pinchModes) {
    await page.getByRole("button", { name: mode }).click();
    const beforeZoom = Number(await canvas.getAttribute("data-zoom"));
    const beforeShapes = Number(await canvas.getAttribute("data-shape-count"));
    const beforeDraftPoints = Number(await canvas.getAttribute("data-draft-point-count"));
    const beforeWalkPoints = Number(await canvas.getAttribute("data-walk-point-count"));
    const beforeActiveChain = Number(await canvas.getAttribute("data-active-chain-point-count"));
    const beforeDraftWall = Number(await canvas.getAttribute("data-draft-wall-point-count"));
    bounds = await canvas.boundingBox();
    const centerX = bounds.x + bounds.width * 0.52;
    const centerY = bounds.y + bounds.height * 0.52;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: centerX - 18, y: centerY },
        { id: 2, x: centerX + 18, y: centerY },
      ],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 1, x: centerX - 34, y: centerY },
        { id: 2, x: centerX + 34, y: centerY },
      ],
    });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(
      before => Number(document.querySelector("canvas")?.getAttribute("data-zoom")) > before,
      beforeZoom,
      { timeout: 5000 },
    );
    assert.equal(
      Number(await canvas.getAttribute("data-shape-count")),
      beforeShapes,
      "pinch in " + mode + " must not accidentally create/delete a shape",
    );
    assert.equal(
      Number(await canvas.getAttribute("data-draft-point-count")),
      beforeDraftPoints,
      "pinch in " + mode + " must not add a polygon vertex",
    );
    assert.equal(
      Number(await canvas.getAttribute("data-walk-point-count")),
      beforeWalkPoints,
      "pinch in " + mode + " must not change walk-test points",
    );
    assert.equal(
      Number(await canvas.getAttribute("data-active-chain-point-count")),
      beforeActiveChain,
      "pinch in " + mode + " must not mutate the saved active chain",
    );
    assert.equal(
      Number(await canvas.getAttribute("data-draft-wall-point-count")),
      beforeDraftWall,
      "pinch in " + mode + " must cancel the in-progress freehand stroke",
    );
  }
  await touch.detach();

  // A reload must offer an explicit restore for the unsaved local document.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("canvas[data-editor-loaded='true']").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Restore local draft" }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Restore local draft" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");
  assert.equal(Number(await canvas.getAttribute("data-draft-point-count")), 0);
  assert.equal(Number(await canvas.getAttribute("data-active-chain-point-count")), 0);
  assert.equal(Number(await canvas.getAttribute("data-draft-wall-point-count")), 0);

  assert.deepEqual(errors, [], "vector editor should not emit browser runtime errors");
  console.log("VECTOR COLLISION MOBILE EDITOR BROWSER TESTS PASSED");
} finally {
  await browser.close();
}
