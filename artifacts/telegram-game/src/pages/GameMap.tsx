import { useRef, useEffect, useState, useCallback } from 'react';
import { haptic } from '../lib/haptics';
import { sfx, unlockSfx } from '../lib/sfx';
import {
  buildCollisionGrid,
  MAP_W, MAP_H,
  KILL_RANGE_PX,
  REPORT_RANGE_PX,
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
  fromWire,
  NO_TARGET,
  MEETING_DISCUSSION_MS,
  MEETING_VOTING_MS,
} from '@workspace/shared/coords';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import {
  SABOTAGE_DEFS,
  SABOTAGE_INTERACTION_RANGE_PX,
  SABOTAGE_LIGHTS,
  SABOTAGE_COMMS,
  SABOTAGE_DOORS,
  getSabotageTimeoutMs,
  NORMAL_VISION_RADIUS_PX,
  IMPOSTOR_VISION_RADIUS_PX,
  LIGHTS_CREWMATE_VISION_RADIUS_PX,
  type SabotageSystemId,
} from '@workspace/shared/sabotage';
import { VENT_DEFS, VENT_INTERACTION_RANGE_PX, findVent } from '@workspace/shared/vents';
import { buildShadowGrid, computeVisibilityPolygon } from '../game/visibility';
import { ADMIN_TABLE_DEFS, ADMIN_TABLE_INTERACTION_RANGE_PX } from '@workspace/shared/adminTable';
import TaskMinigame from '../components/TaskMinigame';
import { useLanguage } from '../lib/language';

/** Empty key set used to force-freeze local movement during a meeting. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

// ── Russian translations ───────────────────────────────────────────────────
const TASK_NAME_RU: Record<string, string> = {
  'Fix Wiring':             'Починить проводку',
  'Download Data':          'Скачать данные',
  'Calibrate Distributor':  'Настроить распределитель',
  'Empty Garbage':          'Вынести мусор',
  'Clean Filters':          'Почистить фильтры',
  'Stabilize Navigation':  'Стабилизировать навигацию',
  'Reboot WiFi':           'Перезапустить связь',
  'Fuel Engine':           'Заправить двигатель',
  'Start Reactor':         'Запустить реактор',
  'Align Engine':          'Выровнять двигатель',
  'Clear Asteroids':       'Уничтожить астероиды',
};
const SABOTAGE_NAME_RU: Record<string, string> = {
  'Lights':   'Свет',
  'O₂':       'O₂',
  'Reactor':  'Реактор',
  'Comms':    'Связь',
  'Doors':    'Двери',
};
function taskRu(name: string | undefined, language: 'ru' | 'en'): string {
  if (language === 'en') return name || 'Task';
  return (name && TASK_NAME_RU[name]) || name || 'Задание';
}
function sabotageRu(name: string | undefined, language: 'ru' | 'en'): string {
  if (language === 'en') return name || 'System';
  return (name && SABOTAGE_NAME_RU[name]) || name || 'Система';
}

const ADMIN_DOT_COLORS: Record<CharacterColor, string> = {
  teal: '#31c6b4',
  maroon: '#c44958',
  navy: '#4679d4',
  purple: '#9860d3',
  brown: '#8c6755',
  'dark-gray': '#5e6872',
  magenta: '#c94eb6',
};

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

// ── CSS-based sprite renderer for DOM overlays (role-reveal, game-over) ──────
const _POSE_ROW: Record<string, number> = {
  idle: 0, 'walk-1': 1, 'walk-2': 2, 'run-lean': 3, ghost: 4,
  mask: 5, 'hold-item': 6, 'sit-hug-knees': 7, 'sit-crouch': 8,
};
const _SHEET_COLS = 7;
const _SHEET_PX_W = CHARACTER_CELL_WIDTH * _SHEET_COLS;
const _SHEET_PX_H = CHARACTER_CELL_HEIGHT * CHARACTER_SHEET_ROWS;

function CharSpriteUI({
  color, pose = 'idle', size = 64, flipped = false,
}: {
  color: string; pose?: string; size?: number; flipped?: boolean;
}) {
  const colIdx = CHARACTER_COLORS.indexOf(color as CharacterColor);
  const col = colIdx >= 0 ? colIdx : 0;
  const row = _POSE_ROW[pose] ?? 0;
  const scale = size / CHARACTER_CELL_WIDTH;
  const bgW   = _SHEET_PX_W * scale;
  const bgH   = _SHEET_PX_H * scale;
  const posX  = -(col * CHARACTER_CELL_WIDTH * scale);
  const posY  = -(row * CHARACTER_CELL_HEIGHT * scale);
  const height = Math.round(CHARACTER_CELL_HEIGHT * scale * 0.82); // clip ground shadow

  return (
    <div style={{
      width: size, height, flexShrink: 0, overflow: 'hidden',
      backgroundImage: `url(${CHARACTER_SHEET_PATH})`,
      backgroundSize: `${bgW}px ${bgH}px`,
      backgroundPosition: `${posX}px ${posY}px`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
      transform: flipped ? 'scaleX(-1)' : undefined,
    }} />
  );
}

// ── Remote player animation state (per slot, maintained across frames) ───────
// Remote positions arrive at 25Hz via 0xFF deltas; the rAF loop compares
// against the previous frame to derive walk animation and facing direction.
interface RemoteAnim {
  /** Most recently received authoritative position. */
  x: number;
  y: number;
  /** Interpolated screen position; bot updates arrive slower than human updates. */
  renderX: number;
  renderY: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  segmentStartTs: number;
  segmentDurationMs: number;
  lastTargetTs: number;
  animMs: number;
  facingLeft: boolean;
  lastMovedTs: number;
}

/** Keep the walk cycle alive across the server's 200ms bot tick interval. */
const REMOTE_MOVING_WINDOW_MS = 260;
const REMOTE_INTERPOLATION_MIN_MS = 40;
const REMOTE_INTERPOLATION_MAX_MS = 220;

export default function GameMap() {
  const { language } = useLanguage();
  const en = language === 'en';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapImgRef    = useRef<HTMLImageElement | null>(null);
  const spriteImgRef = useRef<CanvasImageSource | null>(null);
  /** Per-slot animation state for remote players, maintained across rAF frames. */
  const remoteAnimMapRef = useRef<Map<number, RemoteAnim>>(new Map());

  const [loaded,       setLoaded]       = useState(false);
  const [error,        setError]        = useState(false);
  const [spriteLoaded, setSpriteLoaded] = useState(false);

  // ── Network ───────────────────────────────────────────────────────────────
  const { sendMove } = useGameActions();
  const remotePlayersRef = useRemotePlayersRef();
  // Server correction for our own position (set by 0xFF handler in GameContext).
  const correctionRef = useCorrectionRef();
  // Rolling history of wire positions we ourselves have sent, oldest first.
  // Used to tell a real wall-clip rejection apart from an ordinary echo of
  // a position we already sent (see the reconciliation comment below).
  const pendingSentRef = useRef<Array<{ wireX: number; wireY: number }>>([]);

  // ── Multiplayer state (mirrored into refs for the rAF loop) ───────────────
  const {
    mySlot, players, myRole, impostorSlots, deadSlots, killCooldownMs,
    meeting, hasVoted, voteResult, myTasks, globalTaskProgress,
    sabotage, sabotageCooldownMs, myVentId, meetingMessages, emergencyMeetingUsed, corpsePositions, lastKill,
  } = useGameState();
  const {
    sendKill, reportBody, callEmergencyMeeting, castVote, clearVoteResult, completeTaskStep,
    triggerSabotage, repairSabotage,
    enterVent, travelVent, exitVent, sendMeetingChat,
  } = useGameActions();

  const [killAnimation, setKillAnimation] = useState<ReturnType<typeof useGameState>['lastKill']>(null);
  useEffect(() => {
    if (!lastKill) return;
    // The victim receives the blocking full-screen death sequence; the
    // attacker gets the kill sound but can keep playing and moving.
    if (lastKill.attackerSlot === mySlot && lastKill.victimSlot !== mySlot) {
      sfx('kill', 0.48);
      return;
    }
    if (lastKill.victimSlot !== mySlot) return;
    setKillAnimation(lastKill);
    sfx('kill', 0.72);
    const timer = window.setTimeout(() => setKillAnimation(null), 1150);
    return () => window.clearTimeout(timer);
  }, [lastKill, mySlot]);

  const playerName = useCallback(
    (slot: number) => players.find(p => p.slot === slot)?.username ?? `Player ${slot}`,
    [players],
  );

  const mySlotRef = useRef<number | null>(mySlot);
  useEffect(() => { mySlotRef.current = mySlot; }, [mySlot]);

  const myVentRef = useRef<number | null>(myVentId);
  useEffect(() => { myVentRef.current = myVentId; }, [myVentId]);

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
  const corpsePositionsRef = useRef(corpsePositions);
  useEffect(() => { corpsePositionsRef.current = corpsePositions; }, [corpsePositions]);

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
  const [showAdminTable, setShowAdminTable] = useState(false);
  const [, setAdminTableTick] = useState(0);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [miniMapTick, setMiniMapTick] = useState(0);
  const [showTaskList, setShowTaskList] = useState(false);
  const [trackedTaskId, setTrackedTaskId] = useState<number | null>(null);
  const miniMapOpenRef = useRef(false);
  useEffect(() => {
    miniMapOpenRef.current = showMiniMap;
    // Prevent the keyboard and joystick from moving the player behind the modal.
    keysRef.current.clear();
    pendingSentRef.current.length = 0;
  }, [showMiniMap]);
  const [chatDraft, setChatDraft] = useState('');
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
    ? Math.max(0, getSabotageTimeoutMs(sabotage.systemId as SabotageSystemId) - (sabotageNow - sabotage.startedAtMs))
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
      for (const body of corpsePositionsRef.current) {
        const dx = body.x - myPos.x;
        const dy = body.y - myPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) { best = body.slot; bestDistSq = distSq; }
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
        if (rp.inVent) continue;
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
  const trackedTaskIdRef = useRef<number | null>(trackedTaskId);
  useEffect(() => { trackedTaskIdRef.current = trackedTaskId; }, [trackedTaskId]);

  /** Closest in-range incomplete task (null when nothing is nearby). */
  const [nearestTask, setNearestTask] = useState<{ taskId: number; stepIndex: number } | null>(null);
  /** Which task minigame is currently open (null = none). */
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  useEffect(() => {
    if (trackedTaskId !== null && !myTasks.some(task => {
      const def = TASK_DEFS.find(item => item.id === task.taskId);
      return task.taskId === trackedTaskId && def !== undefined && task.completedSteps < def.steps;
    })) setTrackedTaskId(null);
  }, [trackedTaskId, myTasks]);

  useEffect(() => {
    if (myRole !== 'crewmate' || meeting !== null || activeTaskId !== null || voteResult?.winner) {
      setShowTaskList(false);
    }
  }, [myRole, meeting, activeTaskId, voteResult?.winner]);

  // Close an in-progress minigame on death; ghosts can reopen the same
  // assigned task afterward and continue contributing to the shared task bar.
  useEffect(() => {
    const activeTaskLocked = activeTaskId !== null &&
      (sabotage?.systemId === SABOTAGE_COMMS ||
       (sabotage?.systemId === SABOTAGE_DOORS && sabotage.lockedTaskIds.includes(activeTaskId)));
    if (meeting !== null || amIDead || myRole !== 'crewmate' || voteResult?.winner || activeTaskLocked) setActiveTaskId(null);
  }, [meeting, amIDead, myRole, voteResult?.winner, sabotage, activeTaskId]);

  useEffect(() => {
    if (meeting !== null || myRole !== 'crewmate' ||
        sabotage?.systemId === SABOTAGE_COMMS) { setNearestTask(null); return; }
    const id = setInterval(() => {
      const myPos = playerStateRef.current;
      if (!myPos) return;
      let best: { taskId: number; stepIndex: number } | null = null;
      let bestDistSq = TASK_INTERACTION_RANGE_PX * TASK_INTERACTION_RANGE_PX;
      for (const t of myTasksRef.current) {
        const def = TASK_DEFS[t.taskId];
        if (!def || t.completedSteps >= def.steps) continue;
        if (sabotageRef.current?.systemId === SABOTAGE_DOORS &&
            sabotageRef.current.lockedTaskIds.includes(t.taskId)) continue;
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
  }, [meeting, myRole, sabotage]);

  // Living players may use the custom-map Admin Table when they stand at its console.
  // The proximity check is only client-side UI; the table itself reads replicated player
  // coordinates and never exposes roles or the hidden vent occupant.
  const [nearestAdminTableId, setNearestAdminTableId] = useState<number | null>(null);
  const adminTableOpenRef = useRef(false);
  useEffect(() => {
    adminTableOpenRef.current = showAdminTable;
    keysRef.current.clear();
    pendingSentRef.current.length = 0;
  }, [showAdminTable]);

  useEffect(() => {
    if (amIDead || myVentId !== null || meeting !== null || voteResult?.winner) {
      setShowAdminTable(false);
    }
  }, [amIDead, myVentId, meeting, voteResult?.winner]);

  useEffect(() => {
    if (myRole === null || amIDead || myVentId !== null || meeting !== null || voteResult?.winner) {
      setNearestAdminTableId(null);
      return;
    }
    const id = setInterval(() => {
      const pos = playerStateRef.current;
      let best: number | null = null;
      let bestDistSq = ADMIN_TABLE_INTERACTION_RANGE_PX * ADMIN_TABLE_INTERACTION_RANGE_PX;
      for (const consoleDef of ADMIN_TABLE_DEFS) {
        const dx = consoleDef.x - pos.x;
        const dy = consoleDef.y - pos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) {
          best = consoleDef.id;
          bestDistSq = distSq;
        }
      }
      setNearestAdminTableId(best);
    }, 150);
    return () => clearInterval(id);
  }, [myRole, amIDead, myVentId, meeting, voteResult?.winner]);

  useEffect(() => {
    if (!showMiniMap) return;
    const timer = window.setInterval(() => setMiniMapTick(tick => tick + 1), 250);
    return () => window.clearInterval(timer);
  }, [showMiniMap]);

  useEffect(() => {
    if (meeting !== null || activeTaskId !== null || amIDead || myVentId !== null || voteResult?.winner) {
      setShowMiniMap(false);
    }
  }, [meeting, activeTaskId, amIDead, myVentId, voteResult?.winner]);

  useEffect(() => {
    if (!showAdminTable) return;
    const timer = window.setInterval(() => setAdminTableTick(tick => tick + 1), 250);
    return () => window.clearInterval(timer);
  }, [showAdminTable]);

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
    sfx('roundStart', 0.75);
    if (isMockReveal) return;
    const timer = setTimeout(() => setShowReveal(false), 3200);
    return () => clearTimeout(timer);
  }, [myRole, isMockReveal]);

  // ── Sound effects for game-over and meeting ───────────────────────────────
  useEffect(() => {
    if (!voteResult?.winner) return;
    if (voteResult.winner === 'impostors') sfx('victoryImpostor', 0.8);
    else sfx('victoryCrewmate', 0.8);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voteResult?.winner]);

  const prevMeetingRef = useRef<typeof meeting>(null);
  useEffect(() => {
    if (meeting !== null && prevMeetingRef.current === null) {
      sfx(meeting.bodySlot === NO_TARGET ? 'meeting' : 'bodyReport', 0.85);
    }
    prevMeetingRef.current = meeting;
  }, [meeting]);

  const prevSabotageIdRef = useRef<number | null>(null);
  useEffect(() => {
    const currentId = sabotage?.systemId ?? null;
    if (currentId !== null && prevSabotageIdRef.current === null) sfx('sabotage', 0.55);
    prevSabotageIdRef.current = currentId;
  }, [sabotage?.systemId]);

  const prevVentIdRef = useRef<number | null>(myVentId);
  useEffect(() => {
    if (myVentId !== prevVentIdRef.current && (myVentId !== null || prevVentIdRef.current !== null)) {
      sfx('vent', 0.48);
    }
    prevVentIdRef.current = myVentId;
  }, [myVentId]);

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
    // Debounce: iOS Safari fires a burst of `resize` events with different
    // innerWidth/innerHeight values while its dynamic toolbar (URL bar) is
    // animating in/out — most visibly right after the page first loads and
    // right after the user starts scrolling/dragging. Resizing the canvas
    // buffer on every intermediate event thrashes canvas.width/height, which
    // changes the render loop's srcW/srcH crop each time and reads as the
    // whole map "shaking" even though the render loop itself is stable
    // per-frame. Wait for the burst to settle before committing a resize.
    let timeoutId: number | undefined;
    const handleResize = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(sizeCanvas, 150);
    };
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
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
      unlockSfx();
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

  // ── Main rAF render loop ───────────────────────────────────────────────────
  const playerStateRef = useRef(createInitialPlayerState());

  // Nearest vent is recomputed at low frequency; the server still checks range.
  const [nearestVentId, setNearestVentId] = useState<number | null>(null);
  useEffect(() => {
    if (!amIImpostor || amIDead || myVentId !== null || meeting !== null || voteResult?.winner) {
      setNearestVentId(null);
      return;
    }
    const id = setInterval(() => {
      const myPos = playerStateRef.current;
      if (!myPos) return;
      let best: number | null = null;
      let bestDistSq = VENT_INTERACTION_RANGE_PX * VENT_INTERACTION_RANGE_PX;
      for (const vent of VENT_DEFS) {
        const dx = vent.x - myPos.x;
        const dy = vent.y - myPos.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) { best = vent.id; bestDistSq = distSq; }
      }
      setNearestVentId(best);
    }, 150);
    return () => clearInterval(id);
  }, [amIImpostor, amIDead, myVentId, meeting, voteResult?.winner]);


  useEffect(() => {
    if (myVentId !== null) {
      const vent = findVent(myVentId);
      if (vent) playerStateRef.current = { ...playerStateRef.current, x: vent.x, y: vent.y };
    }
    keysRef.current.clear();
    pendingSentRef.current.length = 0;
  }, [myVentId]);

  useEffect(() => {
    if (!loaded || !spriteLoaded) return;
    const canvas = canvasRef.current;
    const mapImg = mapImgRef.current;
    const sprite = spriteImgRef.current;
    if (!canvas || !mapImg || !sprite) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fogCanvas = document.createElement('canvas');
    const fogCtx = fogCanvas.getContext('2d');
    if (!fogCtx) return;

    const grid = buildCollisionGrid();
    // Movement still uses every solid collision cell. Vision shadows use a
    // separate occlusion grid that ignores tiny isolated props like benches.
    const shadowGrid = buildShadowGrid(grid);
    if (!isSpawnWalkable(grid)) {
      console.warn('Player spawn point is not walkable — check PLAYER_SPAWN in game/player.ts');
    }

    let rafId = 0;
    let lastTs: number | null = null;
    /** Timestamp of the last 0x11 sent. */
    let lastMoveSentTs = 0;
    let lastFootstepTs = 0;
    /** Wire-space position at last send (for delta filtering). */
    let lastSentWireX = -1;
    let lastSentWireY = -1;

    const frame = (ts: number) => {
      const dtMs = lastTs === null ? 16 : Math.min(ts - lastTs, 48);
      lastTs = ts;

      // Reconcile any pending server position echo before stepping physics.
      //
      // The 0xFF broadcast always includes our own last-known-accepted
      // position, even when nothing was rejected — it's simply an ack of
      // whatever we most recently sent, arriving one round trip later.
      // Local movement never waits for that ack, so by the time it arrives
      // we've already moved further in the same direction. Blindly
      // snapping to every echo fights local prediction and reads as
      // continuous shake/jitter as soon as the player starts moving.
      //
      // Instead, compare the echoed wire position against our own recent
      // send history: if it matches something we sent, it's just a normal
      // ack — drop it and keep predicting forward. If it doesn't match
      // anything we sent recently, the server actually fell back to an
      // older valid position (a real wall-clip rejection) — snap to it.
      if (correctionRef.current) {
        const { wireX: cWireX, wireY: cWireY } = correctionRef.current;
        correctionRef.current = null;

        const pending = pendingSentRef.current;
        const ackIndex = pending.findIndex(
          (p) => p.wireX === cWireX && p.wireY === cWireY,
        );

        if (ackIndex !== -1) {
          // Confirmed — everything up to and including this send is stale
          // history now; local prediction already accounts for it.
          pending.splice(0, ackIndex + 1);
        } else {
          // Not something we sent recently — the server rejected our
          // latest move(s) and is holding us at an earlier valid spot.
          playerStateRef.current = {
            ...playerStateRef.current,
            x: fromWire(cWireX, MAP_W),
            y: fromWire(cWireY, MAP_H),
          };
          pending.length = 0;
        }
      }

      // Step player physics. Dead players (ghosts) walk through walls.
      // Movement freezes entirely during a meeting (server ignores 0x11 too).
      const effectiveKeys = meetingActiveRef.current || myVentRef.current !== null || adminTableOpenRef.current || miniMapOpenRef.current
        ? EMPTY_KEYS
        : keysRef.current;
      playerStateRef.current = stepPlayer(
        grid, playerStateRef.current, effectiveKeys, dtMs, deadSlotsRef.current.has(mySlotRef.current ?? -1),
      );
      const { x: px, y: py, pose, facingLeft } = playerStateRef.current;
      if (
        (pose === 'walk-1' || pose === 'walk-2') &&
        !deadSlotsRef.current.has(mySlotRef.current ?? -1) &&
        ts - lastFootstepTs >= 320
      ) {
        sfx('footstep', 0.42);
        lastFootstepTs = ts;
      }

      // ── Send 0x11 move intent (throttled to 25Hz) ─────────────────────────
      const sinceLastSend = ts - lastMoveSentTs;
      if (sinceLastSend >= MOVE_SEND_INTERVAL_MS) {
        const wireX = toWire(px, MAP_W);
        const wireY = toWire(py, MAP_H);
        // Only send if position has changed in wire space
        if (wireX !== lastSentWireX || wireY !== lastSentWireY) {
          sendMove(wireX, wireY);
          pendingSentRef.current.push({ wireX, wireY });
          // Bounded history — comfortably covers any realistic round trip
          // at the 25Hz send rate without growing unbounded.
          if (pendingSentRef.current.length > 40) pendingSentRef.current.shift();
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

      // ── 2.5 Task markers (crewmates only, hidden during meetings) ──────────
      {
        const snap = myTasksRef.current;
        if (snap.length > 0 && !meetingActiveRef.current && sabotageRef.current?.systemId !== SABOTAGE_COMMS) {
          ctx.textAlign = 'center';
          for (const t of snap) {
            const def = TASK_DEFS[t.taskId];
            if (!def) continue;
            const done = t.completedSteps >= def.steps;
            const locked = sabotageRef.current?.systemId === SABOTAGE_DOORS &&
              sabotageRef.current.lockedTaskIds.includes(t.taskId);
            const tx = Math.round((def.x - srcX) * scale);
            const ty = Math.round((def.y - srcY) * scale);
            if (tx < -60 || tx > cw + 60 || ty < -60 || ty > ch + 60) continue;
            const markerR = Math.round(9 * dpr);
            // Glow ring
            ctx.beginPath();
            ctx.arc(tx, ty, markerR + 3, 0, Math.PI * 2);
            ctx.fillStyle = locked ? 'rgba(255,40,40,0.25)' : done ? 'rgba(50,180,50,0.2)' : 'rgba(255,220,40,0.18)';
            ctx.fill();
            // Marker circle
            ctx.beginPath();
            ctx.arc(tx, ty, markerR, 0, Math.PI * 2);
            ctx.fillStyle = locked ? 'rgba(150,35,40,0.95)' : done ? 'rgba(50,180,50,0.85)' : 'rgba(255,210,30,0.9)';
            ctx.fill();
            ctx.strokeStyle = done ? 'rgba(30,140,30,0.9)' : 'rgba(180,140,0,0.9)';
            ctx.lineWidth = Math.round(1.5 * dpr);
            ctx.stroke();
            // Icon
            ctx.fillStyle = locked ? '#ffffff' : done ? '#0d3b0d' : '#3b2a00';
            ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.fillText(locked ? '×' : done ? '✓' : '!', tx, ty);
            // Label
            ctx.textBaseline = 'top';
            ctx.font = `${Math.round(9 * dpr)}px sans-serif`;
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.lineWidth = Math.round(3 * dpr);
            ctx.strokeText(def.name, tx, ty + markerR + 3);
            ctx.fillStyle = locked ? 'rgba(255,120,120,0.95)' : done ? 'rgba(120,255,120,0.85)' : 'rgba(255,235,80,0.9)';
            ctx.fillText(locked ? `🔒 ${def.name}` : def.name, tx, ty + markerR + 3);
          }
          // Off-screen task compass: points towards the selected task (or the next
          // unfinished one). Coordinates are clamped in canvas pixels, so it works
          // in both portrait Telegram WebViews and wide desktop windows.
          if (myRoleRef.current === 'crewmate') {
            const candidates = snap.filter(task => {
              const def = TASK_DEFS.find(item => item.id === task.taskId);
              if (!def || task.completedSteps >= def.steps) return false;
              return !(sabotageRef.current?.systemId === SABOTAGE_DOORS &&
                sabotageRef.current.lockedTaskIds.includes(task.taskId));
            });
            const target = candidates.find(task => task.taskId === trackedTaskIdRef.current) ?? candidates[0];
            const def = target ? TASK_DEFS.find(item => item.id === target.taskId) : undefined;
            if (def && !meetingActiveRef.current) {
              const tx = (def.x - srcX) * scale;
              const ty = (def.y - srcY) * scale;
              const margin = 30 * dpr;
              const inView = tx >= margin && tx <= cw - margin && ty >= margin && ty <= ch - margin;
              if (!inView) {
                const centerX = cw / 2;
                const centerY = ch / 2;
                const dx = tx - centerX;
                const dy = ty - centerY;
                const factorX = Math.abs(dx) > 0.001 ? (centerX - margin) / Math.abs(dx) : Number.POSITIVE_INFINITY;
                const factorY = Math.abs(dy) > 0.001 ? (centerY - margin) / Math.abs(dy) : Number.POSITIVE_INFINITY;
                const factor = Math.min(factorX, factorY);
                const ax = centerX + dx * factor;
                const ay = centerY + dy * factor;
                ctx.save();
                ctx.translate(ax, ay);
                ctx.rotate(Math.atan2(dy, dx));
                ctx.beginPath();
                ctx.moveTo(11 * dpr, 0);
                ctx.lineTo(-7 * dpr, -7 * dpr);
                ctx.lineTo(-4 * dpr, 0);
                ctx.lineTo(-7 * dpr, 7 * dpr);
                ctx.closePath();
                ctx.fillStyle = target.taskId === trackedTaskIdRef.current
                  ? 'rgba(112,223,193,0.98)'
                  : 'rgba(255,220,70,0.95)';
                ctx.strokeStyle = 'rgba(0,0,0,0.88)';
                ctx.lineWidth = 2 * dpr;
                ctx.stroke();
                ctx.fill();
                ctx.restore();
              }
            }
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

      // ── 2.8 Vent markers ──────────────────────────────────────────────────
      // Positions are in Among Gas's own collision-checked map coordinate space.
      ctx.save();
      ctx.textAlign = 'center';
      VENT_DEFS.forEach(vent => {
        const vx = Math.round((vent.x - srcX) * scale);
        const vy = Math.round((vent.y - srcY) * scale);
        if (vx < -32 || vx > cw + 32 || vy < -32 || vy > ch + 32) return;
        const radius = Math.max(5, Math.round(10 * dpr));
        ctx.beginPath();
        ctx.arc(vx, vy, radius + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.56)';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(vx, vy, radius, radius * 0.62, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#34454e';
        ctx.fill();
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeStyle = 'rgba(170,220,230,0.9)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(vx - radius * 0.65, vy + radius * 0.08);
        ctx.lineTo(vx + radius * 0.65, vy + radius * 0.08);
        ctx.strokeStyle = 'rgba(10,20,26,0.95)';
        ctx.lineWidth = Math.max(2, dpr * 2);
        ctx.stroke();
      });
      ctx.restore();

      // ── 3.1 Dropped bodies (separate from the moving ghost avatar) ─────────
      // Among Gas's balaclava character art is retained, but only the lower half
      // remains after a kill. The bone rises from the cut edge; it is not drawn
      // over a complete standing character. This marker is visual only.
      const corpseMarkerSize = Math.max(8, Math.round(PLAYER_DISPLAY_HEIGHT * scale));
      ctx.save();
      for (const body of corpsePositionsRef.current) {
        const bx = Math.round((body.x - srcX) * scale);
        const by = Math.round((body.y - srcY) * scale);
        if (bx < -48 || bx > cw + 48 || by < -48 || by > ch + 48) continue;
        const corpseW = Math.max(8, Math.round(PLAYER_DISPLAY_WIDTH * scale));
        const corpseH = corpseMarkerSize;
        const rect = getCharacterFrameRect(slotColor(body.slot), 'idle');
        const sx = Math.ceil(rect.x);
        const sy = Math.ceil(rect.y);
        const sw = Math.floor(rect.x + rect.width) - sx;
        const sh = Math.floor(rect.y + rect.height) - sy;
        const splitY = Math.floor(sh * 0.52);
        const lowerHeight = Math.max(1, sh - splitY);

        // The original sprite faces up. Rotate the lower half onto its side so
        // the remaining legs extend from the cut point, with a subtle stain below.
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(-Math.PI / 2 - 0.12);
        ctx.beginPath();
        ctx.ellipse(0, corpseH * 0.1, corpseW * 0.48, corpseH * 0.12, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(104, 18, 24, 0.42)';
        ctx.fill();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          sprite, sx, sy + splitY, sw, lowerHeight,
          -corpseW / 2, 0, corpseW, corpseH / 2,
        );
        ctx.imageSmoothingEnabled = true;
        ctx.restore();

        // Keep the exposed bone upright on screen, perpendicular to the body.
        ctx.save();
        ctx.translate(bx, by);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(20, 12, 12, 0.92)';
        ctx.lineWidth = Math.max(3, dpr * 4);
        ctx.beginPath();
        ctx.moveTo(0, 1);
        ctx.lineTo(0, -corpseW * 0.46);
        ctx.stroke();
        ctx.strokeStyle = '#f5ead2';
        ctx.lineWidth = Math.max(2, dpr * 2.5);
        ctx.beginPath();
        ctx.moveTo(0, 1);
        ctx.lineTo(0, -corpseW * 0.46);
        ctx.stroke();
        for (const [boneX, boneY] of [
          [-corpseW * 0.07, -corpseW * 0.40],
          [ corpseW * 0.07, -corpseW * 0.40],
          [-corpseW * 0.07, -corpseW * 0.47],
          [ corpseW * 0.07, -corpseW * 0.47],
        ]) {
          ctx.beginPath();
          ctx.arc(boneX, boneY, Math.max(2, dpr * 2), 0, Math.PI * 2);
          ctx.fillStyle = '#f5ead2';
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();

      // ── 2.9 Admin Table console marker ────────────────────────────────────
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const consoleDef of ADMIN_TABLE_DEFS) {
        const ax = Math.round((consoleDef.x - srcX) * scale);
        const ay = Math.round((consoleDef.y - srcY) * scale);
        if (ax < -30 || ax > cw + 30 || ay < -30 || ay > ch + 30) continue;
        const radius = Math.max(7, Math.round(12 * dpr));
        ctx.beginPath();
        ctx.arc(ax, ay, radius + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.58)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ax, ay, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#193c4b';
        ctx.fill();
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeStyle = 'rgba(100,225,235,0.95)';
        ctx.stroke();
        ctx.fillStyle = '#e4ffff';
        ctx.font = `900 ${Math.max(10, Math.round(13 * dpr))}px sans-serif`;
        ctx.fillText('A', ax, ay + 0.5 * dpr);
      }
      ctx.restore();

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

        const viewerIsDead = deadSlotsRef.current.has(mySlotRef.current ?? -1);
        for (const rp of remotePlayers.values()) {
          // Vent occupants must disappear completely until they exit.
          if (rp.inVent) continue;
          const rIsGhost = deadSlotsRef.current.has(rp.slot);
          // Living players see the stationary body, not the dead player's moving ghost.
          if (rIsGhost && !viewerIsDead) continue;
          // Update per-slot animation state from position deltas
          let anim = remoteAnims.get(rp.slot);
          if (!anim) {
            anim = {
              x: rp.x, y: rp.y,
              renderX: rp.x, renderY: rp.y,
              fromX: rp.x, fromY: rp.y,
              targetX: rp.x, targetY: rp.y,
              segmentStartTs: ts, segmentDurationMs: REMOTE_INTERPOLATION_MIN_MS,
              lastTargetTs: ts,
              animMs: 0, facingLeft: false, lastMovedTs: -1e9,
            };
            remoteAnims.set(rp.slot, anim);
          }
          const rdx = rp.x - anim.x;
          const rdy = rp.y - anim.y;
          if (rdx * rdx + rdy * rdy > 0.25) {
            // Start the next interpolation segment from the current rendered
            // position, not the previous network sample. This avoids visible
            // jumps when synthetic bots update at 5Hz while humans update at 25Hz.
            anim.fromX = anim.renderX;
            anim.fromY = anim.renderY;
            anim.targetX = rp.x;
            anim.targetY = rp.y;
            anim.segmentStartTs = ts;
            anim.segmentDurationMs = Math.max(
              REMOTE_INTERPOLATION_MIN_MS,
              Math.min(REMOTE_INTERPOLATION_MAX_MS, ts - anim.lastTargetTs),
            );
            anim.lastTargetTs = ts;
            anim.lastMovedTs = ts;
            if (Math.abs(rdx) > 0.1) anim.facingLeft = rdx < 0;
          }
          anim.x = rp.x;
          anim.y = rp.y;
          const segmentT = Math.max(0, Math.min(1,
            (ts - anim.segmentStartTs) / anim.segmentDurationMs,
          ));
          const easedT = segmentT * segmentT * (3 - 2 * segmentT);
          anim.renderX = anim.fromX + (anim.targetX - anim.fromX) * easedT;
          anim.renderY = anim.fromY + (anim.targetY - anim.fromY) * easedT;
          const rMoving = ts - anim.lastMovedTs < REMOTE_MOVING_WINDOW_MS;
          anim.animMs = rMoving ? anim.animMs + dtMs : 0;
          // Phase 5: dead players always render the static "ghost" pose.
          const rPose: CharacterPose = rIsGhost
            ? 'ghost'
            : rMoving
              ? Math.floor(anim.animMs / PLAYER_ANIM_INTERVAL_MS) % 2 === 0
                ? 'walk-1'
                : 'walk-2'
              : 'idle';

          const rpCX = Math.round((anim.renderX - srcX) * scale);
          const rpCY = Math.round((anim.renderY - srcY) * scale);

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

      // ── 5. Base-game vision + wall shadows ─────────────────────────────────
      // Crewmates and impostors always see only their sight radius. Lights
      // sharply reduces crewmate vision; impostor vision is unchanged. Ghosts
      // can see the entire map and continue tasks, as in the base game.
      const localRole = myRoleRef.current;
      const isLocalGhost = deadSlotsRef.current.has(mySlotRef.current ?? -1);
      if (!isLocalGhost && (localRole === 'crewmate' || localRole === 'impostor')) {
        const activeSabotage = sabotageRef.current;
        const visionRadius = localRole === 'impostor'
          ? IMPOSTOR_VISION_RADIUS_PX
          : activeSabotage?.systemId === SABOTAGE_LIGHTS
            ? LIGHTS_CREWMATE_VISION_RADIUS_PX
            : NORMAL_VISION_RADIUS_PX;
        const visionR = visionRadius * scale;
        const visiblePolygon = computeVisibilityPolygon(px, py, visionRadius, shadowGrid);

        if (fogCanvas.width !== cw || fogCanvas.height !== ch) {
          fogCanvas.width = cw;
          fogCanvas.height = ch;
        }
        fogCtx.setTransform(1, 0, 0, 1, 0, 0);
        fogCtx.globalAlpha = 1;
        fogCtx.globalCompositeOperation = 'source-over';
        fogCtx.filter = 'none';
        fogCtx.clearRect(0, 0, cw, ch);
        fogCtx.fillStyle = 'rgba(0,0,0,0.96)';
        fogCtx.fillRect(0, 0, cw, ch);

        // The visibility polygon ends at either the sight-radius boundary or
        // the first wall. Clipping a soft radial gradient to it makes open
        // rooms fade naturally while solid obstacles cast opaque shadows.
        // Erase only this overlay: destination-out on the main canvas also
        // removes the map and player underneath, exposing the page background.
        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.beginPath();
        for (let i = 0; i < visiblePolygon.length; i++) {
          const point = visiblePolygon[i];
          const x = (point.x - srcX) * scale;
          const y = (point.y - srcY) * scale;
          if (i === 0) fogCtx.moveTo(x, y);
          else fogCtx.lineTo(x, y);
        }
        if (visiblePolygon.length > 2) {
          fogCtx.closePath();
          fogCtx.clip();
          const grad = fogCtx.createRadialGradient(pCX, pCY, visionR * 0.55, pCX, pCY, visionR);
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          grad.addColorStop(0.82, 'rgba(0,0,0,1)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          fogCtx.fillStyle = grad;
          fogCtx.beginPath();
          fogCtx.arc(pCX, pCY, visionR, 0, Math.PI * 2);
          fogCtx.fill();
        }
        fogCtx.restore();
        // iOS Safari can retain filters across canvas state resets; keeping
        // this explicit avoids radial-fog artefacts on the next frame.
        fogCtx.filter = 'none';
        ctx.drawImage(fogCanvas, 0, 0);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [loaded, spriteLoaded, sendMove, remotePlayersRef]);

  return (
    <div
      onPointerDown={unlockSfx}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#3d4e5e' }}
    >
      {killAnimation && (
        <div
          role="alert"
          aria-live="assertive"
          aria-label="Kill animation"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at center, rgba(70,8,14,0.94), rgba(5,7,12,0.98) 72%)',
            color: '#fff4f2', fontFamily: 'system-ui, sans-serif',
            animation: 'agKillBackdrop 1.15s ease-out both',
            pointerEvents: 'none',
          }}
        >
          <style>{`
            @keyframes agKillBackdrop {
              0% { opacity: 0; filter: brightness(2.2); }
              12% { opacity: 1; filter: brightness(1.25); }
              100% { opacity: 1; filter: brightness(1); }
            }
            @keyframes agKillAttacker {
              0% { transform: translateX(-110vw) scale(.72); opacity: .2; }
              35% { transform: translateX(0) scale(1.08); opacity: 1; }
              100% { transform: translateX(-3vw) scale(1); opacity: 1; }
            }
            @keyframes agKillVictim {
              0%, 26% { transform: translateX(12vw) rotate(0deg); opacity: 1; }
              45% { transform: translateX(16vw) rotate(18deg); opacity: .65; }
              100% { transform: translateX(16vw) rotate(28deg) translateY(5vh); opacity: .45; }
            }
            @keyframes agKillSlash {
              0%, 22% { transform: translate(-120%, -50%) rotate(-18deg); opacity: 0; }
              34% { opacity: 1; }
              52% { transform: translate(0, -50%) rotate(-18deg); opacity: 1; }
              100% { transform: translate(120%, -50%) rotate(-18deg); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
              .ag-kill-attacker, .ag-kill-victim, .ag-kill-slash { animation-duration: 1ms !important; }
            }
          `}</style>
          <div style={{
            position: 'relative', width: 'min(94vw, 760px)', height: 'min(58vh, 420px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div className="ag-kill-attacker" style={{
              position: 'absolute', left: '12%', top: '25%',
              animation: 'agKillAttacker 1.15s cubic-bezier(.2,.8,.2,1) both',
              filter: 'drop-shadow(0 12px 12px rgba(0,0,0,.7))',
            }}>
              <CharSpriteUI color={slotColor(killAnimation.attackerSlot ?? 0)} pose="run-lean" size={150} />
            </div>
            <div className="ag-kill-victim" style={{
              position: 'absolute', right: '15%', top: '25%',
              animation: 'agKillVictim 1.15s ease-in both',
              filter: 'drop-shadow(0 12px 12px rgba(0,0,0,.7))',
            }}>
              <CharSpriteUI color={slotColor(killAnimation.victimSlot)} pose="sit-crouch" size={150} />
            </div>
            <div className="ag-kill-slash" style={{
              position: 'absolute', left: '5%', top: '48%', width: '90%', height: 10,
              borderRadius: 999, background: 'linear-gradient(90deg, transparent, #ff334d 12%, #fff4f2 50%, #ff334d 88%, transparent)',
              boxShadow: '0 0 24px rgba(255,35,65,.9)',
              animation: 'agKillSlash 1.15s ease-out both',
            }} />
          </div>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: '12%',
            textAlign: 'center', fontSize: 'clamp(20px, 4vw, 42px)',
            fontWeight: 950, letterSpacing: '.18em', textTransform: 'uppercase',
            color: '#fff4f2', textShadow: '0 4px 18px rgba(255,30,50,.8)',
          }}>
            ELIMINATED
          </div>
        </div>
      )}
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

      {/* Task list and selected-task tracking, adapted for small Telegram screens. */}
      {loaded && myRole === 'crewmate' && meeting === null && (
        <>
          <div style={{
            position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 60px)', left: 12, zIndex: 35,
          }}>
            <button
              onClick={() => { haptic.tap(); setShowTaskList(value => !value); setShowMiniMap(false); setShowAdminTable(false); }}
              aria-expanded={showTaskList}
              style={{
                padding: '9px 12px', borderRadius: 9, color: '#f5f0d5',
                background: showTaskList ? 'rgba(106,79,18,0.96)' : 'rgba(10,22,34,0.92)',
                border: '1px solid rgba(241,196,15,0.62)', boxShadow: '0 3px 12px rgba(0,0,0,0.35)',
                fontFamily: 'sans-serif', fontSize: 12, fontWeight: 900, backdropFilter: 'blur(8px)',
                touchAction: 'manipulation',
              }}
            >
              {showTaskList ? (en ? '✕ CLOSE TASKS' : '✕ ЗАКРЫТЬ ЗАДАНИЯ') : (en ? '☷ TASKS' : '☷ ЗАДАНИЯ')}
            </button>
          </div>

          {showTaskList && (
            <div role="region" aria-label={en ? 'Task list' : 'Список заданий'} style={{
              position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 106px)', left: 12,
              width: 'min(330px, calc(100vw - 24px))', maxHeight: 'min(55vh, 420px)',
              overflowY: 'auto', zIndex: 52, padding: 10, borderRadius: 12,
              background: 'rgba(6,16,24,0.97)', border: '1px solid rgba(241,196,15,0.42)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)', color: '#e8f2f6',
              fontFamily: 'sans-serif', backdropFilter: 'blur(10px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 2px 8px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: '0.08em' }}>{en ? 'CREW TASKS' : 'ЗАДАНИЯ ЭКИПАЖА'}</div>
                  <div style={{ marginTop: 3, color: 'rgba(220,239,242,0.58)', fontSize: 10 }}>
                    {myTasks.filter(task => {
                      const def = TASK_DEFS.find(item => item.id === task.taskId);
                      return def && task.completedSteps >= def.steps;
                    }).length} / {myTasks.length} {en ? 'completed' : 'выполнено'}
                  </div>
                </div>
                <button onClick={() => setShowTaskList(false)} aria-label={en ? 'Close tasks' : 'Закрыть задания'} style={{
                  width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(220,240,240,0.18)',
                  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 19, touchAction: 'manipulation',
                }}>×</button>
              </div>

              {sabotage?.systemId === SABOTAGE_COMMS ? (
                <div style={{
                  marginTop: 4, padding: 12, borderRadius: 8, background: 'rgba(155,48,39,0.18)',
                  border: '1px solid rgba(255,90,80,0.26)', fontSize: 12, lineHeight: 1.4,
                }}>
                  <strong>{en ? 'Communications disrupted.' : 'Связь нарушена.'}</strong> {en ? 'The task list is unavailable until communications are restored.' : 'Список заданий временно недоступен до восстановления связи.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {myTasks.map(task => {
                    const def = TASK_DEFS.find(item => item.id === task.taskId);
                    if (!def) return null;
                    const done = task.completedSteps >= def.steps;
                    const locked = sabotage?.systemId === SABOTAGE_DOORS && sabotage.lockedTaskIds.includes(task.taskId);
                    const tracked = (trackedTaskId ?? myTasks.find(item => {
                      const taskDef = TASK_DEFS.find(candidate => candidate.id === item.taskId);
                      return taskDef && item.completedSteps < taskDef.steps &&
                        !(sabotage?.systemId === SABOTAGE_DOORS && sabotage.lockedTaskIds.includes(item.taskId));
                    })?.taskId) === task.taskId;
                    return (
                      <button key={task.taskId} disabled={done || locked}
                        onClick={() => { haptic.tap(); setTrackedTaskId(task.taskId); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                          padding: '8px 9px', borderRadius: 8, cursor: done || locked ? 'default' : 'pointer',
                          color: done ? 'rgba(170,235,190,0.75)' : locked ? 'rgba(255,140,140,0.68)' : '#f3f6fb',
                          background: tracked ? 'rgba(60,145,125,0.2)' : done ? 'rgba(40,100,60,0.08)' : 'rgba(255,255,255,0.035)',
                          border: `1px solid ${tracked ? 'rgba(112,223,193,0.55)' : 'rgba(160,195,205,0.12)'}`,
                          fontFamily: 'inherit', fontSize: 12, touchAction: 'manipulation',
                        }}>
                        <span style={{ width: 21, height: 21, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center',
                          background: done ? 'rgba(57,170,100,0.22)' : locked ? 'rgba(170,45,45,0.22)' : 'rgba(241,196,15,0.16)',
                          border: `1px solid ${done ? 'rgba(80,220,130,0.45)' : locked ? 'rgba(250,90,90,0.4)' : 'rgba(241,196,15,0.5)'}`,
                          color: done ? '#7fe3a3' : locked ? '#ff9999' : '#f1c40f', fontWeight: 950,
                        }}>{done ? '✓' : locked ? '×' : '!'}</span>
                        <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>{taskRu(def.name, language)}</span>
                        <span style={{ color: 'rgba(220,239,242,0.6)', fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>
                          {Math.min(task.completedSteps, def.steps)} / {def.steps}
                        </span>
                      </button>
                    );
                  })}
                  <div style={{ padding: '5px 3px 0', fontSize: 10, color: 'rgba(220,239,242,0.55)' }}>
                    {en ? 'Choose a task; the compass will point toward it.' : 'Выберите задание: компас укажет направление к цели.'}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Mini-map toggle — top-left and safe-area aware for Telegram mobile. */}
      {loaded && myRole !== null && meeting === null && (
        <div style={{
          position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 12, zIndex: 35,
        }}>
          <button
            onClick={() => { haptic.tap(); setShowMiniMap(value => !value); if (!showMiniMap) setShowAdminTable(false); }}
            aria-expanded={showMiniMap}
            style={{
              padding: '9px 12px', borderRadius: 9, color: '#e4f5ff',
              background: showMiniMap ? 'rgba(24,95,103,0.96)' : 'rgba(10,22,34,0.92)',
              border: '1px solid rgba(105,205,220,0.65)', boxShadow: '0 3px 12px rgba(0,0,0,0.35)',
              fontFamily: 'sans-serif', fontSize: 12, fontWeight: 900, backdropFilter: 'blur(8px)',
              touchAction: 'manipulation',
            }}
          >
            {showMiniMap ? (en ? '✕ CLOSE MAP' : '✕ ЗАКРЫТЬ КАРТУ') : (en ? '🗺 MAP' : '🗺 КАРТА')}
          </button>
        </div>
      )}

      {showMiniMap && loaded && myRole !== null && meeting === null && (
        <div data-minimap-tick={miniMapTick} role="dialog" aria-modal="true" aria-label={en ? 'Among Gas map' : 'Карта Among Gas'}
          onClick={() => setShowMiniMap(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 75,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'max(12px, env(safe-area-inset-top, 12px)) 12px max(12px, env(safe-area-inset-bottom, 12px))',
            background: 'rgba(2,8,15,0.94)', backdropFilter: 'blur(6px)', color: '#e4f5ff', fontFamily: 'sans-serif',
          }}>
          <div onClick={event => event.stopPropagation()} style={{
            width: 'min(96vw, 900px)', maxHeight: '100%', overflowY: 'auto',
            borderRadius: 14, padding: 12, background: 'linear-gradient(155deg, rgba(18,42,55,0.98), rgba(5,14,25,0.99))',
            border: '1px solid rgba(100,210,230,0.55)', boxShadow: '0 16px 60px rgba(0,0,0,0.55)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 'clamp(18px, 4vw, 25px)', letterSpacing: '0.07em' }}>{en ? 'FACILITY MAP' : 'КАРТА ОБЪЕКТА'}</div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'rgba(190,225,235,0.68)' }}>
                  {myRole === 'crewmate' ? (en ? 'Your unfinished tasks are marked in yellow' : 'Ваши незавершённые задания отмечены жёлтым') : (en ? 'Map overview' : 'Обзор карты')}
                </div>
              </div>
              <button onClick={() => setShowMiniMap(false)} aria-label={en ? 'Close map' : 'Закрыть карту'} style={{
                width: 40, height: 40, flexShrink: 0, borderRadius: 10, border: '1px solid rgba(130,195,215,0.35)',
                background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 23, fontWeight: 800, touchAction: 'manipulation',
              }}>×</button>
            </div>
            <div style={{
              position: 'relative', width: '100%', aspectRatio: MAP_W / MAP_H,
              overflow: 'hidden', borderRadius: 9, border: '1px solid rgba(120,200,220,0.4)', background: '#13212a',
            }}>
              <img src={`${import.meta.env.BASE_URL}map-hires.png`} alt={en ? 'Among Gas map' : 'Карта Among Gas'} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none' }} />
              {myRole === 'crewmate' && myTasks.filter(task => {
                const def = TASK_DEFS.find(item => item.id === task.taskId);
                return def !== undefined && task.completedSteps < def.steps;
              }).map(task => {
                const def = TASK_DEFS.find(item => item.id === task.taskId)!;
                return <span key={task.taskId} title={def.name} style={{
                  position: 'absolute', left: `${def.x / MAP_W * 100}%`, top: `${def.y / MAP_H * 100}%`,
                  transform: 'translate(-50%,-50%)', display: 'grid', placeItems: 'center',
                  width: 'clamp(13px, 2.8vw, 22px)', height: 'clamp(13px, 2.8vw, 22px)',
                  borderRadius: '50%', background: '#f1c40f', border: '1px solid #fff5b4',
                  color: '#493900', fontSize: 'clamp(10px, 1.7vw, 15px)', fontWeight: 950,
                  boxShadow: '0 0 8px rgba(255,211,48,0.72)',
                }}>!</span>;
              })}
              {myVentId === null && (
                <span title={en ? 'You are here' : 'Вы здесь'} aria-label={en ? 'Your location' : 'Ваше местоположение'} style={{
                  position: 'absolute', left: `${playerStateRef.current.x / MAP_W * 100}%`, top: `${playerStateRef.current.y / MAP_H * 100}%`,
                  transform: 'translate(-50%,-50%)', width: 'clamp(12px, 2.6vw, 19px)', height: 'clamp(12px, 2.6vw, 19px)',
                  borderRadius: '50%', background: '#45e6bc', border: '2px solid #fff',
                  boxShadow: '0 0 0 4px rgba(69,230,188,0.25), 0 0 8px #000',
                }} />
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, padding: '8px 2px 0', fontSize: 11, color: 'rgba(220,239,242,0.7)' }}>
              <span>● {en ? 'Your location' : 'Ваше местоположение'}</span>
              <span>! {en ? 'Unfinished task' : 'Незавершённое задание'}</span>
              <span>{myTasks.filter(task => {
                const def = TASK_DEFS.find(item => item.id === task.taskId);
                return def !== undefined && task.completedSteps < def.steps;
              }).length} {en ? 'tasks remaining' : 'заданий осталось'}</span>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Vent interaction (living impostors only) ───────────────────────── */}
      {loaded && !amIDead && amIImpostor && myVentId === null && nearestVentId !== null && meeting === null && (
        <div style={{ position: 'fixed', bottom: 220, right: 24, zIndex: 28 }}>
          <button
            onClick={() => { haptic.tap(); enterVent(nearestVentId); }}
            style={{
              padding: '11px 16px', borderRadius: 12,
              background: 'linear-gradient(180deg, #394b54, #17272e)',
              color: '#e3fbff', border: '2px solid rgba(170,220,230,0.75)',
              boxShadow: '0 4px 0 #071015, 0 0 18px rgba(50,180,200,0.25)',
              fontFamily: 'sans-serif', fontWeight: 900, fontSize: 12,
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            🕳️ {en ? 'ENTER VENT' : 'ВЛЕЗТЬ В ЛЮК'}
          </button>
        </div>
      )}

      {/* ── Admin Table action (living players at the custom-map console) ─── */}
      {loaded && !amIDead && myRole !== null && myVentId === null && meeting === null &&
        nearestAdminTableId !== null && (
        <div style={{ position: 'fixed', bottom: 300, right: 24, zIndex: 28 }}>
          <button
            onClick={() => { haptic.tap(); setShowAdminTable(true); }}
            style={{
              padding: '11px 16px', borderRadius: 12,
              background: 'linear-gradient(180deg, #23606d, #15323a)',
              color: '#e4ffff', border: '2px solid rgba(105,225,235,0.8)',
              boxShadow: '0 4px 0 #071015, 0 0 18px rgba(50,190,205,0.28)',
              fontFamily: 'sans-serif', fontWeight: 900, fontSize: 12,
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            ◉ ADMIN TABLE
          </button>
        </div>
      )}

      {/* Live room table from the original game, using Among Gas's own map asset. */}
      {showAdminTable && myRole !== null && !amIDead && meeting === null && (() => {
        const agents = players.flatMap(player => {
          const isLocal = player.slot === mySlot;
          const remote = isLocal ? undefined : remotePlayersRef.current.get(player.slot);
          if (isLocal && myVentId !== null) return [];
          if (!isLocal && (!remote || remote.inVent)) return [];
          const position = isLocal ? playerStateRef.current : remote!;
          const alive = !deadSlots.includes(player.slot);
          return [{
            slot: player.slot,
            username: player.username,
            x: position.x,
            y: position.y,
            alive,
          }];
        });
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin Table"
            onClick={() => setShowAdminTable(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 88,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 12, padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
              background: 'rgba(2,8,15,0.94)', backdropFilter: 'blur(5px)',
              color: '#e4f5ff', fontFamily: 'sans-serif', overflowY: 'auto',
            }}
          >
            <div style={{
              width: 'min(94vw, 920px)', maxHeight: '88dvh',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              padding: '18px 14px 14px', borderRadius: 16,
              background: 'linear-gradient(155deg, rgba(18,42,55,0.98), rgba(5,14,25,0.99))',
              border: '1px solid rgba(100,210,230,0.55)',
              boxShadow: '0 16px 60px rgba(0,0,0,0.55)',
            }} onClick={e => e.stopPropagation()}>
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 950, fontSize: 'clamp(19px, 4vw, 28px)', letterSpacing: '0.1em' }}>ADMIN TABLE</div>
                  <div style={{ fontSize: 12, color: 'rgba(190,225,235,0.68)', marginTop: 3 }}>
                    Live player locations · {agents.length} visible
                  </div>
                </div>
                <button onClick={() => setShowAdminTable(false)} aria-label="Close Admin Table" style={{
                  width: 42, height: 42, borderRadius: 12, border: '1px solid rgba(130,195,215,0.35)',
                  background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 22, fontWeight: 800,
                  touchAction: 'manipulation',
                }}>×</button>
              </div>

              <div style={{
                position: 'relative', width: '100%', aspectRatio: MAP_W / MAP_H,
                borderRadius: 10, overflow: 'hidden',
                border: '1px solid rgba(120,200,220,0.45)', background: '#13212a',
              }}>
                <img
                  src={`${import.meta.env.BASE_URL}map-hires.png`}
                  alt="Among Gas map"
                  draggable={false}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', userSelect: 'none' }}
                />
                {agents.map(agent => (
                  <div
                    key={agent.slot}
                    title={agent.username}
                    aria-label={`${agent.username}, ${agent.alive ? 'alive' : 'dead'}`}
                    style={{
                      position: 'absolute',
                      left: `${Math.max(0, Math.min(100, agent.x / MAP_W * 100))}%`,
                      top: `${Math.max(0, Math.min(100, agent.y / MAP_H * 100))}%`,
                      transform: 'translate(-50%, -50%)',
                      display: 'grid', placeItems: 'center',
                      width: 'clamp(11px, 2.2vw, 19px)', height: 'clamp(11px, 2.2vw, 19px)',
                      borderRadius: '50%',
                      border: '1.5px solid rgba(255,255,255,0.95)',
                      background: agent.alive ? ADMIN_DOT_COLORS[slotColor(agent.slot)] : '#7f858b',
                      color: '#fff', fontWeight: 950, fontSize: 'clamp(9px, 1.4vw, 13px)',
                      lineHeight: 1, boxShadow: '0 1px 5px rgba(0,0,0,0.65)',
                      pointerEvents: 'auto',
                    }}
                  >
                    {agent.alive ? '' : '×'}
                  </div>
                ))}
              </div>
              <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                {agents.map(agent => (
                  <div key={agent.slot} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.04)', color: agent.alive ? '#e4f5ff' : '#7f858b',
                    fontSize: 11, maxWidth: '100%',
                  }}>
                    <span style={{
                      display: 'inline-block', width: 9, height: 9, flexShrink: 0, borderRadius: '50%',
                      background: agent.alive ? ADMIN_DOT_COLORS[slotColor(agent.slot)] : '#7f858b',
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(42vw, 200px)' }}>
                      {agent.username}
                    </span>
                    {!agent.alive && <span>×</span>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(190,225,235,0.55)', textAlign: 'center' }}>
                Hidden players inside vents do not appear. The table refreshes live.
              </div>
            </div>
          </div>
        );
      })()}

      {/* Vent selection covers the viewport and freezes movement while hidden. */}
      {myVentId !== null && (() => {
        const vent = findVent(myVentId);
        if (!vent) return null;
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 85,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            gap: 12, padding: 24, background: 'rgba(4,10,15,0.96)',
            color: '#e3fbff', fontFamily: 'sans-serif',
          }}>
            <div style={{ fontSize: 11, opacity: 0.65, letterSpacing: '0.2em', fontWeight: 800 }}>{en ? 'VENT SYSTEM' : 'СИСТЕМА ЛЮКОВ'}</div>
            <div style={{ fontSize: 26, fontWeight: 900, textAlign: 'center' }}>{vent.name}</div>
            <div style={{ width: 'min(360px, 100%)', display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {vent.connections.map(id => {
                const nextVent = findVent(id);
                if (!nextVent) return null;
                return (
                  <button key={id} onClick={() => { haptic.tap(); travelVent(id); }} style={{
                    width: '100%', padding: '15px 18px', borderRadius: 10,
                    color: '#e3fbff', background: '#193842',
                    border: '1px solid rgba(130,220,230,0.6)', fontWeight: 800, fontSize: 15,
                    touchAction: 'manipulation',
                  }}>
                    → {nextVent.name}
                  </button>
                );
              })}
            </div>
            <button onClick={() => { haptic.tap(); exitVent(); }} style={{
              width: 'min(360px, 100%)', padding: '14px 18px', borderRadius: 10,
              color: '#fff', background: '#8b2430', border: '1px solid #ff7785',
              fontWeight: 900, fontSize: 15, touchAction: 'manipulation',
            }}>
              {en ? 'EXIT VENT' : 'ВЫЛЕЗТИ ИЗ ЛЮКА'}
            </button>
          </div>
        );
      })()}

      {/* ── Do Task button (Phase 7, crewmates only) ────────────────────────── */}
      {loaded && myRole === 'crewmate' && meeting === null && activeTaskId === null && nearestTask !== null && (
        <div style={{
          position: 'fixed', bottom: 220, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
        }}>
          <button
            onClick={() => { haptic.tap(); setActiveTaskId(nearestTask.taskId); }}
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
            ⚙ {taskRu(TASK_DEFS[nearestTask.taskId]?.name, language)}
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
              onClick={() => { if (nearestTarget !== null) { haptic.tap(); sendKill(nearestTarget); } }}
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
              {killCooldownMs > 0 ? Math.ceil(killCooldownMs / 1000) : (en ? '☠ Kill' : '☠ Убить')}
            </button>
          )}
          {sabotage === null && nearestBody !== null && (
            <button
              onClick={() => { haptic.tap(); sfx('uiSelect', 0.3); reportBody(nearestBody); }}
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
              🛑 {en ? 'Report' : 'Доложить'}
            </button>
          )}
        </div>
      )}

      {/* ── Sabotage panel button (Phase 8, impostor only) ─────────────────── */}
      {loaded && !amIDead && amIImpostor && meeting === null && sabotage === null && (
        <div style={{ position: 'fixed', bottom: 130, left: 24, zIndex: 25 }}>
          <button
            disabled={sabotageCooldownMs > 0}
            onClick={() => { haptic.tap(); setShowSabotagePanel(true); }}
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
            {sabotageCooldownMs > 0 ? Math.ceil(sabotageCooldownMs / 1000) : (en ? '⚡ Sabotage' : '⚡ Саботаж')}
          </button>
        </div>
      )}

      {/* ── Repair button (Phase 8, crewmates only) ─────────────────────────── */}
      {loaded && !amIDead && !amIImpostor && meeting === null && sabotage !== null && nearestRepairPad !== null && (
        <div style={{
          position: 'fixed', bottom: 220, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
        }}>
          <button
            onClick={() => { haptic.tap(); sfx('uiSelect', 0.3); repairSabotage(nearestRepairPad.systemId, nearestRepairPad.padId); }}
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
            🔧 {en ? 'Fix' : 'Починить'} {sabotageRu(sabotageDef?.name, language)}
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
          ⚠ {sabotageRu(sabotageDef.name, language)} {en ? 'sabotaged' : 'саботирован'} — {Math.ceil(sabotageRemainingMs / 1000)}{en ? 's' : 'с'}
          {sabotageDef.pads.length > 1 && (
            <span style={{ opacity: 0.8 }}> ({sabotage.fixedPads.length}/{sabotageDef.pads.length} {en ? 'fixed' : 'починено'})</span>
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
            {en ? 'Choose a sabotage system' : 'Выберите систему саботажа'}
          </div>
          {Object.values(SABOTAGE_DEFS).map(def => (
            <button
              key={def.id}
              onClick={(e) => { e.stopPropagation(); haptic.tap(); sfx('uiSelect', 0.3); triggerSabotage(def.id); setShowSabotagePanel(false); }}
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
            {en ? 'Cancel' : 'Отмена'}
          </button>
        </div>
      )}

      {/* ── Emergency meeting button (Phase 6) ─────────────────────────────── */}
      {loaded && !amIDead && meeting === null && sabotage === null && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 20 }}>
          <button
            disabled={emergencyMeetingUsed}
            onClick={() => { if (!emergencyMeetingUsed) { haptic.tap(); sfx('uiSelect', 0.3); callEmergencyMeeting(); } }}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: emergencyMeetingUsed ? 'rgba(55,60,65,0.75)' : 'rgba(160,40,20,0.85)',
              color: emergencyMeetingUsed ? 'rgba(255,255,255,0.35)' : '#ffe4d0',
              border: '1px solid rgba(255,120,80,0.4)', fontFamily: 'sans-serif',
              fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
              textTransform: 'uppercase', cursor: emergencyMeetingUsed ? 'default' : 'pointer',
              backdropFilter: 'blur(6px)', touchAction: 'manipulation',
            }}
          >
            {emergencyMeetingUsed ? (en ? '✓ Emergency used' : '✓ Тревога использована') : (en ? '🚨 Emergency' : '🚨 Тревога')}
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
            ? (en ? '🗳️ Nobody ejected' : '🗳️ Никто не исключён')
            : `🗳️ ${playerName(voteResult.ejectedSlot)} ${en ? 'was ejected' : 'исключён'}`}
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
              {meeting.bodySlot === NO_TARGET ? (en ? 'Emergency meeting' : 'Экстренное собрание') : (en ? 'Body reported' : 'Найдено тело')}
            </div>
            <div style={{ fontSize: 16, color: '#e8f0ff', fontFamily: 'sans-serif', fontWeight: 700 }}>
              {meeting.bodySlot === NO_TARGET
                ? `${playerName(meeting.reporterSlot)} ${en ? 'called an emergency meeting' : 'вызвал экстренное собрание'}`
                : `${playerName(meeting.reporterSlot)} ${en ? 'reported' : 'нашёл тело'} ${playerName(meeting.bodySlot)}`}
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
              {inDiscussion ? (en ? 'Discussion' : 'Обсуждение') : (en ? 'Voting' : 'Голосование')}
            </div>
          </div>

          {amIDead && (
            <div style={{
              color: 'rgba(200,220,255,0.6)', fontSize: 12, fontFamily: 'sans-serif', marginBottom: 12,
            }}>
              👻 {en ? 'You are dead — spectating' : 'Вы мертвы — наблюдаете'}
            </div>
          )}

          {!amIDead && (
            <div style={{ width: 'min(440px, 94vw)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {inDiscussion && (
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'sans-serif', textAlign: 'center' }}>
                  {en ? 'Voting begins after discussion' : 'Голосование начнётся после обсуждения'}
                </div>
              )}
              <div aria-live="polite" style={{
                display: 'flex', flexDirection: 'column', gap: 5, padding: 10,
                height: 150, overflowY: 'auto', borderRadius: 10,
                background: 'rgba(25,35,48,0.88)', border: '1px solid rgba(120,160,200,0.2)',
                textAlign: 'left',
              }}>
                {meetingMessages.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.4, textAlign: 'center', margin: 'auto' }}>{en ? 'Meeting chat' : 'Чат обсуждения'}</div>
                )}
                {meetingMessages.map((message, i) => (
                  <div key={`${message.receivedAt}-${message.slot}-${i}`} style={{
                    fontSize: 13, lineHeight: 1.35, overflowWrap: 'anywhere', color: '#e6f2ff',
                  }}>
                    <strong style={{ color: message.slot === mySlot ? '#70dfc1' : '#ffd166' }}>{playerName(message.slot)}:</strong> {message.text}
                  </div>
                ))}
              </div>
              <form onSubmit={e => {
                e.preventDefault();
                if (!chatDraft.trim()) return;
                sendMeetingChat(chatDraft);
                setChatDraft('');
              }} style={{ display: 'flex', gap: 8 }}>
                <input
                  aria-label={en ? 'Meeting message' : 'Сообщение в обсуждении'}
                  value={chatDraft}
                  onChange={e => setChatDraft(e.target.value)}
                  maxLength={200}
                  placeholder={en ? 'Write a message…' : 'Написать сообщение…'}
                  style={{
                    flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 9,
                    color: '#fff', background: '#172230', border: '1px solid rgba(130,180,220,0.35)',
                    fontSize: 14, outline: 'none',
                  }}
                />
                <button type="submit" disabled={!chatDraft.trim()} style={{
                  padding: '0 16px', borderRadius: 9, color: '#071015', background: '#70dfc1',
                  border: 0, fontWeight: 900, opacity: chatDraft.trim() ? 1 : 0.4,
                  touchAction: 'manipulation',
                }}>➤</button>
              </form>
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
                    onClick={() => { haptic.tap(); sfx('uiSelect', 0.3); castVote(p.slot); }}
                    style={{
                      padding: '10px 14px', borderRadius: 8, textAlign: 'left',
                      background: hasVoted ? 'rgba(30,40,55,0.6)' : 'rgba(30,40,55,0.9)',
                      color: hasVoted ? 'rgba(255,255,255,0.35)' : '#fff',
                      border: '1px solid rgba(120,160,200,0.25)', fontFamily: 'sans-serif', fontSize: 14,
                      cursor: hasVoted ? 'default' : 'pointer',
                    }}
                  >
                    {p.slot === mySlot ? `${p.username} (${en ? 'you' : 'вы'})` : p.username}
                  </button>
                ))}
              <button
                disabled={hasVoted}
                onClick={() => { haptic.tap(); sfx('uiSelect', 0.3); castVote(NO_TARGET); }}
                style={{
                  padding: '10px 14px', borderRadius: 8, textAlign: 'center', fontWeight: 700,
                  background: hasVoted ? 'rgba(60,60,60,0.4)' : 'rgba(60,60,60,0.75)',
                  color: hasVoted ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(150,150,150,0.25)', fontFamily: 'sans-serif', fontSize: 14,
                  cursor: hasVoted ? 'default' : 'pointer',
                }}
              >
                {en ? 'Skip' : 'Пропустить'}
              </button>
              {hasVoted && (
                <div style={{ textAlign: 'center', color: 'rgba(150,220,150,0.85)', fontSize: 12, marginTop: 2 }}>
                  {en ? 'Vote cast — waiting for others…' : 'Голос отдан — ждём других…'}
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
              haptic.success();
              sfx('taskComplete', 0.58);
              completeTaskStep(activeTaskId, stepIndex);
              // If this was the last step, close the panel
              if (stepIndex + 1 >= def.steps) setActiveTaskId(null);
              // Otherwise keep open — key change will remount for next step
            }}
            onClose={() => setActiveTaskId(null)}
          />
        );
      })()}

      {/* ── Game over overlay (Phase 6) — Among Gas styled ──────────────────── */}
      {voteResult?.winner && (() => {
        const isImpWin = voteResult.winner === 'impostors';
        const accent   = isImpWin ? '#ff3344' : '#4dcdff';
        const outline  = '-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,-4px 0 0 #000,4px 0 0 #000,0 -4px 0 #000,0 4px 0 #000';
        const glow     = isImpWin
          ? ',0 0 40px rgba(255,50,50,0.8),0 0 80px rgba(255,50,50,0.3)'
          : ',0 0 40px rgba(60,180,255,0.8),0 0 80px rgba(60,180,255,0.3)';
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 70,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: isImpWin
              ? 'radial-gradient(ellipse at 50% 40%, #5a0000 0%, #1a0000 60%, #000 100%)'
              : 'radial-gradient(ellipse at 50% 40%, #001850 0%, #000d28 60%, #000 100%)',
            padding: '0 28px',
          }}>
            {/* КОНЕЦ ИГРЫ label */}
            <p style={{
              fontFamily: "'Fredoka One', sans-serif",
              fontSize: 12, color: 'rgba(255,255,255,0.38)',
              letterSpacing: '0.35em', textTransform: 'uppercase', marginBottom: 20,
            }}>
              {en ? 'Game over' : 'Конец игры'}
            </p>

            {/* Character row */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
              {players.map(p => (
                <CharSpriteUI
                  key={p.slot}
                  color={slotColor(p.slot)}
                  pose={deadSlots.includes(p.slot) ? 'ghost' : 'idle'}
                  size={50}
                  flipped={p.slot % 2 === 0}
                />
              ))}
            </div>

            {/* Winner title */}
            <div style={{
              fontFamily: "'Fredoka One', sans-serif",
              fontSize: 52, color: accent, letterSpacing: '0.04em',
              textShadow: outline + glow,
              textAlign: 'center', lineHeight: 1.1, marginBottom: 36,
              whiteSpace: 'pre-line',
            }}>
              {isImpWin ? (en ? 'IMPOSTORS\nWIN' : 'ПРЕДАТЕЛИ\nПОБЕДИЛИ') : (en ? 'CREWMATES\nWIN' : 'ЭКИПАЖ\nПОБЕДИЛ')}
            </div>

            {/* В ЛОББИ button — Among Gas pill style */}
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'flex', alignItems: 'stretch',
                width: '100%', maxWidth: 260, minHeight: 60,
                borderRadius: 8, border: '2.5px solid rgba(0,0,0,0.5)',
                boxShadow: isImpWin ? '0 7px 0 #6b0000' : '0 7px 0 #00316b',
                overflow: 'hidden', cursor: 'pointer', padding: 0, background: 'none',
                transition: 'transform 0.08s, box-shadow 0.08s',
              }}
              onMouseDown={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(6px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = isImpWin ? '0 1px 0 #6b0000' : '0 1px 0 #00316b';
              }}
              onMouseUp={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = '';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = isImpWin ? '0 7px 0 #6b0000' : '0 7px 0 #00316b';
              }}
            >
              <div style={{
                width: 60, flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: isImpWin ? '#aa2233' : '#225599',
                borderRight: '2px solid rgba(0,0,0,0.22)', fontSize: 22,
              }}>🚪</div>
              <div style={{
                flex: 1, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: isImpWin ? '#cc2244' : '#2266cc',
                backgroundImage: 'repeating-linear-gradient(-55deg, transparent 0px, transparent 12px, rgba(255,255,255,0.08) 12px, rgba(255,255,255,0.08) 22px)',
                fontFamily: "'Fredoka One', sans-serif",
                fontSize: 20, color: 'white',
                textShadow: '0 2px 5px rgba(0,0,0,0.5)',
                letterSpacing: '0.08em',
              }}>
                {en ? 'TO LOBBY' : 'В ЛОББИ'}
              </div>
            </button>
          </div>
        );
      })()}

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
          👻 {en ? 'You are dead — ghost mode' : 'Вы мертвы — режим призрака'}
        </div>
      )}

      {/* ── Role reveal overlay (Phase 4) — Among Gas styled ────────────────── */}
      {showReveal && myRole && (() => {
        const isImp  = myRole === 'impostor';
        const accent = isImp ? '#ff3344' : '#4dcdff';
        const outline = '-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,-4px 0 0 #000,4px 0 0 #000,0 -4px 0 #000,0 4px 0 #000';
        const glow    = isImp
          ? ',0 0 40px rgba(255,50,50,0.8),0 0 80px rgba(255,50,50,0.3)'
          : ',0 0 40px rgba(60,180,255,0.8),0 0 80px rgba(60,180,255,0.3)';
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: isImp
              ? 'radial-gradient(ellipse at 50% 40%, #5a0000 0%, #1a0000 60%, #000 100%)'
              : 'radial-gradient(ellipse at 50% 40%, #001850 0%, #000d28 60%, #000 100%)',
            animation: isMockReveal ? 'none' : 'rrFade 3.2s ease forwards',
            pointerEvents: 'none',
          }}>
            <div style={{
              textAlign: 'center', padding: '0 32px',
              animation: isMockReveal ? 'none' : 'rrScale 3.2s ease forwards',
            }}>
              {/* ВАША РОЛЬ label */}
              <p style={{
                fontFamily: "'Fredoka One', sans-serif",
                fontSize: 12, color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.35em', textTransform: 'uppercase',
                marginBottom: 28,
              }}>
                {en ? 'Your role' : 'Ваша роль'}
              </p>

              {/* Large character sprite */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
                <CharSpriteUI
                  color={isImp ? 'maroon' : 'teal'}
                  pose={isImp ? 'mask' : 'idle'}
                  size={170}
                />
              </div>

              {/* Role name */}
              <div style={{
                fontFamily: "'Fredoka One', sans-serif",
                fontSize: 56, color: accent, letterSpacing: '0.04em',
                textShadow: outline + glow,
                marginBottom: 20,
              }}>
                {isImp ? (en ? 'IMPOSTOR' : 'ПРЕДАТЕЛЬ') : (en ? 'CREWMATE' : 'ЭКИПАЖНИК')}
              </div>

              {/* Fellow impostors */}
              {isImp && impostorSlots.filter(s => s !== mySlot).length > 0 && (
                <div style={{
                  fontFamily: "'Fredoka One', sans-serif",
                  fontSize: 16, color: 'rgba(255,150,150,0.85)',
                  letterSpacing: '0.06em',
                }}>
                  {impostorSlots.filter(s => s !== mySlot).length > 1 ? (en ? 'Teammates' : 'Сообщники') : (en ? 'Teammate' : 'Сообщник')}:{' '}
                  {impostorSlots
                    .filter(s => s !== mySlot)
                    .map(s => players.find(p => p.slot === s)?.username ?? `Slot ${s}`)
                    .join(', ')}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
