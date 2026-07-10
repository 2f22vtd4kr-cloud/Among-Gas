/**
 * GameContext — shared multiplayer state & socket actions
 *
 * Phase 2: WebSocket lifecycle, lobby state (room code, players, host).
 * Phase 3: Remote player positions via 0xFF delta sync, sendMove() action,
 *   game-start via 0x12, phase transition on 0x1A role reveal.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  fromWire, MAP_W, MAP_H, KILL_COOLDOWN_MS,
  MEETING_DISCUSSION_MS, MEETING_VOTING_MS, NO_TARGET,
} from '@workspace/shared/coords';
import {
  SABOTAGE_LIGHTS, SABOTAGE_COOLDOWN_MS,
} from '@workspace/shared/sabotage';
import { PLAYER_SPAWN } from '../game/player';
import { haptic } from '../lib/haptics';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LobbyPlayer {
  slot: number;
  username: string;
}

/** Remote player position in pixel space (updated by 0xFF packets). */
export interface RemotePlayer {
  slot: number;
  /** Pixel X (sprite centre). */
  x: number;
  /** Pixel Y (sprite centre). */
  y: number;
}

export type GamePhase = 'connecting' | 'lobby' | 'playing' | 'error';

export type PlayerRole = 'crewmate' | 'impostor';

/**
 * Active meeting (Phase 6 — GAME_SPEC.md §6/§9). Set on the 0x1B receipt,
 * cleared on 0x1C. Timing is client-mirrored from `startedAtMs` using the
 * same MEETING_DISCUSSION_MS/MEETING_VOTING_MS constants the server uses to
 * gate votes, so the countdown UI lines up with server enforcement.
 */
export interface MeetingInfo {
  reporterSlot: number;
  /** NO_TARGET (0xFF) = emergency button, no specific body. */
  bodySlot: number;
  /** performance.now()-style client timestamp when 0x1B was received. */
  startedAtMs: number;
}

/** Result of the most recently concluded meeting or kill-triggered game end. */
export interface VoteResultInfo {
  /** NO_TARGET (0xFF) if no one was ejected. */
  ejectedSlot: number;
  winner: 'crewmates' | 'impostors' | null;
}

/**
 * A task assigned to this crewmate (Phase 7 — GAME_SPEC.md §10).
 * `completedSteps` is incremented optimistically on the client when the player
 * finishes a minigame step; the server is authoritative for global progress.
 */
export interface MyTask {
  taskId: number;
  completedSteps: number;
}

/**
 * Active sabotage (Phase 8 — GAME_SPEC.md §10). Set on 0x16 sub 0x01 receipt,
 * cleared on sub 0x03. `startedAtMs` is mirrored client-side (same pattern as
 * MeetingInfo) to drive the countdown UI against SABOTAGE_COUNTDOWN_MS.
 * `fixedPads` tracks which pad indices have already been fixed, for the
 * two-pad O2/Reactor systems' progress UI.
 */
export interface SabotageInfo {
  systemId: number;
  startedAtMs: number;
  fixedPads: number[];
}

export interface GameState {
  phase: GamePhase;
  mySlot: number | null;
  roomCode: string | null;
  hostSlot: number;
  players: LobbyPlayer[];
  errorMessage: string | null;
  /** Set by the server's 0x1A packet at game start. Never trust other clients. */
  myRole: PlayerRole | null;
  /** Fellow impostor slots — only populated when myRole === 'impostor'. */
  impostorSlots: number[];
  /** Slots killed or ejected this game. Reset on role reveal. */
  deadSlots: number[];
  /** Impostor-only kill cooldown countdown, ms. 0 = ready to kill. Client-side display estimate. */
  killCooldownMs: number;
  /** Non-null while a meeting (discussion or voting) is in progress. */
  meeting: MeetingInfo | null;
  /** True once this client has cast its vote for the current meeting. */
  hasVoted: boolean;
  /** Non-null right after a meeting concludes or a kill ends the game — drives the result/game-over overlay. */
  voteResult: VoteResultInfo | null;
  /** Crewmate's assigned tasks (empty for impostors, populated by 0x1D packet). */
  myTasks: MyTask[];
  /** Global task completion 0–100 (broadcast by server on each step completion). */
  globalTaskProgress: number;
  /** Non-null while a sabotage is active (Phase 8). */
  sabotage: SabotageInfo | null;
  /** Impostor-only sabotage cooldown countdown, ms. 0 = ready to sabotage. Client-side display estimate. */
  sabotageCooldownMs: number;
}

export interface GameActions {
  createRoom: () => void;
  joinRoom: (code: string) => void;
  startGame: () => void;
  /** Send a 0x11 Move Intent packet (wire coords 0–32000). */
  sendMove: (wireX: number, wireY: number) => void;
  /** Send a 0x15 sub 0x01 Kill RPC (impostor only; server re-validates). */
  sendKill: (victimSlot: number) => void;
  /** Send a 0x13 Report Body packet for a specific dead slot. */
  reportBody: (bodySlot: number) => void;
  /** Send a 0x13 Report packet with bodySlot = NO_TARGET (emergency button). */
  callEmergencyMeeting: () => void;
  /** Send a 0x14 Vote packet (targetSlot = NO_TARGET to skip). */
  castVote: (targetSlot: number) => void;
  /** Dismiss the vote-result overlay after a meeting concludes without ending the game. */
  clearVoteResult: () => void;
  /**
   * Mark a minigame step as done (Phase 7). Optimistically updates local task
   * progress and sends [0x15, 0x03, taskId, stepIndex] to the server.
   */
  completeTaskStep: (taskId: number, stepIndex: number) => void;
  /** Send a 0x15 sub 0x04 Sabotage RPC (impostor only; server re-validates). */
  triggerSabotage: (systemId: number) => void;
  /** Send a 0x15 sub 0x05 Repair RPC (crewmate only; server re-validates proximity). */
  repairSabotage: (systemId: number, padId: number) => void;
}

const DEFAULT_STATE: GameState = {
  phase: 'connecting',
  mySlot: null,
  roomCode: null,
  hostSlot: 0,
  players: [],
  errorMessage: null,
  myRole: null,
  impostorSlots: [],
  deadSlots: [],
  killCooldownMs: 0,
  meeting: null,
  hasVoted: false,
  voteResult: null,
  myTasks: [],
  globalTaskProgress: 0,
  sabotage: null,
  sabotageCooldownMs: 0,
};

// ── Contexts ─────────────────────────────────────────────────────────────────

const GameStateCtx = createContext<GameState>(DEFAULT_STATE);
const GameActionsCtx = createContext<GameActions>({
  createRoom: () => {},
  joinRoom: () => {},
  startGame: () => {},
  sendMove: () => {},
  sendKill: () => {},
  reportBody: () => {},
  callEmergencyMeeting: () => {},
  castVote: () => {},
  clearVoteResult: () => {},
  completeTaskStep: () => {},
  triggerSabotage: () => {},
  repairSabotage: () => {},
});

/** Mutable ref holding the latest remote-player positions (slot → RemotePlayer).
 *  Updated by 0xFF packets; read by the rAF loop in GameMap without triggering re-renders. */
const GameRemotePlayersCtx = createContext<React.RefObject<Map<number, RemotePlayer>>>(
  { current: new Map() },
);

/** Mutable ref holding a pending server position correction for the local player.
 *  Set by the 0xFF handler when the server disagrees with local position.
 *  Cleared by the rAF loop after applying. */
const GameCorrectionCtx = createContext<React.RefObject<{ x: number; y: number } | null>>(
  { current: null },
);

export function useGameState(): GameState {
  return useContext(GameStateCtx);
}

export function useGameActions(): GameActions {
  return useContext(GameActionsCtx);
}

/** Returns a stable ref to the remote players map — safe to read inside rAF. */
export function useRemotePlayersRef(): React.RefObject<Map<number, RemotePlayer>> {
  return useContext(GameRemotePlayersCtx);
}

/** Returns a stable ref to the pending server correction ({x,y} or null). */
export function useCorrectionRef(): React.RefObject<{ x: number; y: number } | null> {
  return useContext(GameCorrectionCtx);
}

// ── Dev-only mock states (screenshot / visual QA harness) ──────────────────
//
// Navigate to `?mock=<key>` in dev to force the app into a specific visual
// state without a real WebSocket connection — lets us screenshot every
// screen on demand instead of always landing on the lobby. DEV-gated so it
// can never affect production builds.

const MOCK_PLAYERS_ROOM: LobbyPlayer[] = [
  { slot: 0, username: 'HostPlayer' },
  { slot: 1, username: 'DevPlayer' },
  { slot: 2, username: 'Guest99' },
];

const MOCK_PLAYERS_GAME: LobbyPlayer[] = [
  { slot: 0, username: 'DevPlayer' },
  { slot: 1, username: 'Blitz' },
  { slot: 2, username: 'Nova' },
  { slot: 3, username: 'Quill' },
];

/** Remote positions (pixel space) scattered near the mock local player, for `playing` mocks. */
const MOCK_REMOTE_POSITIONS: RemotePlayer[] = [
  { slot: 1, x: MAP_W / 2 + 120, y: MAP_H / 2 - 40 },
  { slot: 2, x: MAP_W / 2 - 90, y: MAP_H / 2 + 60 },
  { slot: 3, x: MAP_W / 2 + 30, y: MAP_H / 2 + 140 },
];

interface MockPreset {
  state: Partial<GameState>;
  remotePlayers?: RemotePlayer[];
}

const MOCK_PRESETS: Record<string, MockPreset> = {
  connecting: { state: { phase: 'connecting' } },
  error: { state: { phase: 'error', errorMessage: 'Room not found' } },
  'lobby-empty': {
    state: { phase: 'lobby', mySlot: 0, hostSlot: 0, roomCode: null, players: [] },
  },
  'lobby-host': {
    state: {
      phase: 'lobby', mySlot: 0, hostSlot: 0, roomCode: 'XYZ789',
      players: [{ slot: 0, username: 'DevPlayer' }, { slot: 1, username: 'Alice' }],
    },
  },
  'lobby-solo': {
    state: {
      phase: 'lobby', mySlot: 0, hostSlot: 0, roomCode: 'SOLO01',
      players: [{ slot: 0, username: 'DevPlayer' }],
    },
  },
  'lobby-guest': {
    state: {
      phase: 'lobby', mySlot: 1, hostSlot: 0, roomCode: 'ABC123',
      players: MOCK_PLAYERS_ROOM,
    },
  },
  'reveal-crewmate': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [],
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  'reveal-impostor': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'impostor', impostorSlots: [0, 2],
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  playing: {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: null, impostorSlots: [],
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 5 — kill mechanics: impostor, cooldown ready, a crewmate in range to kill.
  'kill-ready': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'impostor', impostorSlots: [0], killCooldownMs: 0,
    },
    remotePlayers: [
      { slot: 1, x: MAP_W / 2 + 20, y: MAP_H / 2 + 6 }, // in kill range
      { slot: 2, x: MAP_W / 2 - 90, y: MAP_H / 2 + 60 },
      { slot: 3, x: MAP_W / 2 + 30, y: MAP_H / 2 + 140 },
    ],
  },
  // Phase 5 — ghost mode: this client has been killed, sees the "You are dead" state.
  ghost: {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [], deadSlots: [0],
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 7 — crewmate with tasks assigned; task progress bar visible.
  'task-playing': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [],
      myTasks: [
        { taskId: 0, completedSteps: 0 },
        { taskId: 2, completedSteps: 1 },
      ],
      globalTaskProgress: 30,
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 6 — a dead body is nearby, report prompt should appear.
  // Positioned relative to PLAYER_SPAWN (not MAP_W/2, unlike MOCK_REMOTE_POSITIONS
  // above) since the local player's real physics position starts at spawn, and
  // the report-proximity check reads the live playerStateRef, not a mock override.
  'report-ready': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [], deadSlots: [1],
    },
    remotePlayers: [
      { slot: 1, x: PLAYER_SPAWN.x + 20, y: PLAYER_SPAWN.y + 6 }, // in report range
      { slot: 2, x: PLAYER_SPAWN.x - 90, y: PLAYER_SPAWN.y + 60 },
      { slot: 3, x: PLAYER_SPAWN.x + 30, y: PLAYER_SPAWN.y + 140 },
    ],
  },
  // Phase 6 — meeting just started, discussion window (no voting yet).
  'meeting-discussion': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [], deadSlots: [1],
      meeting: { reporterSlot: 2, bodySlot: 1, startedAtMs: Date.now() },
      hasVoted: false,
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 6 — voting window open (discussion timer already elapsed).
  'meeting-voting': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [], deadSlots: [1],
      meeting: { reporterSlot: 2, bodySlot: NO_TARGET, startedAtMs: Date.now() - MEETING_DISCUSSION_MS - 1000 },
      hasVoted: false,
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 6 — meeting concluded, someone was ejected, game continues.
  'meeting-result': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [], deadSlots: [1, 3],
      meeting: null, voteResult: { ejectedSlot: 3, winner: null },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 6 — game over: crewmates win.
  'gameover-crew': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [], deadSlots: [1],
      meeting: null, voteResult: { ejectedSlot: 1, winner: 'crewmates' },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 6 — game over: impostors win.
  'gameover-impostor': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'impostor', impostorSlots: [0], deadSlots: [1, 2],
      meeting: null, voteResult: { ejectedSlot: NO_TARGET, winner: 'impostors' },
    },
    remotePlayers: [
      { slot: 2, x: MAP_W / 2 - 90, y: MAP_H / 2 + 60 },
      { slot: 3, x: MAP_W / 2 + 30, y: MAP_H / 2 + 140 },
    ],
  },
  // Phase 8 — impostor, sabotage cooldown ready, can open the sabotage panel.
  'sabotage-ready': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'impostor', impostorSlots: [0], killCooldownMs: 0, sabotageCooldownMs: 0,
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 8 — Lights sabotage active, crewmate view: fog-of-war vision reduced to 15%.
  'sabotage-lights': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [],
      sabotage: { systemId: SABOTAGE_LIGHTS, startedAtMs: Date.now(), fixedPads: [] },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 8 — O2 sabotage active, crewmate view: one of two pads already fixed.
  'sabotage-o2': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [],
      sabotage: { systemId: 0x02, startedAtMs: Date.now(), fixedPads: [0] },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
};

/** Returns the requested dev mock preset, or null if none/invalid/prod. */
function getMockPreset(): MockPreset | null {
  if (!import.meta.env.DEV) return null;
  const key = new URLSearchParams(window.location.search).get('mock');
  if (!key) return null;
  const preset = MOCK_PRESETS[key];
  if (!preset) {
    console.warn(`[mock] Unknown ?mock=${key}. Valid keys: ${Object.keys(MOCK_PRESETS).join(', ')}`);
    return null;
  }
  return preset;
}

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/ws`;
}

function getInitData(): string {
  const twa = (window as any).Telegram?.WebApp;
  if (twa?.initData) return twa.initData;
  return JSON.stringify({ id: (Date.now() % 90000) + 10000, username: 'DevPlayer' });
}

/**
 * Parse 0x10 0x03 room update packet into lobby state.
 *
 * Layout:
 *   [0x10, 0x03, playerCount, hostSlot, ...6-byte roomCode, (slot, usernameLen, ...username) × N]
 */
function parseRoomUpdate(
  view: DataView,
): { playerCount: number; hostSlot: number; roomCode: string; players: LobbyPlayer[] } | null {
  if (view.byteLength < 2 + 1 + 1 + 6) return null;

  const playerCount = view.getUint8(2);
  const hostSlot = view.getUint8(3);

  const codeBytes = new Uint8Array(view.buffer, view.byteOffset + 4, 6);
  const roomCode = String.fromCharCode(...codeBytes);

  let off = 10; // 2 + 1 + 1 + 6
  const players: LobbyPlayer[] = [];
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < playerCount; i++) {
    if (off + 2 > view.byteLength) break;
    const slot = view.getUint8(off++);
    const nameLen = view.getUint8(off++);
    if (off + nameLen > view.byteLength) break;
    const username = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + off, nameLen));
    off += nameLen;
    players.push({ slot, username });
  }

  return { playerCount, hostSlot, roomCode, players };
}

/**
 * Parse 0xFF delta sync packet and update the remote players map.
 *
 * Layout:
 *   Byte 0:   0xFF
 *   Byte 1:   N (player count)
 *   [× N]:  slot(Uint8) + X(Int16LE) + Y(Int16LE)
 */
function applyDeltaPacket(
  view: DataView,
  mySlot: number | null,
  remotePlayersMap: Map<number, RemotePlayer>,
  onCorrection: (x: number, y: number) => void,
): void {
  if (view.byteLength < 2) return;
  const count = view.getUint8(1);
  let off = 2;

  for (let i = 0; i < count; i++) {
    if (off + 5 > view.byteLength) break;
    const slot = view.getUint8(off++);
    const wireX = view.getInt16(off, true); off += 2;
    const wireY = view.getInt16(off, true); off += 2;

    const x = fromWire(wireX, MAP_W);
    const y = fromWire(wireY, MAP_H);

    if (slot === mySlot) {
      // Server correction for our own position (wall clip rejection).
      // The snap threshold (~5 wire units ≈ 0.5px) avoids jitter from
      // floating-point round-trip differences.
      onCorrection(x, y);
    } else {
      remotePlayersMap.set(slot, { slot, x, y });
    }
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(DEFAULT_STATE);
  const socketRef = useRef<WebSocket | null>(null);

  // mySlot / myRole in refs so WS callbacks don't have stale-closure workarounds
  const mySlotRef = useRef<number | null>(null);
  const myRoleRef = useRef<PlayerRole | null>(null);

  // Remote player positions — updated every 40ms, never triggers re-renders
  const remotePlayersRef = useRef<Map<number, RemotePlayer>>(new Map());

  // Pending server correction for local player — read & cleared by GameMap's rAF loop
  const correctionRef = useRef<{ x: number; y: number } | null>(null);

  const send = useCallback((buf: Uint8Array | number[]) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    }
  }, []);

  const createRoom = useCallback(() => { send([0x10, 0x01]); }, [send]);

  const joinRoom = useCallback((code: string) => {
    const codeUpper = code.toUpperCase().slice(0, 6).padEnd(6, ' ');
    const buf = new Uint8Array(8);
    buf[0] = 0x10; buf[1] = 0x02;
    const codeBytes = new TextEncoder().encode(codeUpper);
    buf.set(codeBytes.slice(0, 6), 2);
    send(buf);
  }, [send]);

  const startGame = useCallback(() => {
    send([0x12]);
  }, [send]);

  const sendMove = useCallback((wireX: number, wireY: number) => {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x11);
    view.setInt16(1, wireX, true); // Little-Endian
    view.setInt16(3, wireY, true);
    send(buf);
  }, [send]);

  const sendKill = useCallback((victimSlot: number) => {
    send([0x15, 0x01, victimSlot]);
  }, [send]);

  const reportBody = useCallback((bodySlot: number) => {
    send([0x13, bodySlot]);
  }, [send]);

  const callEmergencyMeeting = useCallback(() => {
    send([0x13, NO_TARGET]);
  }, [send]);

  const castVote = useCallback((targetSlot: number) => {
    setState(s => (s.hasVoted ? s : { ...s, hasVoted: true }));
    send([0x14, targetSlot]);
  }, [send]);

  const clearVoteResult = useCallback(() => {
    setState(s => ({ ...s, voteResult: null }));
  }, []);

  const completeTaskStep = useCallback((taskId: number, stepIndex: number) => {
    // Always send — server validates proximity/role/order and rejects if invalid.
    send([0x15, 0x03, taskId, stepIndex]);
    // Optimistic update: only advance local completedSteps if the game is still
    // in a valid state. This prevents desync when a meeting races with completion.
    setState(s => {
      if (s.meeting !== null) return s; // meeting started concurrently; server will reject
      if (mySlotRef.current !== null && s.deadSlots.includes(mySlotRef.current)) return s;
      return {
        ...s,
        myTasks: s.myTasks.map(t =>
          t.taskId === taskId
            ? { ...t, completedSteps: Math.max(t.completedSteps, stepIndex + 1) }
            : t
        ),
      };
    });
  }, [send]);

  const triggerSabotage = useCallback((systemId: number) => {
    send([0x15, 0x04, systemId]);
  }, [send]);

  const repairSabotage = useCallback((systemId: number, padId: number) => {
    send([0x15, 0x05, systemId, padId]);
  }, [send]);

  useEffect(() => {
    // ── Dev mock mode: skip the real socket, force a fixed visual state ────
    const mock = getMockPreset();
    if (mock) {
      if (mock.remotePlayers) {
        remotePlayersRef.current = new Map(mock.remotePlayers.map(rp => [rp.slot, rp]));
      }
      setState(s => ({ ...s, ...mock.state }));
      console.log(`[mock] Forced state:`, mock.state);
      return () => {};
    }

    const ws = new WebSocket(getWsUrl());
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(new TextEncoder().encode(getInitData()));
    };

    ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 1) return;
      const view = new DataView(event.data);
      const opcode = view.getUint8(0);

      // ── 0x00: auth failure ──────────────────────────────────────────────
      if (opcode === 0x00) {
        setState(s => ({ ...s, phase: 'error', errorMessage: 'Authentication failed' }));
        return;
      }

      // ── 0x01: handshake ACK ─────────────────────────────────────────────
      if (opcode === 0x01 && event.data.byteLength >= 2) {
        const slot = view.getUint8(1);
        mySlotRef.current = slot;
        setState(s => ({ ...s, phase: 'lobby', mySlot: slot }));
        console.log(`[WS] ✅ handshake OK — assigned slot ${slot}`);
        return;
      }

      // ── 0x10: lobby control ─────────────────────────────────────────────
      if (opcode === 0x10 && event.data.byteLength >= 2) {
        const sub = view.getUint8(1);

        // 0x03: room update
        if (sub === 0x03) {
          const parsed = parseRoomUpdate(view);
          if (!parsed) return;
          setState(s => ({
            ...s,
            roomCode: parsed.roomCode,
            hostSlot: parsed.hostSlot,
            players: parsed.players,
            errorMessage: null,
          }));
          // Prune remote players that are no longer in the room.
          // This prevents departed players from rendering as ghost circles.
          const activeSlots = new Set(parsed.players.map(p => p.slot));
          const mySlot = mySlotRef.current;
          for (const slot of remotePlayersRef.current.keys()) {
            if (!activeSlots.has(slot) || slot === mySlot) {
              remotePlayersRef.current.delete(slot);
            }
          }
          return;
        }

        // 0x04: join error
        if (sub === 0x04 && event.data.byteLength >= 3) {
          const errCode = view.getUint8(2);
          const messages: Record<number, string> = {
            0x01: 'Room not found',
            0x02: 'Game already in progress',
            0x03: 'Room is full',
          };
          setState(s => ({ ...s, errorMessage: messages[errCode] ?? 'Unknown error' }));
          return;
        }

        // 0x05: authoritative slot assignment
        if (sub === 0x05 && event.data.byteLength >= 3) {
          const slot = view.getUint8(2);
          mySlotRef.current = slot;
          setState(s => ({ ...s, mySlot: slot }));
          return;
        }
      }

      // ── 0x1A: role reveal → transition to playing ───────────────────────
      // Crewmate: [0x1A, 0x00]
      // Impostor: [0x1A, 0x01, impostorCount, slot_0, slot_1, ...]
      if (opcode === 0x1A && event.data.byteLength >= 2) {
        const roleByte = view.getUint8(1);
        const myRole: PlayerRole = roleByte === 1 ? 'impostor' : 'crewmate';
        // Keep ref in sync so win/loss haptic in 0x1C can read role without stale closure.
        myRoleRef.current = myRole;
        // Haptic: impostor reveal is a warning; crewmate reveal is a success pulse.
        if (myRole === 'impostor') haptic.warning(); else haptic.success();

        const impostorSlots: number[] = [];
        if (roleByte === 1 && event.data.byteLength >= 3) {
          const count = view.getUint8(2);
          for (let i = 0; i < count && 3 + i < event.data.byteLength; i++) {
            impostorSlots.push(view.getUint8(3 + i));
          }
        }

        // Clear stale remote player data from the previous session
        remotePlayersRef.current.clear();
        // Cooldown starts ready (0) at game start — the 25s cooldown applies
        // only after a kill, not before the impostor's first one.
        setState(s => ({
          ...s, phase: 'playing', myRole, impostorSlots,
          deadSlots: [],
          killCooldownMs: 0,
          meeting: null,
          hasVoted: false,
          voteResult: null,
          myTasks: [],
          globalTaskProgress: 0,
          sabotage: null,
          sabotageCooldownMs: 0,
        }));
        console.log(`[WS] 🎮 Role reveal received — role=${myRole}`);
        return;
      }

      // ── 0xFF: delta sync — update remote player positions ───────────────
      if (opcode === 0xFF) {
        applyDeltaPacket(
          view,
          mySlotRef.current,
          remotePlayersRef.current,
          (x, y) => { correctionRef.current = { x, y }; },
        );
        return;
      }

      // ── 0x15: RPC event ──────────────────────────────────────────────────
      if (opcode === 0x15 && event.data.byteLength >= 2) {
        const sub = view.getUint8(1);

        // 0x01 — Kill broadcast: [0x15, 0x01, victimSlot, attackerSlot]
        if (sub === 0x01 && event.data.byteLength >= 3) {
          const victimSlot = view.getUint8(2);
          const attackerSlot = event.data.byteLength >= 4 ? view.getUint8(3) : null;
            // Haptics gated inside the functional updater so replayed broadcast
          // packets don't retrigger after the victim is already in deadSlots.
          setState(s => {
            if (s.deadSlots.includes(victimSlot)) return s;
            // I was killed — strong error pulse.
            if (victimSlot === mySlotRef.current) haptic.kill();
            // I executed the kill — medium confirmation pulse.
            else if (attackerSlot === mySlotRef.current) haptic.medium();
            return {
              ...s,
              deadSlots: [...s.deadSlots, victimSlot],
              killCooldownMs: attackerSlot === mySlotRef.current
                ? KILL_COOLDOWN_MS
                : s.killCooldownMs,
            };
          });
          return;
        }

        // 0x03 — Task progress broadcast (S→C, 3 bytes): [0x15, 0x03, progressPercent]
        // Phase 7: server broadcasts updated global task completion after each step.
        // 3-byte length distinguishes this from C→S task-step (4 bytes).
        if (sub === 0x03 && event.data.byteLength === 3) {
          const percent = view.getUint8(2);
          setState(s => ({ ...s, globalTaskProgress: percent }));
          return;
        }

        return;
      }

      // ── 0x16: sabotage control (Phase 8, GAME_SPEC.md §10) ──────────────
      // sub 0x01 — Started: [0x16, 0x01, systemId, attackerSlot]
      // sub 0x02 — Pad fixed (progress): [0x16, 0x02, systemId, padId]
      // sub 0x03 — Fixed / cleared: [0x16, 0x03, systemId]
      if (opcode === 0x16 && event.data.byteLength >= 3) {
        const sub = view.getUint8(1);
        const systemId = view.getUint8(2);

        if (sub === 0x01) {
          const attackerSlot = event.data.byteLength >= 4 ? view.getUint8(3) : null;
          haptic.warning();
          setState(s => ({
            ...s,
            sabotage: { systemId, startedAtMs: Date.now(), fixedPads: [] },
            // Only the triggering client resets its own cooldown UI.
            sabotageCooldownMs: attackerSlot === mySlotRef.current
              ? SABOTAGE_COOLDOWN_MS
              : s.sabotageCooldownMs,
          }));
          return;
        }

        if (sub === 0x02 && event.data.byteLength >= 4) {
          const padId = view.getUint8(3);
          setState(s => (
            !s.sabotage || s.sabotage.systemId !== systemId || s.sabotage.fixedPads.includes(padId)
              ? s
              : { ...s, sabotage: { ...s.sabotage, fixedPads: [...s.sabotage.fixedPads, padId] } }
          ));
          return;
        }

        if (sub === 0x03) {
          haptic.success();
          setState(s => (s.sabotage?.systemId === systemId ? { ...s, sabotage: null } : s));
          return;
        }

        return;
      }

      // ── 0x1D: task assignment (S→C, crewmates only) ─────────────────────
      // Phase 7: layout [0x1D, taskCount, taskId_0, taskId_1, ...]
      if (opcode === 0x1D && event.data.byteLength >= 2) {
        const taskCount = view.getUint8(1);
        const taskIds: number[] = [];
        for (let i = 0; i < taskCount && 2 + i < event.data.byteLength; i++) {
          taskIds.push(view.getUint8(2 + i));
        }
        setState(s => ({
          ...s,
          myTasks: taskIds.map(id => ({ taskId: id, completedSteps: 0 })),
        }));
        console.log(`[WS] 📋 Tasks assigned: [${taskIds.join(', ')}]`);
        return;
      }

      // ── 0x1B: meeting start ──────────────────────────────────────────────
      // Layout: [0x1B, reporterSlot, bodySlot]
      if (opcode === 0x1B && event.data.byteLength >= 3) {
        const reporterSlot = view.getUint8(1);
        const bodySlot = view.getUint8(2);
        setState(s => {
          // Ignore duplicate 0x1B while a meeting is already active — prevents
          // a network replay from resetting the countdown, hasVoted flag, and haptic.
          if (s.meeting !== null) return s;
          haptic.meeting(); // first receipt only
          return {
            ...s,
            meeting: { reporterSlot, bodySlot, startedAtMs: Date.now() },
            hasVoted: false,
            voteResult: null,
          };
        });
        return;
      }

      // ── 0x1C: vote result / eject (also used for a kill-triggered end) ──
      // Layout: [0x1C, ejectedSlot, winFlag]  (winFlag: 0 none, 1 crew, 2 impostor)
      if (opcode === 0x1C && event.data.byteLength >= 3) {
        const ejectedSlot = view.getUint8(1);
        const winByte = view.getUint8(2);
        const winner: 'crewmates' | 'impostors' | null =
          winByte === 1 ? 'crewmates' : winByte === 2 ? 'impostors' : null;
        // Haptic: success on a local win, warning on a local loss.
        if (winner) {
          const localWon = (winner === 'crewmates' && myRoleRef.current === 'crewmate') ||
                           (winner === 'impostors' && myRoleRef.current === 'impostor');
          if (localWon) haptic.success(); else haptic.warning();
        }

        setState(s => ({
          ...s,
          meeting: null,
          deadSlots: ejectedSlot !== NO_TARGET && !s.deadSlots.includes(ejectedSlot)
            ? [...s.deadSlots, ejectedSlot]
            : s.deadSlots,
          voteResult: { ejectedSlot, winner },
        }));
        return;
      }

      return;
    };

    ws.onclose = () => {
      setState(s => ({
        ...s,
        phase: s.phase === 'lobby' || s.phase === 'connecting' ? 'error' : s.phase,
        errorMessage: s.errorMessage ?? 'Connection lost',
      }));
    };

    ws.onerror = () => {
      setState(s => ({ ...s, phase: 'error', errorMessage: 'WebSocket error' }));
    };

    return () => ws.close();
  }, []); // socket is created once

  // Client-side kill cooldown countdown display (server is authoritative for
  // the actual kill validation; this just drives the impostor's UI timer).
  useEffect(() => {
    if (state.phase !== 'playing' || state.myRole !== 'impostor') return;
    if (state.killCooldownMs <= 0) return;
    const id = setInterval(() => {
      setState(s => ({ ...s, killCooldownMs: Math.max(0, s.killCooldownMs - 250) }));
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, state.myRole, state.killCooldownMs > 0]);

  // Client-side sabotage cooldown countdown display (server is authoritative
  // for the actual trigger validation; this just drives the impostor's UI timer).
  useEffect(() => {
    if (state.phase !== 'playing' || state.myRole !== 'impostor') return;
    if (state.sabotageCooldownMs <= 0) return;
    const id = setInterval(() => {
      setState(s => ({ ...s, sabotageCooldownMs: Math.max(0, s.sabotageCooldownMs - 250) }));
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, state.myRole, state.sabotageCooldownMs > 0]);

  const actions: GameActions = {
    createRoom, joinRoom, startGame, sendMove, sendKill,
    reportBody, callEmergencyMeeting, castVote, clearVoteResult,
    completeTaskStep, triggerSabotage, repairSabotage,
  };

  return (
    <GameStateCtx.Provider value={state}>
      <GameActionsCtx.Provider value={actions}>
        <GameRemotePlayersCtx.Provider value={remotePlayersRef}>
          <GameCorrectionCtx.Provider value={correctionRef}>
            {children}
          </GameCorrectionCtx.Provider>
        </GameRemotePlayersCtx.Provider>
      </GameActionsCtx.Provider>
    </GameStateCtx.Provider>
  );
}
