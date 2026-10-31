/**
 * WebSocket server — Phase 1 (auth) + Phase 2 (lobby) + Phase 3 (movement)
 *
 * Lifecycle:
 *   1. Client connects → 10s window to send initData (Telegram auth string)
 *   2. Server validates auth, sends [0x01, slotId] ACK
 *   3. Client sends [0x10, 0x01] to create a room  OR
 *              sends [0x10, 0x02, ...6-byte code] to join a room
 *   4. Server broadcasts [0x10, 0x03, ...] room update to all lobby members
 *   5. Host sends [0x12] to start game → server sends [0x1A, role] to all
 *   6. Clients send [0x11, wireX(Int16LE), wireY(Int16LE)] at ~25Hz
 *   7. Server validates movement, updates position, broadcasts [0xFF, ...] at 25Hz
 */
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { verifyTelegramAuth, validateAuthConfig } from './auth.js';
import {
  LobbyManager,
  buildJoinErrorPacket,
  buildSlotAssignedPacket,
  type LobbyResumeSnapshotV1,
} from './lobby.js';
import { CrewmateBot } from '../bot/CrewmateBot.js';
import { ImpostorBot } from '../bot/ImpostorBot.js';
import { isSabotageSystemId, SABOTAGE_DOORS } from '@workspace/shared/sabotage';
import { logger } from '../lib/logger.js';
import { buildPreciseCollisionGrid } from '@workspace/shared/collisionMap';
import {
  fromWire,
  toWire,
  MAP_W, MAP_H,
} from '@workspace/shared/coords';
import { buildMovementCorrectionPacket, validateMovementIntent } from './movement.js';

interface AuthSocket extends WebSocket {
  isVerified: boolean;
  tgUserId?: number;
  username?: string;
  playerSlotId?: number;
}

const WS_PATH = '/api/ws';
const HANDSHAKE_TIMEOUT_MS = 10_000;

/**
 * Hard cap on any single WS frame. The largest legitimate client→server
 * packet is a real Telegram initData string (a few hundred bytes); 4KB
 * leaves generous headroom while rejecting oversized frames at the socket
 * layer before they ever reach application code.
 */
const MAX_PAYLOAD_BYTES = 4096;

/** Outbound one-off state snapshot cap; normal client frames remain capped at 4KB. */
const MAX_RESUME_SNAPSHOT_BYTES = 64 * 1024;

/**
 * 0x25 / v1 — authoritative state snapshot sent only to a successfully
 * reattached player, after room + slot assignment. WebSocket message framing
 * supplies the packet boundary; bytes after [0x25, 0x01] are UTF-8 JSON.
 */
function buildResumeSnapshotPacket(snapshot: LobbyResumeSnapshotV1): Buffer {
  const payload = Buffer.from(JSON.stringify(snapshot), 'utf8');
  if (payload.byteLength > MAX_RESUME_SNAPSHOT_BYTES) {
    throw new Error('Reconnect snapshot exceeds the configured outbound size limit');
  }
  return Buffer.concat([Buffer.from([0x25, 0x01]), payload]);
}

/**
 * Usernames are written into buildRoomUpdatePacket as a UInt8 length prefix,
 * which throws (RangeError) for values > 255. Telegram's own limits keep
 * real usernames well under this, but DEV_MODE trusts a client-supplied
 * JSON payload verbatim (see auth.ts), so this must be enforced server-side
 * regardless of the auth path — one oversized username must never be able
 * to crash packet building (and thus the whole process) for every lobby.
 */
const MAX_USERNAME_BYTES = 64;

/** Truncate to a safe UTF-8 byte length for use in length-prefixed packets. */
function sanitizeUsername(raw: string): string {
  let buf = Buffer.from(raw, 'utf8');
  if (buf.length <= MAX_USERNAME_BYTES) return raw;
  buf = buf.subarray(0, MAX_USERNAME_BYTES);
  // Avoid splitting a multi-byte UTF-8 sequence in half.
  return buf.toString('utf8').replace(/\uFFFD+$/, '');
}

/** Singleton lobby manager shared across all connections. */
const lobbyManager = new LobbyManager();

/** Collision grid — built once at startup, shared across all validations. */
const collisionGrid = buildPreciseCollisionGrid();

export function attachWsServer(httpServer: HttpServer): WebSocketServer {
  validateAuthConfig();

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: AuthSocket) => {
    ws.isVerified = false;

    const handshakeTimer = setTimeout(() => {
      // Guard against a socket that closed in the race right before this
      // timer fires — send()/close() on an already-closing socket can throw,
      // and this runs outside the message handler's try/catch (it's a timer
      // callback, not a 'message' event), so an uncaught throw here would
      // crash the whole process for every active lobby.
      try {
        if (!ws.isVerified && ws.readyState === ws.OPEN) {
          ws.send(Buffer.from([0x00]));
          ws.close();
        }
      } catch (err) {
        logger.error({ err }, '[WS] Error during handshake-timeout close — ignoring');
      }
    }, HANDSHAKE_TIMEOUT_MS);

    ws.on('message', (raw: Buffer) => {
      try {
        handleMessage(ws, raw);
      } catch (err) {
        // Defense-in-depth: a single malformed/unexpected packet must never
        // crash the process and take down every active lobby. Log and close
        // just this connection instead.
        logger.error(
          { err, userId: ws.tgUserId ?? 'unauthenticated' },
          '[WS] Unhandled error processing message — closing connection',
        );
        ws.close();
      }
    });

    function handleMessage(ws: AuthSocket, raw: Buffer): void {
      if (!Buffer.isBuffer(raw) || raw.length === 0) return;

      // ── Phase 1: auth handshake ───────────────────────────────────────────
      if (!ws.isVerified) {
        clearTimeout(handshakeTimer);

        const user = verifyTelegramAuth(raw.toString('utf8'));
        if (!user) {
          ws.send(Buffer.from([0x00]));
          ws.close();
          return;
        }

        ws.isVerified = true;
        ws.tgUserId = user.id;
        ws.username = sanitizeUsername(user.username ?? `User${user.id}`);
        ws.playerSlotId = 0;

        const ack = Buffer.alloc(2);
        ack.writeUInt8(0x01, 0);
        ack.writeUInt8(ws.playerSlotId, 1);
        ws.send(ack);
        return;
      }

      // ── Phase 2+: game opcodes ────────────────────────────────────────────
      if (raw.length < 1) return;

      const opcode = raw.readUInt8(0);
      const subOpcode = raw.length >= 2 ? raw.readUInt8(1) : -1;
      // A fresh authenticated socket is not the lobby's bound socket until it
      // creates/joins a room. Permit only those intentional transition requests
      // while it is unbound; all gameplay actions still require current ownership.
      const isSessionTransition = opcode === 0x10 &&
        (subOpcode === 0x01 || subOpcode === 0x02 || subOpcode === 0x06);

      if (ws.tgUserId !== undefined) {
        const superseded = lobbyManager.isSupersededSocket(ws);
        const current = lobbyManager.isCurrentSocket(ws.tgUserId, ws);
        if (superseded || (!current && !isSessionTransition)) {
          logger.info(
            { userId: ws.tgUserId, superseded, opcode, subOpcode },
            '[WS] Rejected message from a replaced or unbound player session',
          );
          if (ws.readyState === ws.OPEN) ws.close(1000, 'Replaced by a newer session');
          return;
        }
      }

      // ── 0x10: Lobby Control ───────────────────────────────────────────────
      if (opcode === 0x10) {
        if (raw.length < 2) return;
        const sub = raw.readUInt8(1);
        const tgUserId = ws.tgUserId!;
        const username = ws.username!;

        // 0x01 — Create room
        if (sub === 0x01) {
          const lobby = lobbyManager.createLobby(tgUserId, username, ws);
          ws.playerSlotId = 0;
          ws.send(buildSlotAssignedPacket(0));
          lobbyManager.broadcastRoomUpdate(lobby);
          logger.info(`[WS] Create room → ${lobby.code} (userId=${tgUserId})`);
          return;
        }

        // 0x02 — Join room (bytes 2–7: 6-char ASCII room code)
        if (sub === 0x02) {
          if (raw.length < 8) return;
          const roomCode = raw.slice(2, 8).toString('ascii').trim().toUpperCase();
          const result = lobbyManager.joinLobby(roomCode, tgUserId, username, ws);

          if (result === 'not_found') { ws.send(buildJoinErrorPacket(0x01)); return; }
          if (result === 'in_progress') { ws.send(buildJoinErrorPacket(0x02)); return; }
          if (result === 'full') { ws.send(buildJoinErrorPacket(0x03)); return; }

          ws.playerSlotId = result.userIdToSlot.get(tgUserId)!;
          ws.send(buildSlotAssignedPacket(ws.playerSlotId));
          lobbyManager.broadcastRoomUpdate(result);
          const resumeSnapshot = lobbyManager.buildResumeSnapshot(result, ws.playerSlotId);
          if (resumeSnapshot) {
            ws.send(buildResumeSnapshotPacket(resumeSnapshot));
          } else {
            // 0x25 / v0 confirms a successful WAITING-lobby rejoin. This makes
            // lobby-vs-active resume deterministic without a client-side timer.
            ws.send(Buffer.from([0x25, 0x00]));
          }
          logger.info(`[WS] Join room ${roomCode} → slot=${ws.playerSlotId} (userId=${tgUserId})`);
          return;
        }

        // 0x06 — Create Solo game (C→S, 3 bytes): [0x10, 0x06, botCount]
        // Creates a private room, fills it with AI bots, and auto-starts.
        // botCount: 1–14 (default 4 if byte missing or out of range).
        if (sub === 0x06) {
          const BOT_NAMES = [
            'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon',
            'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
            'Lambda', 'Mu', 'Nu', 'Xi',
          ];

          const rawCount = raw.length >= 3 ? raw.readUInt8(2) : 4;
          const botCount = Math.max(1, Math.min(14, rawCount));

          // Create a private lobby (phase → ROAMING immediately after startGame,
          // so joinLobby will reject any late joiners with 'in_progress').
          const lobby = lobbyManager.createLobby(tgUserId, username, ws);
          ws.playerSlotId = 0;
          ws.send(buildSlotAssignedPacket(0));

          // Add bots with placeholder CrewmateBot agents; roles are reassigned
          // after startGame() runs its Fisher-Yates shuffle below.
          for (let i = 0; i < botCount; i++) {
            lobbyManager.addBotPlayer(lobby, i, BOT_NAMES[i], new CrewmateBot());
          }

          // Assign roles + spawn positions + send 0x1A role reveal to human.
          lobbyManager.startGame(lobby);

          // Swap bot agents to match their Fisher-Yates-assigned roles so the
          // AI decision-making (impostor hunting vs crewmate tasks) is correct.
          for (const player of lobby.players.values()) {
            if (player.isBot) {
              player.botAgent = player.role === 'impostor'
                ? new ImpostorBot()
                : new CrewmateBot();
            }
          }

          logger.info(
            `[WS] Solo game started: ${lobby.code} — ${botCount} bots (userId=${tgUserId})`,
          );
          return;
        }

        return;
      }

      // ── 0x23: client gameplay-ready acknowledgement ───────────────────────
      // Sent only after both the map texture and character atlas are decoded.
      if (opcode === 0x23 && raw.length === 1) {
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby) return;
        const slot = lobby.userIdToSlot.get(tgUserId);
        if (slot === undefined) return;
        const wasAlreadyGameplayReady = lobby.gameplayReady === true;
        const ready = lobbyManager.markGameplayReady(lobby, slot);
        // Initial barrier completion broadcasts 0x24 to the whole lobby.
        // Only a late reconnect needs a targeted one-player acknowledgement.
        if (ready && wasAlreadyGameplayReady && ws.readyState === ws.OPEN) {
          ws.send(Buffer.from([0x24, 0x01]));
        }
        return;
      }

      // ── 0x11: Move Intent (C→S) ───────────────────────────────────────────
      // Layout: [0x11, wireX(Int16LE, 2 bytes), wireY(Int16LE, 2 bytes)]  = 5 bytes
      if (opcode === 0x11) {
        if (raw.length !== 5) return; // exactly [opcode, wireX(2), wireY(2)]

        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby) return;

        // Movement remains locked until all connected clients have rendered the map.
        if (lobby.phase !== 'ROAMING' || !lobbyManager.isGameplayReady(lobby)) return;

        const slot = lobby.userIdToSlot.get(tgUserId);
        if (slot === undefined || !lobbyManager.isPlayerReady(lobby, slot)) return;
        const player = lobby.players.get(slot);
        if (!player || player.inVent) return;

        // Decode wire-space coordinates (Int16LE, 0–32000)
        const wireX = raw.readInt16LE(1);
        const wireY = raw.readInt16LE(3);

        // Clamp to valid wire range
        if (wireX < 0 || wireX > 32000 || wireY < 0 || wireY > 32000) return;

        // Convert to pixel space, then validate speed and the complete path.
        // Checking only the final point lets a modified client teleport between
        // walkable tiles or skip over a thin wall with one forged target.
        const pixelX = fromWire(wireX, MAP_W);
        const pixelY = fromWire(wireY, MAP_H);
        const decision = validateMovementIntent(player, pixelX, pixelY, Date.now(), collisionGrid);
        player.movementPacketTokens = decision.movementPacketTokens;
        player.movementPacketTokensUpdatedAtMs = decision.movementPacketTokensUpdatedAtMs;
        if (decision.rateLimited) return;

        player.movementCreditPx = decision.movementCreditPx;
        player.movementCreditUpdatedAtMs = decision.movementCreditUpdatedAtMs;
        player.lastMovementPacketAtMs = decision.lastMovementPacketAtMs;
        player.lastMovementCorrectionAtMs = decision.lastMovementCorrectionAtMs;
        if (decision.accepted) {
          player.x = decision.x;
          player.y = decision.y;
        }

        if (decision.sendCorrection && ws.readyState === ws.OPEN) {
          ws.send(buildMovementCorrectionPacket(
            toWire(player.x, MAP_W),
            toWire(player.y, MAP_H),
          ));
        }
        if (decision.corrected) {
          logger.debug(
            `[WS] Constrained movement from slot=${slot}: wireX=${wireX} wireY=${wireY} accepted=${decision.accepted}`,
          );
        }

        return;
      }

      // ── 0x17: Vent actions (C→S) ─────────────────────────────────────────
      // sub 0x01 enter [0x17, 0x01, ventId]
      // sub 0x02 travel [0x17, 0x02, ventId]
      // sub 0x03 exit [0x17, 0x03]
      if (opcode === 0x17) {
        if (raw.length < 2) return;
        const sub = raw.readUInt8(1);
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby || !lobbyManager.isGameplayReady(lobby)) return;
        const slot = lobby.userIdToSlot.get(tgUserId);
        if (slot === undefined || !lobbyManager.isPlayerReady(lobby, slot)) return;

        if ((sub === 0x01 || sub === 0x02) && raw.length === 3) {
          const ventId = raw.readUInt8(2);
          const accepted = sub === 0x01
            ? lobbyManager.enterVent(lobby, slot, ventId)
            : lobbyManager.travelVent(lobby, slot, ventId);
          if (!accepted) logger.debug(`[WS] Rejected vent action sub=${sub} slot=${slot} vent=${ventId}`);
          return;
        }
        if (sub === 0x03 && raw.length === 2) {
          const accepted = lobbyManager.exitVent(lobby, slot);
          if (!accepted) logger.debug(`[WS] Rejected vent exit for slot=${slot}`);
        }
        return;
      }

      // ── 0x19: Discussion chat (C→S) ───────────────────────────────────────
      // [0x19, 0x01, utf8Length(UInt8), utf8Bytes...]; server relays [0x19,0x02,slot,len,text].
      if (opcode === 0x19) {
        if (raw.length < 3 || raw.readUInt8(1) !== 0x01) return;
        const textLength = raw.readUInt8(2);
        if (textLength === 0 || textLength > 200 || raw.length !== 3 + textLength) return;
        const text = raw.subarray(3, 3 + textLength).toString('utf8');
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby) return;
        const slot = lobby.userIdToSlot.get(tgUserId);
        if (slot === undefined || !lobbyManager.isPlayerReady(lobby, slot)) return;
        lobbyManager.sendMeetingChat(lobby, slot, text);
        return;
      }

      // ── 0x15: RPC Event ───────────────────────────────────────────────────
      if (opcode === 0x15) {
        if (raw.length < 2) return;
        const sub = raw.readUInt8(1);
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby || !lobbyManager.isGameplayReady(lobby)) return;
        const attackerSlot = lobby.userIdToSlot.get(tgUserId);
        if (attackerSlot === undefined || !lobbyManager.isPlayerReady(lobby, attackerSlot)) return;

        // 0x01 — Kill (impostor only; server re-validates role/cooldown/range).
        if (sub === 0x01) {
          if (raw.length < 3) return;
          const victimSlot = raw.readUInt8(2);
          const applied = lobbyManager.applyKill(lobby, attackerSlot, victimSlot);
          if (applied) {
            logger.info(`[WS] Kill in ${lobby.code}: slot=${attackerSlot} → slot=${victimSlot}`);
          }
          return;
        }

        // 0x03 — Task Step (C→S, 4 bytes): [0x15, 0x03, taskId, stepIndex]
        // Phase 7: crewmate completes one step of an assigned task.
        // Packet length 4 distinguishes this from S→C progress broadcast (3 bytes).
        if (sub === 0x03 && raw.length === 4) {
          const taskId = raw.readUInt8(2);
          const stepIndex = raw.readUInt8(3);
          lobbyManager.applyTaskStep(lobby, attackerSlot, taskId, stepIndex);
          return;
        }

        // 0x04 — Sabotage trigger (C→S, 3 bytes): [0x15, 0x04, systemId]
        // Phase 8: impostor-only; server re-validates role/cooldown/single-sabotage.
        if (sub === 0x04 && raw.length === 3) {
          const systemId = raw.readUInt8(2);
          if (!isSabotageSystemId(systemId)) return;
          const triggered = lobbyManager.triggerSabotage(lobby, attackerSlot, systemId);
          if (triggered) {
            lobbyManager.broadcastSabotageStart(lobby, systemId, attackerSlot);
            if (systemId === SABOTAGE_DOORS) lobbyManager.broadcastDoorLocks(lobby);
            logger.info(`[WS] Sabotage triggered in ${lobby.code}: system=${systemId} by slot=${attackerSlot}`);
          }
          return;
        }

        // 0x05 — Repair (C→S, 4 bytes): [0x15, 0x05, systemId, padId]
        // Phase 8: crewmate-only; server re-validates role/proximity/active sabotage.
        if (sub === 0x05 && raw.length === 4) {
          const systemId = raw.readUInt8(2);
          const padId = raw.readUInt8(3);
          const result = lobbyManager.applyRepair(lobby, attackerSlot, systemId, padId);
          if (result === 'fixed') {
            logger.info(`[WS] Sabotage fixed in ${lobby.code}: system=${systemId} by slot=${attackerSlot}`);
          }
          return;
        }

        return;
      }

      // ── 0x13: Report Body / Emergency Meeting (C→S) ──────────────────────
      // Layout: [0x13, bodySlot]  (bodySlot = 0xFF for the emergency button)
      if (opcode === 0x13) {
        if (raw.length !== 2) return;
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby || !lobbyManager.isGameplayReady(lobby)) return;
        const reporterSlot = lobby.userIdToSlot.get(tgUserId);
        if (reporterSlot === undefined || !lobbyManager.isPlayerReady(lobby, reporterSlot)) return;

        const bodySlot = raw.readUInt8(1);
        const started = lobbyManager.callMeeting(lobby, reporterSlot, bodySlot);
        if (started) {
          logger.info(`[WS] Meeting called in ${lobby.code} by slot=${reporterSlot}`);
        }
        return;
      }

      // ── 0x14: Vote (C→S) ──────────────────────────────────────────────────
      // Layout: [0x14, targetSlot]  (targetSlot = 0xFF to skip)
      if (opcode === 0x14) {
        if (raw.length !== 2) return;
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby || !lobbyManager.isGameplayReady(lobby)) return;
        const voterSlot = lobby.userIdToSlot.get(tgUserId);
        if (voterSlot === undefined || !lobbyManager.isPlayerReady(lobby, voterSlot)) return;

        const targetSlot = raw.readUInt8(1);
        lobbyManager.castVote(lobby, voterSlot, targetSlot);
        return;
      }

      // ── 0x12: Game Start (host only) ─────────────────────────────────────
      if (opcode === 0x12) {
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby) return;
        if (lobby.hostSlot !== ws.playerSlotId) return; // host only
        if (lobby.phase !== 'WAITING') return;

        lobbyManager.startGame(lobby);
        logger.info(`[WS] Game started in ${lobby.code} by slot=${ws.playerSlotId}`);
        return;
      }
    }

    ws.on('close', () => {
      clearTimeout(handshakeTimer);

      if (ws.tgUserId !== undefined) {
        const updatedLobby = lobbyManager.markPlayerDisconnected(ws.tgUserId, ws);
        if (updatedLobby) {
          lobbyManager.broadcastRoomUpdate(updatedLobby);
        }
      }
    });

    ws.on('error', (err: Error) => {
      logger.error(`[WS] Socket error (userId=${ws.tgUserId ?? 'unauthenticated'}): ${err.message}`);
    });
  });

  return wss;
}
