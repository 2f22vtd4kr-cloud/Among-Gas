import { useRef, useEffect, useState } from 'react';
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
  CHARACTER_CELL_WIDTH,
  CHARACTER_CELL_HEIGHT,
  getCharacterFrameRect,
} from '../game/characterSprites';

// ── Camera ────────────────────────────────────────────────────────────────────
// How many screen pixels equal one map pixel. Matches the reference
// Among Us screenshots — character is a small figure with lots of
// surrounding map visible, not a close-up zoom.
const ZOOM = 0.6;

// On-map display size of the player sprite. Derived from the sheet cell's
// aspect ratio (146.29:128) rather than hardcoded so it stays proportional
// if the sprite sheet is ever re-sliced. Scaled against the map's native
// upscaled resolution (36px was tuned for the old 1652×952 canvas).
const PLAYER_DISPLAY_HEIGHT = Math.round(36 * (MAP_W / 1652));
const PLAYER_DISPLAY_WIDTH = PLAYER_DISPLAY_HEIGHT * (CHARACTER_CELL_WIDTH / CHARACTER_CELL_HEIGHT);

export default function GameMap() {
  const mapCanvasRef     = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerCanvasRef  = useRef<HTMLCanvasElement>(null);
  // The camera transform is applied directly to this div each rAF — no state
  const cameraRef        = useRef<HTMLDivElement>(null);

  const [loaded, setLoaded]               = useState(false);
  const [error, setError]                 = useState(false);
  const [showCollision, setShowCollision] = useState(false);
  const [hoverZone, setHoverZone]         = useState<string | null>(null);
  const [spriteLoaded, setSpriteLoaded]   = useState(false);

  // ── Load map image ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
      setLoaded(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      setError(true);
    };
    // Pre-upscaled (sharp lanczos3) static asset — see game/collisionMap.ts
    // for why we don't stretch the small original via canvas at runtime.
    img.src = `${import.meta.env.BASE_URL}map-hires.png`;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
      setLoaded(true);
    }
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, []);

  // ── Draw / clear collision overlay ────────────────────────────────────────
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MAP_W, MAP_H);
    if (!showCollision) return;

    const grid = buildCollisionGrid();

    // Draw blocked cells
    ctx.fillStyle = 'rgba(255, 50, 50, 0.42)';
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (grid[row * COLS + col] === 1) {
          ctx.fillRect(col * CELL_X, row * CELL_Y, CELL_X, CELL_Y);
        }
      }
    }

    // Draw walkable cells (subtle green tint)
    ctx.fillStyle = 'rgba(60, 220, 120, 0.12)';
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (grid[row * COLS + col] === 0) {
          ctx.fillRect(col * CELL_X, row * CELL_Y, CELL_X, CELL_Y);
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    for (let row = 0; row <= ROWS; row++) {
      ctx.beginPath();
      ctx.moveTo(0,      row * CELL_Y);
      ctx.lineTo(MAP_W,  row * CELL_Y);
      ctx.stroke();
    }
    for (let col = 0; col <= COLS; col++) {
      ctx.beginPath();
      ctx.moveTo(col * CELL_X, 0);
      ctx.lineTo(col * CELL_X, MAP_H);
      ctx.stroke();
    }

    // Draw zone outlines with labels
    ctx.font         = 'bold 9px monospace';
    ctx.textBaseline = 'top';
    for (const zone of ZONES) {
      ctx.strokeStyle = 'rgba(120, 220, 255, 0.6)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(zone.px, zone.py, zone.pw, zone.ph);

      ctx.fillStyle = 'rgba(120, 220, 255, 0.85)';
      ctx.fillText(zone.label, zone.px + 3, zone.py + 3);
    }
  }, [showCollision]);

  // ── Keyboard shortcut 'C' to toggle collision overlay ─────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        setShowCollision(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Load player sprite sheet ──────────────────────────────────────────────
  const spriteImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setSpriteLoaded(true); };
    img.src = `${import.meta.env.BASE_URL}${CHARACTER_SHEET_PATH.slice(1)}`;
    spriteImgRef.current = img;
    if (img.complete && img.naturalWidth > 0) setSpriteLoaded(true);
    return () => { cancelled = true; img.onload = null; };
  }, []);

  // ── Track held movement keys (WASD + arrows) ──────────────────────────────
  const keysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const trackedKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!trackedKeys.has(key)) return;
      e.preventDefault();
      keysRef.current.add(key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!trackedKeys.has(key)) return;
      keysRef.current.delete(key);
    };
    const clearKeys = () => keysRef.current.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
    };
  }, []);

  // ── Player movement + render loop ─────────────────────────────────────────
  const playerStateRef = useRef(createInitialPlayerState());
  useEffect(() => {
    if (!loaded || !spriteLoaded) return;
    const canvas = playerCanvasRef.current;
    const sprite = spriteImgRef.current;
    if (!canvas || !sprite) return;
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

      playerStateRef.current = stepPlayer(grid, playerStateRef.current, keysRef.current, dtMs);
      const { x, y, pose, facingLeft } = playerStateRef.current;

      // ── Draw player sprite ──────────────────────────────────────────────
      ctx.clearRect(0, 0, MAP_W, MAP_H);
      ctx.imageSmoothingEnabled = false;

      const rect = getCharacterFrameRect(PLAYER_COLOR, pose);
      ctx.save();
      ctx.translate(x, y);
      if (facingLeft) ctx.scale(-1, 1);
      ctx.drawImage(
        sprite,
        rect.x, rect.y, rect.width, rect.height,
        -PLAYER_DISPLAY_WIDTH / 2, -PLAYER_DISPLAY_HEIGHT / 2,
        PLAYER_DISPLAY_WIDTH, PLAYER_DISPLAY_HEIGHT,
      );
      ctx.restore();

      // ── Camera follow ───────────────────────────────────────────────────
      // Mutate the container transform directly — avoids React re-renders.
      // transform-origin is 0 0, so:
      //   screen_x = map_x * ZOOM + tx  →  tx = vw/2 - x * ZOOM
      //   screen_y = map_y * ZOOM + ty  →  ty = vh/2 - y * ZOOM
      const cam = cameraRef.current;
      if (cam) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const tx = vw / 2 - x * ZOOM;
        const ty = vh / 2 - y * ZOOM;
        cam.style.transform = `translate(${tx}px,${ty}px) scale(${ZOOM})`;
      }

      rafId = requestAnimationFrame(frame);
    };

    // Set initial camera position before first frame so there's no flash
    const initCam = cameraRef.current;
    if (initCam) {
      const { x, y } = playerStateRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      initCam.style.transform =
        `translate(${vw / 2 - x * ZOOM}px,${vh / 2 - y * ZOOM}px) scale(${ZOOM})`;
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [loaded, spriteLoaded]);

  // ── Track mouse to show zone name on hover ────────────────────────────────
  // Convert screen coords → map coords, accounting for the camera transform.
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!showCollision) return;
    const { x: px, y: py } = playerStateRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Inverse of: translate(vw/2 - px*ZOOM, vh/2 - py*ZOOM) scale(ZOOM)
    const mapX = (e.clientX - (vw / 2 - px * ZOOM)) / ZOOM;
    const mapY = (e.clientY - (vh / 2 - py * ZOOM)) / ZOOM;
    const found = ZONES.find(
      z => mapX >= z.px && mapX < z.px + z.pw && mapY >= z.py && mapY < z.py + z.ph,
    );
    setHoverZone(found?.label ?? null);
  };

  return (
    // ── Viewport clipping wrapper ─────────────────────────────────────────
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: '#3d4e5e',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverZone(null)}
    >
      {/* ── Loading / error states (centred in viewport) ───────────────── */}
      {!loaded && !error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#8faabb', fontFamily: 'monospace', fontSize: 14,
          zIndex: 10,
        }}>
          Loading map…
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#cc4444', fontFamily: 'monospace', fontSize: 14,
          zIndex: 10,
        }}>
          Failed to load map.
        </div>
      )}

      {/* ── Camera container: transform applied here each rAF ─────────── */}
      <div
        ref={cameraRef}
        style={{
          position: 'absolute',
          width: MAP_W,
          height: MAP_H,
          transformOrigin: '0 0',
          // Initial position: player spawn centred; overwritten on first rAF
          willChange: 'transform',
        }}
      >
        {/* Map image layer */}
        <canvas
          ref={mapCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
        />

        {/* Overlay: collision debug */}
        <canvas
          ref={overlayCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{
            display: 'block', position: 'absolute', top: 0, left: 0,
            opacity: loaded ? 1 : 0,
          }}
        />

        {/* Player layer */}
        <canvas
          ref={playerCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{
            display: 'block', position: 'absolute', top: 0, left: 0,
            opacity: loaded && spriteLoaded ? 1 : 0,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ── HUD: movement hint ────────────────────────────────────────────── */}
      {loaded && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          padding: '5px 10px',
          background: 'rgba(20, 32, 44, 0.85)',
          color: '#8ab8cc',
          fontFamily: 'monospace',
          fontSize: 12,
          borderRadius: 6,
          border: '1px solid rgba(100,160,200,0.3)',
          backdropFilter: 'blur(6px)',
          letterSpacing: '0.03em',
          zIndex: 20,
        }}>
          WASD / Arrow keys to move
        </div>
      )}

      {/* ── HUD: debug controls ──────────────────────────────────────────── */}
      {loaded && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 6,
          zIndex: 20,
        }}>
          {showCollision && hoverZone && (
            <div style={{
              padding: '3px 8px',
              background: 'rgba(20, 32, 44, 0.9)',
              color: '#78d4ff',
              fontFamily: 'monospace',
              fontSize: 11,
              borderRadius: 4,
              border: '1px solid rgba(120,200,255,0.3)',
            }}>
              {hoverZone}
            </div>
          )}
          <button
            onClick={() => setShowCollision(prev => !prev)}
            style={{
              padding: '6px 14px',
              background: showCollision ? 'rgba(200, 50, 50, 0.85)' : 'rgba(20, 32, 44, 0.85)',
              color: showCollision ? '#ffcccc' : '#8ab8cc',
              border: `1px solid ${showCollision ? 'rgba(255,100,100,0.4)' : 'rgba(100,160,200,0.3)'}`,
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 12,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              letterSpacing: '0.03em',
            }}
          >
            {showCollision ? '■ Hide Collision [C]' : '□ Show Collision [C]'}
          </button>
        </div>
      )}
    </div>
  );
}
