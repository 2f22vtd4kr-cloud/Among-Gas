import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { haptic } from '../lib/haptics';
import { sfx, unlockSfx } from '../lib/sfx';
import {
  buildPreciseCollisionGrid,
  isPlayerPositionWalkable,
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
  CHARACTER_CELL_WIDTH,
  CHARACTER_CELL_HEIGHT,
  getCharacterFrameRect,
  type CharacterPose,
} from '../game/characterSprites';
import { loadCharacterAtlas } from '../game/characterAtlas';
import { clipCharacterLegGap } from '../game/characterSpriteRenderer';
import { clearMovementInput } from '../game/gameInput';
import { useGameMapMovementInput } from '../game/useGameMapMovementInput';
import {
  getCharacterShadowScale,
  getCharacterWalkBobOffset,
} from '../game/characterAnimation';
import Joystick from '../components/Joystick';
import { Link } from 'wouter';
import type { MeetingChatMessage } from '../context/GameContext';

import {
  useGameState,
  useGameActions,
  useRemotePlayersRef,
  useCorrectionRef,
} from '@/context/GameContext';
import {
  toWire,
  fromWire,
  FEET_OFFSET_Y,
  KILL_COOLDOWN_MS,
  NO_TARGET,
  MEETING_DISCUSSION_MS,
  MEETING_VOTING_MS,
} from '@workspace/shared/coords';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import { isLineOfSightClear, isLineOfSightToInteractionTarget } from '@workspace/shared/collisionMap';
import {
  SABOTAGE_DEFS,
  SABOTAGE_INTERACTION_RANGE_PX,
  SABOTAGE_COMMS,
  SABOTAGE_DOORS,
  getSabotageTimeoutMs,
  type SabotageSystemId,
} from '@workspace/shared/sabotage';
import { VENT_DEFS, VENT_INTERACTION_RANGE_PX, findVent } from '@workspace/shared/vents';
import { buildFineShadowSegments, buildNarrowShadowOccluders, buildShadowGrid, computeVisibilityPolygon, smoothVisibilityPolygon } from '../game/visibility';
import { ADMIN_TABLE_DEFS, ADMIN_TABLE_INTERACTION_RANGE_PX } from '@workspace/shared/adminTable';
import TaskMinigame from '../components/TaskMinigame';
import SettingsDialog from '../components/SettingsDialog';
import GameTopHud from '../components/GameTopHud';
import { useLanguage } from '../lib/language';
import { customControlPositionStyle, useGameSettings } from '../lib/gameSettings';
import { classifyMovementEcho } from '../game/movementReconciliation';
import { mapWorldRectToImagePixels } from '@workspace/shared/mapImageTransform';
import { TiledMap } from '../game/TiledMap';
import { drawMapBaseLayer } from '../game/mapBaseLayer';
import { drawVisionFogOverlay } from '../game/mapVisionRenderer';
import { drawWorldMarkers } from '../game/mapMarkerRenderer';
import { drawWorldDetails } from '../game/mapWorldDetailsRenderer';
import { drawRemotePlayerAppearance } from '../game/mapRemotePlayerRenderer';
import { drawLocalPlayerAppearance } from '../game/mapLocalPlayerRenderer';
import { getCharacterGhostMotion } from '../game/characterGhostMotion';
import { getPlayerVisionRadius } from '../game/mapVisionPolicy';
import { getLocalPlayerCanvasPosition, getRemotePlayerCanvasPosition } from '../game/mapPlayerCanvasPosition';
import { stepRemotePlayerAnimation, type RemotePlayerAnimationState } from '../game/remotePlayerAnimation';
import { MapCameraController } from '../game/mapCamera';
import { getUseActionKind, isUseActionEnabled } from '../game/gameActionState';
import GameActionBar from '../components/GameActionBar';
import GameSabotageControls from '../components/GameSabotageControls';
import GameAdminTable from '../components/GameAdminTable';
import { buildAdminTableAgents } from '../game/adminTableAgents';
import TaskListPanel from '../components/TaskListPanel';
import { EmergencyCallIcon } from '../components/EmergencyMeetingArtwork';
import EmergencyCallSplash from '../components/EmergencyCallSplash';
import MeetingChatPanel from '../components/MeetingChatPanel';
import MeetingVotingPanel from '../components/MeetingVotingPanel';
import KillAnimationOverlay from '../components/KillAnimationOverlay';
import GameOverOverlay from '../components/GameOverOverlay';
import RoleRevealOverlay from '../components/RoleRevealOverlay';
import { sabotageRu, slotColor, taskRu } from '../game/mapPresentation';

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

// Character canvas rendering is isolated in game/characterSpriteRenderer.tsx.

function getTaskInteractionMockTaskId(mode: string | null): number | null {
  if (mode === 'task-interaction') return 4;
  if (mode === 'task-interaction-blocked' || mode === 'task-interaction-ghost-blocked') return 7;
  if (mode !== 'task-interaction-gallery') return null;

  const rawTaskId = new URLSearchParams(window.location.search).get('taskId');
  if (rawTaskId === null || !/^[0-9]+$/.test(rawTaskId)) {
    throw new Error('Minigame gallery requires a numeric taskId query parameter');
  }
  const taskId = Number(rawTaskId);
  if (!Number.isSafeInteger(taskId) || !TASK_DEFS.some(task => task.id === taskId)) {
    throw new Error(`Minigame gallery taskId ${rawTaskId} is not in the canonical TASK_DEFS registry`);
  }
  return taskId;
}

export default function GameMap() {
  const taskInteractionGrid = useMemo(() => buildPreciseCollisionGrid(), []);
  const { language } = useLanguage();
  const { joystickSide, controlLayout } = useGameSettings();
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);
  const en = language === 'en';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapImgRef    = useRef<HTMLImageElement | null>(null);
  const tiledMapRef  = useRef<TiledMap | null>(null);
  const spriteImgRef = useRef<CanvasImageSource | null>(null);
  /** Per-slot animation state for remote players, maintained across rAF frames. */
  const remoteAnimMapRef = useRef<Map<number, RemotePlayerAnimationState>>(new Map());

  const [loaded,       setLoaded]       = useState(false);
  const [error,        setError]        = useState(false);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const leaveDialogRef = useRef<HTMLElement>(null);
  const leaveCancelRef = useRef<HTMLButtonElement>(null);
  const leaveFocusReturnRef = useRef<HTMLElement | null>(null);
  const mapDialogRef = useRef<HTMLDivElement>(null);
  const mapCloseRef = useRef<HTMLButtonElement>(null);
  const mapFocusReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!leaveConfirmOpen) return;
    leaveFocusReturnRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    leaveCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLeaveConfirmOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = leaveDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !leaveDialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !leaveDialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const previous = leaveFocusReturnRef.current;
      if (previous?.isConnected) previous.focus();
    };
  }, [leaveConfirmOpen]);

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
    phase, mySlot, players, myRole, impostorSlots, deadSlots, killCooldownMs, gameplayReady,
    meeting, hasVoted, voteResult, myTasks, globalTaskProgress,
    sabotage, sabotageCooldownMs, myVentId, meetingMessages, emergencyMeetingUsed, groqApiKeyConfigured, corpsePositions, lastKill,
  } = useGameState();
  const {
    sendKill, reportBody, callEmergencyMeeting, castVote, clearVoteResult, completeTaskStep, markGameplayReady, setGroqApiKey,
    triggerSabotage, repairSabotage,
    enterVent, travelVent, exitVent, sendMeetingChat,
  } = useGameActions();

  const [killAnimation, setKillAnimation] = useState<ReturnType<typeof useGameState>['lastKill']>(null);
  const killAnimationOpenRef = useRef(killAnimation !== null);
  killAnimationOpenRef.current = killAnimation !== null;
  useEffect(() => {
    if (!lastKill) return undefined;
    // Victims see the blocking death sequence; attackers keep playing.
    if (lastKill.victimSlot === mySlot) {
      setKillAnimation(lastKill);
      sfx('kill', 0.72);
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const timer = window.setTimeout(() => setKillAnimation(null), reducedMotion ? 150 : 1700);
      return () => window.clearTimeout(timer);
    }
    if (lastKill.attackerSlot === mySlot) {
      // The attacker already played the cue on the trusted Kill-button
      // gesture; do not replay it when the authoritative event returns.
      return;
    }

    // The server broadcasts kill events to the whole lobby. Give nearby
    // bystanders an audible cue too, without leaking kills across the map.
    const local = playerStateRef.current;
    const attacker = lastKill.attackerSlot === null ? undefined : remotePlayersRef.current.get(lastKill.attackerSlot);
    const victim = lastKill.victimSlot === null ? undefined : remotePlayersRef.current.get(lastKill.victimSlot);
    const hearingRange = 520;
    const nearby = [attacker, victim].some(player => player &&
      Math.hypot(player.x - local.x, player.y - local.y) <= hearingRange);
    if (nearby) sfx('kill', 0.34);
    return undefined;
  }, [lastKill, mySlot, remotePlayersRef]);

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
  const gameOverOpenRef = useRef(Boolean(voteResult?.winner));
  gameOverOpenRef.current = Boolean(voteResult?.winner);

  const [emergencyCallStatus, setEmergencyCallStatus] = useState<'calling' | 'confirmed' | 'failed' | null>(null);
  const emergencyCallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousMeetingRef = useRef(meeting);
  useEffect(() => {
    const previousMeeting = previousMeetingRef.current;
    previousMeetingRef.current = meeting;
    if (previousMeeting || !meeting || meeting.bodySlot !== NO_TARGET) return;
    if (emergencyCallTimerRef.current) clearTimeout(emergencyCallTimerRef.current);
    setEmergencyCallStatus('confirmed');
    emergencyCallTimerRef.current = setTimeout(() => setEmergencyCallStatus(null), 2200);
  }, [meeting]);
  useEffect(() => () => {
    if (emergencyCallTimerRef.current) clearTimeout(emergencyCallTimerRef.current);
  }, []);

  const [showSabotagePanel, setShowSabotagePanel] = useState(false);
  const sabotagePanelOpenRef = useRef(showSabotagePanel);
  sabotagePanelOpenRef.current = showSabotagePanel;
  const [showAdminTable, setShowAdminTable] = useState(false);
  const [, setAdminTableTick] = useState(0);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [miniMapTick, setMiniMapTick] = useState(0);
  const [showTaskList, setShowTaskList] = useState(false);
  const [trackedTaskId, setTrackedTaskId] = useState<number | null>(null);
  const miniMapOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const leaveConfirmOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  leaveConfirmOpenRef.current = leaveConfirmOpen;
  useEffect(() => {
    miniMapOpenRef.current = showMiniMap;
    // Prevent the keyboard and joystick from moving the player behind the modal.
    clearMovementInput(keysRef.current);
    pendingSentRef.current.length = 0;
  }, [showMiniMap]);

  useEffect(() => {
    if (!showMiniMap) return;
    mapFocusReturnRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    mapCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowMiniMap(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = mapDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !mapDialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !mapDialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const previous = mapFocusReturnRef.current;
      if (previous?.isConnected) previous.focus();
    };
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
        const hasLineOfSight = isLineOfSightToInteractionTarget(
          taskInteractionGrid,
          myPos.x, myPos.y + FEET_OFFSET_Y,
          pad.x, pad.y + FEET_OFFSET_Y,
          24,
        );
        if (distSq <= bestDistSq && hasLineOfSight) {
          best = { systemId: active.systemId, padId };
          bestDistSq = distSq;
        }
      });
      setNearestRepairPad(best);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amIDead, amIImpostor, sabotage, taskInteractionGrid]);

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
        const hasLineOfSight = isLineOfSightClear(
          taskInteractionGrid,
          myPos.x, myPos.y + FEET_OFFSET_Y,
          body.x, body.y + FEET_OFFSET_Y,
        );
        if (distSq <= bestDistSq && hasLineOfSight) { best = body.slot; bestDistSq = distSq; }
      }
      setNearestBody(best);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amIDead, meeting, taskInteractionGrid]);

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
        const hasLineOfSight = isLineOfSightClear(
          taskInteractionGrid,
          myPos.x, myPos.y + FEET_OFFSET_Y,
          rp.x, rp.y + FEET_OFFSET_Y,
        );
        if (distSq <= bestDistSq && hasLineOfSight) { best = rp.slot; bestDistSq = distSq; }
      }
      setNearestTarget(best);
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amIImpostor, amIDead, taskInteractionGrid]);

  // ── Task system (Phase 7) ─────────────────────────────────────────────────
  // Mirror myTasks into a ref so the rAF loop can read it without closure issues.
  const myTasksRef = useRef(myTasks);
  useEffect(() => { myTasksRef.current = myTasks; }, [myTasks]);
  const trackedTaskIdRef = useRef<number | null>(trackedTaskId);
  useEffect(() => { trackedTaskIdRef.current = trackedTaskId; }, [trackedTaskId]);

  /** Closest in-range incomplete task (null when nothing is nearby). */
  const [nearestTask, setNearestTask] = useState<{ taskId: number; stepIndex: number } | null>(null);
  // Mirrors the actionable task into the canvas loop so it can suppress the
  // duplicate map marker while the matching fixed-position action button is shown.
  const nearestTaskRef = useRef<number | null>(null);
  /** Which task minigame is currently open (null = none). */
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const activeTaskOpenRef = useRef(activeTaskId !== null);
  activeTaskOpenRef.current = activeTaskId !== null;

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

  // Close an in-progress minigame on the transition into death; once dead,
  // ghosts may reopen their assigned tasks and keep contributing to the bar.
  const wasDeadRef = useRef(amIDead);
  useEffect(() => {
    const justDied = amIDead && !wasDeadRef.current;
    wasDeadRef.current = amIDead;
    const activeTaskLocked = activeTaskId !== null &&
      (sabotage?.systemId === SABOTAGE_COMMS ||
       (sabotage?.systemId === SABOTAGE_DOORS && sabotage.lockedTaskIds.includes(activeTaskId)));
    if (meeting !== null || justDied || myRole !== 'crewmate' || voteResult?.winner || activeTaskLocked) setActiveTaskId(null);
  }, [meeting, amIDead, myRole, voteResult?.winner, sabotage, activeTaskId]);

  useEffect(() => {
    const taskMockMode = new URLSearchParams(window.location.search).get('mock');
    const taskMockTaskId = import.meta.env.VITE_ENABLE_GAME_MOCKS === 'true'
      ? getTaskInteractionMockTaskId(taskMockMode)
      : null;
    const taskMockActive = taskMockTaskId !== null;
    if (taskMockActive) {
      (window as Window & { __AG_TASK_DEBUG?: unknown }).__AG_TASK_DEBUG = {
        stage: 'proximity-effect-start',
        role: myRole,
        meeting,
        sabotage,
        assignedTasks: myTasks,
        player: playerStateRef.current,
      };
    }
    if (meeting !== null || myRole !== 'crewmate' ||
        sabotage?.systemId === SABOTAGE_COMMS) {
      nearestTaskRef.current = null;
      setNearestTask(null);
      return;
    }
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
        // Ghosts intentionally keep through-wall task access on both client and server.
        const hasLineOfSight = amIDead || isLineOfSightToInteractionTarget(
          taskInteractionGrid,
          myPos.x,
          myPos.y + FEET_OFFSET_Y,
          def.x,
          def.y + FEET_OFFSET_Y,
          def.interactionTargetRadiusPx ?? 24,
        );
        if (distSq <= bestDistSq && hasLineOfSight) {
          best = { taskId: t.taskId, stepIndex: t.completedSteps };
          bestDistSq = distSq;
        }
      }
      nearestTaskRef.current = best?.taskId ?? null;
      setNearestTask(best);
      if (taskMockActive) {
        const fixtureTask = TASK_DEFS.find(task => task.id === taskMockTaskId);
        (window as Window & { __AG_TASK_DEBUG?: unknown }).__AG_TASK_DEBUG = {
          role: myRole,
          isGhost: amIDead,
          meeting: meeting !== null,
          assignedTasks: myTasksRef.current,
          player: { x: myPos.x, y: myPos.y },
          target: fixtureTask ? { x: fixtureTask.x, y: fixtureTask.y } : null,
          distance: fixtureTask ? Math.hypot(fixtureTask.x - myPos.x, fixtureTask.y - myPos.y) : null,
          range: TASK_INTERACTION_RANGE_PX,
          best,
        };
      }
    }, 150);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting, myRole, sabotage, amIDead, taskInteractionGrid]);

  // Living players may use the custom-map Admin Table when they stand at its console.
  // The proximity check is only client-side UI; the table itself reads replicated player
  // coordinates and never exposes roles or the hidden vent occupant.
  const [nearestAdminTableId, setNearestAdminTableId] = useState<number | null>(null);
  const adminTableOpenRef = useRef(false);
  useEffect(() => {
    adminTableOpenRef.current = showAdminTable;
    clearMovementInput(keysRef.current);
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
  const mockQuery = new URLSearchParams(window.location.search);
  const isMockReveal = import.meta.env.DEV && mockQuery.get('mock')?.startsWith('reveal-');
  // Visual fixtures can skip the role overlay so screenshots of later events
  // (e.g. a kill sequence) do not get obscured by an unrelated opening screen.
  const skipMockReveal = import.meta.env.VITE_ENABLE_GAME_MOCKS === 'true'
    && mockQuery.get('skipReveal') === 'true';
  const [showReveal, setShowReveal] = useState(false);
  useEffect(() => {
    if (!myRole) return;
    // Clear stale remote animation state so sprites animate fresh from spawns.
    remoteAnimMapRef.current.clear();
    if (skipMockReveal) {
      setShowReveal(false);
      return;
    }
    setShowReveal(true);
    sfx('roundStart', 0.75);
    if (isMockReveal) return;
    const timer = setTimeout(() => setShowReveal(false), 3200);
    return () => clearTimeout(timer);
  }, [myRole, isMockReveal, skipMockReveal]);

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
      @keyframes rrCharacterBob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      @keyframes rrShadowPulse {
        0%, 100% { transform: scaleX(1); opacity: 0.68; }
        50% { transform: scaleX(0.72); opacity: 0.5; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ag-role-reveal-character, .ag-role-reveal-shadow { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // ── Resize canvas ────────────────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = getRenderDpr();
    // The document element represents the stable layout viewport; visualViewport
    // can shrink and grow as mobile browser/Telegram chrome animates.
    const w = document.documentElement.clientWidth || window.innerWidth;
    const h = document.documentElement.clientHeight || window.innerHeight;
    const pixelWidth = Math.round(w * dpr);
    const pixelHeight = Math.round(h * dpr);
    // A backing-store resize clears the buffer. Avoid touching it when dimensions
    // did not change and ignore visualViewport toolbar-animation events: only
    // the layout viewport/orientation should change the camera's visible frame.
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${w}px`) canvas.style.width = `${w}px`;
    if (canvas.style.height !== `${h}px`) canvas.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    sizeCanvas();
    let timeoutId: number | undefined;
    const handleResize = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(sizeCanvas, 120);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [sizeCanvas]);

  // ── Load canonical overview and optional viewport map tiles ───────────────
  useEffect(() => {
    let cancelled = false;
    let loadedTiledMap: TiledMap | null = null;
    const overview = new Image();
    overview.decoding = 'async';
    const overviewPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const decode = async () => {
        try {
          if (typeof overview.decode === 'function') await overview.decode();
          if (overview.naturalWidth <= 0 || overview.naturalHeight <= 0) {
            throw new Error('Map overview decoded with empty dimensions');
          }
          resolve(overview);
        } catch (error) {
          reject(error);
        }
      };
      overview.onload = () => { void decode(); };
      overview.onerror = () => reject(new Error('Failed to load canonical map overview'));
      overview.src = `${import.meta.env.BASE_URL}map-overview.webp`;
      if (overview.complete && overview.naturalWidth > 0) void decode();
    });

    const variant = new URLSearchParams(window.location.search).get('map-art') === 'sharp'
      ? 'map-tiles-sharp/'
      : 'map-tiles/';
    void overviewPromise.then(async image => {
      let tiledMap: TiledMap | null = null;
      try {
        const maxResidentTiles = window.matchMedia('(max-width: 767px)').matches ? 6 : 12;
        tiledMap = await TiledMap.load(`${import.meta.env.BASE_URL}${variant}`, maxResidentTiles);
      } catch (tileError) {
        // The overview remains a complete playable fallback if optional tiles fail.
        if (import.meta.env.DEV) console.warn('Map detail tiles unavailable; using overview fallback', tileError);
      }
      if (cancelled) {
        tiledMap?.dispose();
        return;
      }
      loadedTiledMap = tiledMap;
      mapImgRef.current = image;
      tiledMapRef.current = tiledMap;
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) setError(true);
    });

    return () => {
      cancelled = true;
      overview.onload = null;
      overview.onerror = null;
      loadedTiledMap?.dispose();
      if (tiledMapRef.current === loadedTiledMap) tiledMapRef.current = null;
      if (mapImgRef.current === overview) mapImgRef.current = null;
    };
  }, []);

  // Do not let bots or other players act against this client while its
  // map-loading screen is still visible. The server starts gameplay only
  // after every connected human client acknowledges both decoded assets.
  const gameplayReadySentRef = useRef(false);
  useEffect(() => {
    if (phase !== 'playing' || myRole === null) {
      gameplayReadySentRef.current = false;
      return;
    }
    if (!loaded || !spriteLoaded || gameplayReadySentRef.current) return;
    gameplayReadySentRef.current = true;
    markGameplayReady();
  }, [phase, myRole, loaded, spriteLoaded, markGameplayReady]);

  // ── Load the authored atlas and expand its suit palettes once ────────────
  useEffect(() => {
    let cancelled = false;
    void loadCharacterAtlas(import.meta.env.BASE_URL).then(atlas => {
      if (cancelled) return;
      spriteImgRef.current = atlas;
      if (import.meta.env.DEV) {
        (window as Window & { __AG_CHARACTER_ATLAS?: HTMLCanvasElement }).__AG_CHARACTER_ATLAS = atlas;
      }
      setSpriteLoaded(true);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Track held movement keys ──────────────────────────────────────────────
  const keysRef = useRef<Set<string>>(new Set());
  const gameplayReadyRef = useRef(gameplayReady);
  useEffect(() => {
    gameplayReadyRef.current = gameplayReady;
    if (!gameplayReady) {
      clearMovementInput(keysRef.current);
      pendingSentRef.current.length = 0;
    }
  }, [gameplayReady]);
  useEffect(() => {
    if (!settingsOpen) return;
    clearMovementInput(keysRef.current);
    pendingSentRef.current.length = 0;
  }, [settingsOpen]);
  useEffect(() => {
    if (!leaveConfirmOpen) return;
    clearMovementInput(keysRef.current);
    pendingSentRef.current.length = 0;
  }, [leaveConfirmOpen]);
  useGameMapMovementInput(keysRef, settingsOpenRef, leaveConfirmOpenRef);

  // ── Main rAF render loop ───────────────────────────────────────────────────
  const initialPlayerState = createInitialPlayerState();
  // Task fixture placement is resolved against the real collision grid below.
  // Production state always starts at the shared lobby spawn.
  const playerStateRef = useRef(initialPlayerState);

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
        const hasLineOfSight = isLineOfSightToInteractionTarget(
          taskInteractionGrid,
          myPos.x, myPos.y + FEET_OFFSET_Y,
          vent.x, vent.y + FEET_OFFSET_Y,
          20,
        );
        if (distSq <= bestDistSq && hasLineOfSight) { best = vent.id; bestDistSq = distSq; }
      }
      setNearestVentId(best);
    }, 150);
    return () => clearInterval(id);
  }, [amIImpostor, amIDead, myVentId, meeting, voteResult?.winner, taskInteractionGrid]);


  useEffect(() => {
    if (myVentId !== null) {
      const vent = findVent(myVentId);
      if (vent) playerStateRef.current = { ...playerStateRef.current, x: vent.x, y: vent.y };
    }
    clearMovementInput(keysRef.current);
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
    // Expose the actual render transform only to the opt-in dev camera fixture.
    // Browser QA uses this to distinguish player drift from changing map pixels.
    const cameraDebugEnabled = import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('mock') === 'task-playing';
    const fogCanvas = document.createElement('canvas');
    const fogCtx = fogCanvas.getContext('2d');
    if (!fogCtx) return;

    const grid = taskInteractionGrid;
    const fineGrid = grid;
    const taskMockMode = new URLSearchParams(window.location.search).get('mock');
    const taskMockTaskId = import.meta.env.VITE_ENABLE_GAME_MOCKS === 'true'
      ? getTaskInteractionMockTaskId(taskMockMode)
      : null;
    if (taskMockTaskId !== null) {
      const blockedFixture = taskMockMode === 'task-interaction-blocked' ||
        taskMockMode === 'task-interaction-ghost-blocked';
      const fixtureTask = TASK_DEFS.find(task => task.id === taskMockTaskId);
      if (!fixtureTask) throw new Error(`Task interaction fixture is missing task ${taskMockTaskId}`);
      let nearest: { x: number; y: number; distanceSq: number } | null = null;
      const range = TASK_INTERACTION_RANGE_PX - 8;
      for (let y = fixtureTask.y - range; y <= fixtureTask.y + range; y += 4) {
        for (let x = fixtureTask.x - range; x <= fixtureTask.x + range; x += 4) {
          const dx = fixtureTask.x - x;
          const dy = fixtureTask.y - y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq > range * range || (nearest && distanceSq >= nearest.distanceSq)) continue;
          if (!isPlayerPositionWalkable(fineGrid, x, y)) continue;
          const hasLineOfSight = isLineOfSightToInteractionTarget(
            fineGrid, x, y + FEET_OFFSET_Y,
            fixtureTask.x, fixtureTask.y + FEET_OFFSET_Y,
            fixtureTask.interactionTargetRadiusPx ?? 24,
          );
          if (blockedFixture === hasLineOfSight) continue;
          nearest = { x, y, distanceSq };
        }
      }
      if (!nearest) throw new Error(blockedFixture
        ? 'Occluded task fixture has no walkable in-range position without line of sight'
        : 'Task interaction fixture has no walkable, visible player position within interaction range');
      playerStateRef.current = { ...playerStateRef.current, x: nearest.x, y: nearest.y };
      (window as Window & { __AG_TASK_FIXTURE_POSITION?: unknown }).__AG_TASK_FIXTURE_POSITION = nearest;
    }
    // Player prediction and visual occlusion share the canonical fine grid.
    // Compact geometry remains available to navigation consumers that need A*.
    const shadowGrid = buildShadowGrid(fineGrid);
    const narrowOccluders = buildNarrowShadowOccluders(fineGrid, true);
    const narrowSegments = buildFineShadowSegments(fineGrid);
    if (!isSpawnWalkable(fineGrid)) {
      throw new Error('Unsafe player spawn: the rendered-feet footprint overlaps blocked map geometry');
    }

    let rafId = 0;
    let lastTs: number | null = null;
    /** Timestamp of the last 0x11 sent. */
    let lastMoveSentTs = 0;
    let lastFootstepTs = 0;
    /** Wire-space position at last send (for delta filtering). */
    let lastSentWireX = -1;
    let lastSentWireY = -1;
    const cameraController = new MapCameraController({
      x: playerStateRef.current.x,
      y: playerStateRef.current.y,
    });
    let hasAuthoritativePosition = false;

    const frame = (ts: number) => {
      const dtMs = lastTs === null ? 16 : Math.min(ts - lastTs, 48);
      lastTs = ts;

      // First own-player 0xFF snapshot initializes the server-selected spawn.
      // Later 0xFF snapshots only acknowledge a sent position. Delayed or
      // duplicate snapshots cannot overwrite newer local prediction; only an
      // explicit 0x22 rejection/correction is allowed to snap the player.
      if (correctionRef.current) {
        const incoming = correctionRef.current;
        correctionRef.current = null;
        const pending = pendingSentRef.current;
        const classification = classifyMovementEcho(pending, incoming, hasAuthoritativePosition);
        if (classification.kind === 'initial' || classification.kind === 'correction') {
          const correctedX = fromWire(incoming.wireX, MAP_W);
          const correctedY = fromWire(incoming.wireY, MAP_H);
          playerStateRef.current = { ...playerStateRef.current, x: correctedX, y: correctedY };
          cameraController.snap({ x: correctedX, y: correctedY });
          hasAuthoritativePosition = true;
          pending.length = 0;
        } else if (classification.kind === 'acknowledgement') {
          pending.splice(0, classification.acknowledgedIndex + 1);
        }
      }

      // Step player physics. Dead players (ghosts) walk through walls.
      // Movement freezes entirely during a meeting (server ignores 0x11 too).
      const effectiveKeys = !gameplayReadyRef.current || meetingActiveRef.current || settingsOpenRef.current || leaveConfirmOpenRef.current || myVentRef.current !== null || adminTableOpenRef.current || miniMapOpenRef.current || activeTaskOpenRef.current || sabotagePanelOpenRef.current || killAnimationOpenRef.current || gameOverOpenRef.current
        ? EMPTY_KEYS
        : keysRef.current;
      playerStateRef.current = stepPlayer(
        fineGrid, playerStateRef.current, effectiveKeys, dtMs, deadSlotsRef.current.has(mySlotRef.current ?? -1),
      );
      // Browser task fixtures must remain at their measured collision-grid
      // position. The first authoritative WebSocket spawn can arrive after the
      // fixture setup and otherwise overwrite it before the LOS assertion.
      // This branch is enabled only by the explicit development mock modes.
      if (taskMockTaskId !== null) {
        const fixture = (window as Window & { __AG_TASK_FIXTURE_POSITION?: { x: number; y: number } }).__AG_TASK_FIXTURE_POSITION;
        if (fixture) {
          playerStateRef.current = { ...playerStateRef.current, x: fixture.x, y: fixture.y };
          cameraController.snap({ x: fixture.x, y: fixture.y });
        }
      }
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
      if (gameplayReadyRef.current && sinceLastSend >= MOVE_SEND_INTERVAL_MS) {
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

      // The camera controller owns follow smoothing and viewport state; its pure
      // math helpers keep frame-rate and world-boundary contracts testable.
      const cameraFrame = cameraController.update(
        { x: px, y: py },
        dtMs,
        {
          canvasWidth: cw,
          canvasHeight: ch,
          dpr,
          zoom: ZOOM,
          mapWidth: MAP_W,
          mapHeight: MAP_H,
        },
      );
      const cameraX = cameraFrame.center.x;
      const cameraY = cameraFrame.center.y;
      const viewport = cameraFrame.viewport;
      const { srcX, srcY, srcW, srcH, scale } = viewport;
      // Camera/collision coordinates use canonical world pixels. The loaded
      // PNG and higher-resolution WebP do not share the same source-pixel scale.
      const mapSourceRect = mapWorldRectToImagePixels(
        { x: srcX, y: srcY, width: srcW, height: srcH },
        { width: MAP_W, height: MAP_H },
        { width: mapImg.naturalWidth, height: mapImg.naturalHeight },
      );

      // scale is supplied by getCameraViewport above.
      if (cameraDebugEnabled) {
        (window as Window & { __AG_CAMERA_DEBUG?: unknown }).__AG_CAMERA_DEBUG = {
          playerX: px,
          playerY: py,
          cameraX,
          cameraY,
          screenX: (px - srcX) * scale,
          screenY: (py - srcY) * scale,
          canvasWidth: cw,
          canvasHeight: ch,
          mapImageWidth: mapImg.naturalWidth,
          mapImageHeight: mapImg.naturalHeight,
          mapWorldRect: { x: srcX, y: srcY, width: srcW, height: srcH },
          mapSourceRect,
        };
      }

      // ── 1. Clear + Map ───────────────────────────────────────────────────
      const tiledMap = tiledMapRef.current;
      const tilesReady = drawMapBaseLayer({
        context: ctx,
        canvasWidth: cw,
        canvasHeight: ch,
        mapImage: mapImg,
        mapSourceRect,
        cameraWorldRect: { x: srcX, y: srcY, w: srcW, h: srcH },
        zoom: ZOOM,
        dpr,
        tiledMap,
      });
      if (tiledMap && import.meta.env.DEV) {
        const tileStatus = tiledMap.getStatus();
        (window as Window & { __AG_TILE_DEBUG?: unknown }).__AG_TILE_DEBUG = {
          ...tileStatus,
          overviewDecodedBytes: mapImg.naturalWidth * mapImg.naturalHeight * 4,
          totalDecodedBytes: mapImg.naturalWidth * mapImg.naturalHeight * 4 + tileStatus.decodedBytes,
          ready: tilesReady,
        };
      }

      drawWorldMarkers({
        context: ctx,
        canvasWidth: cw,
        canvasHeight: ch,
        devicePixelRatio: dpr,
        cameraX: srcX,
        cameraY: srcY,
        scale,
        tasks: myTasksRef.current,
        sabotage: sabotageRef.current,
        meetingActive: meetingActiveRef.current,
        nearestTaskId: nearestTaskRef.current,
        trackedTaskId: trackedTaskIdRef.current,
        role: myRoleRef.current,
        translateTaskName: name => taskRu(name, languageRef.current),
        translateSabotageName: name => sabotageRu(name, languageRef.current),
      });

      // Vent positions remain active for proximity-gated controls, but we do not
      // paint synthetic black/white vent glyphs over the illustrated floor.

      // ── 2.9 Static world details (corpses + Admin console) ─────────────
      drawWorldDetails({
        context: ctx,
        canvasWidth: cw,
        canvasHeight: ch,
        cameraX: srcX,
        cameraY: srcY,
        scale,
        devicePixelRatio: dpr,
        sprite,
        corpses: corpsePositionsRef.current,
        playerDisplayWidth: PLAYER_DISPLAY_WIDTH,
        playerDisplayHeight: PLAYER_DISPLAY_HEIGHT,
        getSlotColor: slotColor,
        getFrameRect: getCharacterFrameRect,
        clipCharacter: clipCharacterLegGap,
      });

      // ── 3. Remote players (sprite-sheet rendering, Phase 4) ───────────────
      // Rendered before the local player so local player is always on top.
      const remotePlayers = remotePlayersRef.current;
      const remoteAnims = remoteAnimMapRef.current;
      // Prune animation state for slots that no longer exist
      for (const slot of remoteAnims.keys()) {
        if (!remotePlayers.has(slot)) remoteAnims.delete(slot);
      }
      if (remotePlayers.size > 0) {
        const rBaseSpriteH = Math.round(PLAYER_DISPLAY_HEIGHT * scale);
        const rSpriteW = Math.round(PLAYER_DISPLAY_WIDTH  * scale);

        ctx.save();

        const viewerIsDead = deadSlotsRef.current.has(mySlotRef.current ?? -1);
        for (const rp of remotePlayers.values()) {
          // Vent occupants must disappear completely until they exit.
          if (rp.inVent) continue;
          const rIsGhost = deadSlotsRef.current.has(rp.slot);
          // Living players see the stationary body, not the dead player's moving ghost.
          if (rIsGhost && !viewerIsDead) continue;
          const animationStep = stepRemotePlayerAnimation(
            remoteAnims.get(rp.slot),
            rp.x,
            rp.y,
            ts,
            dtMs,
          );
          const anim = animationStep.state;
          const rMoving = animationStep.moving;
          remoteAnims.set(rp.slot, anim);
          // The atlas contains one dedicated ghost pose, not a walking ghost
          // cycle. Keep that silhouette and animate its body transform rather
          // than swapping in living-player frames that would lose the ghost look.
          const rPose: CharacterPose = rIsGhost
            ? 'ghost'
            : rMoving
              ? Math.floor(anim.animMs / PLAYER_ANIM_INTERVAL_MS) % 2 === 0
                ? 'walk-1'
                : 'walk-2'
              : 'idle';
          const rRect = getCharacterFrameRect(slotColor(rp.slot), rPose);
          const rSpriteH = Math.round(rBaseSpriteH * rRect.height / CHARACTER_CELL_HEIGHT);

          // Shared ghost float/breathing remains draw-only; world position and
          // collision use the untouched authoritative/interpolated coordinates.
          const ghostMotion = getCharacterGhostMotion(ts, rp.slot, rSpriteW, rSpriteH);
          // Living characters visibly bounce on each step. This is draw-only:
          // authoritative coordinates and collision are never modified.
          const rWalkBob = rMoving
            ? getCharacterWalkBobOffset(anim.animMs, rBaseSpriteH)
            : 0;
          const remoteCanvasPosition = getRemotePlayerCanvasPosition({
            worldX: anim.renderX,
            worldY: anim.renderY,
            camera: { sourceX: srcX, sourceY: srcY, scale },
            ghost: rIsGhost,
            ghostMotion,
            walkBobOffset: rWalkBob,
          });
          const rpGroundY = remoteCanvasPosition.groundY;
          const rpCX = remoteCanvasPosition.spriteX;
          const rpCY = remoteCanvasPosition.spriteY;

          // Skip players that are off-screen (with margin)
          if (rpCX < -rSpriteW * 2 || rpCX > cw + rSpriteW * 2) continue;
          if (rpCY < -rSpriteH * 2 || rpCY > ch + rSpriteH * 2) continue;

          // Keep role policy and shadow compression in GameMap; the renderer
          // owns only the canvas appearance pass for this already-positioned player.
          const name = usernamesRef.current.get(rp.slot) ?? `Player ${rp.slot}`;
          const isTeammate = impostorSetRef.current.has(rp.slot);
          const rShadowScale = !rIsGhost && rMoving
            ? getCharacterShadowScale(rWalkBob, rBaseSpriteH)
            : 1;
          drawRemotePlayerAppearance({
            context: ctx,
            sprite,
            frameRect: rRect,
            pose: rPose,
            ghostMotion,
            screenX: rpCX,
            screenY: rpCY,
            groundY: rpGroundY,
            spriteWidth: rSpriteW,
            spriteHeight: rSpriteH,
            facingLeft: anim.facingLeft,
            ghost: rIsGhost,
            devicePixelRatio: dpr,
            shadowScale: rShadowScale,
            name,
            labelColor: rIsGhost
              ? 'rgba(200,220,255,0.55)'
              : isTeammate ? 'rgba(255,80,80,0.95)' : 'rgba(255,255,255,0.9)',
            clipCharacterLegGap,
          });
        }

        ctx.restore();
      }

      // ── 4. Local player sprite ────────────────────────────────────────────
      const spriteH = PLAYER_DISPLAY_HEIGHT * scale;
      const spriteW = PLAYER_DISPLAY_WIDTH  * scale;
      const rect = getCharacterFrameRect(slotColor(mySlotRef.current ?? 0), pose);
      const sH = Math.round(spriteH * rect.height / CHARACTER_CELL_HEIGHT);
      const sW  = Math.round(spriteW);
      const localMoving = pose === 'walk-1' || pose === 'walk-2';
      // Use the same elapsed movement clock as the local walk-1/walk-2 pose
      // selection; RAF wall-clock time can otherwise drift out of phase.
      const localWalkBob = localMoving
        ? getCharacterWalkBobOffset(playerStateRef.current.animElapsedMs, sH)
        : 0;

      // Shared ghost float/breathing is a draw-only transform. GameMap still
      // owns the final screen coordinates, walk bob and all gameplay policy.
      const amIGhostFrame = deadSlotsRef.current.has(mySlotRef.current ?? -1);
      const localSlot = mySlotRef.current ?? 0;
      const localGhostMotion = getCharacterGhostMotion(ts, localSlot, sW, sH);
      const localCanvasPosition = getLocalPlayerCanvasPosition({
        worldX: px,
        worldY: py,
        camera: { sourceX: srcX, sourceY: srcY, scale },
        ghost: amIGhostFrame,
        ghostMotion: localGhostMotion,
        walkBobOffset: localWalkBob,
      });

      const localShadowScale = localMoving
        ? getCharacterShadowScale(localWalkBob, sH)
        : 1;
      drawLocalPlayerAppearance({
        context: ctx,
        sprite,
        frameRect: rect,
        pose,
        ghostMotion: localGhostMotion,
        shadowX: localCanvasPosition.groundX,
        shadowY: localCanvasPosition.groundY,
        spriteX: localCanvasPosition.spriteX,
        spriteY: localCanvasPosition.spriteY,
        spriteWidth: sW,
        spriteHeight: sH,
        facingLeft,
        ghost: amIGhostFrame,
        shadowScale: localShadowScale,
        clipCharacterLegGap,
      });

      // ── 5. Base-game vision + wall shadows ─────────────────────────────────
      // Crewmates and impostors always see only their sight radius. Lights
      // sharply reduces crewmate vision; impostor vision is unchanged. Ghosts
      // can see the entire map and continue tasks, as in the base game.
      const localRole = myRoleRef.current;
      const isLocalGhost = deadSlotsRef.current.has(mySlotRef.current ?? -1);
      const visionRadius = getPlayerVisionRadius(
        localRole,
        isLocalGhost,
        sabotageRef.current?.systemId ?? null,
      );
      if (visionRadius !== null) {
        const visionR = visionRadius * scale;
        const rawVisiblePolygon = computeVisibilityPolygon(px, py, visionRadius, shadowGrid, narrowOccluders, true, narrowSegments);
        // Smooth the visual shadow silhouette across a wider ray window. The helper clamps every smoothed ray to its original hit distance, so it can soften stair-stepped occluders without extending sight through a wall.
        const visiblePolygon = smoothVisibilityPolygon(rawVisiblePolygon, { x: px, y: py }, 6);

        drawVisionFogOverlay({
          context: ctx,
          fogContext: fogCtx,
          fogCanvas,
          canvasWidth: cw,
          canvasHeight: ch,
          cameraX: srcX,
          cameraY: srcY,
          scale,
          playerScreenX: localCanvasPosition.groundX,
          playerScreenY: localCanvasPosition.groundY,
          visionRadiusScreenPx: visionR,
          visiblePolygon,
        });
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [loaded, spriteLoaded, sendMove, remotePlayersRef]);

  const adminTableAgents = showAdminTable ? buildAdminTableAgents({
    players,
    mySlot,
    remotePlayers: remotePlayersRef.current,
    localPosition: playerStateRef.current,
    myVentId,
    deadSlots,
  }) : [];

  const useActionState = {
    hasNearbyTask: nearestTask !== null,
    isCrewmate: myRole === 'crewmate',
    hasNearbyRepairPad: nearestRepairPad !== null,
    isImpostor: amIImpostor,
    hasNearbyVent: nearestVentId !== null,
    isInVent: myVentId !== null,
    hasNearbyAdminTable: nearestAdminTableId !== null,
    hasActiveTask: activeTaskId !== null,
    showAdminTable,
    showMiniMap,
  };
  const useActionKind = getUseActionKind(useActionState);
  const useActionEnabled = isUseActionEnabled(useActionKind, useActionState);

  return (
    <div
      onPointerDown={unlockSfx}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', overscrollBehavior: 'none', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', background: '#3d4e5e' }}
    >
      {killAnimation && (
        <KillAnimationOverlay
          attackerSlot={killAnimation.attackerSlot}
          victimSlot={killAnimation.victimSlot}
          english={en}
        />
      )}
      {(!loaded || !spriteLoaded || !gameplayReady) && !error && (
        <div data-testid="gameplay-loading-screen" style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#8faabb', fontFamily: 'monospace', fontSize: 14, zIndex: 10,
        }}>
          {en ? 'Loading map…' : 'Загрузка карты…'}
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#cc4444', fontFamily: 'monospace', fontSize: 14, zIndex: 10,
        }}>
          {en ? 'Failed to load map.' : 'Не удалось загрузить карту.'}
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          display: 'block', position: 'absolute', top: 0, left: 0,
          opacity: loaded && spriteLoaded && gameplayReady ? 1 : 0,
        }}
      />

      <TaskListPanel
        visible={loaded && myRole === 'crewmate' && meeting === null}
        expanded={showTaskList}
        english={en}
        completedCount={myTasks.filter(task => {
          const def = TASK_DEFS.find(item => item.id === task.taskId);
          return def && task.completedSteps >= def.steps;
        }).length}
        totalCount={myTasks.length}
        commsDisrupted={sabotage?.systemId === SABOTAGE_COMMS}
        tasks={myTasks.flatMap(task => {
          const def = TASK_DEFS.find(item => item.id === task.taskId);
          if (!def) return [];
          const done = task.completedSteps >= def.steps;
          const locked = sabotage?.systemId === SABOTAGE_DOORS && sabotage.lockedTaskIds.includes(task.taskId);
          const tracked = (trackedTaskId ?? myTasks.find(item => {
            const taskDef = TASK_DEFS.find(candidate => candidate.id === item.taskId);
            return taskDef && item.completedSteps < taskDef.steps &&
              !(sabotage?.systemId === SABOTAGE_DOORS && sabotage.lockedTaskIds.includes(item.taskId));
          })?.taskId) === task.taskId;
          return [{
            id: task.taskId,
            name: taskRu(def.name, language),
            completedSteps: Math.min(task.completedSteps, def.steps),
            steps: def.steps,
            done,
            locked,
            tracked,
          }];
        })}
        onToggle={() => {
          haptic.tap();
          setShowTaskList(value => !value);
          setShowMiniMap(false);
          setShowAdminTable(false);
        }}
        onClose={() => setShowTaskList(false)}
        onTrackTask={taskId => {
          haptic.tap();
          setTrackedTaskId(taskId);
        }}
      />



      <GameTopHud
        english={en}
        taskProgress={globalTaskProgress}
        showProgress={loaded && myRole !== null && meeting === null}
        showMap={loaded && myRole !== null && meeting === null}
        mapOpen={showMiniMap}
        showSettings={loaded && meeting === null && !killAnimation && !showMiniMap && !showTaskList && !showAdminTable}
        onToggleMap={() => {
          haptic.tap();
          setShowMiniMap(value => !value);
          if (!showMiniMap) setShowAdminTable(false);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {showMiniMap && loaded && myRole !== null && meeting === null && (
        <div ref={mapDialogRef} data-minimap-tick={miniMapTick} role="dialog" aria-modal="true" aria-label={en ? 'Among Gas map' : 'Карта Among Gas'}
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
              <button ref={mapCloseRef} onClick={() => setShowMiniMap(false)} aria-label={en ? 'Close map' : 'Закрыть карту'} style={{
                width: 40, height: 40, flexShrink: 0, borderRadius: 10, border: '1px solid rgba(130,195,215,0.35)',
                background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 23, fontWeight: 800, touchAction: 'manipulation',
              }}>×</button>
            </div>
            <div style={{
              position: 'relative', width: '100%', aspectRatio: MAP_W / MAP_H,
              overflow: 'hidden', borderRadius: 9, border: '1px solid rgba(120,200,220,0.4)', background: '#13212a',
            }}>
              <img src={`${import.meta.env.BASE_URL}map-overview.webp`} alt={en ? 'Among Gas map' : 'Карта Among Gas'} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none' }} />
              {myRole === 'crewmate' && myTasks.filter(task => {
                const def = TASK_DEFS.find(item => item.id === task.taskId);
                return def !== undefined && task.completedSteps < def.steps;
              }).map(task => {
                const def = TASK_DEFS.find(item => item.id === task.taskId)!;
                return <span key={task.taskId} title={taskRu(def.name, language)} style={{
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

      {loaded && gameplayReady && meeting === null && !settingsOpen && !leaveConfirmOpen && myVentId === null && !showAdminTable && !showMiniMap && activeTaskId === null && !showSabotagePanel && !killAnimation && !voteResult?.winner && <Joystick keysRef={keysRef} />}


      <SettingsDialog
        open={settingsOpen && !killAnimation}
        onClose={() => setSettingsOpen(false)}
        showLeaveMatch={loaded && meeting === null && !killAnimation}
        onLeaveMatch={() => {
          setSettingsOpen(false);
          setLeaveConfirmOpen(true);
        }}
        onGroqApiKeyChange={setGroqApiKey}
        groqApiKeyConfigured={groqApiKeyConfigured}
      />

      {leaveConfirmOpen && !killAnimation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ag-leave-match-title"
          onPointerDown={event => {
            if (event.target === event.currentTarget) setLeaveConfirmOpen(false);
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2200,
            display: 'grid', placeItems: 'center',
            padding: 'max(18px, env(safe-area-inset-top, 0px)) 18px max(18px, env(safe-area-inset-bottom, 0px))',
            background: 'rgba(3,8,13,.78)', backdropFilter: 'blur(8px)',
          }}
        >
          <section
            ref={leaveDialogRef}
            style={{
            width: 'min(100%, 360px)', boxSizing: 'border-box',
            padding: '22px 20px 18px', borderRadius: 20,
            border: '1px solid rgba(255,145,145,.3)',
            background: 'linear-gradient(165deg, #2c1b27 0%, #10151e 100%)',
            boxShadow: '0 24px 70px rgba(0,0,0,.58)', color: '#f7eeee',
            fontFamily: 'system-ui, sans-serif',
          }}>
            <h2 id="ag-leave-match-title" style={{ margin: '0 0 8px', fontSize: 22 }}>
              {en ? 'Leave this match?' : 'Выйти из матча?'}
            </h2>
            <p style={{ margin: '0 0 20px', color: 'rgba(245,225,229,.72)', fontSize: 14, lineHeight: 1.5 }}>
              {en ? 'You will disconnect from the current match and return to the main menu.' : 'Вы отключитесь от текущего матча и вернётесь в главное меню.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button ref={leaveCancelRef} type="button" onClick={() => setLeaveConfirmOpen(false)} style={{
                flex: 1, minHeight: 46, borderRadius: 11,
                border: '1px solid rgba(180,205,214,.28)',
                background: 'rgba(5,15,23,.55)', color: '#eaf4f5',
                fontWeight: 800, touchAction: 'manipulation',
              }}>
                {en ? 'Stay' : 'Остаться'}
              </button>
              <button type="button" onClick={() => {
                window.location.replace(new URL(import.meta.env.BASE_URL, window.location.origin).toString());
              }} style={{
                flex: 1, minHeight: 46, borderRadius: 11,
                border: '1px solid rgba(255,145,145,.5)',
                background: 'linear-gradient(180deg, #c94459, #76223b)', color: '#fff',
                fontWeight: 900, touchAction: 'manipulation',
              }}>
                {en ? 'Leave match' : 'Выйти'}
              </button>
            </div>
          </section>
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
          {import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true' && (
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
              Edit Collision
            </Link>
          )}
        </div>
      )}

      {/* Live room table from the original game, using Among Gas's own map asset. */}
      {showAdminTable && myRole !== null && !amIDead && meeting === null && (
        <GameAdminTable
          agents={adminTableAgents}
          english={en}
          mapImageSrc={`${import.meta.env.BASE_URL}map-overview.webp`}
          onClose={() => setShowAdminTable(false)}
        />
      )}

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

      {/* Persistent Report and Use; Kill remains impostor-only. */}
      {loaded && myRole !== null && (!amIDead || myRole === 'crewmate') && meeting === null && !voteResult?.winner && (
        <GameActionBar
          isImpostor={amIImpostor && !amIDead}
          isGhost={amIDead}
          killCooldownMs={killCooldownMs}
          killCooldownMaxMs={KILL_COOLDOWN_MS}
          killAvailable={!amIDead && nearestTarget !== null && myVentId === null}
          reportAvailable={!amIDead && nearestBody !== null && sabotage === null && myVentId === null}
          useAvailable={useActionEnabled}
          useActionKind={useActionKind}
          english={en}
          positionStyle={customControlPositionStyle('killReport', controlLayout, joystickSide)}
          onKill={() => {
            if (nearestTarget !== null && killCooldownMs <= 0 && myVentId === null) {
              haptic.tap();
              sfx('kill', 0.48);
              sendKill(nearestTarget);
            }
          }}
          onReport={() => {
            if (nearestBody !== null && sabotage === null && myVentId === null) {
              haptic.tap();
              sfx('uiSelect', 0.3);
              reportBody(nearestBody);
            }
          }}
          onUse={() => {
            if (!useActionEnabled) return;
            haptic.tap();
            sfx('uiSelect', 0.3);
            if (useActionKind === 'task' && nearestTask !== null) {
              setActiveTaskId(nearestTask.taskId);
            } else if (useActionKind === 'repair' && nearestRepairPad !== null) {
              repairSabotage(nearestRepairPad.systemId, nearestRepairPad.padId);
            } else if (useActionKind === 'vent' && nearestVentId !== null) {
              enterVent(nearestVentId);
            } else if (useActionKind === 'admin') {
              setShowAdminTable(true);
            }
          }}
        />
      )}
      <GameSabotageControls
        loaded={loaded}
        isDead={amIDead}
        isImpostor={amIImpostor}
        meetingActive={meeting !== null}
        sabotage={sabotage}
        cooldownMs={sabotageCooldownMs}
        remainingMs={sabotageRemainingMs}
        english={en}
        language={language}
        positionStyle={customControlPositionStyle('sabotage', controlLayout, joystickSide)}
        panelOpen={showSabotagePanel}
        onPanelOpen={() => setShowSabotagePanel(true)}
        onPanelClose={() => setShowSabotagePanel(false)}
        onTrigger={triggerSabotage}
      />

      {/* ── Emergency meeting button (Phase 6) ─────────────────────────────── */}
      {loaded && !amIDead && meeting === null && sabotage === null && (
        <div style={{
          position: 'fixed',
          // Place the movable Emergency action below the fixed top HUD, even on narrow phones.
          top: 'max(calc(env(safe-area-inset-top, 0px) + 144px), 25dvh)',
          right: 'max(12px, env(safe-area-inset-right, 0px))',
          zIndex: 35,
          ...customControlPositionStyle('emergency', controlLayout, joystickSide),
        }}>
          <button
            aria-label={emergencyMeetingUsed
              ? (en ? 'Emergency meeting already used' : 'Экстренное собрание уже использовано')
              : (en ? 'Call emergency meeting' : 'Созвать экстренное собрание')}
            disabled={emergencyMeetingUsed}
            onClick={() => {
              if (emergencyMeetingUsed || emergencyCallStatus === 'calling') return;
              haptic.tap();
              sfx('uiSelect', 0.3);
              setEmergencyCallStatus('calling');
              if (emergencyCallTimerRef.current) clearTimeout(emergencyCallTimerRef.current);
              callEmergencyMeeting();
              emergencyCallTimerRef.current = setTimeout(() => {
                setEmergencyCallStatus(current => current === 'calling' ? 'failed' : current);
                emergencyCallTimerRef.current = setTimeout(() => setEmergencyCallStatus(null), 2200);
              }, 4000);
            }}
            style={{
              width: 92, height: 92, padding: 8, borderRadius: '50%',
              display: 'grid', placeItems: 'center',
              background: emergencyMeetingUsed ? 'rgba(55,60,65,0.75)' : 'rgba(160,40,20,0.85)',
              color: emergencyMeetingUsed ? 'rgba(255,255,255,0.35)' : '#ffe4d0',
              border: '1px solid rgba(255,120,80,0.4)', fontFamily: 'sans-serif',
              fontWeight: 800, fontSize: 14, letterSpacing: '0.04em',
              textTransform: 'uppercase', cursor: emergencyMeetingUsed ? 'default' : 'pointer',
              backdropFilter: 'blur(6px)', touchAction: 'manipulation',
            }}
          >
            {emergencyMeetingUsed ? '✓' : <EmergencyCallIcon size={70} />}
          </button>
        </div>
      )}

      {emergencyCallStatus && (
        <EmergencyCallSplash status={emergencyCallStatus} english={en} />
      )}

      {/* ── Ejection / no-ejection banner (Phase 6) ─────────────────────────── */}
      {voteResult && !voteResult.winner && !meeting && (
        <div style={{
          position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 112px)', left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', zIndex: 45,
          background: 'rgba(20,32,44,0.9)', color: '#e8f0ff',
          fontFamily: 'sans-serif', fontSize: 12, fontWeight: 700,
          letterSpacing: '0.03em', borderRadius: 8,
          border: '1px solid rgba(120,180,220,0.3)', backdropFilter: 'blur(6px)',
        }}>
          {voteResult.ejectedSlot === NO_TARGET
            ? (en ? 'Nobody ejected' : 'Никто не исключён')
            : `${playerName(voteResult.ejectedSlot)} ${en ? 'was ejected' : 'исключён'}`}
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
              {en ? 'You are dead — spectating' : 'Вы мертвы — наблюдаете'}
            </div>
          )}

          <MeetingChatPanel
            messages={meetingMessages}
            inDiscussion={inDiscussion}
            isDead={amIDead}
            english={en}
            draft={chatDraft}
            onDraftChange={setChatDraft}
            playerName={playerName}
            onSend={sendMeetingChat}
          />

          {!inDiscussion && !amIDead && (
            <MeetingVotingPanel
              players={players}
              deadSlots={deadSlots}
              hasVoted={hasVoted}
              mySlot={mySlot}
              english={en}
              onVote={slot => { haptic.tap(); sfx('uiSelect', 0.3); castVote(slot); }}
            />
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
      {voteResult?.winner && (
        <GameOverOverlay
          winner={voteResult.winner}
          players={players}
          deadSlots={deadSlots}
          english={en}
        />
      )}

      {/* ── Dead / ghost-mode banner (Phase 5) ────────────────────────────── */}
      {loaded && amIDead && (
        <div style={{
          position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 112px)', left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', zIndex: 25,
          background: 'rgba(20,32,44,0.85)', color: '#a8c8e0',
          fontFamily: 'sans-serif', fontSize: 12, fontWeight: 600,
          letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: 8,
          border: '1px solid rgba(120,180,220,0.3)', backdropFilter: 'blur(6px)',
        }}>
          {en ? 'You are dead — ghost mode' : 'Вы мертвы — режим призрака'}
        </div>
      )}

      {/* ── Role reveal overlay (Phase 4) — Among Gas styled ────────────────── */}
      {showReveal && myRole && !skipMockReveal && (
        <RoleRevealOverlay
          role={myRole}
          english={en}
          mock={Boolean(isMockReveal)}
          impostorSlots={impostorSlots}
          mySlot={mySlot}
          players={players}
        />
      )}
    </div>
  );
}
