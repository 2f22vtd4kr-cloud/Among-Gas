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
  await page.goto(base + "/dev/collision?scratch=1", { waitUntil: "domcontentloaded" });
  await page.getByText("VECTOR GEOMETRY WORKSPACE").waitFor({ timeout: 15000 });
  const canvas = page.locator("canvas[data-editor-loaded='true']");
  await canvas.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => {
    const element = document.querySelector("canvas[data-editor-loaded='true']");
    return !!element && Number(element.getAttribute("width")) > 0 && Number(element.getAttribute("height")) > 0;
  });

  // Use real Chromium touchscreen PointerEvents for authored strokes, not synthetic mouse events.
  const touch = await page.context().newCDPSession(page);
  let touchId = 1;
  const touchTap = async (x, y) => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: touchId, x, y, radiusX: 3, radiusY: 3, force: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    touchId++;
  };
  const touchStroke = async points => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: touchId, x: points[0][0], y: points[0][1], radiusX: 3, radiusY: 3, force: 1 }],
    });
    for (const [x, y] of points.slice(1)) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: touchId, x, y, radiusX: 3, radiusY: 3, force: 1 }],
      });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    touchId++;
  };
  const touchLongPress = async (x, y, durationMs = 650) => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: touchId, x, y, radiusX: 3, radiusY: 3, force: 1 }],
    });
    await page.waitForTimeout(durationMs);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    touchId++;
  };

  // A one-finger freehand wall stroke must create an active chain on a touch device.
  await page.getByRole("button", { name: "Draw wall" }).click();
  let bounds = await canvas.boundingBox();
  assert.ok(bounds && bounds.width > 250 && bounds.height > 180, "mobile canvas occupies a usable viewport");
  await touchStroke([
    [bounds.x + 45, bounds.y + 70],
    [bounds.x + 85, bounds.y + 72],
    [bounds.x + 125, bounds.y + 74],
    [bounds.x + 165, bounds.y + 76],
  ]);
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.getAttribute("data-active-chain-point-count")) >= 2);
  assert.equal(Number(await canvas.getAttribute("data-shape-count")), 0, "unfinished chain is not yet part of the saved document");

  // The vision preview requires a stationary long-press; a drag must not activate it.
  await page.getByRole("button", { name: "Vision preview (hold)" }).click();
  bounds = await canvas.boundingBox();
  const visionX = bounds.x + bounds.width * 0.55;
  const visionY = bounds.y + bounds.height * 0.48;
  await touchStroke([[visionX, visionY], [visionX + 24, visionY]]);
  assert.equal(await canvas.getAttribute("data-vision-preview"), "false", "moving a vision press must cancel preview");

  await touchLongPress(visionX, visionY, 650);
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-vision-preview") === "true", null, { timeout: 3000 });
  assert.match(await page.locator("footer").innerText(), /diagnostic only, not live gameplay/);
  await page.getByRole("button", { name: "Clear vision preview" }).click();
  assert.equal(await canvas.getAttribute("data-vision-preview"), "false", "vision preview can be cleared");

  // The 4x loupe follows real touchscreen pointer movement and can be dismissed.
  await page.getByRole("button", { name: "Loupe (4×)" }).click();
  bounds = await canvas.boundingBox();
  const loupeX = bounds.x + bounds.width * 0.42;
  const loupeY = bounds.y + bounds.height * 0.52;
  await touchStroke([[loupeX, loupeY], [loupeX + 12, loupeY + 8]]);
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-loupe-active") === "true", null, { timeout: 3000 });
  assert.match(await canvas.getAttribute("data-loupe-origin") ?? "", /^\d+(\.\d+)?,\d+(\.\d+)?$/,
    "loupe exposes its world-space focus for visual QA");
  await page.getByRole("button", { name: "Clear loupe" }).click();
  assert.equal(await canvas.getAttribute("data-loupe-active"), "false", "loupe overlay can be dismissed");

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
  // Jump to end changes the camera; restore the full-map view before drawing
  // the independent polygon so its vertices remain inside the authored map.
  await page.getByRole("button", { name: "Fit map" }).click();

  // Draw and close a solid polygon with three taps.
  await page.getByRole("button", { name: "Draw solid" }).click();
  bounds = await canvas.boundingBox();
  await page.getByLabel("Casts shadow").uncheck();
  await touchTap(bounds.x + 220, bounds.y + 95);
  await touchTap(bounds.x + 280, bounds.y + 95);
  await touchTap(bounds.x + 250, bounds.y + 150);
  await page.getByRole("button", { name: "Close polygon" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");

  // Newly authored geometry must preserve independent movement, sight and shadow flags.
  await page.getByRole("button", { name: "Edit vertices" }).click();
  bounds = await canvas.boundingBox();
  await touchTap(bounds.x + 220, bounds.y + 95);
  const selectedShadow = page.getByLabel("Shadow");
  await selectedShadow.waitFor();
  assert.equal(await selectedShadow.isChecked(), false, "Casts shadow defaults must preserve the author-selected value");
  // Undo and redo must preserve the shape count and stay interactive on mobile.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "1");
  await page.getByRole("button", { name: "Redo" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");

  // Select an existing vertex, assign its shape to a review zone, then save that
  // zone without replacing the other candidate document contents.
  const selectedZone = page.getByLabel("Selected shape zone");
  await selectedZone.waitFor();
  await selectedZone.selectOption("B");
  assert.equal(await selectedZone.inputValue(), "B");
  assert.equal(await page.getByLabel("Map zone").inputValue(), "B",
    "the active zone selector follows the selected shape's zone");
  await selectedZone.selectOption("A");
  assert.equal(await selectedZone.inputValue(), "A");
  assert.equal(await page.getByLabel("Map zone").inputValue(), "A");
  const polygonId = await canvas.getAttribute("data-selected-shape-id");
  await page.getByRole("button", { name: "Save zone", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-zone-busy") === "false");
  await page.getByText(/Zone A saved · 1 shapes · SHA-256/).waitFor({ timeout: 10000 });

  // Undo/redo must restore zone assignments without dropping the authored polygon.
  const undoButton = page.getByRole("button", { name: "Undo" });
  const redoButton = page.getByRole("button", { name: "Redo" });
  await undoButton.click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Selected shape zone"]')?.value === "B");
  assert.equal(await canvas.getAttribute("data-shape-count"), "2");
  await undoButton.click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Selected shape zone"]')?.value === "unassigned");
  assert.equal(await canvas.getAttribute("data-shape-count"), "2");
  await undoButton.click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "1");
  await redoButton.click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");
  await redoButton.click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Selected shape zone"]')?.value === "B");
  await redoButton.click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Selected shape zone"]')?.value === "A");
  assert.equal(await canvas.getAttribute("data-selected-shape-id"), polygonId,
    "undo/redo keeps the candidate polygon selected");
  await selectedShadow.check();
  assert.equal(await selectedShadow.isChecked(), true, "shadow casting can be enabled independently");
  await selectedShadow.uncheck();
  assert.equal(await selectedShadow.isChecked(), false, "shadow casting can be disabled independently");

  // A 20px touch offset must still acquire the wall endpoint within its 48px target.
  await page.getByRole("button", { name: "Edit vertices" }).click();
  bounds = await canvas.boundingBox();
  await touchTap(bounds.x + 25, bounds.y + 70);
  assert.notEqual(await canvas.getAttribute("data-selected-shape-id"), polygonId,
    "a 20px-offset finger tap must acquire the wall endpoint");

  // Candidate analyzer uses the shared task/vent targets and production player footprint.
  await page.getByRole("button", { name: "Analyze candidate" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-analysis-task-count") === "11");
  assert.equal(await canvas.getAttribute("data-analysis-vent-count"), "6");
  await page.locator("[data-candidate-analysis='complete']").waitFor();
  assert.match(await page.locator("[data-candidate-analysis='complete']").innerText(), /Tasks reachable from spawn with interaction LOS:/);
  assert.match(await page.locator("[data-candidate-analysis='complete']").innerText(), /Diagnostic only/);

  // Export remains available offline; no save is performed by this UI smoke.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "collision.v1.json");

  // Walk preview uses the production three-circle feet footprint, but remains a straight-line editor test, not live joystick/pathfinding parity.
  await page.getByRole("button", { name: "Walk test" }).click();
  bounds = await canvas.boundingBox();
  await touchTap(bounds.x + 40, bounds.y + 40);
  await page.waitForFunction(
    () => document.querySelector("canvas")?.getAttribute("data-walk-point-count") === "1",
    null,
    { timeout: 10000 },
  );
  await page.getByText(/Start selected\. Tap a destination/).waitFor();
  await touchTap(bounds.x + 100, bounds.y + 40);
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
  const pinchModes = ["Pan / zoom", "Draw wall", "Draw solid", "Edit vertices", "Delete shape", "Walk test", "Vision preview (hold)", "Loupe (4×)"];
  for (const mode of pinchModes) {
    console.log("PINCH TAKEOVER TEST:", mode);
    // Each independent pinch starts from a known zoom. Without this reset, the
    // first few cases increase zoom to the 8x cap and make later increases impossible.
    await page.getByRole("button", { name: "Fit map" }).click();
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
    const pinchIds = [touchId, touchId + 1];
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: pinchIds[0], x: centerX - 18, y: centerY },
        { id: pinchIds[1], x: centerX + 18, y: centerY },
      ],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: pinchIds[0], x: centerX - 34, y: centerY },
        { id: pinchIds[1], x: centerX + 34, y: centerY },
      ],
    });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    touchId += 2;
    try {
      await page.waitForFunction(
        before => Number(document.querySelector("canvas")?.getAttribute("data-zoom")) > before,
        beforeZoom,
        { timeout: 5000 },
      );
    } catch (error) {
      const observedZoom = Number(await canvas.getAttribute("data-zoom"));
      throw new Error("Pinch takeover failed in " + mode + ": zoom " + beforeZoom + " -> " + observedZoom, { cause: error });
    }
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
