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
import { findVent } from '@workspace/shared/vents';
import { PLAYER_SPAWN } from '../game/player';
import { haptic } from '../lib/haptics';
import { readLobbyStartParam, resolveInitialRoomCode } from '../lib/telegramStartParam';

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
  /** Hidden in a vent; the renderer must not draw this player until exit. */
  inVent?: boolean;
}

export interface MeetingChatMessage {
  slot: number;
  text: string;
  receivedAt: number;
}

/** Server-authoritative, immutable dropped body position (not the moving ghost). */
export interface CorpsePosition {
  slot: number;
  x: number;
  y: number;
}

export type GamePhase = 'connecting' | 'lobby' | 'playing' | 'error';

export type GameConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'resuming' | 'offline';

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

/** Authoritative kill event used to trigger the local attacker/victim animation once. */
export interface KillEventInfo {
  victimSlot: number;
  attackerSlot: number | null;
  occurredAtMs: number;
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
  /** Task IDs temporarily locked by the Doors sabotage. */
  lockedTaskIds: number[];
}

export interface GameState {
  phase: GamePhase;
  mySlot: number | null;
  roomCode: string | null;
  hostSlot: number;
  players: LobbyPlayer[];
  errorMessage: string | null;
  /** Transport/session status; gameplay controls remain gated while reconnecting or resuming. */
  connectionStatus: GameConnectionStatus;
  /** Server-confirmed readiness after all connected human clients load assets. */
  gameplayReady: boolean;
  /** Set by the server's 0x1A packet at game start. Never trust other clients. */
  myRole: PlayerRole | null;
  /** Fellow impostor slots — only populated when myRole === 'impostor'. */
  impostorSlots: number[];
  /** Slots killed or ejected this game. Reset on role reveal. */
  deadSlots: number[];
  /** Most recent authoritative kill broadcast, used for the short kill animation. */
  lastKill: KillEventInfo | null;
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
  /** Local player's vent ID, or null while visible on the map. */
  myVentId: number | null;
  /** Messages received during the current discussion phase. */
  meetingMessages: MeetingChatMessage[];
  /** True after the server confirms this player's one emergency call this round. */
  emergencyMeetingUsed: boolean;
  /** Bodies persist at the kill location while ghosts move independently. */
  corpsePositions: CorpsePosition[];
}

export interface GameActions {
  createRoom: () => void;
  /** Create a private solo game pre-filled with `botCount` AI bots (1–14, default 4). */
  createSolo: (botCount?: number) => void;
  joinRoom: (code: string) => void;
  startGame: () => void;
  /** Tell the server the map and character atlas have both loaded. */
  markGameplayReady: () => void;
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
   * Submit a minigame step (Phase 7). Local progress advances only on the
   * server-authoritative task-progress broadcast.
   */
  completeTaskStep: (taskId: number, stepIndex: number) => void;
  /** Send a 0x15 sub 0x04 Sabotage RPC (impostor only; server re-validates). */
  triggerSabotage: (systemId: number) => void;
  /** Send a 0x15 sub 0x05 Repair RPC (crewmate only; server re-validates proximity). */
  repairSabotage: (systemId: number, padId: number) => void;
  enterVent: (ventId: number) => void;
  travelVent: (ventId: number) => void;
  exitVent: () => void;
  sendMeetingChat: (text: string) => void;
}

const DEFAULT_STATE: GameState = {
  phase: 'connecting',
  mySlot: null,
  roomCode: null,
  hostSlot: 0,
  players: [],
  errorMessage: null,
  connectionStatus: 'connecting',
  gameplayReady: false,
  myRole: null,
  impostorSlots: [],
  deadSlots: [],
  lastKill: null,
  killCooldownMs: 0,
  meeting: null,
  hasVoted: false,
  voteResult: null,
  myTasks: [],
  globalTaskProgress: 0,
  sabotage: null,
  sabotageCooldownMs: 0,
  myVentId: null,
  meetingMessages: [],
  emergencyMeetingUsed: false,
  corpsePositions: [],
};

// ── Contexts ─────────────────────────────────────────────────────────────────

const GameStateCtx = createContext<GameState>(DEFAULT_STATE);
const GameActionsCtx = createContext<GameActions>({
  createRoom: () => {},
  createSolo: () => {},
  joinRoom: () => {},
  startGame: () => {},
  markGameplayReady: () => {},
  sendMove: () => {},
  sendKill: () => {},
  reportBody: () => {},
  callEmergencyMeeting: () => {},
  castVote: () => {},
  clearVoteResult: () => {},
  completeTaskStep: () => {},
  triggerSabotage: () => {},
  repairSabotage: () => {},
  enterVent: () => {},
  travelVent: () => {},
  exitVent: () => {},
  sendMeetingChat: () => {},
});

/** Mutable ref holding the latest remote-player positions (slot → RemotePlayer).
 *  Updated by 0xFF packets; read by the rAF loop in GameMap without triggering re-renders. */
const GameRemotePlayersCtx = createContext<React.RefObject<Map<number, RemotePlayer>>>(
  { current: new Map() },
);

/** Mutable ref holding a pending server position correction for the local player.
 *  Set by the 0xFF handler when the server disagrees with local position.
 *  Cleared by the rAF loop after applying. */
const GameCorrectionCtx = createContext<React.RefObject<{ wireX: number; wireY: number; force?: boolean } | null>>(
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

/** Returns a stable ref to the pending server correction ({wireX,wireY} or null). */
export function useCorrectionRef(): React.RefObject<{ wireX: number; wireY: number; force?: boolean } | null> {
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
      { slot: 1, x: PLAYER_SPAWN.x + 20, y: PLAYER_SPAWN.y + 6 }, // in kill range of the real spawn position
      { slot: 2, x: PLAYER_SPAWN.x - 90, y: PLAYER_SPAWN.y + 60 },
      { slot: 3, x: PLAYER_SPAWN.x + 30, y: PLAYER_SPAWN.y + 140 },
    ],
  },
  // Kill-screen visual QA fixtures: only the victim sees the full-screen kill animation.
  'kill-animation-victim': {
    state: {
      phase: 'playing', mySlot: 1, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [0], deadSlots: [1],
      lastKill: { victimSlot: 1, attackerSlot: 0, occurredAtMs: Date.now() },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  'kill-animation-attacker': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'impostor', impostorSlots: [0], deadSlots: [1],
      lastKill: { victimSlot: 1, attackerSlot: 0, occurredAtMs: Date.now() },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Match start: impostor can see a nearby target but must wait for the initial cooldown.
  'impostor-opening': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'impostor', impostorSlots: [0], killCooldownMs: KILL_COOLDOWN_MS,
    },
    remotePlayers: [
      { slot: 1, x: PLAYER_SPAWN.x + 20, y: PLAYER_SPAWN.y + 6 },
      { slot: 2, x: PLAYER_SPAWN.x - 90, y: PLAYER_SPAWN.y + 60 },
      { slot: 3, x: PLAYER_SPAWN.x + 30, y: PLAYER_SPAWN.y + 140 },
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
  // Browser smoke test: this task console is reachable from PLAYER_SPAWN.
  'task-interaction': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [],
      myTasks: [{ taskId: 4, completedSteps: 0 }],
      globalTaskProgress: 0,
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
      corpsePositions: [{ slot: 1, x: PLAYER_SPAWN.x + 32, y: PLAYER_SPAWN.y + 65 }],
    },
    remotePlayers: [
      { slot: 1, x: PLAYER_SPAWN.x + 20, y: PLAYER_SPAWN.y + 6 }, // ghost may move; body remains at this position
      { slot: 2, x: PLAYER_SPAWN.x - 90, y: PLAYER_SPAWN.y + 60 },
      { slot: 3, x: PLAYER_SPAWN.x + 30, y: PLAYER_SPAWN.y + 140 },
    ],
  },
  // Visual QA: every atlas color must have a matching dead-body sprite.
  'corpse-all-colors': {
    state: {
      phase: 'playing', mySlot: 7, hostSlot: 7,
      players: Array.from({ length: 8 }, (_, slot) => ({ slot, username: `Player${slot}` })),
      myRole: 'crewmate', impostorSlots: [], deadSlots: [0, 1, 2, 3, 4, 5, 6],
      corpsePositions: Array.from({ length: 7 }, (_, slot) => ({
        slot,
        x: PLAYER_SPAWN.x + (slot - 3) * 54,
        y: PLAYER_SPAWN.y + 90,
      })),
    },
    remotePlayers: [],
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
  // Dead players must retain read-only access to the meeting transcript.
  'meeting-ghost': {
    state: {
      phase: 'playing', mySlot: 1, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [], deadSlots: [1],
      meeting: { reporterSlot: 2, bodySlot: NO_TARGET, startedAtMs: Date.now() - MEETING_DISCUSSION_MS - 1000 },
      meetingMessages: [
        { slot: 0, text: 'I saw Nova near the west wall.', receivedAt: Date.now() - 1500 },
        { slot: 2, text: 'I was finishing the task console.', receivedAt: Date.now() - 900 },
      ],
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
      sabotage: { systemId: SABOTAGE_LIGHTS, startedAtMs: Date.now(), fixedPads: [], lockedTaskIds: [] },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
  // Phase 8 — O2 sabotage active, crewmate view: one of two pads already fixed.
  'sabotage-o2': {
    state: {
      phase: 'playing', mySlot: 0, hostSlot: 0, players: MOCK_PLAYERS_GAME,
      myRole: 'crewmate', impostorSlots: [],
      sabotage: { systemId: 0x02, startedAtMs: Date.now(), fixedPads: [0], lockedTaskIds: [] },
    },
    remotePlayers: MOCK_REMOTE_POSITIONS,
  },
};

/** Returns the requested dev mock preset, or null if none/invalid/prod. */
function getMockPreset(): MockPreset | null {
  // Player-facing dev previews (e.g. Replit) must not be able to enter mock
  // mid-game states through a query string. Tests opt in explicitly.
  if (import.meta.env.VITE_ENABLE_GAME_MOCKS !== 'true') return null;
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
  // The default keeps self-hosted/Replit deployments same-origin. Static hosts
  // such as a separate Vercel frontend can point at the live game server with
  // VITE_WS_URL, e.g. wss://game.example.com/api/ws.
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return configured;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/ws`;
}

function getInitData(): string {
  const twa = (window as any).Telegram?.WebApp;
  if (typeof twa?.initData === 'string' && twa.initData.length > 0) return twa.initData;

  // Never send a fabricated identity to a production server. The JSON bypass
  // is only for local/Replit development, where the server explicitly enables
  // DEV_MODE and rejects it automatically in production.
  if (import.meta.env.PROD) return '';
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


const ROOM_SESSION_STORAGE_KEY = 'among-gas:resume-room-code';

function readPersistedRoomCode(): string | null {
  try {
    const code = window.sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY)?.toUpperCase() ?? '';
    return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function persistRoomCode(code: string | null): void {
  try {
    if (code) window.sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, code);
    else window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
  } catch {
    // Private browsing / storage-disabled contexts still retain the in-memory
    // room code for socket reconnects; only full-page recovery is unavailable.
  }
}

interface ResumeSabotageV1 {
  systemId: number;
  elapsedMs: number;
  fixedPads: number[];
  lockedTaskIds: number[];
}

interface ResumeMeetingV1 {
  reporterSlot: number;
  bodySlot: number;
  elapsedMs: number;
  votingOpen: boolean;
  hasVoted: boolean;
  votes: Array<{ slot: number; targetSlot: number }>;
  messages: Array<{ slot: number; text: string; sentAtMs: number }>;
}

interface ResumeSnapshotV1 {
  version: 1;
  roomCode: string;
  phase: 'ROAMING' | 'MEETING' | 'GAMEOVER';
  hostSlot: number;
  mySlot: number;
  players: LobbyPlayer[];
  playerPositions: Array<{ slot: number; wireX: number; wireY: number; inVent: boolean; ventId?: number }>;
  myRole: PlayerRole;
  impostorSlots: number[];
  deadSlots: number[];
  corpsePositions: Array<{ slot: number; wireX: number; wireY: number }>;
  myTasks: MyTask[];
  globalTaskProgress: number;
  killCooldownMs: number;
  sabotageCooldownMs: number;
  myVentId: number | null;
  emergencyMeetingUsed: boolean;
  sabotage: ResumeSabotageV1 | null;
  meeting: ResumeMeetingV1 | null;
  gameOverResult: null | { ejectedSlot: number; winFlag: 0 | 1 | 2 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum;
}

function isSlot(value: unknown): value is number {
  return isIntegerInRange(value, 0, 14);
}

/** Strictly validate server-supplied resume state before mutating live client state. */
function parseResumeSnapshotV1(data: ArrayBuffer): ResumeSnapshotV1 | null {
  if (data.byteLength < 3) return null;
  const view = new DataView(data);
  if (view.getUint8(0) !== 0x25 || view.getUint8(1) !== 0x01) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(data, 2),
    ));
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.version !== 1) return null;
  if (typeof raw.roomCode !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(raw.roomCode)) return null;
  if (raw.phase !== 'ROAMING' && raw.phase !== 'MEETING' && raw.phase !== 'GAMEOVER') return null;
  if (!isSlot(raw.hostSlot) || !isSlot(raw.mySlot)) return null;
  if (raw.myRole !== 'crewmate' && raw.myRole !== 'impostor') return null;
  if (!Array.isArray(raw.players) || raw.players.length < 1 || raw.players.length > 15) return null;
  const players: LobbyPlayer[] = [];
  for (const entry of raw.players) {
    if (!isRecord(entry) || !isSlot(entry.slot) ||
        typeof entry.username !== 'string' || entry.username.length > 96) return null;
    players.push({ slot: entry.slot, username: entry.username });
  }
  if (!players.some(player => player.slot === raw.mySlot)) return null;

  if (!Array.isArray(raw.playerPositions) || raw.playerPositions.length > 15) return null;
  const playerPositions: ResumeSnapshotV1['playerPositions'] = [];
  for (const entry of raw.playerPositions) {
    if (!isRecord(entry) || !isSlot(entry.slot) ||
        !isIntegerInRange(entry.wireX, 0, 32_000) ||
        !isIntegerInRange(entry.wireY, 0, 32_000) ||
        typeof entry.inVent !== 'boolean') return null;
    if (entry.ventId !== undefined && !isIntegerInRange(entry.ventId, 0, 255)) return null;
    playerPositions.push({
      slot: entry.slot,
      wireX: entry.wireX,
      wireY: entry.wireY,
      inVent: entry.inVent,
      ...(entry.ventId !== undefined ? { ventId: entry.ventId as number } : {}),
    });
  }
  if (!playerPositions.some(position => position.slot === raw.mySlot)) return null;

  const parseSlots = (value: unknown): number[] | null => {
    if (!Array.isArray(value) || value.length > 15 || !value.every(isSlot)) return null;
    return value as number[];
  };
  const impostorSlots = parseSlots(raw.impostorSlots);
  const deadSlots = parseSlots(raw.deadSlots);
  if (!impostorSlots || !deadSlots) return null;
  // A crewmate snapshot must never expose the impostor roster.
  if (raw.myRole === 'crewmate' && impostorSlots.length !== 0) return null;

  if (!Array.isArray(raw.corpsePositions) || raw.corpsePositions.length > 15) return null;
  const corpsePositions: ResumeSnapshotV1['corpsePositions'] = [];
  for (const entry of raw.corpsePositions) {
    if (!isRecord(entry) || !isSlot(entry.slot) ||
        !isIntegerInRange(entry.wireX, 0, 32_000) ||
        !isIntegerInRange(entry.wireY, 0, 32_000)) return null;
    corpsePositions.push({ slot: entry.slot, wireX: entry.wireX, wireY: entry.wireY });
  }

  if (!Array.isArray(raw.myTasks) || raw.myTasks.length > 32) return null;
  const myTasks: MyTask[] = [];
  for (const task of raw.myTasks) {
    if (!isRecord(task) || !isIntegerInRange(task.taskId, 0, 255) ||
        !isIntegerInRange(task.completedSteps, 0, 255)) return null;
    myTasks.push({ taskId: task.taskId, completedSteps: task.completedSteps });
  }

  if (!isIntegerInRange(raw.globalTaskProgress, 0, 100) ||
      !isIntegerInRange(raw.killCooldownMs, 0, 600_000) ||
      !isIntegerInRange(raw.sabotageCooldownMs, 0, 600_000) ||
      !(raw.myVentId === null || isIntegerInRange(raw.myVentId, 0, 255)) ||
      typeof raw.emergencyMeetingUsed !== 'boolean') return null;

  let sabotage: ResumeSnapshotV1['sabotage'] = null;
  if (raw.sabotage !== null) {
    const value = raw.sabotage;
    if (!isRecord(value) ||
        !isIntegerInRange(value.systemId, 0, 255) ||
        !isIntegerInRange(value.elapsedMs, 0, 86_400_000)) return null;
    const fixedPads = value.fixedPads;
    const lockedTaskIds = value.lockedTaskIds;
    if (!Array.isArray(fixedPads) || fixedPads.length > 16 ||
        !fixedPads.every(value => isIntegerInRange(value, 0, 255)) ||
        !Array.isArray(lockedTaskIds) || lockedTaskIds.length > 32 ||
        !lockedTaskIds.every(value => isIntegerInRange(value, 0, 255))) return null;
    sabotage = {
      systemId: value.systemId,
      elapsedMs: value.elapsedMs,
      fixedPads: fixedPads as number[],
      lockedTaskIds: lockedTaskIds as number[],
    };
  }

  let meeting: ResumeSnapshotV1['meeting'] = null;
  if (raw.meeting !== null) {
    const value = raw.meeting;
    if (!isRecord(value) || !isSlot(value.reporterSlot) ||
        !isIntegerInRange(value.bodySlot, 0, 255) ||
        !isIntegerInRange(value.elapsedMs, 0, 86_400_000) ||
        typeof value.votingOpen !== 'boolean' || typeof value.hasVoted !== 'boolean' ||
        !Array.isArray(value.votes) || value.votes.length > 15 ||
        !Array.isArray(value.messages) || value.messages.length > 60) return null;
    const votes: ResumeMeetingV1['votes'] = [];
    for (const vote of value.votes) {
      if (!isRecord(vote) || !isSlot(vote.slot) ||
          !isIntegerInRange(vote.targetSlot, 0, 255)) return null;
      votes.push({ slot: vote.slot, targetSlot: vote.targetSlot });
    }
    const messages: ResumeMeetingV1['messages'] = [];
    for (const message of value.messages) {
      if (!isRecord(message) || !isSlot(message.slot) ||
          typeof message.text !== 'string' || message.text.length > 200 ||
          !isIntegerInRange(message.sentAtMs, 0, Number.MAX_SAFE_INTEGER)) return null;
      messages.push({ slot: message.slot, text: message.text, sentAtMs: message.sentAtMs });
    }
    meeting = {
      reporterSlot: value.reporterSlot,
      bodySlot: value.bodySlot,
      elapsedMs: value.elapsedMs,
      votingOpen: value.votingOpen,
      hasVoted: value.hasVoted,
      votes,
      messages,
    };
  }

  let gameOverResult: ResumeSnapshotV1['gameOverResult'] = null;
  if (raw.gameOverResult !== null) {
    const value = raw.gameOverResult;
    if (!isRecord(value) ||
        !isIntegerInRange(value.ejectedSlot, 0, 255) ||
        !isIntegerInRange(value.winFlag, 0, 2)) return null;
    gameOverResult = { ejectedSlot: value.ejectedSlot, winFlag: value.winFlag as 0 | 1 | 2 };
  }

  return {
    version: 1,
    roomCode: raw.roomCode,
    phase: raw.phase,
    hostSlot: raw.hostSlot,
    mySlot: raw.mySlot,
    players,
    playerPositions,
    myRole: raw.myRole,
    impostorSlots,
    deadSlots,
    corpsePositions,
    myTasks,
    globalTaskProgress: raw.globalTaskProgress,
    killCooldownMs: raw.killCooldownMs,
    sabotageCooldownMs: raw.sabotageCooldownMs,
    myVentId: raw.myVentId,
    emergencyMeetingUsed: raw.emergencyMeetingUsed,
    sabotage,
    meeting,
    gameOverResult,
  };
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
  onCorrection: (wireX: number, wireY: number, force?: boolean) => void,
): void {
  if (view.byteLength < 2) return;
  const count = view.getUint8(1);
  let off = 2;

  for (let i = 0; i < count; i++) {
    if (off + 5 > view.byteLength) break;
    const slot = view.getUint8(off++);
    const wireX = view.getInt16(off, true); off += 2;
    const wireY = view.getInt16(off, true); off += 2;

    if (slot === mySlot) {
      // Echo of the server's last-accepted position for our own player.
      // This is NOT necessarily a "correction" — most of the time it's
      // just an ack of a position we already sent (and have since moved
      // past locally, since local movement isn't paused waiting for
      // acks). Pass raw wire ints; the consumer (GameMap's rAF loop)
      // reconciles against its own recently-sent history to tell a real
      // wall-clip rejection apart from ordinary round-trip lag.
      onCorrection(wireX, wireY);
    } else {
      const x = fromWire(wireX, MAP_W);
      const y = fromWire(wireY, MAP_H);
      const previous = remotePlayersMap.get(slot);
      remotePlayersMap.set(slot, { slot, x, y, inVent: previous?.inVent ?? false });
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
  const correctionRef = useRef<{ wireX: number; wireY: number; force?: boolean } | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const reconnectBarrierRef = useRef(false);
  const shouldReconnectRef = useRef(true);

  const send = useCallback((buf: Uint8Array | number[]) => {
    const ws = socketRef.current;
    const packet = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (reconnectBarrierRef.current) {
      const isRoomRejoin = packet[0] === 0x10 && packet[1] === 0x02;
      const isReadinessAck = packet[0] === 0x23;
      if (!isRoomRejoin && !isReadinessAck) return;
    }
    if (ws?.readyState === WebSocket.OPEN) ws.send(packet);
  }, []);

  const createRoom = useCallback(() => {
    roomCodeRef.current = null;
    persistRoomCode(null);
    reconnectBarrierRef.current = false;
    send([0x10, 0x01]);
  }, [send]);

  const createSolo = useCallback((botCount: number = 4) => {
    roomCodeRef.current = null;
    persistRoomCode(null);
    reconnectBarrierRef.current = false;
    const count = Math.max(1, Math.min(14, Math.round(botCount)));
    send([0x10, 0x06, count]);
  }, [send]);

  const joinRoom = useCallback((code: string) => {
    const codeUpper = code.toUpperCase().slice(0, 6).padEnd(6, ' ');
    const trimmedCode = codeUpper.trim();
    if (/^[A-HJ-NP-Z2-9]{6}$/.test(trimmedCode)) {
      roomCodeRef.current = trimmedCode;
      persistRoomCode(trimmedCode);
    }
    const buf = new Uint8Array(8);
    buf[0] = 0x10; buf[1] = 0x02;
    const codeBytes = new TextEncoder().encode(codeUpper);
    buf.set(codeBytes.slice(0, 6), 2);
    send(buf);
  }, [send]);

  const startGame = useCallback(() => {
    send([0x12]);
  }, [send]);

  const markGameplayReady = useCallback(() => {
    // Mock browser fixtures have no server to acknowledge readiness.
    if (import.meta.env.VITE_ENABLE_GAME_MOCKS === 'true') {
      setState(s => ({ ...s, gameplayReady: true }));
      return;
    }
    send([0x23]);
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
    // Keep the minigame responsive with an optimistic step update. GameMap
    // only exposes the task action when the player is in server-equivalent range
    // and has clear line of sight; meeting/sabotage transitions close the task
    // UI. The server remains authoritative and broadcasts canonical progress.
    setState(s => {
      if (s.meeting !== null || s.myRole !== 'crewmate') return s;
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

  const enterVent = useCallback((ventId: number) => {
    send([0x17, 0x01, ventId]);
  }, [send]);

  const travelVent = useCallback((ventId: number) => {
    send([0x17, 0x02, ventId]);
  }, [send]);

  const exitVent = useCallback(() => {
    send([0x17, 0x03]);
  }, [send]);

  const sendMeetingChat = useCallback((text: string) => {
    const encoder = new TextEncoder();
    const trimmed = text.trim();
    let safe = '';
    for (const char of trimmed) {
      if (encoder.encode(safe + char).byteLength > 200) break;
      safe += char;
    }
    const bytes = encoder.encode(safe);
    if (!bytes.byteLength) return;
    const packet = new Uint8Array(3 + bytes.byteLength);
    packet[0] = 0x19;
    packet[1] = 0x01;
    packet[2] = bytes.byteLength;
    packet.set(bytes, 3);
    send(packet);
  }, [send]);

  useEffect(() => {
    // ── Dev mock mode: skip the real socket, force a fixed visual state ────
    const mock = getMockPreset();
    if (mock) {
      if (mock.remotePlayers) {
        remotePlayersRef.current = new Map(mock.remotePlayers.map(rp => [rp.slot, rp]));
      }
      setState(s => ({ ...s, ...mock.state, connectionStatus: 'online' }));
      console.log('[mock] Forced state:', mock.state);
      return () => {};
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let activeSocket: WebSocket | null = null;

    const telegramStartParam = (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param;
    const inviteCode = readLobbyStartParam(window.location.search, telegramStartParam);
    const persistedRoomCode = readPersistedRoomCode();
    roomCodeRef.current = resolveInitialRoomCode(inviteCode, persistedRoomCode);

    // A fresh, validated invite is an explicit navigation choice. Clear the
    // old WebView resume code so the socket authenticates into the lobby and
    // Lobby.tsx can join the invited room instead of silently resuming the old one.
    if (inviteCode) persistRoomCode(null);

    if (roomCodeRef.current) {
      reconnectBarrierRef.current = true;
      setState(s => ({
        ...s,
        roomCode: roomCodeRef.current,
        connectionStatus: 'reconnecting',
        gameplayReady: false,
        errorMessage: 'Reconnecting to your game…',
      }));
    }

    const clearSavedRoom = () => {
      roomCodeRef.current = null;
      persistRoomCode(null);
      reconnectBarrierRef.current = false;
    };

    const connect = () => {
      if (disposed) return;
      const roomToRejoin = roomCodeRef.current;
      const isRejoin = roomToRejoin !== null;
      reconnectBarrierRef.current = isRejoin;

      if (isRejoin) {
        setState(s => ({
          ...s,
          connectionStatus: 'reconnecting',
          gameplayReady: false,
          errorMessage: 'Reconnecting to your game…',
        }));
      } else {
        setState(s => ({
          ...s,
          connectionStatus: reconnectAttempt === 0 ? 'connecting' : 'reconnecting',
        }));
      }

      const ws = new WebSocket(getWsUrl());
      activeSocket = ws;
      socketRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        const initData = getInitData();
        if (!initData) {
          shouldReconnectRef.current = false;
          setState(s => ({
            ...s,
            phase: 'error',
            connectionStatus: 'offline',
            errorMessage: 'Откройте Among Gas через Telegram, чтобы войти в игру.',
          }));
          ws.close(1008, 'Telegram Mini App initData required');
          return;
        }
        ws.send(new TextEncoder().encode(initData));
      };

      ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 1) return;
        const view = new DataView(event.data);
        const opcode = view.getUint8(0);

        // ── 0x00: auth failure ──────────────────────────────────────────────
        if (opcode === 0x00) {
          shouldReconnectRef.current = false;
          reconnectBarrierRef.current = false;
          setState(s => ({
            ...s,
            phase: 'error',
            connectionStatus: 'offline',
            errorMessage: 'Authentication failed',
          }));
          ws.close(1008, 'Telegram authentication failed');
          return;
        }

        // ── 0x01: authenticated handshake; rejoin the last room if one exists ─
        if (opcode === 0x01 && event.data.byteLength >= 2) {
          const slot = view.getUint8(1);
          const roomToRejoinNow = roomCodeRef.current;
          mySlotRef.current = slot;
          reconnectAttempt = 0;
          if (roomToRejoinNow) {
            reconnectBarrierRef.current = true;
            const codeBytes = new TextEncoder().encode(roomToRejoinNow);
            const joinPacket = new Uint8Array(8);
            joinPacket[0] = 0x10;
            joinPacket[1] = 0x02;
            joinPacket.set(codeBytes.slice(0, 6), 2);
            ws.send(joinPacket);
            setState(s => ({
              ...s,
              phase: s.phase === 'playing' ? 'playing' : 'lobby',
              mySlot: slot,
              connectionStatus: 'resuming',
              gameplayReady: false,
              errorMessage: null,
            }));
          } else {
            reconnectBarrierRef.current = false;
            setState(s => ({
              ...s,
              phase: 'lobby',
              mySlot: slot,
              connectionStatus: 'online',
              errorMessage: null,
            }));
          }
          console.log('[WS] authenticated — assigned slot ' + slot);
          return;
        }

        // ── 0x10: lobby control ─────────────────────────────────────────────
        if (opcode === 0x10 && event.data.byteLength >= 2) {
          const sub = view.getUint8(1);

          // 0x03: authoritative room update. The following 0x25 frame tells
          // us whether this was a WAITING lobby or an active-match resume.
          if (sub === 0x03) {
            const parsed = parseRoomUpdate(view);
            if (!parsed) return;
            roomCodeRef.current = parsed.roomCode;
            persistRoomCode(parsed.roomCode);
            const activeSlots = new Set(parsed.players.map(p => p.slot));
            setState(s => ({
              ...s,
              roomCode: parsed.roomCode,
              hostSlot: parsed.hostSlot,
              players: parsed.players,
              connectionStatus: reconnectBarrierRef.current ? 'resuming' : 'online',
              errorMessage: null,
              corpsePositions: s.corpsePositions.filter(body => activeSlots.has(body.slot)),
            }));
            // Prune remote players that are no longer in the room.
            for (const slot of remotePlayersRef.current.keys()) {
              if (!activeSlots.has(slot) || slot === mySlotRef.current) {
                remotePlayersRef.current.delete(slot);
              }
            }
            return;
          }

          // 0x04: join error — do not keep retrying an expired/invalid room.
          if (sub === 0x04 && event.data.byteLength >= 3) {
            const errCode = view.getUint8(2);
            const messages: Record<number, string> = {
              0x01: 'Room not found',
              0x02: 'Game already in progress',
              0x03: 'Room is full',
            };
            clearSavedRoom();
            setState(s => ({
              ...s,
              connectionStatus: 'online',
              gameplayReady: false,
              errorMessage: messages[errCode] ?? 'Unknown error',
            }));
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

        // ── 0x25: versioned session resume ──────────────────────────────────
        if (opcode === 0x25 && event.data.byteLength >= 2) {
          const version = view.getUint8(1);
          if (version === 0x00 && event.data.byteLength === 2) {
            // WAITING lobby: roster/slot have been restored; no match snapshot
            // is needed and normal lobby controls can be re-enabled.
            reconnectBarrierRef.current = false;
            setState(s => ({
              ...s,
              phase: 'lobby',
              connectionStatus: 'online',
              gameplayReady: false,
              errorMessage: null,
            }));
            return;
          }
          if (version !== 0x01) return;

          const snapshot = parseResumeSnapshotV1(event.data);
          if (!snapshot) {
            shouldReconnectRef.current = false;
            setState(s => ({
              ...s,
              connectionStatus: 'offline',
              gameplayReady: false,
              errorMessage: 'The server sent an invalid resume snapshot. Please reload the game.',
            }));
            ws.close(1008, 'Invalid resume snapshot');
            return;
          }

          const ownPosition = snapshot.playerPositions.find(position => position.slot === snapshot.mySlot);
          if (!ownPosition) return;

          mySlotRef.current = snapshot.mySlot;
          myRoleRef.current = snapshot.myRole;
          roomCodeRef.current = snapshot.roomCode;
          persistRoomCode(snapshot.roomCode);

          const restoredRemotePlayers = new Map<number, RemotePlayer>();
          for (const position of snapshot.playerPositions) {
            if (position.slot === snapshot.mySlot) continue;
            const vent = position.inVent && position.ventId !== undefined
              ? findVent(position.ventId)
              : undefined;
            restoredRemotePlayers.set(position.slot, {
              slot: position.slot,
              x: vent?.x ?? fromWire(position.wireX, MAP_W),
              y: vent?.y ?? fromWire(position.wireY, MAP_H),
              inVent: position.inVent,
            });
          }
          remotePlayersRef.current = restoredRemotePlayers;

          // Seed the local rAF reconciliation path with the authoritative
          // position. GameMap consumes this before its next movement/camera step.
          correctionRef.current = {
            wireX: ownPosition.wireX,
            wireY: ownPosition.wireY,
            force: true,
          };

          const restoredMeeting: MeetingInfo | null = snapshot.meeting
            ? {
                reporterSlot: snapshot.meeting.reporterSlot,
                bodySlot: snapshot.meeting.bodySlot,
                startedAtMs: Date.now() - snapshot.meeting.elapsedMs,
              }
            : null;
          const restoredMeetingMessages: MeetingChatMessage[] = snapshot.meeting
            ? snapshot.meeting.messages.map(message => ({
                slot: message.slot,
                text: message.text,
                receivedAt: message.sentAtMs,
              }))
            : [];
          const restoredSabotage: SabotageInfo | null = snapshot.sabotage
            ? {
                systemId: snapshot.sabotage.systemId,
                startedAtMs: Date.now() - snapshot.sabotage.elapsedMs,
                fixedPads: snapshot.sabotage.fixedPads,
                lockedTaskIds: snapshot.sabotage.lockedTaskIds,
              }
            : null;
          const winner = snapshot.gameOverResult?.winFlag === 1
            ? 'crewmates'
            : snapshot.gameOverResult?.winFlag === 2
              ? 'impostors'
              : null;

          reconnectBarrierRef.current = true;
          setState(s => ({
            ...s,
            phase: 'playing',
            connectionStatus: 'resuming',
            mySlot: snapshot.mySlot,
            roomCode: snapshot.roomCode,
            hostSlot: snapshot.hostSlot,
            players: snapshot.players,
            errorMessage: null,
            gameplayReady: false,
            myRole: snapshot.myRole,
            impostorSlots: snapshot.impostorSlots,
            deadSlots: snapshot.deadSlots,
            lastKill: null,
            killCooldownMs: snapshot.killCooldownMs,
            meeting: restoredMeeting,
            hasVoted: snapshot.meeting?.hasVoted ?? false,
            voteResult: snapshot.phase === 'GAMEOVER' && snapshot.gameOverResult
              ? { ejectedSlot: snapshot.gameOverResult.ejectedSlot, winner }
              : null,
            myTasks: snapshot.myTasks,
            globalTaskProgress: snapshot.globalTaskProgress,
            sabotage: restoredSabotage,
            sabotageCooldownMs: snapshot.sabotageCooldownMs,
            myVentId: snapshot.myVentId,
            meetingMessages: restoredMeetingMessages,
            emergencyMeetingUsed: snapshot.emergencyMeetingUsed,
            corpsePositions: snapshot.corpsePositions.map(corpse => ({
              slot: corpse.slot,
              x: fromWire(corpse.wireX, MAP_W),
              y: fromWire(corpse.wireY, MAP_H),
            })),
          }));
          return;
        }

        // ── 0x1A: role reveal → transition to playing ───────────────────────
        // Crewmate: [0x1A, 0x00]
        // Impostor: [0x1A, 0x01, impostorCount, slot_0, slot_1, ...]
        if (opcode === 0x1A && event.data.byteLength >= 2) {
          const roleByte = view.getUint8(1);
          const myRole: PlayerRole = roleByte === 1 ? 'impostor' : 'crewmate';
          myRoleRef.current = myRole;
          if (myRole === 'impostor') haptic.warning(); else haptic.success();

          const impostorSlots: number[] = [];
          if (roleByte === 1 && event.data.byteLength >= 3) {
            const count = view.getUint8(2);
            for (let i = 0; i < count && 3 + i < event.data.byteLength; i++) {
              impostorSlots.push(view.getUint8(3 + i));
            }
          }

          remotePlayersRef.current.clear();
          correctionRef.current = null;
          setState(s => ({
            ...s, phase: 'playing', connectionStatus: 'online', myRole, impostorSlots,
            gameplayReady: false,
            deadSlots: [],
            lastKill: null,
            killCooldownMs: myRole === 'impostor' ? KILL_COOLDOWN_MS : 0,
            meeting: null,
            hasVoted: false,
            voteResult: null,
            myTasks: [],
            globalTaskProgress: 0,
            sabotage: null,
            sabotageCooldownMs: 0,
            myVentId: null,
            meetingMessages: [],
            emergencyMeetingUsed: false,
            corpsePositions: [],
          }));
          console.log('[WS] role reveal received — role=' + myRole);
          return;
        }

        // ── 0x24: server confirmed this player's gameplay readiness ───────
        if (opcode === 0x24 && event.data.byteLength >= 2 && view.getUint8(1) === 0x01) {
          reconnectBarrierRef.current = false;
          setState(s => ({
            ...s,
            connectionStatus: 'online',
            gameplayReady: true,
            errorMessage: null,
          }));
          return;
        }

        // ── 0x21: immutable corpse drop ───────────────────────────────────────
        // [0x21, victimSlot, wireX(UInt16LE), wireY(UInt16LE)].
        if (opcode === 0x21 && event.data.byteLength === 6) {
          const slot = view.getUint8(1);
          const x = fromWire(view.getUint16(2, true), MAP_W);
          const y = fromWire(view.getUint16(4, true), MAP_H);
          setState(s => ({
            ...s,
            corpsePositions: [
              ...s.corpsePositions.filter(body => body.slot !== slot),
              { slot, x, y },
            ],
          }));
          return;
        }

        // ── 0x22: forced authoritative movement correction ─────────────────
        if (opcode === 0x22 && event.data.byteLength === 5) {
          correctionRef.current = {
            wireX: view.getUint16(1, true),
            wireY: view.getUint16(3, true),
            force: true,
          };
          return;
        }

        // ── 0xFF: delta sync — update remote player positions ───────────────
        if (opcode === 0xFF) {
          applyDeltaPacket(
            view,
            mySlotRef.current,
            remotePlayersRef.current,
            (wireX, wireY, force) => { correctionRef.current = { wireX, wireY, force }; },
          );
          return;
        }

        // ── 0x15: RPC event ──────────────────────────────────────────────────
        if (opcode === 0x15 && event.data.byteLength >= 2) {
          const sub = view.getUint8(1);

          // Kill broadcast: [0x15, 0x01, victimSlot, attackerSlot]
          if (sub === 0x01 && event.data.byteLength >= 3) {
            const victimSlot = view.getUint8(2);
            const attackerSlot = event.data.byteLength >= 4 ? view.getUint8(3) : null;
            setState(s => {
              if (s.deadSlots.includes(victimSlot)) return s;
              if (victimSlot === mySlotRef.current) haptic.kill();
              else if (attackerSlot === mySlotRef.current) haptic.medium();
              return {
                ...s,
                deadSlots: [...s.deadSlots, victimSlot],
                lastKill: { victimSlot, attackerSlot, occurredAtMs: Date.now() },
                killCooldownMs: attackerSlot === mySlotRef.current
                  ? KILL_COOLDOWN_MS
                  : s.killCooldownMs,
              };
            });
            return;
          }

          // Task progress broadcast (S→C, 3 bytes).
          if (sub === 0x03 && event.data.byteLength === 3) {
            const percent = view.getUint8(2);
            setState(s => ({ ...s, globalTaskProgress: percent }));
            return;
          }
          return;
        }

        // ── 0x16: sabotage control ──────────────────────────────────────────
        if (opcode === 0x16 && event.data.byteLength >= 3) {
          const sub = view.getUint8(1);
          const systemId = view.getUint8(2);
          if (sub === 0x01) {
            const attackerSlot = event.data.byteLength >= 4 ? view.getUint8(3) : null;
            haptic.warning();
            setState(s => ({
              ...s,
              sabotage: { systemId, startedAtMs: Date.now(), fixedPads: [], lockedTaskIds: [] },
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
          if (sub === 0x04 && event.data.byteLength >= 3) {
            const count = view.getUint8(3);
            const lockedTaskIds: number[] = [];
            for (let i = 0; i < count && 4 + i < event.data.byteLength; i++) {
              lockedTaskIds.push(view.getUint8(4 + i));
            }
            setState(s => (
              !s.sabotage || s.sabotage.systemId !== systemId
                ? s
                : { ...s, sabotage: { ...s.sabotage, lockedTaskIds } }
            ));
            return;
          }
          return;
        }

        // ── 0x20: emergency-use confirmation ────────────────────────────────
        if (opcode === 0x20 && event.data.byteLength >= 3 &&
            view.getUint8(1) === 0x01 && view.getUint8(2) === mySlotRef.current) {
          setState(s => ({ ...s, emergencyMeetingUsed: true }));
          return;
        }

        // ── 0x18: vent state broadcast ──────────────────────────────────────
        if (opcode === 0x18 && event.data.byteLength >= 4) {
          const sub = view.getUint8(1);
          const slot = view.getUint8(2);
          const ventId = view.getUint8(3);
          const vent = findVent(ventId);
          if (!vent || (sub !== 0x01 && sub !== 0x02 && sub !== 0x03)) return;
          const inVent = sub !== 0x03;
          if (slot === mySlotRef.current) {
            remotePlayersRef.current.delete(slot);
            setState(s => ({ ...s, myVentId: inVent ? ventId : null }));
          } else {
            remotePlayersRef.current.set(slot, { slot, x: vent.x, y: vent.y, inVent });
          }
          return;
        }

        // ── 0x19: meeting chat broadcast ────────────────────────────────────
        if (opcode === 0x19 && event.data.byteLength >= 4 && view.getUint8(1) === 0x02) {
          const slot = view.getUint8(2);
          const length = view.getUint8(3);
          if (length === 0 || event.data.byteLength !== 4 + length) return;
          const text = new TextDecoder().decode(new Uint8Array(event.data, 4, length));
          setState(s => ({
            ...s,
            meetingMessages: [...s.meetingMessages, { slot, text, receivedAt: Date.now() }].slice(-60),
          }));
          return;
        }

        // ── 0x1D: task assignment ───────────────────────────────────────────
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
          return;
        }

        // ── 0x1B: meeting start ─────────────────────────────────────────────
        if (opcode === 0x1B && event.data.byteLength >= 3) {
          const reporterSlot = view.getUint8(1);
          const bodySlot = view.getUint8(2);
          setState(s => {
            if (s.meeting !== null) return s;
            haptic.meeting();
            return {
              ...s,
              meeting: { reporterSlot, bodySlot, startedAtMs: Date.now() },
              hasVoted: false,
              voteResult: null,
              meetingMessages: [],
              corpsePositions: bodySlot === NO_TARGET
                ? s.corpsePositions
                : s.corpsePositions.filter(body => body.slot !== bodySlot),
            };
          });
          return;
        }

        // ── 0x1C: vote result / eject ──────────────────────────────────────
        if (opcode === 0x1C && event.data.byteLength >= 3) {
          const ejectedSlot = view.getUint8(1);
          const winByte = view.getUint8(2);
          const winner: 'crewmates' | 'impostors' | null =
            winByte === 1 ? 'crewmates' : winByte === 2 ? 'impostors' : null;
          if (winner) {
            const localWon = (winner === 'crewmates' && myRoleRef.current === 'crewmate') ||
                             (winner === 'impostors' && myRoleRef.current === 'impostor');
            if (localWon) haptic.success(); else haptic.warning();
          }
          setState(s => ({
            ...s,
            meeting: null,
            myVentId: null,
            corpsePositions: ejectedSlot === NO_TARGET
              ? s.corpsePositions
              : s.corpsePositions.filter(body => body.slot !== ejectedSlot),
            deadSlots: ejectedSlot !== NO_TARGET && !s.deadSlots.includes(ejectedSlot)
              ? [...s.deadSlots, ejectedSlot]
              : s.deadSlots,
            voteResult: { ejectedSlot, winner },
          }));
          return;
        }
      };

      ws.onclose = () => {
        if (socketRef.current !== ws || disposed) return;
        remotePlayersRef.current.clear();
        correctionRef.current = null;
        reconnectBarrierRef.current = roomCodeRef.current !== null;
        setState(s => ({
          ...s,
          connectionStatus: 'reconnecting',
          gameplayReady: false,
          errorMessage: 'Connection lost. Reconnecting…',
        }));
        if (!shouldReconnectRef.current) {
          setState(s => ({ ...s, connectionStatus: 'offline' }));
          return;
        }
        const delayMs = Math.min(8_000, 500 * (2 ** Math.min(reconnectAttempt, 4)));
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connect, delayMs);
      };

      ws.onerror = () => {
        if (socketRef.current !== ws || disposed) return;
        setState(s => ({
          ...s,
          connectionStatus: 'reconnecting',
          errorMessage: 'WebSocket interrupted. Reconnecting…',
        }));
      };
    };

    connect();

    return () => {
      disposed = true;
      shouldReconnectRef.current = false;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      const current = activeSocket;
      if (current && current.readyState < WebSocket.CLOSING) {
        current.close(1000, 'Game provider disposed');
      }
      if (socketRef.current === current) socketRef.current = null;
    };
  }, []);

  // Client-side kill cooldown countdown display (server is authoritative for
  // the actual kill validation; this just drives the impostor's UI timer).
  useEffect(() => {
    if (state.phase !== 'playing' || state.myRole !== 'impostor') return;
    if (!state.gameplayReady || state.killCooldownMs <= 0) return;
    const id = setInterval(() => {
      setState(s => ({ ...s, killCooldownMs: Math.max(0, s.killCooldownMs - 250) }));
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, state.myRole, state.gameplayReady, state.killCooldownMs > 0]);

  // Client-side sabotage cooldown countdown display (server is authoritative
  // for the actual trigger validation; this just drives the impostor's UI timer).
  useEffect(() => {
    if (state.phase !== 'playing' || state.myRole !== 'impostor') return;
    if (!state.gameplayReady || state.sabotageCooldownMs <= 0) return;
    const id = setInterval(() => {
      setState(s => ({ ...s, sabotageCooldownMs: Math.max(0, s.sabotageCooldownMs - 250) }));
    }, 250);
    return () => clearInterval(id);
  }, [state.phase, state.myRole, state.gameplayReady, state.sabotageCooldownMs > 0]);

  const actions: GameActions = {
    createRoom, createSolo, joinRoom, startGame, markGameplayReady, sendMove, sendKill,
    reportBody, callEmergencyMeeting, castVote, clearVoteResult,
    completeTaskStep, triggerSabotage, repairSabotage,
    enterVent, travelVent, exitVent, sendMeetingChat,
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
