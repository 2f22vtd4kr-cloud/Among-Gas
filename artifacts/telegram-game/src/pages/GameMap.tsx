import { useRef, useEffect, useState, useCallback } from 'react';
import {
  buildCollisionGrid,
  COLS, ROWS, CELL_X, CELL_Y,
  MAP_W, MAP_H,
  KILL_RANGE_PX,
  REPORT_RANGE_PX,
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
import {
  toWire,
  NO_TARGET,
  MEETING_DISCUSSION_MS,
  MEETING_VOTING_MS,
} from '@workspace/shared/coords';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import {
  SABOTAGE_DEFS,
  SABOTAGE_INTERACTION_RANGE_PX,
  SABOTAGE_COUNTDOWN_MS,
  SABOTAGE_LIGHTS,
  LIGHTS_CREWMATE_VISION_RADIUS_PX,
  type SabotageSystemId,
} from '@workspace/shared/sabotage';
import TaskMinigame from '../components/TaskMinigame';

/** Empty key set used to force-freeze local movement during a meeting. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

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
  const {
    mySlot, players, myRole, impostorSlots, deadSlots, killCooldownMs,
    meeting, hasVoted, voteResult, myTasks, globalTaskProgress,
    sabotage, sabotageCooldownMs,
  } = useGameState();
  const {
    sendKill, reportBody, callEmergencyMeeting, castVote, clearVoteResult, completeTaskStep,
    triggerSabotage, repairSabotage,
  } = useGameActions();

  const playerName = useCallback(
    (slot: number) => players.find(p => p.slot === slot)?.username ?? `Player ${slot}`,
    [players],
  );

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

  // ── Sabotages & vision (Phase 8) ───────────────────────────────────────────
  // Mirrored into refs so the rAF loop (fog-of-war + pad markers) can read the
  // latest values without a stale closure, same pattern as deadSlotsRef above.
  const sabotageRef = useRef(sabotage);
  useEffect(() => { sabotageRef.current = sabotage; }, [sabotage]);
  const myRoleRef = useRef(myRole);
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);

  const [showSabotagePanel, setShowSabotagePanel] = useState(false);
  useEffect(() => {
    if (!amIImpostor || sabotage !== null) setShowSabotagePanel(false);
  }, [amIImpostor, sabotage]);

  /** Closest unfixed pad of the active sabotage within interaction range (crewmates only). */
  const [nearestRepairPad, setNearestRepairPad] = useState<{ systemId: number; padId: number } | null>(null);
  useEffect(() => {
    if (amIDead || amIImpostor || !sabotage) { setNearestRepairPad(null); return; }
    const id = setInterval(() => {
      const myPos = playerStateRef.current;
      const active = sabotageRef.current;
      if (!myPos || !active) return;
      const def = SABOTAGE_DEFS[active.systemId as SabotageSystemId];
      if (!def) return;
      let best: { systemId: number; padId: number } | null = null;
      let bestDistSq = SABOTAGE_INTERACTION_RANGE_PX * SABOTAGE_INTERACTION_RANGE_PX;
      def.pads.forEach((pad, padId) => {
        if (active.fixedPads.includes(padId)) return;
        const dx = pad.x - myPos.x;
        const dy = pad.y - myPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) { best = { systemId: active.systemId, padId }; bestDistSq = distSq; }
      });
      setNearestRepairPad(best);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amIDead, amIImpostor, sabotage]);

  // Local countdown clock for the sabotage banner, ticked independently of
  // the canvas rAF loop — same pattern as meetingNow above.
  const [sabotageNow, setSabotageNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sabotage) return;
    setSabotageNow(Date.now());
    const id = setInterval(() => setSabotageNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [sabotage]);

  const sabotageRemainingMs = sabotage
    ? Math.max(0, SABOTAGE_COUNTDOWN_MS - (sabotageNow - sabotage.startedAtMs))
    : 0;
  const sabotageDef = sabotage ? SABOTAGE_DEFS[sabotage.systemId as SabotageSystemId] : null;

  // ── Meetings & voting (Phase 6) ────────────────────────────────────────────
  // Movement freezes for everyone while a meeting is in progress — the server
  // already ignores 0x11 outside ROAMING, this just keeps the local sprite
  // from drifting through walls with no server correction to pull it back.
  const meetingActiveRef = useRef(false);
  useEffect(() => { meetingActiveRef.current = meeting !== null; }, [meeting]);

  // Nearest reportable body within range — recomputed a few times/sec, same
  // pattern as the impostor's nearestTarget kill check below.
  const [nearestBody, setNearestBody] = useState<number | null>(null);
  useEffect(() => {
    if (amIDead || meeting !== null) { setNearestBody(null); return; }
    const id = setInterval(() => {
      const myPos = playerStateRef.current;
      if (!myPos) return;
      let best: number | null = null;
      let bestDistSq = REPORT_RANGE_PX * REPORT_RANGE_PX;
      for (const rp of remotePlayersRef.current.values()) {
        if (!deadSlotsRef.current.has(rp.slot)) continue;
        const dx = rp.x - myPos.x;
        const dy = rp.y - myPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) { best = rp.slot; bestDistSq = distSq; }
      }
      setNearestBody(best);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amIDead, meeting]);

  // Local countdown clock for the meeting overlay, ticked independently of
  // the canvas rAF loop (this UI lives outside the canvas).
  // Initialised to meeting.startedAtMs immediately so the first frame shows
  // the correct remaining time without waiting for the first 250ms tick.
  const [meetingNow, setMeetingNow] = useState(() => Date.now());
  useEffect(() => {
    if (!meeting) return;
    setMeetingNow(Date.now()); // snap to current time on meeting start
    const id = setInterval(() => setMeetingNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [meeting]);

  const meetingElapsedMs = meeting ? meetingNow - meeting.startedAtMs : 0;
  const inDiscussion = meeting ? meetingElapsedMs < MEETING_DISCUSSION_MS : false;
  const meetingRemainingMs = meeting
    ? Math.max(0, (inDiscussion ? MEETING_DISCUSSION_MS : MEETING_DISCUSSION_MS + MEETING_VOTING_MS) - meetingElapsedMs)
    : 0;

  // Auto-dismiss the "ejected / no one ejected" banner after a few seconds.
  // Game-over results (voteResult.winner set) stay until the player reloads.
  useEffect(() => {
    if (!voteResult || voteResult.winner) return;
    const t = setTimeout(() => clearVoteResult(), 4000);
    return () => clearTimeout(t);
  }, [voteResult, clearVoteResult]);

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

  // ── Task system (Phase 7) ─────────────────────────────────────────────────
  // Mirror myTasks into a ref so the rAF loop can read it without closure issues.
  const myTasksRef = useRef(myTasks);
  useEffect(() => { myTasksRef.current = myTasks; }, [myTasks]);

  /** Closest in-range incomplete task (null when nothing is nearby). */
  const [nearestTask, setNearestTask] = useState<{ taskId: number; stepIndex: number } | null>(null);
  /** Which task minigame is currently open (null = none). */
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  // Auto-close the task panel whenever the game enters a state where task
  // interaction is invalid: meeting in progress, player dead, or game over.
  useEffect(() => {
    if (meeting !== null || amIDead || voteResult?.winner) setActiveTaskId(null);
  }, [meeting, amIDead, voteResult?.winner]);

  useEffect(() => {
    if (amIDead || meeting !== null || myRole !== 'crewmate') { setNearestTask(null); return; }
    const id = setInterval(() => {
      const myPos = playerStateRef.current;
      if (!myPos) return;
      let best: { taskId: number; stepIndex: number } | null = null;
      let bestDistSq = TASK_INTERACTION_RANGE_PX * TASK_INTERACTION_RANGE_PX;
      for (const t of myTasksRef.current) {
        const def = TASK_DEFS[t.taskId];
        if (!def || t.completedSteps >= def.steps) continue;
        const dx = def.x - myPos.x;
        const dy = def.y - myPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) {
          best = { taskId: t.taskId, stepIndex: t.completedSteps };
          bestDistSq = distSq;
        }
      }
      setNearestTask(best);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amIDead, meeting, myRole]);

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
      // Movement freezes entirely during a meeting (server ignores 0x11 too).
      const effectiveKeys = meetingActiveRef.current ? EMPTY_KEYS : keysRef.current;
      playerStateRef.current = stepPlayer(
        grid, playerStateRef.current, effectiveKeys, dtMs, deadSlotsRef.current.has(mySlotRef.current ?? -1),
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

      // ── 2.5 Task markers (crewmates only, hidden during meetings) ──────────
      {
        const snap = myTasksRef.current;
        if (snap.length > 0 && !meetingActiveRef.current) {
          ctx.textAlign = 'center';
          for (const t of snap) {
            const def = TASK_DEFS[t.taskId];
            if (!def) continue;
            const done = t.completedSteps >= def.steps;
            const tx = Math.round((def.x - srcX) * scale);
            const ty = Math.round((def.y - srcY) * scale);
            if (tx < -60 || tx > cw + 60 || ty < -60 || ty > ch + 60) continue;
            const markerR = Math.round(9 * dpr);
            // Glow ring
            ctx.beginPath();
            ctx.arc(tx, ty, markerR + 3, 0, Math.PI * 2);
            ctx.fillStyle = done ? 'rgba(50,180,50,0.2)' : 'rgba(255,220,40,0.18)';
            ctx.fill();
            // Marker circle
            ctx.beginPath();
            ctx.arc(tx, ty, markerR, 0, Math.PI * 2);
            ctx.fillStyle = done ? 'rgba(50,180,50,0.85)' : 'rgba(255,210,30,0.9)';
            ctx.fill();
            ctx.strokeStyle = done ? 'rgba(30,140,30,0.9)' : 'rgba(180,140,0,0.9)';
            ctx.lineWidth = Math.round(1.5 * dpr);
            ctx.stroke();
            // Icon
            ctx.fillStyle = done ? '#0d3b0d' : '#3b2a00';
            ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.fillText(done ? '✓' : '!', tx, ty);
            // Label
            ctx.textBaseline = 'top';
            ctx.font = `${Math.round(9 * dpr)}px sans-serif`;
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.lineWidth = Math.round(3 * dpr);
            ctx.strokeText(def.name, tx, ty + markerR + 3);
            ctx.fillStyle = done ? 'rgba(120,255,120,0.85)' : 'rgba(255,235,80,0.9)';
            ctx.fillText(def.name, tx, ty + markerR + 3);
          }
          ctx.textAlign = 'left';
        }
      }

      // ── 2.6 Sabotage pad markers (Phase 8, hidden during meetings) ─────────
      {
        const active = sabotageRef.current;
        if (active && !meetingActiveRef.current) {
          const def = SABOTAGE_DEFS[active.systemId as SabotageSystemId];
          if (def) {
            ctx.textAlign = 'center';
            def.pads.forEach((pad, padId) => {
              const done = active.fixedPads.includes(padId);
              const tx = Math.round((pad.x - srcX) * scale);
              const ty = Math.round((pad.y - srcY) * scale);
              if (tx < -60 || tx > cw + 60 || ty < -60 || ty > ch + 60) return;
              const markerR = Math.round(10 * dpr);
              ctx.beginPath();
              ctx.arc(tx, ty, markerR + 3, 0, Math.PI * 2);
              ctx.fillStyle = done ? 'rgba(50,180,50,0.2)' : 'rgba(255,60,60,0.22)';
              ctx.fill();
              ctx.beginPath();
              ctx.arc(tx, ty, markerR, 0, Math.PI * 2);
              ctx.fillStyle = done ? 'rgba(50,180,50,0.85)' : 'rgba(230,50,50,0.9)';
              ctx.fill();
              ctx.strokeStyle = done ? 'rgba(30,140,30,0.9)' : 'rgba(140,0,0,0.9)';
              ctx.lineWidth = Math.round(1.5 * dpr);
              ctx.stroke();
              ctx.fillStyle = '#fff';
              ctx.font = `bold ${Math.round(11 * dpr)}px sans-serif`;
              ctx.textBaseline = 'middle';
              ctx.fillText(done ? '✓' : '⚠', tx, ty);
              ctx.textBaseline = 'top';
              ctx.font = `${Math.round(9 * dpr)}px sans-serif`;
              ctx.strokeStyle = 'rgba(0,0,0,0.85)';
              ctx.lineWidth = Math.round(3 * dpr);
              const label = def.pads.length > 1 ? `${def.name} ${padId + 1}` : def.name;
              ctx.strokeText(label, tx, ty + markerR + 3);
              ctx.fillStyle = done ? 'rgba(120,255,120,0.85)' : 'rgba(255,140,140,0.9)';
              ctx.fillText(label, tx, ty + markerR + 3);
            });
            ctx.textAlign = 'left';
          }
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

      // ── 5. Fog-of-war (Phase 8 — Lights sabotage, crewmate view only) ─────
      // Impostor vision is unaffected (GAME_SPEC.md §10), so no fog is drawn
      // on an impostor's own client. Rendered as a full black overlay with a
      // radial-gradient "hole" cut around the local player via destination-out
      // compositing, matching the shadow/blur conventions used elsewhere here.
      const activeSabotage = sabotageRef.current;
      if (activeSabotage && activeSabotage.systemId === SABOTAGE_LIGHTS && myRoleRef.current === 'crewmate') {
        const visionR = Math.round(LIGHTS_CREWMATE_VISION_RADIUS_PX * scale);
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalCompositeOperation = 'destination-out';
        const grad = ctx.createRadialGradient(pCX, pCY, visionR * 0.35, pCX, pCY, visionR);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pCX, pCY, visionR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // iOS Safari fix: an explicit filter reset after restore() prevents
        // the next frame's blur/shadow filters from striping (see memory).
        ctx.filter = 'none';
      }

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

      {/* ── Task progress bar — thin strip at top of screen (Phase 7) ──────── */}
      {loaded && myRole !== null && meeting === null && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 5, zIndex: 30,
          background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
        }}>
          <div style={{
            height: '100%', width: `${globalTaskProgress}%`,
            background: globalTaskProgress >= 100
              ? '#2ecc71'
              : 'linear-gradient(90deg, #f1c40f, #2ecc71)',
            transition: 'width 0.6s ease',
            borderRadius: '0 3px 3px 0',
          }} />
        </div>
      )}

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

      {/* ── Do Task button (Phase 7, crewmates only) ────────────────────────── */}
      {loaded && !amIDead && meeting === null && activeTaskId === null && nearestTask !== null && (
        <div style={{
          position: 'fixed', bottom: 220, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
        }}>
          <button
            onClick={() => setActiveTaskId(nearestTask.taskId)}
            style={{
              padding: '10px 24px', borderRadius: 10,
              background: 'rgba(28,110,200,0.9)', color: '#dff0ff',
              border: '1px solid rgba(100,180,255,0.5)',
              fontFamily: 'sans-serif', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.03em', cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 0 18px rgba(60,140,255,0.35)',
            }}
          >
            ⚙ {TASK_DEFS[nearestTask.taskId]?.name ?? 'Task'}
          </button>
        </div>
      )}

      {/* ── Kill / Report action row (Phase 5 kill, Phase 6 report) ───────── */}
      {/* Report is blocked server-side while a sabotage is active (GAME_SPEC.md §10 —
          meetings can't be called mid-sabotage), so hide it (but not Kill) to match. */}
      {loaded && !amIDead && meeting === null && (amIImpostor || (sabotage === null && nearestBody !== null)) && (
        <div style={{
          position: 'fixed', bottom: 130, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 16, zIndex: 25,
        }}>
          {amIImpostor && (
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
          )}
          {sabotage === null && nearestBody !== null && (
            <button
              onClick={() => reportBody(nearestBody)}
              style={{
                width: 76, height: 76, borderRadius: '50%',
                fontFamily: 'sans-serif', fontWeight: 900, fontSize: 11,
                letterSpacing: '0.03em', textTransform: 'uppercase',
                color: '#fff6d8',
                background: 'radial-gradient(circle, rgba(220,160,20,0.95), rgba(140,90,0,0.95))',
                border: '2px solid rgba(255,210,100,0.85)',
                boxShadow: '0 0 22px rgba(255,190,40,0.5)',
                cursor: 'pointer', backdropFilter: 'blur(4px)',
              }}
            >
              🛑 Report
            </button>
          )}
        </div>
      )}

      {/* ── Sabotage panel button (Phase 8, impostor only) ─────────────────── */}
      {loaded && !amIDead && amIImpostor && meeting === null && sabotage === null && (
        <div style={{ position: 'fixed', bottom: 130, left: 24, zIndex: 25 }}>
          <button
            disabled={sabotageCooldownMs > 0}
            onClick={() => setShowSabotagePanel(true)}
            style={{
              width: 76, height: 76, borderRadius: '50%',
              fontFamily: 'sans-serif', fontWeight: 900, fontSize: 11,
              letterSpacing: '0.03em', textTransform: 'uppercase',
              color: sabotageCooldownMs > 0 ? 'rgba(200,170,255,0.35)' : '#f0e4ff',
              background: sabotageCooldownMs > 0
                ? 'rgba(50,20,70,0.55)'
                : 'radial-gradient(circle, rgba(130,40,200,0.95), rgba(60,10,110,0.95))',
              border: `2px solid ${sabotageCooldownMs > 0 ? 'rgba(160,100,220,0.25)' : 'rgba(190,130,255,0.85)'}`,
              boxShadow: sabotageCooldownMs > 0 ? 'none' : '0 0 22px rgba(150,60,255,0.5)',
              cursor: sabotageCooldownMs > 0 ? 'default' : 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            {sabotageCooldownMs > 0 ? Math.ceil(sabotageCooldownMs / 1000) : '⚡ Sabotage'}
          </button>
        </div>
      )}

      {/* ── Repair button (Phase 8, crewmates only) ─────────────────────────── */}
      {loaded && !amIDead && !amIImpostor && meeting === null && sabotage !== null && nearestRepairPad !== null && (
        <div style={{
          position: 'fixed', bottom: 220, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
        }}>
          <button
            onClick={() => repairSabotage(nearestRepairPad.systemId, nearestRepairPad.padId)}
            style={{
              padding: '10px 24px', borderRadius: 10,
              background: 'rgba(200,50,50,0.9)', color: '#ffe8e8',
              border: '1px solid rgba(255,120,120,0.5)',
              fontFamily: 'sans-serif', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.03em', cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 0 18px rgba(255,60,60,0.35)',
            }}
          >
            🔧 Repair {sabotageDef?.name ?? ''}
          </button>
        </div>
      )}

      {/* ── Sabotage active banner (Phase 8) ─────────────────────────────────── */}
      {loaded && sabotage && sabotageDef && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', zIndex: 40, textAlign: 'center',
          background: 'rgba(70,10,10,0.9)', color: '#ffe4e4',
          fontFamily: 'sans-serif', fontSize: 12, fontWeight: 700,
          letterSpacing: '0.03em', borderRadius: 8,
          border: '1px solid rgba(255,100,100,0.4)', backdropFilter: 'blur(6px)',
        }}>
          ⚠ {sabotageDef.name} sabotaged — {Math.ceil(sabotageRemainingMs / 1000)}s
          {sabotageDef.pads.length > 1 && (
            <span style={{ opacity: 0.8 }}> ({sabotage.fixedPads.length}/{sabotageDef.pads.length} fixed)</span>
          )}
        </div>
      )}

      {/* ── Sabotage panel overlay (Phase 8, impostor only) ─────────────────── */}
      {showSabotagePanel && amIImpostor && sabotage === null && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 55,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,10,18,0.85)', backdropFilter: 'blur(4px)', gap: 14,
          }}
          onClick={() => setShowSabotagePanel(false)}
        >
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif',
            letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Choose a system to sabotage
          </div>
          {Object.values(SABOTAGE_DEFS).map(def => (
            <button
              key={def.id}
              onClick={(e) => { e.stopPropagation(); triggerSabotage(def.id); setShowSabotagePanel(false); }}
              style={{
                padding: '12px 32px', borderRadius: 10, minWidth: 180,
                background: 'rgba(130,40,200,0.85)', color: '#f0e4ff',
                border: '1px solid rgba(190,130,255,0.5)',
                fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14,
                letterSpacing: '0.03em', cursor: 'pointer',
              }}
            >
              {def.name}
            </button>
          ))}
          <button
            onClick={() => setShowSabotagePanel(false)}
            style={{
              marginTop: 8, padding: '8px 20px', borderRadius: 8,
              background: 'transparent', color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.25)',
              fontFamily: 'sans-serif', fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Emergency meeting button (Phase 6) ─────────────────────────────── */}
      {loaded && !amIDead && meeting === null && sabotage === null && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 20 }}>
          <button
            onClick={callEmergencyMeeting}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'rgba(160,40,20,0.85)', color: '#ffe4d0',
              border: '1px solid rgba(255,120,80,0.4)', fontFamily: 'sans-serif',
              fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
              textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(6px)',
            }}
          >
            🚨 Emergency
          </button>
        </div>
      )}

      {/* ── Ejection / no-ejection banner (Phase 6) ─────────────────────────── */}
      {voteResult && !voteResult.winner && !meeting && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', zIndex: 45,
          background: 'rgba(20,32,44,0.9)', color: '#e8f0ff',
          fontFamily: 'sans-serif', fontSize: 12, fontWeight: 700,
          letterSpacing: '0.03em', borderRadius: 8,
          border: '1px solid rgba(120,180,220,0.3)', backdropFilter: 'blur(6px)',
        }}>
          {voteResult.ejectedSlot === NO_TARGET
            ? '🗳️ No one was ejected'
            : `🗳️ ${playerName(voteResult.ejectedSlot)} was ejected`}
        </div>
      )}

      {/* ── Meeting overlay: discussion → voting (Phase 6) ─────────────────── */}
      {meeting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(6,10,18,0.94)', backdropFilter: 'blur(4px)', padding: 24,
          overflowY: 'auto',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'sans-serif',
              letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 8,
            }}>
              {meeting.bodySlot === NO_TARGET ? 'Emergency Meeting' : 'Body Reported'}
            </div>
            <div style={{ fontSize: 16, color: '#e8f0ff', fontFamily: 'sans-serif', fontWeight: 700 }}>
              {meeting.bodySlot === NO_TARGET
                ? `${playerName(meeting.reporterSlot)} called an emergency meeting`
                : `${playerName(meeting.reporterSlot)} found ${playerName(meeting.bodySlot)}'s body`}
            </div>
            <div style={{
              marginTop: 14, fontSize: 32, fontWeight: 900, fontFamily: 'monospace',
              color: inDiscussion ? '#8ab8cc' : '#ffd166',
            }}>
              {Math.ceil(meetingRemainingMs / 1000)}s
            </div>
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif',
              textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4,
            }}>
              {inDiscussion ? 'Discussion' : 'Cast your vote'}
            </div>
          </div>

          {amIDead && (
            <div style={{
              color: 'rgba(200,220,255,0.6)', fontSize: 12, fontFamily: 'sans-serif', marginBottom: 12,
            }}>
              👻 You are dead — spectating
            </div>
          )}

          {inDiscussion && !amIDead && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'sans-serif' }}>
              Voting opens once discussion ends
            </div>
          )}

          {!inDiscussion && !amIDead && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 'min(320px, 90vw)' }}>
              {players
                .filter(p => !deadSlots.includes(p.slot))
                .map(p => (
                  <button
                    key={p.slot}
                    disabled={hasVoted}
                    onClick={() => castVote(p.slot)}
                    style={{
                      padding: '10px 14px', borderRadius: 8, textAlign: 'left',
                      background: hasVoted ? 'rgba(30,40,55,0.6)' : 'rgba(30,40,55,0.9)',
                      color: hasVoted ? 'rgba(255,255,255,0.35)' : '#fff',
                      border: '1px solid rgba(120,160,200,0.25)', fontFamily: 'sans-serif', fontSize: 14,
                      cursor: hasVoted ? 'default' : 'pointer',
                    }}
                  >
                    {p.slot === mySlot ? `${p.username} (you)` : p.username}
                  </button>
                ))}
              <button
                disabled={hasVoted}
                onClick={() => castVote(NO_TARGET)}
                style={{
                  padding: '10px 14px', borderRadius: 8, textAlign: 'center', fontWeight: 700,
                  background: hasVoted ? 'rgba(60,60,60,0.4)' : 'rgba(60,60,60,0.75)',
                  color: hasVoted ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(150,150,150,0.25)', fontFamily: 'sans-serif', fontSize: 14,
                  cursor: hasVoted ? 'default' : 'pointer',
                }}
              >
                Skip Vote
              </button>
              {hasVoted && (
                <div style={{ textAlign: 'center', color: 'rgba(150,220,150,0.85)', fontSize: 12, marginTop: 2 }}>
                  Vote cast — waiting for others…
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Task minigame overlay (Phase 7) ─────────────────────────────────── */}
      {activeTaskId !== null && (() => {
        const myTask = myTasks.find(t => t.taskId === activeTaskId);
        const def = TASK_DEFS[activeTaskId];
        if (!myTask || !def || myTask.completedSteps >= def.steps) {
          // Task is fully done or invalid — auto-close
          setTimeout(() => setActiveTaskId(null), 0);
          return null;
        }
        const stepIndex = myTask.completedSteps;
        return (
          <TaskMinigame
            key={`${activeTaskId}-${stepIndex}`}
            taskId={activeTaskId}
            stepIndex={stepIndex}
            onComplete={() => {
              completeTaskStep(activeTaskId, stepIndex);
              // If this was the last step, close the panel
              if (stepIndex + 1 >= def.steps) setActiveTaskId(null);
              // Otherwise keep open — key change will remount for next step
            }}
            onClose={() => setActiveTaskId(null)}
          />
        );
      })()}

      {/* ── Game over overlay (Phase 6) ─────────────────────────────────────── */}
      {voteResult?.winner && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 70,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: voteResult.winner === 'impostors' ? 'rgba(44,0,0,0.94)' : 'rgba(0,16,48,0.94)',
        }}>
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif',
            letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 14,
          }}>
            Game Over
          </div>
          <div style={{
            fontSize: 42, fontWeight: 900, fontFamily: 'sans-serif',
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: voteResult.winner === 'impostors' ? '#ff3344' : '#44aaff',
            textShadow: voteResult.winner === 'impostors'
              ? '0 0 30px rgba(255,50,50,0.9), 0 0 70px rgba(255,50,50,0.4)'
              : '0 0 30px rgba(60,160,255,0.9), 0 0 70px rgba(60,160,255,0.4)',
          }}>
            {voteResult.winner === 'impostors' ? '☠ Impostors Win' : '✦ Crewmates Win'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 28, padding: '10px 22px', borderRadius: 8,
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.25)', fontFamily: 'sans-serif',
              fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer',
            }}
          >
            Back to Lobby
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
