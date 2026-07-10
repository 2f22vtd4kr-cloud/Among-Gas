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
import { Link } from 'wouter';
import { useGameActions, useRemotePlayersRef, useCorrectionRef } from '@/context/GameContext';
import { toWire } from '@workspace/shared/coords';

// ── Camera ────────────────────────────────────────────────────────────────────
const ZOOM = 0.7;
const MAX_RENDER_DPR = 1 / ZOOM;
const getRenderDpr = () => Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR);

// Player sprite display size in MAP pixels
const PLAYER_DISPLAY_HEIGHT = Math.round(36 * (MAP_W / 1652));
const PLAYER_DISPLAY_WIDTH  = PLAYER_DISPLAY_HEIGHT * (CHARACTER_CELL_WIDTH / CHARACTER_CELL_HEIGHT);

// ── Movement throttle: send 0x11 at most once per 40ms (25Hz) ────────────────
const MOVE_SEND_INTERVAL_MS = 40;

// ── Remote player visual ─────────────────────────────────────────────────────
// Draw remote players as colored circles while sprites are Phase 3 scope.
// Colors cycle through a palette keyed by slot number.
const REMOTE_COLORS = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e67e22', // dark orange
  '#34495e', // dark gray
  '#e91e63', // pink
  '#00bcd4', // cyan
  '#8bc34a', // light green
  '#ff5722', // deep orange
  '#607d8b', // blue gray
  '#795548', // brown
  '#9e9e9e', // gray
];

function remoteColor(slot: number): string {
  return REMOTE_COLORS[slot % REMOTE_COLORS.length];
}

export default function GameMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapImgRef    = useRef<HTMLImageElement | null>(null);
  const spriteImgRef = useRef<CanvasImageSource | null>(null);

  const [loaded,       setLoaded]       = useState(false);
  const [error,        setError]        = useState(false);
  const [showCollision, setShowCollision] = useState(false);
  const [hoverZone,    setHoverZone]    = useState<string | null>(null);
  const [spriteLoaded, setSpriteLoaded] = useState(false);

  const showCollisionRef = useRef(false);
  useEffect(() => { showCollisionRef.current = showCollision; }, [showCollision]);

  // ── Network ───────────────────────────────────────────────────────────────
  const { sendMove } = useGameActions();
  const remotePlayersRef = useRemotePlayersRef();
  // Server correction for our own position (set by 0xFF handler in GameContext).
  const correctionRef = useCorrectionRef();

  // ── Resize canvas ─────────────────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = getRenderDpr();
    const w = window.innerWidth;
    const h = window.innerHeight;
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
    if (img.complete && img.naturalWidth > 0) { mapImgRef.current = img; setLoaded(true); }
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, []);

  // ── Load sprite sheet ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const oc = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      const octx = oc.getContext('2d')!;
      octx.drawImage(img, 0, 0);
      const cellH = img.naturalHeight / CHARACTER_SHEET_ROWS;
      for (let row = 1; row < CHARACTER_SHEET_ROWS; row++) {
        const boundary = Math.ceil(row * cellH);
        octx.clearRect(0, boundary, img.naturalWidth, 5);
      }
      const id = octx.getImageData(0, 0, oc.width, oc.height);
      const px = id.data;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3];
        if (a <= 20) {
          px[i + 3] = 0;
        } else {
          px[i + 3] = 255;
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

  // ── Track held movement keys ──────────────────────────────────────────────
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
      console.warn('Player spawn point is not walkable — check PLAYER_SPAWN in game/player.ts');
    }

    let rafId = 0;
    let lastTs: number | null = null;
    /** Timestamp of the last 0x11 sent. */
    let lastMoveSentTs = 0;
    /** Wire-space position at last send (for delta filtering). */
    let lastSentWireX = -1;
    let lastSentWireY = -1;

    const frame = (ts: number) => {
      const dtMs = lastTs === null ? 16 : Math.min(ts - lastTs, 48);
      lastTs = ts;

      // Apply any pending server correction before stepping physics.
      // This lets the server push back against wall-clip attempts.
      if (correctionRef.current) {
        playerStateRef.current = {
          ...playerStateRef.current,
          x: correctionRef.current.x,
          y: correctionRef.current.y,
        };
        correctionRef.current = null;
      }

      // Step player physics
      playerStateRef.current = stepPlayer(grid, playerStateRef.current, keysRef.current, dtMs);
      const { x: px, y: py, pose, facingLeft } = playerStateRef.current;

      // ── Send 0x11 move intent (throttled to 25Hz) ─────────────────────────
      const sinceLastSend = ts - lastMoveSentTs;
      if (sinceLastSend >= MOVE_SEND_INTERVAL_MS) {
        const wireX = toWire(px, MAP_W);
        const wireY = toWire(py, MAP_H);
        // Only send if position has changed in wire space
        if (wireX !== lastSentWireX || wireY !== lastSentWireY) {
          sendMove(wireX, wireY);
          lastSentWireX = wireX;
          lastSentWireY = wireY;
          lastMoveSentTs = ts;
        }
      }

      // Canvas buffer size and DPR
      const cw  = canvas.width;
      const ch  = canvas.height;
      const dpr = getRenderDpr();

      const srcW = (cw / dpr) / ZOOM;
      const srcH = (ch / dpr) / ZOOM;

      const srcX = Math.max(0, Math.min(MAP_W - srcW, px - srcW / 2));
      const srcY = Math.max(0, Math.min(MAP_H - srcH, py - srcH / 2));

      const scale = ZOOM * dpr;

      // ── 1. Clear + Map ───────────────────────────────────────────────────
      ctx.clearRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mapImg, srcX, srcY, srcW, srcH, 0, 0, cw, ch);

      // ── 2. Collision overlay ──────────────────────────────────────────────
      if (showCollisionRef.current) {
        const colStart = Math.max(0,        Math.floor(srcX / CELL_X));
        const colEnd   = Math.min(COLS - 1, Math.ceil((srcX + srcW) / CELL_X));
        const rowStart = Math.max(0,        Math.floor(srcY / CELL_Y));
        const rowEnd   = Math.min(ROWS - 1, Math.ceil((srcY + srcH) / CELL_Y));

        const cellW = CELL_X * scale;
        const cellH = CELL_Y * scale;
        const mW = cellW * 0.5;
        const mH = cellH * 0.5;
        const mOX = (cellW - mW) / 2;
        const mOY = (cellH - mH) / 2;

        for (let row = rowStart; row <= rowEnd; row++) {
          for (let col = colStart; col <= colEnd; col++) {
            const cx = (col * CELL_X - srcX) * scale;
            const cy = (row * CELL_Y - srcY) * scale;
            if (grid[row * COLS + col] === 1) {
              ctx.fillStyle = 'rgba(255,50,50,0.55)';
              ctx.fillRect(cx + mOX, cy + mOY, mW, mH);
            } else {
              ctx.fillStyle = 'rgba(60,220,120,0.15)';
              ctx.fillRect(cx + mOX, cy + mOY, mW, mH);
            }
          }
        }

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

      // ── 3. Remote players ─────────────────────────────────────────────────
      // Rendered before the local player so local player is always on top.
      const remotePlayers = remotePlayersRef.current;
      if (remotePlayers.size > 0) {
        const spriteH = PLAYER_DISPLAY_HEIGHT * scale;
        const spriteR = spriteH * 0.35; // circle radius ≈ sprite body width

        ctx.save();
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;

        for (const rp of remotePlayers.values()) {
          const rpCX = Math.round((rp.x - srcX) * scale);
          const rpCY = Math.round((rp.y - srcY) * scale);

          // Skip players that are off-screen (with margin)
          if (rpCX < -spriteR * 2 || rpCX > cw + spriteR * 2) continue;
          if (rpCY < -spriteR * 2 || rpCY > ch + spriteR * 2) continue;

          const color = remoteColor(rp.slot);

          // Ground shadow
          {
            const blurPx = Math.max(2, Math.round(spriteH * 0.05));
            ctx.save();
            ctx.filter = `blur(${blurPx}px)`;
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(rpCX, rpCY + spriteH * 0.48, spriteR * 0.7, spriteH * 0.055, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.filter = 'none';
          }

          // Body circle
          ctx.globalAlpha = 1;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(rpCX, rpCY, spriteR, 0, Math.PI * 2);
          ctx.fill();

          // Visor (white oval on upper portion)
          ctx.fillStyle = 'rgba(200,230,255,0.85)';
          ctx.beginPath();
          ctx.ellipse(rpCX + spriteR * 0.1, rpCY - spriteR * 0.18, spriteR * 0.55, spriteR * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();

          // Slot label above
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = Math.round(2 * dpr);
          ctx.strokeText(`${rp.slot}`, rpCX, rpCY - spriteR - 3);
          ctx.fillText(`${rp.slot}`, rpCX, rpCY - spriteR - 3);
        }

        ctx.restore();
      }

      // ── 4. Local player sprite ────────────────────────────────────────────
      const spriteH = PLAYER_DISPLAY_HEIGHT * scale;
      const spriteW = PLAYER_DISPLAY_WIDTH  * scale;
      const playerCX = (px - srcX) * scale;
      const playerCY = (py - srcY) * scale;

      const rect = getCharacterFrameRect(PLAYER_COLOR, pose);
      const sx = Math.ceil(rect.x);
      const sy = Math.ceil(rect.y);
      const sw = Math.floor(rect.x + rect.width)  - sx;
      const sh = Math.floor(rect.y + rect.height) - sy;

      const pCX = Math.round(playerCX);
      const pCY = Math.round(playerCY);
      const sW  = Math.round(spriteW);
      const sH  = Math.round(spriteH);

      // Ground shadow
      {
        const blurPx = Math.max(2, Math.round(sH * 0.05));
        ctx.save();
        ctx.filter = `blur(${blurPx}px)`;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(pCX, pCY + sH * 0.48, sW * 0.28, sH * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.filter = 'none';
      }

      ctx.save();
      ctx.translate(pCX, pCY);
      if (facingLeft) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, sx, sy, sw, sh, -sW / 2, -sH / 2, sW, sH);
      ctx.restore();

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [loaded, spriteLoaded, sendMove, remotePlayersRef]);

  // ── Mouse hover → zone label ──────────────────────────────────────────────
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
      (z) => mapX >= z.px && mapX < z.px + z.pw && mapY >= z.py && mapY < z.py + z.ph,
    );
    setHoverZone(found?.label ?? null);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#3d4e5e' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverZone(null)}
    >
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

      <canvas
        ref={canvasRef}
        style={{
          display: 'block', position: 'absolute', top: 0, left: 0,
          opacity: loaded ? 1 : 0,
        }}
      />

      {loaded && <Joystick keysRef={keysRef} />}

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
          {import.meta.env.DEV && (
            <Link
              href="/collision-editor"
              style={{
                padding: '6px 14px',
                background: 'rgba(20,32,44,0.85)', color: '#8ab8cc',
                border: '1px solid rgba(100,160,200,0.3)',
                borderRadius: 6, fontFamily: 'monospace', fontSize: 12,
                backdropFilter: 'blur(6px)', letterSpacing: '0.03em',
                textDecoration: 'none',
              }}
            >
              ✎ Edit Collision
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
