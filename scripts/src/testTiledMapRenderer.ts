import assert from "node:assert/strict";
import { TiledMap } from "../../artifacts/telegram-game/src/game/TiledMap.js";

type FakeHandler = ((this: GlobalEventHandlers, event: Event) => unknown) | null;

class FakeImage {
  static failNext = false;
  static instances: FakeImage[] = [];
  naturalWidth = 1024;
  naturalHeight = 1024;
  decoding = "";
  onload: FakeHandler = null;
  onerror: FakeHandler = null;
  private currentSrc = "";

  constructor() {
    FakeImage.instances.push(this);
  }

  get src(): string {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    if (!value) return;
    const fail = FakeImage.failNext;
    FakeImage.failNext = false;
    queueMicrotask(() => {
      if (this.currentSrc !== value) return;
      if (fail) this.onerror?.call(this as unknown as GlobalEventHandlers, new Event("error"));
      else this.onload?.call(this as unknown as GlobalEventHandlers, new Event("load"));
    });
  }
}

const originalFetch = globalThis.fetch;
let invalidManifest = false;
Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: FakeImage });
Object.defineProperty(globalThis, "HTMLImageElement", { configurable: true, writable: true, value: FakeImage });
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: async () => ({
    ok: true,
    json: async () => {
      const manifest = {
      version: 1,
      worldW: 3224,
      worldH: 1858,
      scale: 2,
      texW: 6448,
      texH: 3716,
      tilePx: 1024,
      cols: 7,
      rows: 4,
      format: "webp",
      tiles: Array.from({ length: 28 }, (_, index) => {
        const row = Math.floor(index / 7);
        const col = index % 7;
        const x = col * 1024;
        const y = row * 1024;
        const width = Math.min(1024, 6448 - x);
        const height = Math.min(1024, 3716 - y);
        return {
          file: `tile_r${row}_c${col}.webp`,
          row,
          col,
          tex: [x, y, width, height],
          world: [x / 2, y / 2, width / 2, height / 2],
        };
      }),
      };
      if (invalidManifest) manifest.tiles[0].file = "../escape.webp";
      return manifest;
    },
  }),
});

function makeContext() {
  const draws: unknown[][] = [];
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low" as ImageSmoothingQuality,
    drawImage: (...args: unknown[]) => draws.push(args),
  } as unknown as CanvasRenderingContext2D;
  return { context, draws };
}

async function flushImages(): Promise<void> {
  await new Promise<void>(resolve => queueMicrotask(resolve));
}

try {
  const map = await TiledMap.load("/map-tiles");
  const { context, draws } = makeContext();
  const camera = { x: 0, y: 0, w: 512, h: 512 };

  assert.equal(map.draw(context, camera, 1, 1), false, "first frame waits for the visible tile");
  assert.equal(map.getStatus().loading, 1);
  await flushImages();

  assert.equal(map.draw(context, camera, 1, 1), true, "loaded visible tile must render");
  assert.equal(draws.length, 1);
  assert.equal(draws[0][1], 0, "tile left edge");
  assert.equal(draws[0][2], 0, "tile top edge");
  assert.equal(draws[0][3], 513, "the device-pixel bleed closes fractional-scale hairlines");
  assert.equal(draws[0][4], 513);
  assert.equal(context.imageSmoothingEnabled, false, "renderer restores caller smoothing state");
  assert.equal(context.imageSmoothingQuality, "low", "renderer restores caller smoothing quality");

  const previousStatus = map.getStatus();
  map.draw(context, camera, 1, 1);
  assert.equal(previousStatus.cached, 1, "status snapshots must not mutate after later draws");

  FakeImage.failNext = true;
  const adjacentCamera = { x: 512, y: 0, w: 512, h: 512 };
  assert.equal(map.draw(context, adjacentCamera, 1, 1), false);
  await flushImages();
  map.draw(context, adjacentCamera, 1, 1);
  assert.equal(map.getStatus().failed, 1, "failed tile is reported");
  assert.equal(map.retryFailed(), 1, "failed tile can be retried explicitly");
  assert.equal(map.retryFailed(), 0, "retry does not duplicate an already-cleared failure");
  assert.equal(map.draw(context, adjacentCamera, 1, 1), false, "retry starts a new request");
  await flushImages();
  assert.equal(map.draw(context, adjacentCamera, 1, 1), true, "retried tile renders after load");

  const pendingCamera = { x: 1024, y: 0, w: 512, h: 512 };
  assert.equal(map.draw(context, pendingCamera, 1, 1), false);
  const pendingImage = FakeImage.instances.at(-1)!;
  assert.ok(pendingImage.src.endsWith("tile_r0_c2.webp"));
  assert.throws(
    () => map.draw(context, { x: 0, y: 0, w: 0, h: 10 }, 1, 1),
    RangeError,
    "invalid viewports must be rejected",
  );
  map.dispose();
  assert.equal(pendingImage.src, "", "dispose cancels pending image requests");
  assert.equal(map.getStatus().cached, 0, "dispose releases all cached images");
  assert.equal(map.draw(context, camera, 1, 1), false, "disposed maps refuse later drawing");

  const boundedMap = await TiledMap.load("/bounded-map", 6);
  const { context: fullMapContext, draws: fullMapDraws } = makeContext();
  const fullMapCamera = { x: 0, y: 0, w: 3224, h: 1858 };
  assert.equal(boundedMap.draw(fullMapContext, fullMapCamera, 0.2, 1), false,
    "a full-map view must retain the overview fallback for deferred tiles");
  assert.equal(boundedMap.getStatus().visibleTotal, 28);
  assert.equal(boundedMap.getStatus().loading, 6,
    "a zoomed-out view must request no more than the six-tile mobile budget");
  assert.equal(boundedMap.getStatus().deferred, 22);
  assert.equal(boundedMap.getStatus().cached, 6);
  await flushImages();
  assert.equal(boundedMap.draw(fullMapContext, fullMapCamera, 0.2, 1), false);
  assert.equal(boundedMap.getStatus().visibleLoaded, 6);
  assert.equal(boundedMap.getStatus().deferred, 22);
  assert.equal(boundedMap.getStatus().cached, 6,
    "the hard resident budget must include visible and offscreen decoded images");
  assert.equal(fullMapDraws.length, 6,
    "only the six tiles nearest the camera centre should cover the overview");
  const boundedTileNames = FakeImage.instances
    .map(image => image.src)
    .filter(src => src.startsWith("/bounded-map/"))
    .map(src => src.slice("/bounded-map/".length));
  assert.equal(boundedTileNames.length, 6);
  assert.ok(boundedTileNames.every(name => /^tile_r[12]_c[234]\.webp$/.test(name)),
    "full-map zoom-out prioritizes the central six tiles, not a corner-first batch");

  const farCornerCamera = { x: 3072, y: 1536, w: 152, h: 322 };
  assert.equal(boundedMap.draw(fullMapContext, farCornerCamera, 1, 1), false,
    "moving to a distant corner requests its tile");
  await flushImages();
  assert.equal(boundedMap.draw(fullMapContext, farCornerCamera, 1, 1), true);
  assert.equal(boundedMap.getStatus().cached, 1,
    "moving the camera evicts decoded tiles outside the selected resident set");
  boundedMap.dispose();

  invalidManifest = true;
  await assert.rejects(
    () => TiledMap.load("/bad-map"),
    /manifest|tile/i,
    "invalid manifests must fail closed",
  );

  console.log("TILED MAP RENDERER TESTS PASSED: load, bleed, smoothing restore, status, retry, disposal and validation");
} finally {
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
}
