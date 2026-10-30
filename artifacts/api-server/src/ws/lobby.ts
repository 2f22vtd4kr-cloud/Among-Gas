/**
 * Lobby & Matchmaking — Phase 2 + Phase 3 + Phase 4
 *
 * Phase 2: LobbyManager, room code generation, slot assignment,
 *   host migration on disconnect, room update broadcast.
 * Phase 3: Per-player position tracking, 25Hz delta broadcast loop,
 *   game-start handling (0x12 → 0x1A role reveal).
 * Phase 4: Fisher-Yates role assignment with information asymmetry
 *   (personalized 0x1A packets), spread spawn positions at game start.
 * Phase 8: Sabotage state machine (trigger/repair/timeout), meeting block
 *   while a sabotage is active.
 *
 * Protocol reference: GAME_SPEC.md §6, §7, §8, §10
 */
import type { WebSocket } from 'ws';
import { logger } from '../lib/logger.js';
import {
  MAP_W, MAP_H,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
  PLAYER_SPAWN_MIN_SEPARATION_PX,
  toWire,
  DELTA_THRESHOLD_SQ,
  KILL_COOLDOWN_MS,
  MEETING_DISCUSSION_MS, MEETING_VOTING_MS,
  NO_TARGET,
} from '@workspace/shared/coords';
import {
  buildCollisionGrid,
  isPlayerSpawnPositionClear,
  KILL_RANGE_PX,
} from '@workspace/shared/collisionMap';
import { TASK_DEFS, TASKS_PER_CREWMATE, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import {
  SABOTAGE_DEFS,
  SABOTAGE_INTERACTION_RANGE_PX,
  SABOTAGE_COOLDOWN_MS,
  SABOTAGE_PAD_SYNC_WINDOW_MS,
  SABOTAGE_COMMS,
  SABOTAGE_DOORS,
  getSabotageTimeoutMs,
  isCriticalSabotage,
  isSabotageSystemId,
  type SabotageSystemId,
} from '@workspace/shared/sabotage';
import {
  VENT_INTERACTION_RANGE_PX,
  canTravelVent,
  findVent,
} from '@workspace/shared/vents';

// ── Room code alphabet ──────────────────────────────────────────────────────
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// ── Spawn position (matches game/player.ts PLAYER_SPAWN formula) ─────────────
// Exported so bot AI can use it as a known-reachable reference point when
// verifying that a candidate destination is actually connected to the main
// walkable area (the collision grid has isolated 1-cell pockets — see
// .agents/memory/ — that are locally walkable but unreachable from spawn).
export const SPAWN_X = PLAYER_SPAWN_X;
export const SPAWN_Y = PLAYER_SPAWN_Y;

/** Collision grid — built once for spawn-position validation. */
const spawnGrid = buildCollisionGrid();

/**
 * Compute a spread spawn position for player `index` of `total`.
 * Players are placed evenly around an ellipse centered on the lobby spawn
 * point; each candidate is validated against the exact shared player
 * footprint. If no safe separated point exists, lobby start fails closed.
 */
function computeSpawnPosition(
  index: number,
  total: number,
  occupied: readonly { x: number; y: number }[] = [],
): { x: number; y: number } {
  const available = (x: number, y: number) =>
    isPlayerSpawnPositionClear(spawnGrid, x, y) &&
    !occupied.some(player => Math.hypot(player.x - x, player.y - y) < PLAYER_SPAWN_MIN_SEPARATION_PX);
  if (total <= 1 && available(SPAWN_X, SPAWN_Y)) return { x: SPAWN_X, y: SPAWN_Y };
  if (total > 1) {
    const baseAngle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const radii = [96, 120, 144, 168, 192, 216, 240];
    const angleOffsets = [0, Math.PI / 12, -Math.PI / 12, Math.PI / 6, -Math.PI / 6,
      Math.PI / 4, -Math.PI / 4, Math.PI / 3, -Math.PI / 3];
    for (const offset of angleOffsets) for (const radius of radii) {
      const angle = baseAngle + offset;
      const x = Math.round(SPAWN_X + Math.cos(angle) * radius);
      const y = Math.round(SPAWN_Y + Math.sin(angle) * radius * 0.6);
      if (available(x, y)) return { x, y };
    }
  }
  // Solo and multiplayer share the same fallback when the preferred spawn is
  // too close to a wall/prop after applying the full-sprite margin.
  for (let radius = 12; radius <= 600; radius += 12) for (let step = 0; step < 48; step++) {
    const angle = (step / 48) * Math.PI * 2;
    const x = Math.round(SPAWN_X + Math.cos(angle) * radius);
    const y = Math.round(SPAWN_Y + Math.sin(angle) * radius * 0.6);
    if (available(x, y)) return { x, y };
  }
  throw new Error('No separated spawn position meets the full sprite clearance margin');
}

/** Impostor count by player count (GAME_SPEC.md §8; host setting UI is future work). */
function impostorCountFor(playerCount: number): number {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type LobbyPhase = 'WAITING' | 'ROAMING' | 'MEETING' | 'GAMEOVER';

export type PlayerRole = 'crewmate' | 'impostor';

export interface LobbyPlayer {
  slot: number;
  tgUserId: number;
  username: string;
  ws: WebSocket;
  /** Current pixel position; collision is evaluated at the rendered feet baseline. */
  x: number;
  y: number;
  /** Wire-space position at the time of last 0xFF broadcast. */
  lastBroadcastWireX: number;
  lastBroadcastWireY: number;
  /** Assigned at game start (0x12). Server-side only — never broadcast. */
  role: PlayerRole;
  alive: boolean;
  /**
   * Once a meeting has been called over this player's body (dead player's
   * own sprite doubles as the reportable "body" — see GAME_SPEC.md §14 #13),
   * this flips true so the body stops being reportable. Without this, any
   * crewmate (bot or human) wandering near an old corpse re-triggers a fresh
   * meeting indefinitely, since a dead player's position never changes and
   * `alive` alone can't distinguish "never reported" from "already voted on".
   */
  bodyReported?: boolean;
  /** Whether this player used their once-per-round emergency call. */
  emergencyMeetingUsed?: boolean;
  /** Impostor-only kill cooldown, ms remaining. Decremented each delta tick. */
  killCooldownMs: number;
  /** Task IDs assigned to this player at game start (empty for impostors). */
  assignedTasks: number[];
  /** Immutable map position dropped at death; separate from the ghost's live position. */
  corpseX?: number;
  corpseY?: number;
  /** True while the impostor is hidden inside a vent. */
  inVent?: boolean;
  /** Current vent ID while inVent is true. */
  ventId?: number;
  /** Movement-credit bucket: accepted pixel distance available from recent server time. */
  movementCreditPx?: number;
  /** Server time at which the movement-credit bucket was last refilled. */
  movementCreditUpdatedAtMs?: number;
  /** Server time of the last processed movement intent (packet flood guard). */
  lastMovementPacketAtMs?: number;
  /** Server time the last explicit position correction was sent. */
  lastMovementCorrectionAtMs?: number;
  /** True for server-side synthetic bot slots (no real WS connection). */
  isBot?: true;
  /** Bot AI agent — present only when isBot is true. */
  botAgent?: IBotAgent;
}

/**
 * Phase 6 — active meeting state (GAME_SPEC.md §6 DISCUSSION → VOTING).
 * `votes` maps voterSlot → targetSlot (NO_TARGET = skip). Both timers are
 * server-authoritative; the client only mirrors them for its countdown UI.
 */
export interface MeetingChatEntry {
  slot: number;
  text: string;
  sentAtMs: number;
}

export interface MeetingState {
  reporterSlot: number;
  /** NO_TARGET (0xFF) = emergency button, no specific body. */
  bodySlot: number;
  /** Public discussion transcript retained server-side so bots can respond to real chat. */
  messages: MeetingChatEntry[];
  votes: Map<number, number>;
  /** Becomes true once the discussion window elapses; votes are rejected before then. */
  votingOpen: boolean;
  discussionTimer: ReturnType<typeof setTimeout> | null;
  votingTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Phase 8 — active sabotage state (GAME_SPEC.md §10).
 * `startedAtMs` is mirrored by clients to drive their own countdown UI
 * (same pattern as MeetingState's timers). `padFixedAt` tracks, for
 * two-pad systems (O2/Reactor), when each pad index was last fixed — two
 * different pads fixed within SABOTAGE_PAD_SYNC_WINDOW_MS resolves it.
 */
export interface SabotageState {
  systemId: SabotageSystemId;
  startedAtMs: number;
  padFixedAt: Map<number, number>;
  /** Randomly selected task IDs affected by the Doors sabotage. */
  lockedTaskIds: number[];
  timeoutTimer: ReturnType<typeof setTimeout>;
}

export interface Lobby {
  code: string;
  phase: LobbyPhase;
  /** Wall-clock start time for match telemetry and initial cooldowns. */
  startedAtMs?: number;
  /** Client slots that have loaded the map and character atlas for this round. */
  gameplayReadySlots?: Set<number>;
  /** True only after every connected human client has reported its assets ready. */
  gameplayReady?: boolean;
  /** slot → player */
  players: Map<number, LobbyPlayer>;
  /** tgUserId → slot (fast reverse lookup) */
  userIdToSlot: Map<number, number>;
  hostSlot: number;
  /** Non-null only while phase === 'MEETING'. */
  meeting: MeetingState | null;
  /** Completed step keys: `"${slot}:${taskId}:${stepIndex}"`. Populated at game start. */
  completedTaskSteps: Set<string>;
  /** Total assigned task steps across all crewmates (denominator for progress). */
  totalTaskSteps: number;
  /** Non-null only while a sabotage is active (Phase 8). */
  sabotage: SabotageState | null;
  /** Global cooldown (ms remaining) before impostors may trigger another sabotage. */
  sabotageCooldownMs: number;
}

export const MAX_PLAYERS = 15;

/**
 * Minimal interface that server-side bot agents must implement.
 * Defined here (not in bot/BotAgent.ts) to avoid a circular import:
 * BotAgent imports from lobby.ts; lobby.ts needs only this interface.
 */
export interface IBotAgent {
  /** Called every 200ms while the lobby is ROAMING or MEETING. */
  tick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void;
}

/**
 * Structured lifecycle events, emitted only to an optional listener
 * (see `LobbyManager.setEventListener`). Used by the headless simulation
 * runner (SINGLE_PLAY.md §8) to build a per-game event log without any
 * polling — production code paths are unaffected when no listener is set.
 */
export type LobbyEvent =
  | { type: 'kill'; code: string; attackerSlot: number; victimSlot: number; atMs: number }
  | { type: 'taskStep'; code: string; slot: number; taskId: number; stepIndex: number; completedSteps: number; totalSteps: number; atMs: number }
  | { type: 'meetingStart'; code: string; reporterSlot: number; bodySlot: number; atMs: number }
  | { type: 'vote'; code: string; voterSlot: number; targetSlot: number; atMs: number }
  | { type: 'meetingResult'; code: string; ejectedSlot: number; atMs: number }
  | { type: 'sabotageStart'; code: string; systemId: number; attackerSlot: number; atMs: number }
  | { type: 'sabotageResolved'; code: string; systemId: number; fixed: boolean; atMs: number }
  | { type: 'gameOver'; code: string; winFlag: 1 | 2; atMs: number };

// ── Packet builders ─────────────────────────────────────────────────────────

/**
 * 0x10 0x05 — slot assignment (sent individually to the joining player)
 * Layout: [0x10, 0x05, slotId]
 */
export function buildSlotAssignedPacket(slot: number): Buffer {
  return Buffer.from([0x10, 0x05, slot]);
}

/**
 * 0x10 0x03 — room update broadcast
 *
 * Layout:
 *   [0x10, 0x03, playerCount, hostSlot, ...6-byte ASCII room code,
 *    (slotId, usernameLen, ...username UTF-8) × N]
 */
export function buildRoomUpdatePacket(lobby: Lobby): Buffer {
  const players = Array.from(lobby.players.values()).sort((a, b) => a.slot - b.slot);
  const usernameBufs = players.map(p => Buffer.from(p.username, 'utf8'));
  const totalSize =
    2 +   // opcode + sub-action
    1 +   // player count
    1 +   // host slot
    6 +   // room code
    players.reduce((sum, _, i) => sum + 1 + 1 + usernameBufs[i].length, 0);

  const buf = Buffer.alloc(totalSize);
  let off = 0;

  buf.writeUInt8(0x10, off++);
  buf.writeUInt8(0x03, off++);
  buf.writeUInt8(players.length, off++);
  buf.writeUInt8(lobby.hostSlot, off++);
  Buffer.from(lobby.code, 'ascii').copy(buf, off); off += 6;

  for (let i = 0; i < players.length; i++) {
    buf.writeUInt8(players[i].slot, off++);
    buf.writeUInt8(usernameBufs[i].length, off++);
    usernameBufs[i].copy(buf, off); off += usernameBufs[i].length;
  }

  return buf;
}

/**
 * 0x10 0x04 — join error
 * Error codes: 0x01 = not found, 0x02 = in progress, 0x03 = full
 */
export function buildJoinErrorPacket(errorCode: 0x01 | 0x02 | 0x03): Buffer {
  return Buffer.from([0x10, 0x04, errorCode]);
}

/**
 * 0x1A — role reveal (sent individually to each player at game start)
 *
 * Crewmate packet: [0x1A, 0x00]
 * Impostor packet: [0x1A, 0x01, impostorCount, slot_0, slot_1, ...]
 *
 * Information asymmetry (GAME_SPEC.md §8): impostors learn their teammates'
 * slots; crewmates receive NO role data about other players.
 */
export function buildRoleRevealPacket(role: 0 | 1, impostorSlots: number[] = []): Buffer {
  if (role === 0) return Buffer.from([0x1A, 0x00]);
  return Buffer.from([0x1A, 0x01, impostorSlots.length, ...impostorSlots]);
}

/**
 * 0x15 sub 0x01 — kill broadcast (GAME_SPEC.md §9).
 * Layout: [0x15, 0x01, victimSlot, attackerSlot]
 * (attackerSlot is a local extension of the spec's 3-byte format, so the
 * attacking client can reliably reset its own cooldown UI on confirmation.)
 */
export function buildKillPacket(victimSlot: number, attackerSlot: number): Buffer {
  return Buffer.from([0x15, 0x01, victimSlot, attackerSlot]);
}

/**
 * 0x21 — immutable corpse drop position.
 * Layout: [0x21, victimSlot, wireX(UInt16LE), wireY(UInt16LE)].
 * The dead player's ghost can move freely; the corpse stays at the kill position.
 */
export function buildCorpsePacket(victimSlot: number, x: number, y: number): Buffer {
  const packet = Buffer.alloc(6);
  packet.writeUInt8(0x21, 0);
  packet.writeUInt8(victimSlot, 1);
  packet.writeUInt16LE(Math.max(0, Math.min(32000, toWire(x, MAP_W))), 2);
  packet.writeUInt16LE(Math.max(0, Math.min(32000, toWire(y, MAP_H))), 4);
  return packet;
}

/**
 * 0x1B — meeting start broadcast (GAME_SPEC.md §6/§9 Phase 6).
 * Layout: [0x1B, reporterSlot, bodySlot] (bodySlot = NO_TARGET for emergency).
 */
export function buildMeetingStartPacket(reporterSlot: number, bodySlot: number): Buffer {
  return Buffer.from([0x1B, reporterSlot, bodySlot]);
}

/**
 * 0x1C — vote result / eject broadcast (GAME_SPEC.md §6/§9 Phase 6).
 * Layout: [0x1C, ejectedSlot, winFlag]
 *   ejectedSlot: NO_TARGET (0xFF) if no one was ejected (tie or skip majority).
 *   winFlag: 0 = game continues, 1 = crewmates win, 2 = impostors win.
 * Also reused (with ejectedSlot = NO_TARGET) to end the game right after a
 * kill tips the alive-player parity in the impostors' favor, without a vote.
 */
export function buildVoteResultPacket(ejectedSlot: number, winFlag: 0 | 1 | 2): Buffer {
  return Buffer.from([0x1C, ejectedSlot, winFlag]);
}

/**
 * 0x1D — task assignment (S→C, crewmates only, sent right after 0x1A).
 * Layout: [0x1D, taskCount, taskId_0, taskId_1, ...]
 */
export function buildTaskAssignPacket(taskIds: number[]): Buffer {
  return Buffer.from([0x1D, taskIds.length, ...taskIds]);
}

/**
 * 0x15 sub 0x03 — global task progress broadcast (S→C, 3 bytes).
 * Layout: [0x15, 0x03, progressPercent]  (percent: 0–100)
 * Distinguished from C→S task-step (4 bytes) by packet length.
 */
export function buildTaskProgressPacket(percent: number): Buffer {
  return Buffer.from([0x15, 0x03, Math.max(0, Math.min(100, Math.round(percent)))]);
}

/**
 * 0x16 sub 0x01 — sabotage started (S→C, Phase 8, GAME_SPEC.md §10).
 * Layout: [0x16, 0x01, systemId, attackerSlot]
 * (attackerSlot lets the triggering client start its own cooldown UI,
 * same rationale as buildKillPacket's attackerSlot.)
 */
export function buildSabotageStartPacket(systemId: number, attackerSlot: number): Buffer {
  return Buffer.from([0x16, 0x01, systemId, attackerSlot]);
}

/**
 * 0x16 sub 0x02 — sabotage pad-fixed progress (S→C, two-pad systems only).
 * Layout: [0x16, 0x02, systemId, padId]
 */
export function buildSabotagePadFixedPacket(systemId: number, padId: number): Buffer {
  return Buffer.from([0x16, 0x02, systemId, padId]);
}

/**
 * 0x16 sub 0x03 — sabotage fixed / cleared (S→C).
 * Layout: [0x16, 0x03, systemId]
 */
export function buildSabotageFixedPacket(systemId: number): Buffer {
  return Buffer.from([0x16, 0x03, systemId]);
}

/**
 * 0xFF — delta sync broadcast
 *
 * Layout:
 *   Byte 0:   0xFF
 *   Byte 1:   N (number of moving players, Uint8)
 *   [× N]:
 *     Byte 0:    slot (Uint8)
 *     Bytes 1–2: X (Int16LE, wire-normalized 0–32000)
 *     Bytes 3–4: Y (Int16LE, wire-normalized 0–32000)
 *
 * Total: 2 + N×5 bytes.
 */
export function buildDeltaPacket(
  players: Array<{ slot: number; wireX: number; wireY: number }>,
): Buffer {
  const buf = Buffer.alloc(2 + players.length * 5);
  let off = 0;
  buf.writeUInt8(0xFF, off++);
  buf.writeUInt8(players.length, off++);
  for (const p of players) {
    buf.writeUInt8(p.slot, off++);
    buf.writeInt16LE(p.wireX, off); off += 2;
    buf.writeInt16LE(p.wireY, off); off += 2;
  }
  return buf;
}

// ── LobbyManager ────────────────────────────────────────────────────────────

export class LobbyManager {
  /** room code → Lobby */
  readonly lobbies = new Map<string, Lobby>();
  /** tgUserId → room code */
  readonly userToLobbyMap = new Map<number, string>();

  private _deltaInterval: ReturnType<typeof setInterval> | null = null;
  /** 5Hz bot AI tick loop — keeps server-side pathfinding economical; client animation interpolates between updates. */
  private _botInterval: ReturnType<typeof setInterval> | null = null;

  /** Optional sink for LobbyEvent — set only by the headless simulation runner. */
  private _eventListener: ((event: LobbyEvent) => void) | null = null;
  /** Per-user rate limit for meeting chat, matching the base clone's 500ms cap. */
  private _chatLastSentAt = new Map<number, number>();
  /** Socket identities retired by a successful session transition. */
  private _supersededSockets = new WeakSet<WebSocket>();

  /** Install (or clear, with null) a listener for structured lifecycle events. */
  setEventListener(fn: ((event: LobbyEvent) => void) | null): void {
    this._eventListener = fn;
  }

  private _emit(event: LobbyEvent): void {
    this._eventListener?.(event);
  }

  /**
   * Clear any pending meeting/sabotage timers and unregister a lobby.
   * Used both when the last human leaves a lobby and by the headless
   * simulation runner when a game finishes — without this, a lobby's
   * `setTimeout`s (meeting discussion/voting, sabotage countdown) could
   * still fire after the lobby object is gone, or — worse, once a lobby
   * code is later reused — misattribute a stale event to a new game.
   */
  disposeLobby(lobby: Lobby): void {
    if (lobby.meeting) {
      if (lobby.meeting.discussionTimer) clearTimeout(lobby.meeting.discussionTimer);
      if (lobby.meeting.votingTimer) clearTimeout(lobby.meeting.votingTimer);
    }
    if (lobby.sabotage) {
      clearTimeout(lobby.sabotage.timeoutTimer);
    }
    this.lobbies.delete(lobby.code);
    if (this.lobbies.size === 0) {
      this._stopDeltaLoop();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private freshCode(): string {
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      if (++attempts > 1000) throw new Error('Room code space exhausted');
    } while (this.lobbies.has(code));
    return code;
  }

  private nextFreeSlot(lobby: Lobby): number | null {
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!lobby.players.has(s)) return s;
    }
    return null;
  }

  getLobbyForUser(tgUserId: number): Lobby | null {
    const code = this.userToLobbyMap.get(tgUserId);
    return code ? (this.lobbies.get(code) ?? null) : null;
  }

  /**
   * Once a user is attached to a lobby, only that player's currently bound
   * socket may send game actions. A replaced socket can have messages already
   * queued while its close handshake is in flight, so close() alone is not an
   * authorization boundary.
   */
  isCurrentSocket(tgUserId: number, ws: WebSocket): boolean {
    const lobby = this.getLobbyForUser(tgUserId);
    if (!lobby) return true; // authenticated connection not yet assigned to a room
    const slot = lobby.userIdToSlot.get(tgUserId);
    return slot !== undefined && lobby.players.get(slot)?.ws === ws;
  }

  /** True only for an old socket explicitly retired during session replacement. */
  isSupersededSocket(ws: WebSocket): boolean {
    return this._supersededSockets.has(ws);
  }

  // ── Bot slot management ──────────────────────────────────────────────────

  /**
   * Add a bot player to a lobby that is still in WAITING phase.
   * The bot occupies a real slot just like a human player, except:
   *   - Its ws is a NullWebSocket sentinel (readyState = 3 / CLOSED),
   *     so all broadcast helpers naturally skip it.
   *   - Its tgUserId is a negative number (-(botIndex + 1)) to avoid
   *     collisions with real Telegram user IDs.
   *   - It is NOT added to userToLobbyMap (bots don't have WS connections).
   *
   * Call addBotPlayer before startGame; startGame will assign the role and
   * spawn position just like for any other player.
   */
  addBotPlayer(lobby: Lobby, botIndex: number, username: string, agent: IBotAgent): LobbyPlayer | null {
    const slot = this.nextFreeSlot(lobby);
    if (slot === null) return null;

    const fakeTgUserId = -(botIndex + 1); // guaranteed negative → no collision
    // NullWebSocket: readyState=3 (CLOSED) so every `ws.readyState === 1` check skips it
    const nullWs = { readyState: 3 as const, send: (_data: unknown) => {} } as unknown as WebSocket;

    const player: LobbyPlayer = {
      slot,
      tgUserId: fakeTgUserId,
      username,
      ws: nullWs,
      x: SPAWN_X, y: SPAWN_Y,
      lastBroadcastWireX: -100_000,
      lastBroadcastWireY: -100_000,
      role: 'crewmate', // overwritten by startGame
      alive: true,
      killCooldownMs: 0,
      assignedTasks: [],
      isBot: true,
      botAgent: agent,
    };

    lobby.players.set(slot, player);
    lobby.userIdToSlot.set(fakeTgUserId, slot);
    logger.info(`[Lobby] Bot added to ${lobby.code} — "${username}" (slot=${slot})`);
    return player;
  }

  // ── Convenience action methods (used by both wsServer and bot agents) ────

  /**
   * Complete a task step and broadcast progress + check win.
   * Combines handleTaskStep + task-progress broadcast + checkWinAfterTask into
   * a single call so bot agents and the WS handler share the same logic.
   */
  applyTaskStep(lobby: Lobby, playerSlot: number, taskId: number, stepIndex: number): boolean {
    const accepted = this.handleTaskStep(lobby, playerSlot, taskId, stepIndex);
    if (!accepted) return false;
    this._emit({
      type: 'taskStep', code: lobby.code, slot: playerSlot, taskId, stepIndex,
      completedSteps: lobby.completedTaskSteps.size, totalSteps: lobby.totalTaskSteps,
      atMs: Date.now(),
    });
    this._broadcastTaskProgress(lobby);
    this.checkWinAfterTask(lobby);
    return true;
  }

  private _broadcastTaskProgress(lobby: Lobby): void {
    const percent = lobby.totalTaskSteps > 0
      ? Math.round((lobby.completedTaskSteps.size / lobby.totalTaskSteps) * 100)
      : 0;
    const packet = buildTaskProgressPacket(percent);
    for (const p of lobby.players.values()) {
      if (p.ws.readyState === /* OPEN */ 1) p.ws.send(packet);
    }
  }

  /**
   * Attempt a kill and, if successful, broadcast it and check win condition.
   * Returns true if the kill was applied.
   */
  applyKill(lobby: Lobby, attackerSlot: number, victimSlot: number): boolean {
    const applied = this.attemptKill(lobby, attackerSlot, victimSlot);
    if (!applied) return false;
    this._emit({ type: 'kill', code: lobby.code, attackerSlot, victimSlot, atMs: Date.now() });
    this.broadcastKill(lobby, victimSlot, attackerSlot);
    this.broadcastCorpse(lobby, victimSlot);
    this.checkWinAfterKill(lobby);
    // Dropping the victim's incomplete steps (attemptKill) can itself push
    // completedTaskSteps.size to totalTaskSteps — re-check tasks too, but
    // only if the kill didn't already end the game via parity/wipe above.
    if (lobby.phase === 'ROAMING') {
      this._broadcastTaskProgress(lobby);
      this.checkWinAfterTask(lobby);
    }
    return true;
  }

  /**
   * Attempt a sabotage repair and broadcast the result.
   * Returns the same 'fixed' | 'progress' | 'rejected' as attemptRepair.
   */
  applyRepair(
    lobby: Lobby,
    playerSlot: number,
    systemId: number,
    padId: number,
  ): 'fixed' | 'progress' | 'rejected' {
    const result = this.attemptRepair(lobby, playerSlot, systemId, padId);
    if (result === 'fixed') this.broadcastSabotageFixed(lobby, systemId);
    else if (result === 'progress') this.broadcastSabotagePadFixed(lobby, systemId, padId);
    return result;
  }

  /** Enter a vent after validating role, range, phase and vent ID server-side. */
  enterVent(lobby: Lobby, playerSlot: number, ventId: number): boolean {
    if (lobby.phase !== 'ROAMING') return false;
    const player = lobby.players.get(playerSlot);
    const vent = findVent(ventId);
    if (!player || !player.alive || player.role !== 'impostor' || player.inVent || !vent) return false;
    const dx = player.x - vent.x;
    const dy = player.y - vent.y;
    if (dx * dx + dy * dy > VENT_INTERACTION_RANGE_PX * VENT_INTERACTION_RANGE_PX) return false;

    player.inVent = true;
    player.ventId = ventId;
    player.x = vent.x;
    player.y = vent.y;
    player.lastBroadcastWireX = toWire(vent.x, MAP_W);
    player.lastBroadcastWireY = toWire(vent.y, MAP_H);
    this._broadcastVentState(lobby, 0x01, playerSlot, ventId);
    return true;
  }

  /** Travel only along explicitly connected vents. */
  travelVent(lobby: Lobby, playerSlot: number, ventId: number): boolean {
    if (lobby.phase !== 'ROAMING') return false;
    const player = lobby.players.get(playerSlot);
    const fromVentId = player?.ventId;
    const vent = findVent(ventId);
    if (!player || !player.alive || player.role !== 'impostor' || !player.inVent ||
        fromVentId === undefined || !vent || !canTravelVent(fromVentId, ventId)) return false;

    player.ventId = ventId;
    player.x = vent.x;
    player.y = vent.y;
    player.lastBroadcastWireX = toWire(vent.x, MAP_W);
    player.lastBroadcastWireY = toWire(vent.y, MAP_H);
    this._broadcastVentState(lobby, 0x02, playerSlot, ventId);
    return true;
  }

  /** Exit at the current vent; the following delta includes the visible position. */
  exitVent(lobby: Lobby, playerSlot: number): boolean {
    const player = lobby.players.get(playerSlot);
    if (lobby.phase !== 'ROAMING' || !player || !player.alive ||
        player.role !== 'impostor' || !player.inVent || player.ventId === undefined) return false;
    const ventId = player.ventId;
    player.inVent = false;
    player.ventId = undefined;
    player.lastBroadcastWireX = -100_000;
    player.lastBroadcastWireY = -100_000;
    this._broadcastVentState(lobby, 0x03, playerSlot, ventId);
    return true;
  }

  private _broadcastVentState(lobby: Lobby, sub: 0x01 | 0x02 | 0x03, playerSlot: number, ventId: number): void {
    const packet = Buffer.from([0x18, sub, playerSlot, ventId]);
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) player.ws.send(packet);
    }
  }

  /** Broadcast the two task consoles temporarily disabled by the Doors sabotage. */
  broadcastDoorLocks(lobby: Lobby): void {
    const activeSabotage = lobby.sabotage;
    const taskIds = activeSabotage?.systemId === SABOTAGE_DOORS ? activeSabotage.lockedTaskIds : [];
    const packet = Buffer.from([0x16, 0x04, SABOTAGE_DOORS, taskIds.length, ...taskIds]);
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) player.ws.send(packet);
    }
  }

  /** Living players can send meeting chat; all connected lobby members can receive it. */
  sendMeetingChat(lobby: Lobby, playerSlot: number, rawText: string): boolean {
    if (lobby.phase !== 'MEETING' || !lobby.meeting) return false;
    const sender = lobby.players.get(playerSlot);
    if (!sender || !sender.alive) return false;
    const now = Date.now();
    if (now - (this._chatLastSentAt.get(sender.tgUserId) ?? 0) < 500) return false;
    const text = String(rawText ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (!text) return false;
    const payload = Buffer.from(text, 'utf8').subarray(0, 200);
    const safeText = payload.toString('utf8').trim();
    if (!safeText) return false;
    const body = Buffer.from(safeText, 'utf8');
    meeting.messages.push({ slot: playerSlot, text: safeText, sentAtMs: now });
    if (meeting.messages.length > 60) meeting.messages.splice(0, meeting.messages.length - 60);
    this._chatLastSentAt.set(sender.tgUserId, now);
    const packet = Buffer.alloc(4 + body.length);
    packet[0] = 0x19;
    packet[1] = 0x02; // message broadcast
    packet[2] = playerSlot;
    packet[3] = body.length;
    body.copy(packet, 4);
    // Meeting chat is public to the whole lobby, including eliminated
    // spectators. The sender check above still prevents ghosts from posting.
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) player.ws.send(packet);
    }
    return true;
  }

  // ── Create ───────────────────────────────────────────────────────────────

  /**
   * Move an authenticated user to a new lobby/session without leaving the
   * previous lobby's roster stale. removePlayer() performs host migration and
   * may tear down the old lobby; if players remain, publish the roster change.
   * Close the replaced socket only after removing its membership so its later
   * close event is rejected by the socket-identity guard in removePlayer().
   */
  private detachForReplacement(tgUserId: number, replacementWs: WebSocket): void {
    const currentLobby = this.getLobbyForUser(tgUserId);
    const currentSlot = currentLobby?.userIdToSlot.get(tgUserId);
    const previousWs = currentSlot === undefined
      ? undefined
      : currentLobby?.players.get(currentSlot)?.ws;

    const remainingLobby = this.removePlayer(tgUserId, previousWs);
    if (remainingLobby) this.broadcastRoomUpdate(remainingLobby);

    if (previousWs && previousWs !== replacementWs) {
      // Mark before close(): already-queued message events must not act as the
      // same Telegram user after the replacement socket takes over.
      this._supersededSockets.add(previousWs);
      if (previousWs.readyState === 1) {
        previousWs.close(1000, 'Replaced by a newer session');
      }
    }
  }

  createLobby(tgUserId: number, username: string, ws: WebSocket): Lobby {
    this.detachForReplacement(tgUserId, ws);

    const code = this.freshCode();
    const hostPlayer: LobbyPlayer = {
      slot: 0, tgUserId, username, ws,
      x: SPAWN_X, y: SPAWN_Y,
      lastBroadcastWireX: toWire(SPAWN_X, MAP_W),
      lastBroadcastWireY: toWire(SPAWN_Y, MAP_H),
      role: 'crewmate', alive: true, killCooldownMs: 0,
      assignedTasks: [],
    };

    const lobby: Lobby = {
      code, phase: 'WAITING',
      players: new Map([[0, hostPlayer]]),
      userIdToSlot: new Map([[tgUserId, 0]]),
      hostSlot: 0,
      meeting: null,
      completedTaskSteps: new Set(),
      totalTaskSteps: 0,
      sabotage: null,
      sabotageCooldownMs: 0,
    };

    this.lobbies.set(code, lobby);
    this.userToLobbyMap.set(tgUserId, code);
    this.ensureDeltaLoop();

    logger.info(`[Lobby] Created ${code} — host: ${username} (userId=${tgUserId}, slot=0)`);
    return lobby;
  }

  /**
   * Create a lobby with zero players and no host — used only by the headless
   * simulation runner (SINGLE_PLAY.md §8), which has no real WebSocket
   * connection to attach as a human host. Caller fills every slot via
   * `addBotPlayer` and then calls `startGame`. Registered + loop-started
   * exactly like `createLobby`, so the existing 25Hz/5Hz loops (and, in turn,
   * every other lobby already running in this manager) pick it up automatically.
   */
  createHeadlessLobby(): Lobby {
    const code = this.freshCode();
    const lobby: Lobby = {
      code, phase: 'WAITING',
      players: new Map(),
      userIdToSlot: new Map(),
      hostSlot: 0,
      meeting: null,
      completedTaskSteps: new Set(),
      totalTaskSteps: 0,
      sabotage: null,
      sabotageCooldownMs: 0,
    };

    this.lobbies.set(code, lobby);
    this.ensureDeltaLoop();

    logger.info(`[Lobby] Created headless ${code} (simulation — no human host)`);
    return lobby;
  }

  // ── Join ─────────────────────────────────────────────────────────────────

  joinLobby(
    roomCode: string,
    tgUserId: number,
    username: string,
    ws: WebSocket,
  ): Lobby | 'not_found' | 'in_progress' | 'full' {
    const lobby = this.lobbies.get(roomCode.toUpperCase());
    if (!lobby) return 'not_found';
    if (lobby.phase !== 'WAITING') return 'in_progress';

    // Rejoin: same user already in this lobby. The older authenticated
    // socket must not remain capable of sending actions as this same user.
    if (lobby.userIdToSlot.has(tgUserId)) {
      const slot = lobby.userIdToSlot.get(tgUserId)!;
      const existing = lobby.players.get(slot)!;
      const previousWs = existing.ws;
      existing.ws = ws;
      this.userToLobbyMap.set(tgUserId, lobby.code);
      if (previousWs !== ws) {
        this._supersededSockets.add(previousWs);
        if (previousWs.readyState === 1) {
          previousWs.close(1000, 'Replaced by a newer session');
        }
      }
      logger.info(`[Lobby] Rejoin ${lobby.code} — ${username} (slot=${slot})`);
      return lobby;
    }

    const slot = this.nextFreeSlot(lobby);
    if (slot === null) return 'full';

    this.detachForReplacement(tgUserId, ws);

    const player: LobbyPlayer = {
      slot, tgUserId, username, ws,
      x: SPAWN_X, y: SPAWN_Y,
      lastBroadcastWireX: toWire(SPAWN_X, MAP_W),
      lastBroadcastWireY: toWire(SPAWN_Y, MAP_H),
      role: 'crewmate', alive: true, killCooldownMs: 0,
      assignedTasks: [],
    };
    lobby.players.set(slot, player);
    lobby.userIdToSlot.set(tgUserId, slot);
    this.userToLobbyMap.set(tgUserId, roomCode);
    // (sabotage / sabotageCooldownMs are lobby-level and already initialized in createLobby)

    logger.info(`[Lobby] Joined ${roomCode} — ${username} (userId=${tgUserId}, slot=${slot})`);
    return lobby;
  }

  // ── Remove / disconnect ───────────────────────────────────────────────────

  removePlayer(tgUserId: number, closingWs?: WebSocket): Lobby | null {
    const code = this.userToLobbyMap.get(tgUserId);
    if (!code) return null;

    const lobby = this.lobbies.get(code);
    if (!lobby) return null;

    const slot = lobby.userIdToSlot.get(tgUserId);
    if (slot === undefined) return null;

    if (closingWs !== undefined && lobby.players.get(slot)?.ws !== closingWs) {
      logger.info(`[Lobby] Stale close ignored for userId=${tgUserId} (slot=${slot}) in ${code}`);
      return null;
    }

    const departing = lobby.players.get(slot);

    this.userToLobbyMap.delete(tgUserId);
    this._chatLastSentAt.delete(tgUserId);
    lobby.players.delete(slot);
    lobby.userIdToSlot.delete(tgUserId);

    logger.info(`[Lobby] Left ${code} — userId=${tgUserId} (slot=${slot})`);

    // Tear down when no human players remain.
    // A solo game has bots occupying real slots; after the only human leaves,
    // lobby.players.size > 0 but every remaining entry is isBot:true.
    // Without this check the lobby and its bot tick/delta loops would run forever.
    const hasHumans = Array.from(lobby.players.values()).some(p => !p.isBot);
    if (!hasHumans) {
      this.disposeLobby(lobby);
      logger.info(`[Lobby] Torn down lobby ${code} (no human players remaining)`);
      return null;
    }

    if (lobby.phase === 'WAITING' && slot === lobby.hostSlot) {
      const lowestSlot = Math.min(...lobby.players.keys());
      lobby.hostSlot = lowestSlot;
      logger.info(`[Lobby] Host migrated to slot=${lowestSlot} in ${code}`);
    }

    // Same bug class as attemptKill/_tallyVotes: a departing crewmate can
    // never submit their remaining task steps either, so drop them from the
    // shared denominator or the task-win condition can become unreachable.
    // Only relevant once a game is actually in progress (totalTaskSteps is
    // 0 before ROAMING starts).
    if (departing && lobby.totalTaskSteps > 0 && (lobby.phase === 'ROAMING' || lobby.phase === 'MEETING')) {
      this._removeIncompleteTaskSteps(lobby, departing);
      this._broadcastTaskProgress(lobby);
      if (lobby.phase === 'ROAMING') {
        const winFlag = this._computeWinFlag(lobby);
        if (winFlag !== 0) {
          lobby.phase = 'GAMEOVER';
          this._broadcastVoteResult(lobby, NO_TARGET, winFlag);
          this._emit({ type: 'gameOver', code: lobby.code, winFlag, atMs: Date.now() });
        } else {
          this.checkWinAfterTask(lobby);
        }
      }
    }

    // A departing voter may be the one holdout blocking an early tally.
    if (lobby.phase === 'MEETING' && lobby.meeting?.votingOpen) {
      const aliveCount = Array.from(lobby.players.values()).filter(p => p.alive).length;
      if (lobby.meeting.votes.size >= aliveCount) {
        if (lobby.meeting.votingTimer) { clearTimeout(lobby.meeting.votingTimer); lobby.meeting.votingTimer = null; }
        this._tallyVotes(lobby);
      }
    }

    return lobby;
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────

  broadcastRoomUpdate(lobby: Lobby): void {
    const packet = buildRoomUpdatePacket(lobby);
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) {
        player.ws.send(packet);
      }
    }
  }

  // ── Game start (Phase 4: role assignment + spawn positions) ──────────────

  /**
   * Transition lobby to ROAMING:
   * 1. Fisher-Yates shuffle → assign impostor/crewmate roles server-side.
   * 2. Spread players around the spawn point (collision-validated).
   * 3. Force every player into the next 0xFF delta so clients snap to spawns.
   * 4. Send each player their personalized 0x1A role reveal packet.
   */
  /**
   * @param impostorCountOverride Used only by the headless simulation runner
   *   to force a specific impostor count (e.g. `--impostors 1`) instead of
   *   the standard playerCount-based table. Ignored (clamped) if it doesn't
   *   fit the lobby's player count. Real games never pass this.
   */
  /**
   * Record that a human client has loaded the map and sprite atlas. Gameplay
   * (including bot movement and kills) stays paused until every connected
   * human has sent this acknowledgement. Disconnected players are naturally
   * excluded from the readiness quorum.
   */
  markGameplayReady(lobby: Lobby, slot: number): boolean {
    const player = lobby.players.get(slot);
    if (!player || player.isBot || lobby.phase !== 'ROAMING') return false;
    if (!lobby.gameplayReadySlots) lobby.gameplayReadySlots = new Set<number>();
    lobby.gameplayReadySlots.add(slot);
    return this.refreshGameplayReady(lobby);
  }

  /** Recompute readiness on action/tick boundaries so disconnects cannot stall a round. */
  isGameplayReady(lobby: Lobby): boolean {
    // Once unlocked, the ready state persists through meetings so chat/votes
    // continue to work while movement and kills are separately phase-gated.
    if (lobby.phase === 'MEETING') return lobby.gameplayReady === true;
    return this.refreshGameplayReady(lobby);
  }

  private refreshGameplayReady(lobby: Lobby): boolean {
    if (lobby.phase !== 'ROAMING') return false;
    if (!lobby.gameplayReadySlots) lobby.gameplayReadySlots = new Set<number>();
    const connectedHumans = Array.from(lobby.players.values()).filter(
      player => !player.isBot && player.ws.readyState === /* OPEN */ 1,
    );
    // Bot-only headless simulations have no connected human sockets and
    // must exercise the same gameplay loops without a browser readiness packet.
    const wasReady = lobby.gameplayReady === true;
    lobby.gameplayReady = connectedHumans.length === 0
      ? lobby.players.size > 0 && Array.from(lobby.players.values()).every(player => player.isBot)
      : connectedHumans.every(player => lobby.gameplayReadySlots!.has(player.slot));
    if (lobby.gameplayReady && !wasReady && connectedHumans.length > 0) {
      // Also handles the case where an unready client disconnects during load.
      // Clients keep their loading overlay and input lock until this broadcast.
      const packet = Buffer.from([0x24, 0x01]);
      for (const connectedPlayer of lobby.players.values()) {
        if (connectedPlayer.ws.readyState === /* OPEN */ 1) connectedPlayer.ws.send(packet);
      }
    }
    return lobby.gameplayReady;
  }

  startGame(lobby: Lobby, impostorCountOverride?: number): void {
    if (lobby.phase !== 'WAITING') return;

    const players = Array.from(lobby.players.values()).sort((a, b) => a.slot - b.slot);
    // Solo test run: a lone host has no one to be an impostor against (no
    // victims, no meetings) — force crewmate so tasks/movement/UI are
    // still testable instead of an unwinnable 1-impostor-0-crewmate game.
    const impostorCount = players.length === 1
      ? 0
      : impostorCountOverride !== undefined
        ? Math.max(1, Math.min(impostorCountOverride, players.length - 1))
        : impostorCountFor(players.length);

    // Fisher-Yates shuffle (GAME_SPEC.md §8)
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((p, i) => {
      p.role = i < impostorCount ? 'impostor' : 'crewmate';
      p.alive = true;
      p.inVent = false;
      p.ventId = undefined;
      p.emergencyMeetingUsed = false;
      // Match the real game's opening kill cooldown: impostors cannot kill
      // immediately on spawn. Crewmates have no kill action or cooldown.
      p.killCooldownMs = p.role === 'impostor' ? KILL_COOLDOWN_MS : 0;
    });

    const impostorSlots = shuffled
      .slice(0, impostorCount)
      .map(p => p.slot)
      .sort((a, b) => a - b);

    // Spread spawn positions + force inclusion in the next delta broadcast
    const assignedSpawns: Array<{ x: number; y: number }> = [];
    players.forEach((p, i) => {
      const pos = computeSpawnPosition(i, players.length, assignedSpawns);
      assignedSpawns.push(pos);
      p.x = pos.x;
      p.y = pos.y;
      p.lastBroadcastWireX = -100_000;
      p.lastBroadcastWireY = -100_000;
    });

    // ── Phase 7: Task assignment ──────────────────────────────────────────────
    // Each crewmate gets TASKS_PER_CREWMATE randomly-assigned tasks.
    const allTaskIds = TASK_DEFS.map(t => t.id);
    lobby.completedTaskSteps = new Set();
    lobby.totalTaskSteps = 0;

    for (const p of players) {
      if (p.role !== 'crewmate') { p.assignedTasks = []; continue; }
      const shuffled = [...allTaskIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      p.assignedTasks = shuffled.slice(0, TASKS_PER_CREWMATE);
      for (const tid of p.assignedTasks) {
        lobby.totalTaskSteps += TASK_DEFS.find(t => t.id === tid)!.steps;
      }
    }

    const startedAtMs = Date.now();
    for (const player of players) {
      player.movementCreditPx = 0;
      player.movementCreditUpdatedAtMs = startedAtMs;
      player.lastMovementPacketAtMs = startedAtMs;
      player.lastMovementCorrectionAtMs = undefined;
    }
    lobby.startedAtMs = startedAtMs;
    lobby.gameplayReadySlots = new Set<number>();
    lobby.gameplayReady = false;
    lobby.phase = 'ROAMING';
    logger.info(
      `[Lobby] Game started in ${lobby.code} — ${players.length} players, ` +
      `${impostorCount} impostor(s) (slots: ${impostorSlots.join(',')}), ` +
      `totalTaskSteps=${lobby.totalTaskSteps}`,
    );

    for (const p of players) {
      if (p.ws.readyState === /* OPEN */ 1) {
        p.ws.send(
          p.role === 'impostor'
            ? buildRoleRevealPacket(1, impostorSlots)
            : buildRoleRevealPacket(0),
        );
        // Send task assignment only to crewmates (impostors never receive 0x1D)
        if (p.role === 'crewmate' && p.assignedTasks.length > 0) {
          p.ws.send(buildTaskAssignPacket(p.assignedTasks));
        }
      }
    }
  }

  // ── Kill mechanics (Phase 5) ──────────────────────────────────────────────

  /**
   * Validate + apply a kill attempt (GAME_SPEC.md §9).
   * Returns true if the kill was applied (caller should broadcast it).
   */
  attemptKill(lobby: Lobby, attackerSlot: number, victimSlot: number): boolean {
    if (lobby.phase !== 'ROAMING') return false;
    if (attackerSlot === victimSlot) return false;

    const attacker = lobby.players.get(attackerSlot);
    const victim = lobby.players.get(victimSlot);
    if (!attacker || !victim) return false;

    if (!attacker.alive || attacker.role !== 'impostor' || attacker.inVent) return false;
    if (!victim.alive || victim.role === 'impostor' || victim.inVent) return false; // no team kill
    if (attacker.killCooldownMs > 0) return false;

    const dx = attacker.x - victim.x;
    const dy = attacker.y - victim.y;
    if (dx * dx + dy * dy > KILL_RANGE_PX * KILL_RANGE_PX) return false;

    victim.corpseX = victim.x;
    victim.corpseY = victim.y;
    victim.bodyReported = false;
    victim.alive = false;
    attacker.killCooldownMs = KILL_COOLDOWN_MS;
    // Ghost crewmates retain assigned tasks and may finish them after death.
    return true;
  }

  /**
   * Remove unfinished task steps only when a crewmate permanently leaves the
   * lobby. Death and ejection turn crewmates into ghosts who retain their tasks,
   * can complete them, and still contribute to the crew task-win condition.
   */
  private _removeIncompleteTaskSteps(lobby: Lobby, victim: LobbyPlayer): void {
    if (victim.role !== 'crewmate' || victim.assignedTasks.length === 0) return;
    let removed = 0;
    for (const taskId of victim.assignedTasks) {
      const def = TASK_DEFS.find(t => t.id === taskId);
      if (!def) continue;
      for (let step = 0; step < def.steps; step++) {
        if (!lobby.completedTaskSteps.has(`${victim.slot}:${taskId}:${step}`)) removed++;
      }
    }
    if (removed > 0) {
      lobby.totalTaskSteps -= removed;
      logger.info(
        `[Lobby] Dropped ${removed} incomplete task step(s) for dead slot=${victim.slot} ` +
        `in ${lobby.code} (${lobby.completedTaskSteps.size}/${lobby.totalTaskSteps})`,
      );
    }
  }

  broadcastKill(lobby: Lobby, victimSlot: number, attackerSlot: number): void {
    const packet = buildKillPacket(victimSlot, attackerSlot);
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) {
        player.ws.send(packet);
      }
    }
  }

  broadcastCorpse(lobby: Lobby, victimSlot: number): void {
    const victim = lobby.players.get(victimSlot);
    if (!victim) return;
    const x = victim.corpseX ?? victim.x;
    const y = victim.corpseY ?? victim.y;
    const packet = buildCorpsePacket(victimSlot, x, y);
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) player.ws.send(packet);
    }
  }

  /**
   * After a task step completes, check whether every crewmate task is now done.
   * If so, crewmates win immediately (Phase 7, GAME_SPEC.md §10).
   */
  checkWinAfterTask(lobby: Lobby): void {
    if (lobby.phase !== 'ROAMING') return;
    if (lobby.totalTaskSteps === 0) return;
    if (lobby.completedTaskSteps.size < lobby.totalTaskSteps) return;
    lobby.phase = 'GAMEOVER';
    this._broadcastVoteResult(lobby, NO_TARGET, 1); // crewmates win
    this._emit({ type: 'gameOver', code: lobby.code, winFlag: 1, atMs: Date.now() });
    logger.info(`[Lobby] Crewmates win by tasks in ${lobby.code}`);
  }

  /**
   * After a kill lands, check whether it just tipped the alive-player parity
   * in the impostors' favor (or wiped them out). If so, end the game right
   * away rather than waiting for a meeting to notice.
   */
  checkWinAfterKill(lobby: Lobby): void {
    if (lobby.phase !== 'ROAMING') return;
    const winFlag = this._computeWinFlag(lobby);
    if (winFlag === 0) return;
    lobby.phase = 'GAMEOVER';
    this._broadcastVoteResult(lobby, NO_TARGET, winFlag);
    this._emit({ type: 'gameOver', code: lobby.code, winFlag, atMs: Date.now() });
    logger.info(`[Lobby] Game over in ${lobby.code} after kill — winFlag=${winFlag}`);
  }

  // ── Sabotages (Phase 8) ────────────────────────────────────────────────────

  /**
   * Validate + trigger a sabotage (GAME_SPEC.md §10). Returns true if the
   * sabotage was started (caller should broadcast it via buildSabotageStartPacket).
   */
  triggerSabotage(lobby: Lobby, attackerSlot: number, systemId: number): boolean {
    if (lobby.phase !== 'ROAMING') return false;
    if (lobby.sabotage !== null) return false; // one sabotage at a time
    if (lobby.sabotageCooldownMs > 0) return false;
    if (!isSabotageSystemId(systemId)) return false;

    const attacker = lobby.players.get(attackerSlot);
    if (!attacker || !attacker.alive || attacker.role !== 'impostor' || attacker.inVent) return false;

    const lockedTaskIds = systemId === SABOTAGE_DOORS
      ? [...TASK_DEFS]
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.min(2, TASK_DEFS.length))
          .map(task => task.id)
      : [];

    lobby.sabotage = {
      systemId,
      startedAtMs: Date.now(),
      padFixedAt: new Map(),
      lockedTaskIds,
      timeoutTimer: setTimeout(
        () => this._sabotageTimeout(lobby),
        getSabotageTimeoutMs(systemId),
      ),
    };
    lobby.sabotageCooldownMs = SABOTAGE_COOLDOWN_MS;

    this._emit({ type: 'sabotageStart', code: lobby.code, systemId, attackerSlot, atMs: Date.now() });
    logger.info(
      `[Lobby] Sabotage triggered in ${lobby.code}: system=${SABOTAGE_DEFS[systemId].name} ` +
      `by slot=${attackerSlot}`,
    );
    return true;
  }

  broadcastSabotageStart(lobby: Lobby, systemId: number, attackerSlot: number): void {
    const packet = buildSabotageStartPacket(systemId, attackerSlot);
    for (const p of lobby.players.values()) {
      if (p.ws.readyState === /* OPEN */ 1) p.ws.send(packet);
    }
  }

  /**
   * Validate + apply a repair action on one pad of the currently active
   * sabotage (GAME_SPEC.md §10). Returns:
   *   'fixed'    — this repair resolved the sabotage; caller should broadcast
   *                buildSabotageFixedPacket and resume ROAMING.
   *   'progress' — a pad was recorded but the sabotage isn't resolved yet
   *                (two-pad systems); caller should broadcast
   *                buildSabotagePadFixedPacket.
   *   'rejected' — no-op; the action failed validation.
   */
  attemptRepair(lobby: Lobby, playerSlot: number, systemId: number, padId: number): 'fixed' | 'progress' | 'rejected' {
    const sabotage = lobby.sabotage;
    if (!sabotage || sabotage.systemId !== systemId) return 'rejected';

    const player = lobby.players.get(playerSlot);
    if (!player || !player.alive || player.role !== 'crewmate' || player.inVent) return 'rejected';

    const def = SABOTAGE_DEFS[sabotage.systemId];
    const pad = def.pads[padId];
    if (!pad) return 'rejected';

    const dx = player.x - pad.x;
    const dy = player.y - pad.y;
    if (dx * dx + dy * dy > SABOTAGE_INTERACTION_RANGE_PX * SABOTAGE_INTERACTION_RANGE_PX) {
      return 'rejected';
    }

    if (def.pads.length === 1) {
      // Single-pad systems (Lights): any one interaction fixes it immediately.
      this._resolveSabotage(lobby);
      return 'fixed';
    }

    // Multi-pad systems (O2, Reactor): require two *different* pads fixed
    // within the sync window — recording the same pad twice never satisfies
    // the other one, so a lone crewmate can't clear it alone.
    const now = Date.now();
    sabotage.padFixedAt.set(padId, now);

    for (const [otherPadId, otherFixedAt] of sabotage.padFixedAt) {
      if (otherPadId === padId) continue;
      if (Math.abs(now - otherFixedAt) <= SABOTAGE_PAD_SYNC_WINDOW_MS) {
        this._resolveSabotage(lobby);
        return 'fixed';
      }
    }
    return 'progress';
  }

  broadcastSabotagePadFixed(lobby: Lobby, systemId: number, padId: number): void {
    const packet = buildSabotagePadFixedPacket(systemId, padId);
    for (const p of lobby.players.values()) {
      if (p.ws.readyState === /* OPEN */ 1) p.ws.send(packet);
    }
  }

  broadcastSabotageFixed(lobby: Lobby, systemId: number): void {
    const packet = buildSabotageFixedPacket(systemId);
    for (const p of lobby.players.values()) {
      if (p.ws.readyState === /* OPEN */ 1) p.ws.send(packet);
    }
  }

  private _resolveSabotage(lobby: Lobby): void {
    if (!lobby.sabotage) return;
    const systemId = lobby.sabotage.systemId;
    clearTimeout(lobby.sabotage.timeoutTimer);
    lobby.sabotage = null;
    this._emit({ type: 'sabotageResolved', code: lobby.code, systemId, fixed: true, atMs: Date.now() });
    logger.info(`[Lobby] Sabotage resolved in ${lobby.code}`);
  }

  /** Impostors win outright if a sabotage countdown reaches zero unfixed (GAME_SPEC.md §10). */
  private _sabotageTimeout(lobby: Lobby): void {
    if (!lobby.sabotage || lobby.phase !== 'ROAMING') return;
    const systemId = lobby.sabotage.systemId;
    lobby.sabotage = null;

    // Lights/Comms and Doors are temporary disruptions and auto-clear.
    // Only critical O₂/Reactor sabotage wins the round if the crew fails to fix it.
    this.broadcastSabotageFixed(lobby, systemId);
    this._emit({ type: 'sabotageResolved', code: lobby.code, systemId, fixed: false, atMs: Date.now() });

    if (isCriticalSabotage(systemId)) {
      lobby.phase = 'GAMEOVER';
      this._broadcastVoteResult(lobby, NO_TARGET, 2); // impostors win
      this._emit({ type: 'gameOver', code: lobby.code, winFlag: 2, atMs: Date.now() });
      logger.info(`[Lobby] Critical sabotage timed out in ${lobby.code} — impostors win`);
    } else {
      logger.info(`[Lobby] Non-critical sabotage expired in ${lobby.code} — system restored`);
    }
  }

  // ── Tasks (Phase 7) ──────────────────────────────────────────────────────────

  /**
   * Validate and record a completed task step (GAME_SPEC.md §10, Phase 7).
   * Returns true if the step was accepted; caller should then broadcast progress
   * and call checkWinAfterTask.
   *
   * Validation rules:
   *   - Lobby must be ROAMING
   *   - Player must be a crewmate (living or ghost) with this task assigned
   *   - stepIndex must be the next pending step (all prior steps done)
   *   - Step must not already be completed
   */
  handleTaskStep(lobby: Lobby, playerSlot: number, taskId: number, stepIndex: number): boolean {
    if (lobby.phase !== 'ROAMING') return false;

    const player = lobby.players.get(playerSlot);
    // Crewmate ghosts can still complete their assigned tasks, just like the base game.
    if (!player || player.role !== 'crewmate' || player.inVent) return false;
    const activeSabotage = lobby.sabotage;
    if (activeSabotage?.systemId === SABOTAGE_COMMS) return false; // Comms disables task completion
    if (activeSabotage?.systemId === SABOTAGE_DOORS && activeSabotage.lockedTaskIds.includes(taskId)) return false;
    if (!player.assignedTasks.includes(taskId)) return false;

    const def = TASK_DEFS.find(t => t.id === taskId);
    if (!def || stepIndex < 0 || stepIndex >= def.steps) return false;

    // Server-side proximity check: authoritative player position vs task console.
    // Prevents a forged client from completing tasks from anywhere on the map.
    const dx = player.x - def.x;
    const dy = player.y - def.y;
    if (dx * dx + dy * dy > TASK_INTERACTION_RANGE_PX * TASK_INTERACTION_RANGE_PX) {
      logger.debug(
        `[Lobby] Task step rejected (out of range): slot=${playerSlot} ` +
        `taskId=${taskId} dist=${Math.sqrt(dx * dx + dy * dy).toFixed(0)} ` +
        `range=${TASK_INTERACTION_RANGE_PX}`,
      );
      return false;
    }

    // Steps must be completed in order
    for (let i = 0; i < stepIndex; i++) {
      if (!lobby.completedTaskSteps.has(`${playerSlot}:${taskId}:${i}`)) return false;
    }

    const key = `${playerSlot}:${taskId}:${stepIndex}`;
    if (lobby.completedTaskSteps.has(key)) return false; // already done

    lobby.completedTaskSteps.add(key);
    logger.info(
      `[Lobby] Task step in ${lobby.code}: slot=${playerSlot} ` +
      `taskId=${taskId} step=${stepIndex} ` +
      `(${lobby.completedTaskSteps.size}/${lobby.totalTaskSteps})`,
    );
    return true;
  }

  // ── Meetings & voting (Phase 6) ────────────────────────────────────────────

  /**
   * Validate + start a meeting from a report or emergency call
   * (GAME_SPEC.md §6/§9). Returns true if the meeting was started
   * (caller should log; the 0x1B broadcast happens here).
   */
  callMeeting(lobby: Lobby, reporterSlot: number, bodySlot: number): boolean {
    if (lobby.phase !== 'ROAMING') return false;
    // Solo test run: a 1-player lobby has 0 impostors (see startGame), so a
    // meeting/vote tally would immediately trip _computeWinFlag's "0 alive
    // impostors → crewmates win" rule and end the test session with nothing
    // to vote on. Meetings are meaningless solo anyway — reject them so the
    // tester can keep testing movement/tasks until they leave the lobby.
    if (lobby.players.size === 1) return false;
    // Phase 8: 0x13 (report/emergency) is rejected outright while any sabotage
    // is active (GAME_SPEC.md §10) — crewmates must fix it (or run the clock
    // out) before a meeting can be called.
    if (lobby.sabotage !== null) return false;

    const reporter = lobby.players.get(reporterSlot);
    if (!reporter || !reporter.alive || reporter.inVent) return false;

    if (bodySlot !== NO_TARGET) {
      const body = lobby.players.get(bodySlot);
      if (!body || body.alive) return false; // must reference an actual dead body
      if (body.bodyReported) return false; // already voted on this corpse — nothing new to report
      body.bodyReported = true;
    } else {
      // Match the base game's one emergency button use per player per round.
      if (reporter.emergencyMeetingUsed) return false;
      reporter.emergencyMeetingUsed = true;
      if (reporter.ws.readyState === /* OPEN */ 1) {
        reporter.ws.send(Buffer.from([0x20, 0x01, reporterSlot]));
      }
    }

    // A called meeting forcibly releases any impostor hiding in a vent.
    // Clear server state before broadcasting the meeting, so the client closes
    // its vent selector and the player's sprite remains visible during voting.
    for (const player of lobby.players.values()) {
      if (!player.inVent || player.ventId === undefined) continue;
      const ventId = player.ventId;
      player.inVent = false;
      player.ventId = undefined;
      player.lastBroadcastWireX = -100_000;
      player.lastBroadcastWireY = -100_000;
      this._broadcastVentState(lobby, 0x03, player.slot, ventId);
    }

    const meeting: MeetingState = {
      reporterSlot,
      bodySlot,
      messages: [],
      votes: new Map(),
      votingOpen: false,
      discussionTimer: null,
      votingTimer: null,
    };
    lobby.phase = 'MEETING';
    lobby.meeting = meeting;

    meeting.discussionTimer = setTimeout(() => {
      meeting.votingOpen = true;
      meeting.discussionTimer = null;
    }, MEETING_DISCUSSION_MS);

    meeting.votingTimer = setTimeout(() => {
      this._tallyVotes(lobby);
    }, MEETING_DISCUSSION_MS + MEETING_VOTING_MS);

    const packet = buildMeetingStartPacket(reporterSlot, bodySlot);
    for (const p of lobby.players.values()) {
      if (p.ws.readyState === /* OPEN */ 1) p.ws.send(packet);
    }

    this._emit({ type: 'meetingStart', code: lobby.code, reporterSlot, bodySlot, atMs: Date.now() });
    logger.info(
      `[Lobby] Meeting called in ${lobby.code} by slot=${reporterSlot} ` +
      `(body=${bodySlot === NO_TARGET ? 'emergency' : bodySlot})`,
    );
    return true;
  }

  /**
   * Validate + record a vote (GAME_SPEC.md §6/§9). Auto-tallies early once
   * every alive player has voted, instead of waiting out the full timer.
   * Returns true if the vote was recorded.
   */
  castVote(lobby: Lobby, voterSlot: number, targetSlot: number): boolean {
    const meeting = lobby.meeting;
    if (lobby.phase !== 'MEETING' || !meeting || !meeting.votingOpen) return false;

    const voter = lobby.players.get(voterSlot);
    if (!voter || !voter.alive) return false;

    if (targetSlot !== NO_TARGET) {
      const target = lobby.players.get(targetSlot);
      if (!target || !target.alive) return false; // can't vote for a dead/nonexistent slot
    }

    // Reject duplicate votes — each alive player gets exactly one vote per meeting.
    if (meeting.votes.has(voterSlot)) return false;

    meeting.votes.set(voterSlot, targetSlot);
    this._emit({ type: 'vote', code: lobby.code, voterSlot, targetSlot, atMs: Date.now() });

    const aliveCount = Array.from(lobby.players.values()).filter(p => p.alive).length;
    if (meeting.votes.size >= aliveCount) {
      if (meeting.votingTimer) { clearTimeout(meeting.votingTimer); meeting.votingTimer = null; }
      this._tallyVotes(lobby);
    }
    return true;
  }

  /** Compute the alive-player win condition. 0 = none, 1 = crewmates, 2 = impostors. */
  private _computeWinFlag(lobby: Lobby): 0 | 1 | 2 {
    let aliveImpostors = 0;
    let aliveCrewmates = 0;
    for (const p of lobby.players.values()) {
      if (!p.alive) continue;
      if (p.role === 'impostor') aliveImpostors++;
      else aliveCrewmates++;
    }
    if (aliveImpostors === 0) return 1; // all impostors eliminated
    if (aliveImpostors >= aliveCrewmates) return 2; // impostors reached/beat parity
    return 0;
  }

  private _broadcastVoteResult(lobby: Lobby, ejectedSlot: number, winFlag: 0 | 1 | 2): void {
    const packet = buildVoteResultPacket(ejectedSlot, winFlag);
    for (const p of lobby.players.values()) {
      if (p.ws.readyState === /* OPEN */ 1) p.ws.send(packet);
    }
  }

  /**
   * Tally votes, apply ejection (if any), check for a win, and resume
   * ROAMING (or move to GAMEOVER). Broadcasts the single 0x1C result packet.
   */
  private _tallyVotes(lobby: Lobby): void {
    const meeting = lobby.meeting;
    if (!meeting) return;
    if (meeting.discussionTimer) clearTimeout(meeting.discussionTimer);
    if (meeting.votingTimer) clearTimeout(meeting.votingTimer);

    const counts = new Map<number, number>(); // target slot (or NO_TARGET = skip) → count
    for (const target of meeting.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }

    let best: number[] = [];
    let bestCount = 0;
    for (const [target, count] of counts) {
      if (count > bestCount) { bestCount = count; best = [target]; }
      else if (count === bestCount) { best.push(target); }
    }

    // Eject only on an outright (non-tied) plurality for a real target — a
    // tie, an empty vote, or a skip-majority all result in no ejection.
    let ejectedSlot = NO_TARGET;
    if (bestCount > 0 && best.length === 1 && best[0] !== NO_TARGET) {
      ejectedSlot = best[0];
      const ejected = lobby.players.get(ejectedSlot);
      if (ejected) {
        ejected.alive = false;
        // Same as a kill (see attemptKill): an ejected crewmate can no longer
        // submit their remaining task steps, so drop them from the shared
        // denominator or the task-win condition becomes unreachable for the
        // rest of the game.
        // Ejected crewmates retain tasks as ghosts; only disconnected players' work is removed.
      }
    }

    lobby.meeting = null;
    lobby.phase = 'ROAMING';

    let winFlag = this._computeWinFlag(lobby);
    // The ejection may have dropped the denominator far enough that the
    // remaining (already-completed) steps now satisfy it — check tasks too
    // whenever the ejection itself didn't already end the game via parity.
    if (winFlag === 0 && lobby.totalTaskSteps > 0 && lobby.completedTaskSteps.size >= lobby.totalTaskSteps) {
      winFlag = 1;
    }
    if (winFlag !== 0) lobby.phase = 'GAMEOVER';

    this._broadcastVoteResult(lobby, ejectedSlot, winFlag);
    this._broadcastTaskProgress(lobby);
    this._emit({ type: 'meetingResult', code: lobby.code, ejectedSlot, atMs: Date.now() });
    if (winFlag !== 0) {
      this._emit({ type: 'gameOver', code: lobby.code, winFlag, atMs: Date.now() });
    }
    logger.info(
      `[Lobby] Meeting concluded in ${lobby.code} — ` +
      `ejected=${ejectedSlot === NO_TARGET ? 'none' : ejectedSlot}, winFlag=${winFlag}`,
    );
  }

  // ── 25Hz delta broadcast loop ─────────────────────────────────────────────

  /**
   * Start the delta broadcast loop if it isn't already running.
   * Called lazily when the first lobby is created so we don't spin
   * unnecessarily when no lobbies exist.
   */
  ensureDeltaLoop(): void {
    if (this._deltaInterval !== null) return;

    this._deltaInterval = setInterval(() => {
      this._tickDelta();
    }, 40); // 25Hz

    this._botInterval = setInterval(() => {
      this._tickBots();
    }, 200); // 5Hz — economical AI/pathfinding tick; clients interpolate motion at render rate

    logger.info('[Lobby] Delta loop + bot tick loop started');
  }

  private _stopDeltaLoop(): void {
    if (this._deltaInterval === null) return;
    clearInterval(this._deltaInterval);
    this._deltaInterval = null;
    if (this._botInterval !== null) {
      clearInterval(this._botInterval);
      this._botInterval = null;
    }
    logger.info('[Lobby] Delta loop + bot tick loop stopped (no active lobbies)');
  }

  /**
   * 5Hz bot AI tick — called from _botInterval.
   * Runs every bot agent's tick() in every active lobby (ROAMING or MEETING).
   * Errors in individual bots are caught so a buggy agent can't crash the loop.
   */
  private _tickBots(): void {
    for (const lobby of this.lobbies.values()) {
      if (lobby.phase !== 'ROAMING' && lobby.phase !== 'MEETING') continue;
      // Bots must not start walking, sabotaging or hunting while any connected
      // human client is still showing its map-loading screen.
      if (lobby.phase === 'ROAMING' && !this.isGameplayReady(lobby)) continue;
      for (const player of lobby.players.values()) {
        if (!player.isBot || !player.botAgent) continue;
        try {
          player.botAgent.tick(lobby, player, this);
        } catch (err) {
          logger.error(
            { err },
            `[Bot] Error in bot tick — lobby=${lobby.code} slot=${player.slot}`,
          );
        }
      }
    }
  }

  private _tickDelta(): void {
    for (const lobby of this.lobbies.values()) {
      if (lobby.phase === 'ROAMING' && this.isGameplayReady(lobby)) {
        // Loading time must not consume the opening kill/sabotage cooldowns.
        this._tickKillCooldowns(lobby);
        this._tickSabotageCooldown(lobby);
      }
      this._broadcastDelta(lobby);
    }
  }

  /** Decrement each impostor's kill cooldown by one tick (40ms), floored at 0. */
  private _tickKillCooldowns(lobby: Lobby): void {
    for (const player of lobby.players.values()) {
      if (player.killCooldownMs > 0) {
        player.killCooldownMs = Math.max(0, player.killCooldownMs - 40);
      }
    }
  }

  /** Decrement the lobby-wide sabotage cooldown by one tick (40ms), floored at 0. */
  private _tickSabotageCooldown(lobby: Lobby): void {
    if (lobby.sabotageCooldownMs > 0) {
      lobby.sabotageCooldownMs = Math.max(0, lobby.sabotageCooldownMs - 40);
    }
  }

  private _broadcastDelta(lobby: Lobby): void {
    const moving: Array<{ slot: number; wireX: number; wireY: number }> = [];

    for (const player of lobby.players.values()) {
      // Vent occupants are hidden from all other players until they exit.
      if (player.inVent) continue;
      const wireX = toWire(player.x, MAP_W);
      const wireY = toWire(player.y, MAP_H);
      const dx = wireX - player.lastBroadcastWireX;
      const dy = wireY - player.lastBroadcastWireY;
      if (dx * dx + dy * dy > DELTA_THRESHOLD_SQ) {
        moving.push({ slot: player.slot, wireX, wireY });
        player.lastBroadcastWireX = wireX;
        player.lastBroadcastWireY = wireY;
      }
    }

    if (moving.length === 0) return;

    const packet = buildDeltaPacket(moving);
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) {
        player.ws.send(packet);
      }
    }
  }
}
