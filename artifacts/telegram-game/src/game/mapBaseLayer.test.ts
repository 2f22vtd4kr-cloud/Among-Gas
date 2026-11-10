import assert from "node:assert/strict";
import { drawMapBaseLayer } from "./mapBaseLayer.js";
import type { MapBaseLayerContext, MapBaseLayerTileRenderer } from "./mapBaseLayer.js";

const events: string[] = [];
const imageArgs: unknown[][] = [];
const image = {};
const context = {
  imageSmoothingEnabled: false,
  imageSmoothingQuality: "low" as const,
  clearRect: (...args: number[]) => {
    events.push("clear");
    assert.deepEqual(args, [0, 0, 640, 480]);
  },
  drawImage: (...args: unknown[]) => {
    events.push("overview");
    imageArgs.push(args);
  },
} as unknown as MapBaseLayerContext;

const cameraWorldRect = { x: 100, y: 200, w: 300, h: 250 };
const mapSourceRect = { x: 4, y: 8, width: 128, height: 96 };
let tileArguments: unknown[] | null = null;
const tiledMap = {
  draw: (...args: unknown[]) => {
    events.push("tiles");
    tileArguments = args;
    return true;
  },
} as unknown as MapBaseLayerTileRenderer;

const tilesReady = drawMapBaseLayer({
  context,
  canvasWidth: 640,
  canvasHeight: 480,
  mapImage: image,
  mapSourceRect,
  cameraWorldRect,
  zoom: 0.7,
  dpr: 1.5,
  tiledMap,
});

assert.deepEqual(events, ["clear", "overview", "tiles"], "base map layers must draw in stable order");
assert.deepEqual(imageArgs[0], [image, 4, 8, 128, 96, 0, 0, 640, 480]);
assert.deepEqual(tileArguments, [context, cameraWorldRect, 0.7, 1.5]);
assert.equal(tilesReady, true);
assert.equal(context.imageSmoothingEnabled, true);
assert.equal(context.imageSmoothingQuality, "high");

// Without a tile renderer, the overview remains a valid standalone fallback.
events.length = 0;
const fallbackResult = drawMapBaseLayer({
  context,
  canvasWidth: 640,
  canvasHeight: 480,
  mapImage: image,
  mapSourceRect,
  cameraWorldRect,
  zoom: 0.7,
  dpr: 1.5,
});
assert.equal(fallbackResult, null);
assert.deepEqual(events, ["clear", "overview"]);

console.log("MAP BASE LAYER TESTS PASSED: clear, overview crop, tile order, camera contract and fallback");
