import { useRef, useEffect, useState, useCallback } from 'react';
import {
  buildCollisionGrid,
  COLS, ROWS, CELL_X, CELL_Y,
  MAP_W, MAP_H,
  KILL_RANGE_PX,
  ZONES,
} from '../game/collisionMap';
import {
  createInitialPlayerState,
  stepPlayer,
  isSpawnWalkable,
  PLAYER_ANIM_INTERVAL_MS,
} from '../game/player';
import {
  CHARACTER_SHEET_PATH,
  CHARACTER_SHEET_ROWS,
  CHARACTER_CELL_WIDTH,
  CHARACTER_CELL_HEIGHT,
  CHARACTER_COLORS,
  getCharacterFrameRect,
  type CharacterColor,
  type CharacterPose,
} from '../game/characterSprites';
import Joystick from '../components/Joystick';
import { Link } from 'wouter';
import {
  useGameState,
  useGameActions,
  useRemotePlayersRef,
  useCorrectionRef,
} from '@/context/GameContext';
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

// ── Player color: keyed by lobby slot, cycling the 7 sheet colors ────────────
function slotColor(slot: number): CharacterColor {
  return CHARACTER_COLORS[slot % CHARACTER_COLORS.length];
}

// ── Remote player animation state (per slot, maintained across frames) ───────
// Remote positions arrive at 25Hz via 0xFF deltas; the rAF loop compares
// against the previous frame to derive walk animation and facing direction.
interface RemoteAnim {
  x: number;
  y: number;
  animMs: number;
  facingLeft: boolean;
  lastMovedTs: number;
}

/** A remote player is "moving" if its position changed within this window. */
const REMOTE_MOVING_WINDOW_MS = 160;

export default function GameMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapImgRef    = useRef<HTMLImageElement | null>(null);
  const spriteImgRef = useRef<CanvasImageSource | null>(null);
  /** Per-slot animation state for remote players, maintained across rAF frames. */
  const remoteAnimMapRef = useRef<Map<number, RemoteAnim>>(new Map());

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

  // ── Multiplayer state (mirrored into refs for the rAF loop) ───────────────
  const { mySlot, players, myRole, impostorSlots, deadSlots, killCooldownMs } = useGameState();
  const { sendKill } = useGameActions();

  const mySlotRef = useRef<number | null>(mySlot);
  useEffect(() => { mySlotRef.current = mySlot; }, [mySlot]);

  const usernamesRef = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    usernamesRef.current = new Map(players.map(p => [p.slot, p.username]));
  }, [players]);

  // Fellow impostor slots (only populated on an impostor's client)
  const impostorSetRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    impostorSetRef.current = new Set(impostorSlots);
  }, [impostorSlots]);

  // ── Kill mechanics (Phase 5) ───────────────────────────────────────────────
  const deadSlotsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    deadSlotsRef.current = new Set(deadSlots);
  }, [deadSlots]);

  const amIDead = mySlot !== null && deadSlots.includes(mySlot);
  const amIImpostor = myRole === 'impostor';

  // Nearest killable target within range, recomputed a few times/sec for the
  // kill-button UI. Recomputation lives outside the rAF loop since it only
  // drives a low-frequency React state, not per-frame canvas rendering.
  const [nearestTarget, setNearestTarget] = useState<number | null>(null);
  useEffect(() => {
    if (!amIImpostor || amIDead) { setNearestTarget(null); return; }
    const id = setInterval(() => {
      const myPos = playerStateRef.current;
      if (!myPos) return;
      let best: number | null = null;
      let bestDistSq = KILL_RANGE_PX * KILL_RANGE_PX;
      for (const rp of remotePlayersRef.current.values()) {
        if (impostorSetRef.current.has(rp.slot)) continue; // no team kill
        if (deadSlotsRef.current.has(rp.slot)) continue;
        const dx = rp.x - myPos.x;
        const dy = rp.y - myPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) { best = rp.slot; bestDistSq = distSq; }
      }
      setNearestTarget(best);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amIImpostor, amIDead]);

  // ── Role reveal overlay ───────────────────────────────────────────────────
  // Dev screenshot harness: `?mock=reveal-*` holds the overlay open indefinitely
  // (both the React state AND the CSS fade animation, which otherwise finishes
  // and hides itself after 3.2s regardless of state) so it can be screenshotted.
  const isMockReveal = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('mock')?.startsWith('reveal-');
  const [showReveal, setShowReveal] = useState(false);
  useEffect(() => {
    if (!myRole) return;
    // Clear stale remote animation state so sprites animate fresh from spawns.
    remoteAnimMapRef.current.clear();
    setShowReveal(true);
    if (isMockReveal) return;
    const timer = setTimeout(() => setShowReveal(false), 3200);
    return () => clearTimeout(timer);
  }, [myRole, isMockReveal]);

  // Inject role-reveal keyframes once (avoids a CSS file dependency)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes rrFade {
        0%   { opacity: 0; }
        12%  { opacity: 1; }
        80%  { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes rrScale {
        0%   { transform: scale(0.82) translateY(12px); }
        12%  { transform: scale(1)    translateY(0);    }
        80%  { transform: scale(1)    translateY(0);    }
        100% { transform: scale(0.96) translateY(-6px); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

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

      // Step player physics. Dead players (ghosts) walk through walls.
      playerStateRef.current = stepPlayer(
        grid, playerStateRef.current, keysRef.current, dtMs, deadSlotsRef.current.has(mySlotRef.current ?? -1),
      );
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

      // ── 3. Remote players (sprite-sheet rendering, Phase 4) ───────────────
      // Rendered before the local player so local player is always on top.
      const remotePlayers = remotePlayersRef.current;
      const remoteAnims = remoteAnimMapRef.current;
      // Prune animation state for slots that no longer exist
      for (const slot of remoteAnims.keys()) {
        if (!remotePlayers.has(slot)) remoteAnims.delete(slot);
      }
      if (remotePlayers.size > 0) {
        const rSpriteH = Math.round(PLAYER_DISPLAY_HEIGHT * scale);
        const rSpriteW = Math.round(PLAYER_DISPLAY_WIDTH  * scale);

        ctx.save();
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;

        for (const rp of remotePlayers.values()) {
          // Update per-slot animation state from position deltas
          let anim = remoteAnims.get(rp.slot);
          if (!anim) {
            anim = { x: rp.x, y: rp.y, animMs: 0, facingLeft: false, lastMovedTs: -1e9 };
            remoteAnims.set(rp.slot, anim);
          }
          const rdx = rp.x - anim.x;
          const rdy = rp.y - anim.y;
          if (rdx * rdx + rdy * rdy > 0.25) {
            anim.lastMovedTs = ts;
            if (Math.abs(rdx) > 0.1) anim.facingLeft = rdx < 0;
          }
          anim.x = rp.x;
          anim.y = rp.y;
          const rMoving = ts - anim.lastMovedTs < REMOTE_MOVING_WINDOW_MS;
          anim.animMs = rMoving ? anim.animMs + dtMs : 0;
          // Phase 5: dead players always render the static "ghost" pose.
          const rIsGhost = deadSlotsRef.current.has(rp.slot);
          const rPose: CharacterPose = rIsGhost
            ? 'ghost'
            : rMoving
              ? Math.floor(anim.animMs / PLAYER_ANIM_INTERVAL_MS) % 2 === 0
                ? 'walk-1'
                : 'walk-2'
              : 'idle';

          const rpCX = Math.round((rp.x - srcX) * scale);
          const rpCY = Math.round((rp.y - srcY) * scale);

          // Skip players that are off-screen (with margin)
          if (rpCX < -rSpriteW * 2 || rpCX > cw + rSpriteW * 2) continue;
          if (rpCY < -rSpriteH * 2 || rpCY > ch + rSpriteH * 2) continue;

          // Ground shadow (ghosts float — no shadow)
          if (!rIsGhost) {
            const blurPx = Math.max(2, Math.round(rSpriteH * 0.05));
            ctx.save();
            ctx.filter = `blur(${blurPx}px)`;
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.ellipse(rpCX, rpCY + rSpriteH * 0.48, rSpriteW * 0.28, rSpriteH * 0.055, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.filter = 'none';
          }

          // Sprite (slot-keyed color from the character sheet)
          const rRect = getCharacterFrameRect(slotColor(rp.slot), rPose);
          const rsx = Math.ceil(rRect.x);
          const rsy = Math.ceil(rRect.y);
          const rsw = Math.floor(rRect.x + rRect.width)  - rsx;
          const rsh = Math.floor(rRect.y + rRect.height) - rsy;

          ctx.save();
          ctx.translate(rpCX, rpCY);
          if (anim.facingLeft) ctx.scale(-1, 1);
          if (rIsGhost) ctx.globalAlpha = 0.55;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sprite, rsx, rsy, rsw, rsh, -rSpriteW / 2, -rSpriteH / 2, rSpriteW, rSpriteH);
          ctx.restore();
          ctx.imageSmoothingEnabled = true;

          // Username label (red for fellow impostors on an impostor's client)
          const name = usernamesRef.current.get(rp.slot) ?? `Player ${rp.slot}`;
          const isTeammate = impostorSetRef.current.has(rp.slot);
          ctx.fillStyle = rIsGhost
            ? 'rgba(200,220,255,0.55)'
            : isTeammate ? 'rgba(255,80,80,0.95)' : 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = Math.round(2 * dpr);
          ctx.strokeText(name, rpCX, rpCY - rSpriteH / 2 - 3);
          ctx.fillText(name, rpCX, rpCY - rSpriteH / 2 - 3);
        }

        ctx.restore();
      }

      // ── 4. Local player sprite ────────────────────────────────────────────
      const spriteH = PLAYER_DISPLAY_HEIGHT * scale;
      const spriteW = PLAYER_DISPLAY_WIDTH  * scale;
      const playerCX = (px - srcX) * scale;
      const playerCY = (py - srcY) * scale;

      const rect = getCharacterFrameRect(slotColor(mySlotRef.current ?? 0), pose);
      const sx = Math.ceil(rect.x);
      const sy = Math.ceil(rect.y);
      const sw = Math.floor(rect.x + rect.width)  - sx;
      const sh = Math.floor(rect.y + rect.height) - sy;

      const pCX = Math.round(playerCX);
      const pCY = Math.round(playerCY);
      const sW  = Math.round(spriteW);
      const sH  = Math.round(spriteH);

      // Ground shadow (ghosts float — no shadow)
      const amIGhostFrame = deadSlotsRef.current.has(mySlotRef.current ?? -1);
      if (!amIGhostFrame) {
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
      if (amIGhostFrame) ctx.globalAlpha = 0.55;
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

      {/* ── Kill button + cooldown (Phase 5, impostor only) ───────────────── */}
      {loaded && amIImpostor && !amIDead && (
        <div style={{
          position: 'fixed', bottom: 130, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 25,
        }}>
          <button
            disabled={killCooldownMs > 0 || nearestTarget === null}
            onClick={() => { if (nearestTarget !== null) sendKill(nearestTarget); }}
            style={{
              width: 76, height: 76, borderRadius: '50%',
              fontFamily: 'sans-serif', fontWeight: 900, fontSize: 12,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              color: killCooldownMs > 0 || nearestTarget === null ? 'rgba(255,150,150,0.35)' : '#ffe8e8',
              background: killCooldownMs > 0 || nearestTarget === null
                ? 'rgba(90,20,20,0.55)'
                : 'radial-gradient(circle, rgba(210,20,20,0.95), rgba(120,0,0,0.95))',
              border: `2px solid ${killCooldownMs > 0 || nearestTarget === null ? 'rgba(200,80,80,0.25)' : 'rgba(255,120,120,0.85)'}`,
              boxShadow: killCooldownMs > 0 || nearestTarget === null ? 'none' : '0 0 22px rgba(255,40,40,0.55)',
              cursor: killCooldownMs > 0 || nearestTarget === null ? 'default' : 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            {killCooldownMs > 0 ? Math.ceil(killCooldownMs / 1000) : '☠ Kill'}
          </button>
        </div>
      )}

      {/* ── Dead / ghost-mode banner (Phase 5) ────────────────────────────── */}
      {loaded && amIDead && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', zIndex: 25,
          background: 'rgba(20,32,44,0.85)', color: '#a8c8e0',
          fontFamily: 'sans-serif', fontSize: 12, fontWeight: 600,
          letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: 8,
          border: '1px solid rgba(120,180,220,0.3)', backdropFilter: 'blur(6px)',
        }}>
          👻 You are dead — ghost mode
        </div>
      )}

      {/* ── Role reveal overlay (Phase 4) ─────────────────────────────────── */}
      {showReveal && myRole && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: myRole === 'impostor'
            ? 'rgba(44, 0, 0, 0.92)'
            : 'rgba(0, 16, 48, 0.92)',
          animation: isMockReveal ? 'none' : 'rrFade 3.2s ease forwards',
          pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center', animation: isMockReveal ? 'none' : 'rrScale 3.2s ease forwards' }}>
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.5)',
              fontFamily: 'sans-serif', letterSpacing: '0.3em',
              textTransform: 'uppercase', marginBottom: 16,
            }}>
              You are
            </div>
            <div style={{
              fontSize: 50, fontWeight: 900, fontFamily: 'sans-serif',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: myRole === 'impostor' ? '#ff3344' : '#44aaff',
              textShadow: myRole === 'impostor'
                ? '0 0 30px rgba(255,50,50,0.9), 0 0 70px rgba(255,50,50,0.4)'
                : '0 0 30px rgba(60,160,255,0.9), 0 0 70px rgba(60,160,255,0.4)',
            }}>
              {myRole === 'impostor' ? '☠ Impostor' : '✦ Crewmate'}
            </div>
            {myRole === 'impostor' && impostorSlots.filter(s => s !== mySlot).length > 0 && (
              <div style={{
                marginTop: 20, color: 'rgba(255,130,130,0.8)', fontSize: 13,
                fontFamily: 'sans-serif', letterSpacing: '0.04em',
              }}>
                Fellow impostor{impostorSlots.filter(s => s !== mySlot).length > 1 ? 's' : ''}:{' '}
                {impostorSlots
                  .filter(s => s !== mySlot)
                  .map(s => players.find(p => p.slot === s)?.username ?? `Slot ${s}`)
                  .join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
