import { useRef, useEffect, useState, useCallback } from 'react';
import {
  buildCollisionGrid,
  COLS, ROWS, CELL_X, CELL_Y,
  MAP_W, MAP_H,
  ZONES,
} from '../game/collisionMap';
import {
  createInitialPlayerState,
  stepPlayer,
  isSpawnWalkable,
  PLAYER_COLOR,
} from '../game/player';
import {
  CHARACTER_SHEET_PATH,
  CHARACTER_SHEET_ROWS,
  CHARACTER_CELL_WIDTH,
  CHARACTER_CELL_HEIGHT,
  getCharacterFrameRect,
} from '../game/characterSprites';
import Joystick from '../components/Joystick';

// ── Camera ────────────────────────────────────────────────────────────────────
// Screen CSS pixels per map pixel. Calibrated against reference Among Us
// screenshots — small figure with a wide view of surrounding rooms.
const ZOOM = 0.6;

// Hard cap on the DPR used to size the canvas buffer and scale the map draw.
// The map source asset (map-hires.webp) has a fixed native resolution; the
// per-frame draw stretches it by a factor of `ZOOM * dpr`. Once that factor
// exceeds ~1 we're upsampling native image pixels, which reads as visibly
// blurry (bilinear/bicubic interpolation adds no real detail) — this is most
// noticeable on high-DPR phones (iPhones are typically dpr=3). Capping dpr at
// 1/ZOOM keeps the map stretch factor at exactly 1 (pure 1:1, no upsampling)
// on any device, at the cost of slightly less-dense text/UI on very high-DPR
// screens. See .agents/memory/image-upscaling.md.
const MAX_RENDER_DPR = 1 / ZOOM;
const getRenderDpr = () => Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR);

// Player sprite display size in MAP pixels (scaled from the original 1652-wide canvas)
const PLAYER_DISPLAY_HEIGHT = Math.round(36 * (MAP_W / 1652));
const PLAYER_DISPLAY_WIDTH  = PLAYER_DISPLAY_HEIGHT * (CHARACTER_CELL_WIDTH / CHARACTER_CELL_HEIGHT);

export default function GameMap() {
  // Single screen-sized canvas — the whole scene is drawn here each rAF.
  // Buffer dimensions = viewport × DPR so each canvas pixel maps 1:1 to a
  // physical screen pixel with no CSS-transform scaling blur.
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mapImgRef    = useRef<HTMLImageElement | null>(null);
  // OffscreenCanvas after bleed cleanup, or raw img before it finishes
  const spriteImgRef = useRef<CanvasImageSource | null>(null);

  const [loaded,       setLoaded]       = useState(false);
  const [error,        setError]        = useState(false);
  const [showCollision, setShowCollision] = useState(false);
  const [hoverZone,    setHoverZone]    = useState<string | null>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);

  // Mirror showCollision into a ref so the rAF loop reads it without stale closure.
  const showCollisionRef = useRef(false);
  useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);

  // ── Resize canvas buffer to viewport × DPR ────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = getRenderDpr();
    const w   = window.innerWidth;
    const h   = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
    return () => window.removeEventListener('resize', sizeCanvas);
  }, [sizeCanvas]);

  // ── Load map image ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      mapImgRef.current = img;
      setLoaded(true);
    };
    img.onerror = () => { if (!cancelled) setError(true); };
    img.src = `${import.meta.env.BASE_URL}map-hires.png`;
    // Already cached (e.g. HMR reload)
    if (img.complete && img.naturalWidth > 0) { mapImgRef.current = img; setLoaded(true); }
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, []);

  // ── Load sprite sheet ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      // Draw to an OffscreenCanvas and wipe 5px at every inter-row boundary.
      // Some rows' artwork overflows the fractional cell boundary into the next
      // row's space; with imageSmoothingEnabled=false those stray pixels render
      // as a visible dark artifact above the character's head when walking.
      const oc = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      const octx = oc.getContext('2d')!;
      octx.drawImage(img, 0, 0);
      // Wipe 5px at every inter-row boundary to prevent row bleed.
      const cellH = img.naturalHeight / CHARACTER_SHEET_ROWS;
      for (let row = 1; row < CHARACTER_SHEET_ROWS; row++) {
        const boundary = Math.ceil(row * cellH);
        octx.clearRect(0, boundary, img.naturalWidth, 5);
      }
      // Two-pass pixel normalisation:
      // 1. Binarize alpha (> 20 → 255, else → 0) so map tile grout lines
      //    cannot bleed through semi-transparent outline edge pixels.
      // 2. Normalise dark pixels to pure black.  The visor's vertical stripes
      //    bleed teal tint into the outline pixels at the head's curved edge,
      //    producing alternating dark/lighter-teal bands that look like
      //    horizontal stripes at game scale.  Clamping all dark pixels
      //    (average brightness < 80/255) to #000 gives a uniform outline.
      const id = octx.getImageData(0, 0, oc.width, oc.height);
      const px = id.data;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3];
        if (a <= 20) {
          px[i + 3] = 0;
        } else {
          px[i + 3] = 255;
          // Normalise dark pixels → pure black so outline is stripe-free
          if ((px[i] + px[i + 1] + px[i + 2]) / 3 < 80) {
            px[i] = 0; px[i + 1] = 0; px[i + 2] = 0;
          }
        }
      }
      octx.putImageData(id, 0, 0);
      spriteImgRef.current = oc;
      setSpriteLoaded(true);
    };
    img.src = `${import.meta.env.BASE_URL}${CHARACTER_SHEET_PATH.slice(1)}`;
    if (img.complete && img.naturalWidth > 0) img.onload!(new Event('load'));
    return () => { cancelled = true; img.onload = null; };
  }, []);

  // ── Track held movement keys (WASD + arrows) ──────────────────────────────
  const keysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const tracked = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
    const onDown  = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!tracked.has(k)) return;
      e.preventDefault();
      keysRef.current.add(k);
    };
    const onUp   = (e: KeyboardEvent) => { keysRef.current.delete(e.key.toLowerCase()); };
    const clear  = () => keysRef.current.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    window.addEventListener('blur',    clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
      window.removeEventListener('blur',    clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);

  // ── Keyboard shortcut 'C' → toggle collision overlay ──────────────────────
  useEffect(() => {
    if (!loaded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') setShowCollision(prev => !prev);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [loaded]);

  // ── Main rAF render loop ───────────────────────────────────────────────────
  const playerStateRef = useRef(createInitialPlayerState());

  useEffect(() => {
    if (!loaded || !spriteLoaded) return;
    const canvas = canvasRef.current;
    const mapImg = mapImgRef.current;
    const sprite = spriteImgRef.current;
    if (!canvas || !mapImg || !sprite) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grid = buildCollisionGrid();
    if (!isSpawnWalkable(grid)) {
      // eslint-disable-next-line no-console
      console.warn('Player spawn point is not walkable — check PLAYER_SPAWN in game/player.ts');
    }

    let rafId = 0;
    let lastTs: number | null = null;

    const frame = (ts: number) => {
      const dtMs = lastTs === null ? 16 : Math.min(ts - lastTs, 48);
      lastTs = ts;

      // Step player physics
      playerStateRef.current = stepPlayer(grid, playerStateRef.current, keysRef.current, dtMs);
      const { x: px, y: py, pose, facingLeft } = playerStateRef.current;

      // Canvas buffer size and DPR
      const cw  = canvas.width;
      const ch  = canvas.height;
      const dpr = getRenderDpr();

      // How many map pixels are visible across the viewport
      const srcW = (cw / dpr) / ZOOM;   // map px wide
      const srcH = (ch / dpr) / ZOOM;   // map px tall

      // Camera center = player; clamped so we don't show outside the map
      const srcX = Math.max(0, Math.min(MAP_W - srcW, px - srcW / 2));
      const srcY = Math.max(0, Math.min(MAP_H - srcH, py - srcH / 2));

      // scale: map pixels → canvas buffer pixels
      const scale = ZOOM * dpr;

      // ── 1. Clear + Map ───────────────────────────────────────────────────
      // Must clear first: transparent sprite pixels from the previous frame
      // would show through even though the map drawImage is fully opaque,
      // because compositing happens at the pixel level after the fact.
      ctx.clearRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mapImg, srcX, srcY, srcW, srcH, 0, 0, cw, ch);

      // ── 2. Collision overlay (only visible cells) ─────────────────────────
      if (showCollisionRef.current) {
        const colStart = Math.max(0,        Math.floor(srcX / CELL_X));
        const colEnd   = Math.min(COLS - 1, Math.ceil((srcX + srcW) / CELL_X));
        const rowStart = Math.max(0,        Math.floor(srcY / CELL_Y));
        const rowEnd   = Math.min(ROWS - 1, Math.ceil((srcY + srcH) / CELL_Y));

        const cellW = CELL_X * scale;
        const cellH = CELL_Y * scale;

        for (let row = rowStart; row <= rowEnd; row++) {
          for (let col = colStart; col <= colEnd; col++) {
            const cx = (col * CELL_X - srcX) * scale;
            const cy = (row * CELL_Y - srcY) * scale;
            if (grid[row * COLS + col] === 1) {
              ctx.fillStyle = 'rgba(255,50,50,0.42)';
              ctx.fillRect(cx, cy, cellW, cellH);
            } else {
              ctx.fillStyle = 'rgba(60,220,120,0.12)';
              ctx.fillRect(cx, cy, cellW, cellH);
            }
          }
        }

        // Grid lines (only over visible area)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        for (let row = rowStart; row <= rowEnd + 1; row++) {
          const cy = (row * CELL_Y - srcY) * scale;
          ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cw, cy); ctx.stroke();
        }
        for (let col = colStart; col <= colEnd + 1; col++) {
          const cx = (col * CELL_X - srcX) * scale;
          ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, ch); ctx.stroke();
        }

        // Zone outlines + labels
        ctx.font         = `bold ${Math.round(9 * dpr)}px monospace`;
        ctx.textBaseline = 'top';
        for (const zone of ZONES) {
          const zx = (zone.px - srcX) * scale;
          const zy = (zone.py - srcY) * scale;
          const zw = zone.pw * scale;
          const zh = zone.ph * scale;
          ctx.strokeStyle = 'rgba(120,220,255,0.6)';
          ctx.lineWidth   = 1;
          ctx.strokeRect(zx, zy, zw, zh);
          ctx.fillStyle = 'rgba(120,220,255,0.85)';
          ctx.fillText(zone.label, zx + 3, zy + 3);
        }
      }

      // ── 3. Player sprite ──────────────────────────────────────────────────
      const spriteH = PLAYER_DISPLAY_HEIGHT * scale;
      const spriteW = PLAYER_DISPLAY_WIDTH  * scale;
      // Player screen position in canvas buffer pixels
      const playerCX = (px - srcX) * scale;
      const playerCY = (py - srcY) * scale;

      const rect = getCharacterFrameRect(PLAYER_COLOR, pose);
      // Ceil the source ORIGIN so we never start before the cell boundary —
      // floor would pull in the last fractional pixel of the previous row/col,
      // which with imageSmoothingEnabled=false nearest-neighbor blows up into
      // a visible dark artifact at the top of the sprite.
      // Floor the source END (derived from the far boundary) so we never pull
      // in the first fractional pixel of the next row/col either.
      const sx = Math.ceil(rect.x);
      const sy = Math.ceil(rect.y);
      const sw = Math.floor(rect.x + rect.width)  - sx;
      const sh = Math.floor(rect.y + rect.height) - sy;

      // Snap player position to integer canvas pixels to eliminate sub-pixel
      // jitter and give bilinear sampling a clean, stable input each frame.
      const pCX = Math.round(playerCX);
      const pCY = Math.round(playerCY);
      const sW  = Math.round(spriteW);
      const sH  = Math.round(spriteH);

      // Ground shadow — soft dark oval directly under the character's feet,
      // matching the Among Us-style grounding shadow in the reference.
      {
        const blurPx = Math.max(2, Math.round(sH * 0.05));
        ctx.save();
        ctx.filter = `blur(${blurPx}px)`;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(
          pCX,
          pCY + sH * 0.48,   // just at the base of the sprite
          sW  * 0.28,         // wide enough to sit under the feet
          sH  * 0.055,        // thin flat oval
          0, 0, Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
        ctx.filter = 'none'; // guard against iOS Safari filter leak
      }

      // Sprite draw.
      // Source alpha is binarized (0 or 255, no semi-transparent pixels) so
      // nearest-neighbour is now safe: hard source edges produce hard output
      // edges with no tile-line bleed-through. Bilinear was previously needed
      // to blend the original semi-transparent outline fringe, but after
      // binarization it only re-introduces semi-transparent output pixels at
      // every body edge, letting tile grout lines show through as stripes.
      ctx.save();
      ctx.translate(pCX, pCY);
      if (facingLeft) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sprite,
        sx, sy, sw, sh,
        -sW / 2, -sH / 2, sW, sH,
      );
      ctx.restore();

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [loaded, spriteLoaded]);

  // ── Mouse hover → zone label (for collision debug) ────────────────────────
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!showCollision) return;
    const { x: px, y: py } = playerStateRef.current;
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    const srcW = vw / ZOOM;
    const srcH = vh / ZOOM;
    const srcX = Math.max(0, Math.min(MAP_W - srcW, px - srcW / 2));
    const srcY = Math.max(0, Math.min(MAP_H - srcH, py - srcH / 2));
    const mapX = srcX + (e.clientX / vw) * srcW;
    const mapY = srcY + (e.clientY / vh) * srcH;
    const found = ZONES.find(
      z => mapX >= z.px && mapX < z.px + z.pw && mapY >= z.py && mapY < z.py + z.ph,
    );
    setHoverZone(found?.label ?? null);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#3d4e5e' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverZone(null)}
    >
      {/* Loading / error states */}
      {!loaded && !error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#8faabb', fontFamily: 'monospace', fontSize: 14, zIndex: 10,
        }}>
          Loading map…
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#cc4444', fontFamily: 'monospace', fontSize: 14, zIndex: 10,
        }}>
          Failed to load map.
        </div>
      )}

      {/* ── Single screen-sized canvas ─────────────────────────────────────
          CSS size = viewport (no scaling); buffer = viewport × DPR.
          Each frame draws only the visible map slice so map pixels map 1:1
          to physical screen pixels — no CSS-transform downscale blur.   */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'absolute',
          top: 0, left: 0,
          opacity: loaded ? 1 : 0,
        }}
      />

      {/* ── Joystick (touch devices) ──────────────────────────────────────── */}
      {loaded && <Joystick keysRef={keysRef} />}

      {/* ── HUD: keyboard hint (hidden on touch-primary devices) ─────────── */}
      {loaded && (
        <div style={{
          position: 'fixed', bottom: 16, left: 16,
          padding: '5px 10px',
          background: 'rgba(20,32,44,0.85)', color: '#8ab8cc',
          fontFamily: 'monospace', fontSize: 12, borderRadius: 6,
          border: '1px solid rgba(100,160,200,0.3)',
          backdropFilter: 'blur(6px)', letterSpacing: '0.03em', zIndex: 20,
          display: window.matchMedia('(pointer: coarse)').matches ? 'none' : 'block',
        }}>
          WASD / Arrow keys to move
        </div>
      )}

      {/* ── HUD: debug controls ──────────────────────────────────────────── */}
      {loaded && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
          gap: 6, zIndex: 20,
        }}>
          {showCollision && hoverZone && (
            <div style={{
              padding: '3px 8px',
              background: 'rgba(20,32,44,0.9)', color: '#78d4ff',
              fontFamily: 'monospace', fontSize: 11, borderRadius: 4,
              border: '1px solid rgba(120,200,255,0.3)',
            }}>
              {hoverZone}
            </div>
          )}
          <button
            onClick={() => setShowCollision(prev => !prev)}
            style={{
              padding: '6px 14px',
              background: showCollision ? 'rgba(200,50,50,0.85)' : 'rgba(20,32,44,0.85)',
              color: showCollision ? '#ffcccc' : '#8ab8cc',
              border: `1px solid ${showCollision ? 'rgba(255,100,100,0.4)' : 'rgba(100,160,200,0.3)'}`,
              borderRadius: 6, fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
              backdropFilter: 'blur(6px)', letterSpacing: '0.03em',
            }}
          >
            {showCollision ? '■ Hide Collision [C]' : '□ Show Collision [C]'}
          </button>
        </div>
      )}
    </div>
  );
}
