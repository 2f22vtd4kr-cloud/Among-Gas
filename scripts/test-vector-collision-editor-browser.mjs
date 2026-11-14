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

  // Use real Chromium touchscreen PointerEvents for authored strokes, not synthetic mouse events.
  const touch = await page.context().newCDPSession(page);
  const touchTap = async (x, y) => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ id: 1, x, y }],
    });
    await page.waitForTimeout(35);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(35);
  };
  const touchDrag = async (startX, startY, endX, endY, steps = 5) => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ id: 1, x: startX, y: startY }],
    });
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, x: startX + (endX - startX) * t, y: startY + (endY - startY) * t }],
      });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(50);
  };

  // A one-finger freehand wall stroke must create an active chain on a touch device.
  await page.getByRole("button", { name: "Draw wall" }).click();
  let bounds = await canvas.boundingBox();
  assert.ok(bounds && bounds.width > 250 && bounds.height > 180, "mobile canvas occupies a usable viewport");
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: bounds.x + 45, y: bounds.y + 70 }],
  });
  for (const [x, y] of [[85, 72], [125, 74], [165, 76]]) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: bounds.x + x, y: bounds.y + y }],
    });
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.getAttribute("data-active-chain-point-count")) >= 2);
  assert.equal(Number(await canvas.getAttribute("data-shape-count")), 0, "unfinished chain is not yet part of the saved document");

  // The vision preview requires a stationary long-press; a drag must not activate it.
  await page.getByRole("button", { name: "Vision preview (hold)" }).click();
  bounds = await canvas.boundingBox();
  const visionX = bounds.x + bounds.width * 0.55;
  const visionY = bounds.y + bounds.height * 0.48;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart", touchPoints: [{ id: 1, x: visionX, y: visionY }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove", touchPoints: [{ id: 1, x: visionX + 24, y: visionY }],
  });
  await page.waitForTimeout(650);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await canvas.getAttribute("data-vision-preview"), "false", "moving a vision press must cancel preview");

  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart", touchPoints: [{ id: 1, x: visionX, y: visionY }],
  });
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-vision-preview") === "true", null, { timeout: 3000 });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.match(await page.locator("footer").innerText(), /diagnostic only, not live gameplay/);
  await page.getByRole("button", { name: "Clear vision preview" }).click();
  assert.equal(await canvas.getAttribute("data-vision-preview"), "false", "vision preview can be cleared");

  // The 4x loupe follows real touchscreen pointer movement and can be dismissed.
  await page.getByRole("button", { name: "Loupe (4×)" }).click();
  bounds = await canvas.boundingBox();
  const loupeX = bounds.x + bounds.width * 0.42;
  const loupeY = bounds.y + bounds.height * 0.52;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart", touchPoints: [{ id: 1, x: loupeX, y: loupeY }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove", touchPoints: [{ id: 1, x: loupeX + 12, y: loupeY + 8 }],
  });
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-loupe-active") === "true", null, { timeout: 3000 });
  assert.match(await canvas.getAttribute("data-loupe-origin") ?? "", /^\d+(\.\d+)?,\d+(\.\d+)?$/,
    "loupe exposes its world-space focus for visual QA");
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
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
  await touchDrag(chainEndX, chainEndY, chainEndX + 45, chainEndY + 35, 5);
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.getAttribute("data-active-chain-point-count")) >= 3);
  await page.getByRole("button", { name: "Finish chain" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "1");
  assert.equal(Number(await canvas.getAttribute("data-active-chain-point-count")), 0);
  // Jump to end changes the camera; restore the full-map view before drawing
  // the independent polygon so its vertices remain inside the authored map.
  await page.getByRole("button", { name: "Fit map" }).click();

  // Cast-shadow is authored independently from movement and sight. New
  // geometry must preserve the explicit flag through the editor document.
  const newShapeCastsShadow = page.getByLabel("Casts shadow");
  await newShapeCastsShadow.check();
  assert.equal(await newShapeCastsShadow.isChecked(), true);

  // Draw and close a solid polygon using four real finger taps. The fourth
  // tap lands back on the first vertex and must close the loop without a mouse
  // event or the toolbar's Close polygon shortcut.
  await page.getByRole("button", { name: "Draw solid" }).click();
  bounds = await canvas.boundingBox();
  const polygonFirst = { x: bounds.x + 220, y: bounds.y + 95 };
  await touchTap(polygonFirst.x, polygonFirst.y);
  await touchTap(bounds.x + 280, bounds.y + 95);
  await touchTap(bounds.x + 250, bounds.y + 150);
  await touchTap(polygonFirst.x + 2, polygonFirst.y + 2);
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");
  assert.equal(Number(await canvas.getAttribute("data-draft-point-count")), 0,
    "touching the starting vertex must close and commit the polygon loop");
  const shapeMetadata = JSON.parse(await canvas.getAttribute("data-shape-metadata") ?? "[]");
  assert.equal(shapeMetadata[1]?.castsShadow, true,
    "the new polygon must preserve its independent castsShadow authoring flag");


  // Verify the full 48 CSS px touch target: a finger-down 20 CSS px from
  // the existing vertex remains inside its 24 px snap radius and must align.
  const authoredShapes = JSON.parse(await canvas.getAttribute("data-shape-points") ?? "[]");
  const snapTarget = authoredShapes[1][0];
  const zoom = Number(await canvas.getAttribute("data-zoom"));
  const cameraX = Number(await canvas.getAttribute("data-camera-x"));
  const cameraY = Number(await canvas.getAttribute("data-camera-y"));
  bounds = await canvas.boundingBox();
  const snapScreenX = bounds.x + (snapTarget[0] - cameraX) * zoom + 12;
  const snapScreenY = bounds.y + (snapTarget[1] - cameraY) * zoom + 16;
  await page.getByRole("button", { name: "Draw wall" }).click();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart", touchPoints: [{ id: 1, x: snapScreenX, y: snapScreenY }],
  });
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("canvas")?.getAttribute("data-draft-wall-points") || "[]").length === 1,
    null,
    { timeout: 3000 },
  );
  const snappedWallStart = JSON.parse(await canvas.getAttribute("data-draft-wall-points"))[0];
  assert.deepEqual(snappedWallStart, snapTarget,
    "touch hit-radius snapping must align a new wall endpoint to the existing polygon vertex");
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.getByRole("button", { name: "Fit map" }).click();

  // Undo and redo must preserve the shape count and stay interactive on mobile.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "1");
  await page.getByRole("button", { name: "Redo" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.getAttribute("data-shape-count") === "2");

  // Select an existing vertex, assign its shape to a review zone, and keep the
  // active zone selector aligned with that assignment for saving.
  await page.getByRole("button", { name: "Edit vertices" }).click();
  bounds = await canvas.boundingBox();
  await touchTap(bounds.x + 220, bounds.y + 95);
  const selectedShadow = page.getByRole("checkbox", { name: "Shadow", exact: true });
  await selectedShadow.waitFor();
  assert.equal(await selectedShadow.isChecked(), true,
    "selected geometry exposes the authored shadow flag independently");
  await selectedShadow.uncheck();
  const updatedShapeMetadata = JSON.parse(await canvas.getAttribute("data-shape-metadata") ?? "[]");
  assert.equal(updatedShapeMetadata[1]?.castsShadow, false,
    "editing the shadow flag must update candidate metadata without changing movement or sight");
  assert.equal(await page.getByLabel("Move").isChecked(), true);
  assert.equal(await page.getByLabel("Sight").isChecked(), true);

  const selectedZone = page.getByLabel("Selected shape zone");
  await selectedZone.waitFor();
  await selectedZone.selectOption("Z02");
  assert.equal(await selectedZone.inputValue(), "Z02");
  assert.equal(await page.getByLabel("Map zone").inputValue(), "Z02",
    "the active zone selector follows the selected shape's zone");

  const shapeCountBeforeMigration = Number(await canvas.getAttribute("data-shape-count"));
  await page.getByTestId("assign-zones-by-centroid").click();
  assert.equal(await page.getByLabel("Map zone").inputValue(), "Z01",
    "bulk metadata migration returns the authoring selector to the first canonical zone");
  assert.equal(Number(await canvas.getAttribute("data-shape-count")), shapeCountBeforeMigration,
    "centroid zone migration must not add or remove geometry");
  await page.getByText(/Assigned .* shapes to primary zones by ground centroid/).waitFor();

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
