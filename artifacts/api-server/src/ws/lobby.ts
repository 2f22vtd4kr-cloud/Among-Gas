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
  KILL_COOLDOWN_MS,
  MEETING_DISCUSSION_MS, MEETING_VOTING_MS,
  NO_TARGET,
} from '@workspace/shared/coords';
import {
  buildCollisionGrid,
  canMoveTo,
  KILL_RANGE_PX,
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

export type LobbyPhase = 'WAITING' | 'ROAMING' | 'MEETING' | 'GAMEOVER';

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
  /** Impostor-only kill cooldown, ms remaining. Decremented each delta tick. */
  killCooldownMs: number;
}

/**
 * Phase 6 — active meeting state (GAME_SPEC.md §6 DISCUSSION → VOTING).
 * `votes` maps voterSlot → targetSlot (NO_TARGET = skip). Both timers are
 * server-authoritative; the client only mirrors them for its countdown UI.
 */
export interface MeetingState {
  reporterSlot: number;
  /** NO_TARGET (0xFF) = emergency button, no specific body. */
  bodySlot: number;
  votes: Map<number, number>;
  /** Becomes true once the discussion window elapses; votes are rejected before then. */
  votingOpen: boolean;
  discussionTimer: ReturnType<typeof setTimeout> | null;
  votingTimer: ReturnType<typeof setTimeout> | null;
}

export interface Lobby {
  code: string;
  phase: LobbyPhase;
  /** slot → player */
  players: Map<number, LobbyPlayer>;
  /** tgUserId → slot (fast reverse lookup) */
  userIdToSlot: Map<number, number>;
  hostSlot: number;
  /** Non-null only while phase === 'MEETING'. */
  meeting: MeetingState | null;
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
 * 0x15 sub 0x01 — kill broadcast (GAME_SPEC.md §9).
 * Layout: [0x15, 0x01, victimSlot, attackerSlot]
 * (attackerSlot is a local extension of the spec's 3-byte format, so the
 * attacking client can reliably reset its own cooldown UI on confirmation.)
 */
export function buildKillPacket(victimSlot: number, attackerSlot: number): Buffer {
  return Buffer.from([0x15, 0x01, victimSlot, attackerSlot]);
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
      role: 'crewmate', alive: true, killCooldownMs: 0,
    };

    const lobby: Lobby = {
      code, phase: 'WAITING',
      players: new Map([[0, hostPlayer]]),
      userIdToSlot: new Map([[tgUserId, 0]]),
      hostSlot: 0,
      meeting: null,
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
      role: 'crewmate', alive: true, killCooldownMs: 0,
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
      if (lobby.meeting) {
        if (lobby.meeting.discussionTimer) clearTimeout(lobby.meeting.discussionTimer);
        if (lobby.meeting.votingTimer) clearTimeout(lobby.meeting.votingTimer);
      }
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
      // Cooldown starts ready (0) at game start — GAME_SPEC.md §9's 25s cooldown
      // applies only *after* a kill, not before the first one.
      p.killCooldownMs = 0;
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

    if (!attacker.alive || attacker.role !== 'impostor') return false;
    if (!victim.alive || victim.role === 'impostor') return false; // no team kill
    if (attacker.killCooldownMs > 0) return false;

    const dx = attacker.x - victim.x;
    const dy = attacker.y - victim.y;
    if (dx * dx + dy * dy > KILL_RANGE_PX * KILL_RANGE_PX) return false;

    victim.alive = false;
    attacker.killCooldownMs = KILL_COOLDOWN_MS;
    return true;
  }

  broadcastKill(lobby: Lobby, victimSlot: number, attackerSlot: number): void {
    const packet = buildKillPacket(victimSlot, attackerSlot);
    for (const player of lobby.players.values()) {
      if (player.ws.readyState === /* OPEN */ 1) {
        player.ws.send(packet);
      }
    }
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
    logger.info(`[Lobby] Game over in ${lobby.code} after kill — winFlag=${winFlag}`);
  }

  // ── Meetings & voting (Phase 6) ────────────────────────────────────────────

  /**
   * Validate + start a meeting from a report or emergency call
   * (GAME_SPEC.md §6/§9). Returns true if the meeting was started
   * (caller should log; the 0x1B broadcast happens here).
   */
  callMeeting(lobby: Lobby, reporterSlot: number, bodySlot: number): boolean {
    if (lobby.phase !== 'ROAMING') return false;

    const reporter = lobby.players.get(reporterSlot);
    if (!reporter || !reporter.alive) return false;

    if (bodySlot !== NO_TARGET) {
      const body = lobby.players.get(bodySlot);
      if (!body || body.alive) return false; // must reference an actual dead body
    }

    const meeting: MeetingState = {
      reporterSlot,
      bodySlot,
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

    meeting.votes.set(voterSlot, targetSlot);

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
      if (ejected) ejected.alive = false;
    }

    lobby.meeting = null;
    lobby.phase = 'ROAMING';

    const winFlag = this._computeWinFlag(lobby);
    if (winFlag !== 0) lobby.phase = 'GAMEOVER';

    this._broadcastVoteResult(lobby, ejectedSlot, winFlag);
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
      if (lobby.phase === 'ROAMING') this._tickKillCooldowns(lobby);
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
