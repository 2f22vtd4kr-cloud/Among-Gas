import assert from "node:assert/strict";
import { getCameraViewport, stepCameraCenter } from "./mapCamera";

const near = (actual: number, expected: number, message: string) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, message + ": " + actual + " !== " + expected);
};

const oneFrame = stepCameraCenter({ x: 0, y: 0 }, { x: 100, y: 50 }, 16);
const twoFrames = stepCameraCenter(
  stepCameraCenter({ x: 0, y: 0 }, { x: 100, y: 50 }, 8),
  { x: 100, y: 50 },
  8,
);
near(oneFrame.x, 100 * (1 - Math.exp(-1)), "16ms exponential easing");
near(oneFrame.y, 50 * (1 - Math.exp(-1)), "vertical exponential easing");
near(twoFrames.x, oneFrame.x, "camera easing is frame-rate independent");
near(twoFrames.y, oneFrame.y, "camera easing is frame-rate independent on both axes");

const viewport = getCameraViewport({
  canvasWidth: 1170,
  canvasHeight: 2532,
  dpr: 3,
  zoom: 0.7,
  centerX: 1612,
  centerY: 929,
  mapWidth: 3224,
  mapHeight: 1858,
});
near(viewport.srcW, 1170 / 3 / 0.7, "logical viewport width");
near(viewport.srcH, 2532 / 3 / 0.7, "logical viewport height");
near(viewport.srcX, (3224 - viewport.srcW) / 2, "centered horizontal viewport");
near(viewport.srcY, (1858 - viewport.srcH) / 2, "centered vertical viewport");
near(viewport.scale, 2.1, "device drawing scale");

const topLeft = getCameraViewport({
  canvasWidth: 390,
  canvasHeight: 844,
  dpr: 1,
  zoom: 1,
  centerX: -100,
  centerY: -100,
  mapWidth: 3224,
  mapHeight: 1858,
});
near(topLeft.srcX, 0, "left map edge clamps to zero");
near(topLeft.srcY, 0, "top map edge clamps to zero");

const bottomRight = getCameraViewport({
  canvasWidth: 390,
  canvasHeight: 844,
  dpr: 1,
  zoom: 1,
  centerX: 9000,
  centerY: 9000,
  mapWidth: 3224,
  mapHeight: 1858,
});
near(bottomRight.srcX, 3224 - 390, "right map edge clamps to its final viewport");
near(bottomRight.srcY, 1858 - 844, "bottom map edge clamps to its final viewport");

const largerThanMap = getCameraViewport({
  canvasWidth: 4000,
  canvasHeight: 2400,
  dpr: 1,
  zoom: 1,
  centerX: 1000,
  centerY: 1000,
  mapWidth: 3224,
  mapHeight: 1858,
});
near(largerThanMap.srcX, 0, "oversized viewport remains anchored at the left edge");
near(largerThanMap.srcY, 0, "oversized viewport remains anchored at the top edge");

assert.throws(
  () => getCameraViewport({ canvasWidth: 0, canvasHeight: 10, dpr: 1, zoom: 1, centerX: 0, centerY: 0, mapWidth: 10, mapHeight: 10 }),
  RangeError,
);
assert.throws(
  () => stepCameraCenter({ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, 16),
  RangeError,
);

console.log("MAP CAMERA TESTS PASSED: frame-rate-independent easing, DPR scaling, viewport bounds and invalid input");
