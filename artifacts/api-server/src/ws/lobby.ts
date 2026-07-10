/**
 * Lobby & Matchmaking — Phase 2 + Phase 3 + Phase 4
 *
 * Phase 2: LobbyManager, room code generation, slot assignment,
 *   host migration on disconnect, room update broadcast.
 * Phase 3: Per-player position tracking, 25Hz delta broadcast loop,
 *   game-start handling (0x12 → 0x1A role reveal).
 * Phase 4: Fisher-Yates role assignment with information asymmetry
 *   (personalized 0x1A packets), spread spawn positions at game start.
 *
 * Protocol reference: GAME_SPEC.md §6, §7, §8
 */
import type { WebSocket } from 'ws';
import { logger } from '../lib/logger.js';
import {
  MAP_W, MAP_H,
  toWire,
  DELTA_THRESHOLD_SQ,
  FEET_OFFSET_Y, PLAYER_RADIUS,
} from '@workspace/shared/coords';
import {
  buildCollisionGrid,
  canMoveTo,
} from '@workspace/shared/collisionMap';

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
const SPAWN_X = Math.round(350 * (MAP_W / 1040));
const SPAWN_Y = Math.round(150 * (MAP_H / 580));

/** Collision grid — built once for spawn-position validation. */
const spawnGrid = buildCollisionGrid();

/**
 * Compute a spread spawn position for player `index` of `total`.
 * Players are placed evenly around an ellipse centered on the lobby spawn
 * point; each candidate radius is validated against the collision grid,
 * falling back to the central spawn if no walkable candidate is found.
 */
function computeSpawnPosition(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: SPAWN_X, y: SPAWN_Y };
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  for (const radius of [60, 40, 20]) {
    const x = Math.round(SPAWN_X + Math.cos(angle) * radius);
    const y = Math.round(SPAWN_Y + Math.sin(angle) * radius * 0.6);
    if (canMoveTo(spawnGrid, x, y + FEET_OFFSET_Y, PLAYER_RADIUS)) return { x, y };
  }
  return { x: SPAWN_X, y: SPAWN_Y };
}

/** Impostor count by player count (GAME_SPEC.md §8; host setting UI is future work). */
function impostorCountFor(playerCount: number): number {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type LobbyPhase = 'WAITING' | 'ROAMING' | 'GAMEOVER';

export type PlayerRole = 'crewmate' | 'impostor';

export interface LobbyPlayer {
  slot: number;
  tgUserId: number;
  username: string;
  ws: WebSocket;
  /** Current pixel position (feet center — y includes FEET_OFFSET_Y). */
  x: number;
  y: number;
  /** Wire-space position at the time of last 0xFF broadcast. */
  lastBroadcastWireX: number;
  lastBroadcastWireY: number;
  /** Assigned at game start (0x12). Server-side only — never broadcast. */
  role: PlayerRole;
  alive: boolean;
}

export interface Lobby {
  code: string;
  phase: LobbyPhase;
  /** slot → player */
  players: Map<number, LobbyPlayer>;
  /** tgUserId → slot (fast reverse lookup) */
  userIdToSlot: Map<number, number>;
  hostSlot: number;
}

export const MAX_PLAYERS = 15;

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

  // ── Create ───────────────────────────────────────────────────────────────

  createLobby(tgUserId: number, username: string, ws: WebSocket): Lobby {
    this.removePlayer(tgUserId);

    const code = this.freshCode();
    const hostPlayer: LobbyPlayer = {
      slot: 0, tgUserId, username, ws,
      x: SPAWN_X, y: SPAWN_Y,
      lastBroadcastWireX: toWire(SPAWN_X, MAP_W),
      lastBroadcastWireY: toWire(SPAWN_Y, MAP_H),
      role: 'crewmate', alive: true,
    };

    const lobby: Lobby = {
      code, phase: 'WAITING',
      players: new Map([[0, hostPlayer]]),
      userIdToSlot: new Map([[tgUserId, 0]]),
      hostSlot: 0,
    };

    this.lobbies.set(code, lobby);
    this.userToLobbyMap.set(tgUserId, code);
    this.ensureDeltaLoop();

    logger.info(`[Lobby] Created ${code} — host: ${username} (userId=${tgUserId}, slot=0)`);
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

    // Rejoin: same user already in this lobby
    if (lobby.userIdToSlot.has(tgUserId)) {
      const slot = lobby.userIdToSlot.get(tgUserId)!;
      const existing = lobby.players.get(slot)!;
      existing.ws = ws;
      this.userToLobbyMap.set(tgUserId, roomCode);
      logger.info(`[Lobby] Rejoin ${roomCode} — ${username} (slot=${slot})`);
      return lobby;
    }

    const slot = this.nextFreeSlot(lobby);
    if (slot === null) return 'full';

    this.removePlayer(tgUserId);

    const player: LobbyPlayer = {
      slot, tgUserId, username, ws,
      x: SPAWN_X, y: SPAWN_Y,
      lastBroadcastWireX: toWire(SPAWN_X, MAP_W),
      lastBroadcastWireY: toWire(SPAWN_Y, MAP_H),
      role: 'crewmate', alive: true,
    };
    lobby.players.set(slot, player);
    lobby.userIdToSlot.set(tgUserId, slot);
    this.userToLobbyMap.set(tgUserId, roomCode);

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

    this.userToLobbyMap.delete(tgUserId);
    lobby.players.delete(slot);
    lobby.userIdToSlot.delete(tgUserId);

    logger.info(`[Lobby] Left ${code} — userId=${tgUserId} (slot=${slot})`);

    if (lobby.players.size === 0) {
      this.lobbies.delete(code);
      logger.info(`[Lobby] Torn down empty lobby ${code}`);
      // Stop the delta loop when there are no more active lobbies
      if (this.lobbies.size === 0) {
        this._stopDeltaLoop();
      }
      return null;
    }

    if (lobby.phase === 'WAITING' && slot === lobby.hostSlot) {
      const lowestSlot = Math.min(...lobby.players.keys());
      lobby.hostSlot = lowestSlot;
      logger.info(`[Lobby] Host migrated to slot=${lowestSlot} in ${code}`);
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
  startGame(lobby: Lobby): void {
    if (lobby.phase !== 'WAITING') return;

    const players = Array.from(lobby.players.values()).sort((a, b) => a.slot - b.slot);
    const impostorCount = impostorCountFor(players.length);

    // Fisher-Yates shuffle (GAME_SPEC.md §8)
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((p, i) => {
      p.role = i < impostorCount ? 'impostor' : 'crewmate';
      p.alive = true;
    });

    const impostorSlots = shuffled
      .slice(0, impostorCount)
      .map(p => p.slot)
      .sort((a, b) => a - b);

    // Spread spawn positions + force inclusion in the next delta broadcast
    players.forEach((p, i) => {
      const pos = computeSpawnPosition(i, players.length);
      p.x = pos.x;
      p.y = pos.y;
      p.lastBroadcastWireX = -100_000;
      p.lastBroadcastWireY = -100_000;
    });

    lobby.phase = 'ROAMING';
    logger.info(
      `[Lobby] Game started in ${lobby.code} — ${players.length} players, ` +
      `${impostorCount} impostor(s) (slots: ${impostorSlots.join(',')})`,
    );

    for (const p of players) {
      if (p.ws.readyState === /* OPEN */ 1) {
        p.ws.send(
          p.role === 'impostor'
            ? buildRoleRevealPacket(1, impostorSlots)
            : buildRoleRevealPacket(0),
        );
      }
    }
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

    logger.info('[Lobby] Delta loop started');
  }

  private _stopDeltaLoop(): void {
    if (this._deltaInterval === null) return;
    clearInterval(this._deltaInterval);
    this._deltaInterval = null;
    logger.info('[Lobby] Delta loop stopped (no active lobbies)');
  }

  private _tickDelta(): void {
    for (const lobby of this.lobbies.values()) {
      this._broadcastDelta(lobby);
    }
  }

  private _broadcastDelta(lobby: Lobby): void {
    const moving: Array<{ slot: number; wireX: number; wireY: number }> = [];

    for (const player of lobby.players.values()) {
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
