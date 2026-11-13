/**
 * Browser tile renderer for the canonical 3224×1858 world.
 * Tiles are 2× WebP; a hard mobile/desktop residency budget bounds decoded image memory.
 * Shared world boundaries are rounded with the same expression on both
 * neighbouring tiles, so no fractional-zoom hairline gaps can appear.
 */
export interface TileMeta {
  file: string;
  row: number;
  col: number;
  tex: [number, number, number, number];
  world: [number, number, number, number];
}

export interface TileManifest {
  version: 1;
  worldW: number;
  worldH: number;
  scale: number;
  texW: number;
  texH: number;
  tilePx: number;
  cols: number;
  rows: number;
  format: "webp";
  tiles: TileMeta[];
}

type CacheEntry = HTMLImageElement | "loading" | "failed";

function validateManifest(value: unknown): TileManifest {
  if (!value || typeof value !== "object") throw new Error("Map tile manifest must be an object");
  const manifest = value as Partial<TileManifest>;
  if (manifest.version !== 1 || manifest.worldW !== 3224 || manifest.worldH !== 1858 ||
      manifest.scale !== 2 || manifest.texW !== 6448 || manifest.texH !== 3716 ||
      manifest.tilePx !== 1024 || manifest.cols !== 7 || manifest.rows !== 4 ||
      manifest.format !== "webp" || !Array.isArray(manifest.tiles) ||
      manifest.tiles.length !== manifest.cols * manifest.rows) {
    throw new Error("Map tile manifest does not match the canonical 2× world");
  }
  const seen = new Set<string>();
  for (let index = 0; index < manifest.tiles.length; index++) {
    const tile = manifest.tiles[index];
    const row = Math.floor(index / manifest.cols);
    const col = index % manifest.cols;
    const x = col * manifest.tilePx;
    const y = row * manifest.tilePx;
    const width = Math.min(manifest.tilePx, manifest.texW - x);
    const height = Math.min(manifest.tilePx, manifest.texH - y);
    if (!tile || typeof tile.file !== "string" || tile.file !== `tile_r${row}_c${col}.webp` ||
        seen.has(tile.file) || tile.row !== row || tile.col !== col ||
        !Array.isArray(tile.tex) || tile.tex.length !== 4 ||
        !Array.isArray(tile.world) || tile.world.length !== 4 ||
        tile.tex[0] !== x || tile.tex[1] !== y || tile.tex[2] !== width || tile.tex[3] !== height ||
        tile.world[0] !== x / 2 || tile.world[1] !== y / 2 ||
        tile.world[2] !== width / 2 || tile.world[3] !== height / 2) {
      throw new Error(`Invalid map tile manifest entry at index ${index}`);
    }
    seen.add(tile.file);
  }
  return manifest as TileManifest;
}

export class TiledMap {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, HTMLImageElement>();
  private disposed = false;
  private status = { visibleTotal: 0, visibleLoaded: 0, loading: 0, failed: 0, deferred: 0, cached: 0, decodedBytes: 0 };

  private constructor(
    private readonly manifest: TileManifest,
    private readonly baseUrl: string,
    private readonly maxResident = 12,
  ) {}

  static async load(baseUrl: string, maxResident = 12): Promise<TiledMap> {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const response = await fetch(`${normalizedBase}manifest.json`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Map tile manifest request failed: HTTP ${response.status}`);
    const manifest = validateManifest(await response.json());
    const residentLimit = Number.isFinite(maxResident) ? Math.max(1, Math.floor(maxResident)) : 12;
    return new TiledMap(manifest, normalizedBase, residentLimit);
  }

  /** Draw visible tiles over the low-resolution overview fallback. */
  draw(
    ctx: CanvasRenderingContext2D,
    camera: { x: number; y: number; w: number; h: number },
    zoom: number,
    dpr: number,
  ): boolean {
    if (this.disposed) return false;
    if (![camera.x, camera.y, camera.w, camera.h, zoom, dpr].every(Number.isFinite) ||
        camera.w <= 0 || camera.h <= 0 || zoom <= 0 || dpr <= 0) {
      throw new RangeError("Map camera, zoom and DPR must be finite and positive");
    }
    const visibleTiles = this.manifest.tiles.filter(tile => {
      const [wx, wy, ww, wh] = tile.world;
      return !(wx + ww <= camera.x || wy + wh <= camera.y ||
        wx >= camera.x + camera.w || wy >= camera.y + camera.h);
    });
    const visibleTotal = visibleTiles.length;
    const centerX = camera.x + camera.w / 2;
    const centerY = camera.y + camera.h / 2;
    // A zoomed-out map view can intersect all 28 tiles. Never decode every
    // visible tile: keep only the nearest tiles resident and let the overview
    // fallback cover the deferred regions until the camera moves closer.
    const selectedTiles = visibleTiles
      .slice()
      .sort((a, b) => {
        const ax = a.world[0] + a.world[2] / 2 - centerX;
        const ay = a.world[1] + a.world[3] / 2 - centerY;
        const bx = b.world[0] + b.world[2] / 2 - centerX;
        const by = b.world[1] + b.world[3] / 2 - centerY;
        return ax * ax + ay * ay - (bx * bx + by * by) ||
          a.row - b.row || a.col - b.col;
      })
      .slice(0, this.maxResident);
    let visibleLoaded = 0;
    let loading = 0;
    let failed = 0;
    const deferred = visibleTotal - selectedTiles.length;
    const visible = new Set(selectedTiles.map(tile => tile.file));
    const deviceScale = zoom * dpr;
    const previousSmoothing = ctx.imageSmoothingEnabled;
    const previousQuality = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    try {
      for (const tile of selectedTiles) {
        const [wx, wy, ww, wh] = tile.world;
        const image = this.get(tile);
        if (image === "loading") { loading++; continue; }
        if (image === "failed") { failed++; continue; }
        const left = Math.round((wx - camera.x) * deviceScale);
        const top = Math.round((wy - camera.y) * deviceScale);
        const right = Math.round((wx + ww - camera.x) * deviceScale);
        const bottom = Math.round((wy + wh - camera.y) * deviceScale);
        if (right <= left || bottom <= top) continue;
        // One-device-pixel bleed closes compositor hairlines at fractional zoom.
        // Tiles draw in stable centre-priority order, so overlap is deterministic.
        ctx.drawImage(image, left, top, right - left + 1, bottom - top + 1);
        visibleLoaded++;
      }
    } finally {
      ctx.imageSmoothingEnabled = previousSmoothing;
      ctx.imageSmoothingQuality = previousQuality;
    }
    this.evict(visible);
    const decodedBytes = [...this.cache.values()].reduce((total, entry) =>
      typeof HTMLImageElement !== "undefined" && entry instanceof HTMLImageElement
        ? total + entry.naturalWidth * entry.naturalHeight * 4 : total, 0);
    this.status = { visibleTotal, visibleLoaded, loading, failed, deferred, cached: this.cache.size, decodedBytes };
    return visibleTotal > 0 && deferred === 0 && visibleLoaded === visibleTotal;
  }

  getStatus(): Readonly<typeof this.status> {
    return { ...this.status };
  }

  retryFailed(): number {
    let count = 0;
    for (const [file, entry] of this.cache) {
      if (entry === "failed") { this.cache.delete(file); count++; }
    }
    return count;
  }

  /** Cancel pending requests and release decoded image references on unmount. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const image of this.pending.values()) {
      image.onload = null; image.onerror = null; image.src = "";
    }
    this.pending.clear();
    for (const entry of this.cache.values()) {
      if (typeof HTMLImageElement !== "undefined" && entry instanceof HTMLImageElement) {
        entry.onload = null; entry.onerror = null; entry.src = "";
      }
    }
    this.cache.clear();
    this.status = { visibleTotal: 0, visibleLoaded: 0, loading: 0, failed: 0, deferred: 0, cached: 0, decodedBytes: 0 };
  }

  private get(tile: TileMeta): CacheEntry {
    const existing = this.cache.get(tile.file);
    if (existing) {
      this.touch(tile.file, existing);
      return existing;
    }

    const image = new Image();
    image.decoding = "async";
    this.cache.set(tile.file, "loading");
    this.pending.set(tile.file, image);
    image.onload = () => {
      this.pending.delete(tile.file);
      if (!this.disposed && this.cache.get(tile.file) === "loading") this.touch(tile.file, image);
    };
    image.onerror = () => {
      this.pending.delete(tile.file);
      if (!this.disposed && this.cache.get(tile.file) === "loading") this.touch(tile.file, "failed");
    };
    image.src = this.baseUrl + tile.file;
    return "loading";
  }

  private touch(file: string, value: CacheEntry): void {
    this.cache.delete(file);
    this.cache.set(file, value);
  }

  private evict(visible: ReadonlySet<string>): void {
    // Keep only the current priority set, even when it contains fewer tiles
    // than the budget. Otherwise a previous zoomed-out frame can leave stale
    // decoded images resident after the camera moves to a single corner tile.
    for (const file of this.cache.keys()) {
      if (visible.has(file)) continue;
      const pending = this.pending.get(file);
      if (pending) {
        pending.onload = null; pending.onerror = null; pending.src = "";
        this.pending.delete(file);
      }
      const entry = this.cache.get(file);
      if (typeof HTMLImageElement !== "undefined" && entry instanceof HTMLImageElement) {
        entry.onload = null; entry.onerror = null; entry.src = "";
      }
      this.cache.delete(file);
    }
  }
}
