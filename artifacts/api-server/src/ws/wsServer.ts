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
} from './lobby.js';
import { logger } from '../lib/logger.js';
import {
  buildCollisionGrid,
  canMoveTo,
} from '@workspace/shared/collisionMap';
import {
  fromWire,
  MAP_W, MAP_H,
  FEET_OFFSET_Y, PLAYER_RADIUS,
} from '@workspace/shared/coords';

interface AuthSocket extends WebSocket {
  isVerified: boolean;
  tgUserId?: number;
  username?: string;
  playerSlotId?: number;
}

const WS_PATH = '/api/ws';
const HANDSHAKE_TIMEOUT_MS = 10_000;

/** Singleton lobby manager shared across all connections. */
const lobbyManager = new LobbyManager();

/** Collision grid — built once at startup, shared across all validations. */
const collisionGrid = buildCollisionGrid();

export function attachWsServer(httpServer: HttpServer): WebSocketServer {
  validateAuthConfig();

  const wss = new WebSocketServer({ noServer: true });

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
      if (!ws.isVerified) {
        ws.send(Buffer.from([0x00]));
        ws.close();
      }
    }, HANDSHAKE_TIMEOUT_MS);

    ws.on('message', (raw: Buffer) => {
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
        ws.username = user.username ?? `User${user.id}`;
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
          logger.info(`[WS] Join room ${roomCode} → slot=${ws.playerSlotId} (userId=${tgUserId})`);
          return;
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

        // Phase 4: movement only allowed while ROAMING (post role assignment).
        if (lobby.phase !== 'ROAMING') return;

        const slot = lobby.userIdToSlot.get(tgUserId);
        if (slot === undefined) return;
        const player = lobby.players.get(slot);
        if (!player) return;

        // Decode wire-space coordinates (Int16LE, 0–32000)
        const wireX = raw.readInt16LE(1);
        const wireY = raw.readInt16LE(3);

        // Clamp to valid wire range
        if (wireX < 0 || wireX > 32000 || wireY < 0 || wireY > 32000) return;

        // Convert to pixel space
        const pixelX = fromWire(wireX, MAP_W);
        const pixelY = fromWire(wireY, MAP_H);

        // Validate against collision grid (same geometry as client: feet-center).
        // Phase 5: dead players are in ghost mode and walk through walls
        // (GAME_SPEC.md §9), so collision is skipped once !player.alive.
        const feetX = pixelX;
        const feetY = pixelY + FEET_OFFSET_Y;

        if (!player.alive || canMoveTo(collisionGrid, feetX, feetY, PLAYER_RADIUS)) {
          // Valid position — update server-side state
          player.x = pixelX;
          player.y = pixelY;
        } else {
          // Invalid (wall clip) — server will broadcast the last valid position
          // on the next delta tick, which the client applies as a correction.
          logger.debug(
            `[WS] Rejected 0x11 from slot=${slot}: wireX=${wireX} wireY=${wireY} clips a wall`,
          );
        }

        return;
      }

      // ── 0x15: RPC Event ───────────────────────────────────────────────────
      if (opcode === 0x15) {
        if (raw.length < 2) return;
        const sub = raw.readUInt8(1);
        const tgUserId = ws.tgUserId!;
        const lobby = lobbyManager.getLobbyForUser(tgUserId);
        if (!lobby) return;
        const attackerSlot = lobby.userIdToSlot.get(tgUserId);
        if (attackerSlot === undefined) return;

        // 0x01 — Kill (impostor only; server re-validates role/cooldown/range).
        if (sub === 0x01) {
          if (raw.length < 3) return;
          const victimSlot = raw.readUInt8(2);
          const applied = lobbyManager.attemptKill(lobby, attackerSlot, victimSlot);
          if (applied) {
            lobbyManager.broadcastKill(lobby, victimSlot, attackerSlot);
            logger.info(`[WS] Kill in ${lobby.code}: slot=${attackerSlot} → slot=${victimSlot}`);
            // Phase 6: a kill can tip alive-player parity in the impostors'
            // favor immediately — check before waiting for a meeting.
            lobbyManager.checkWinAfterKill(lobby);
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
        if (!lobby) return;
        const reporterSlot = lobby.userIdToSlot.get(tgUserId);
        if (reporterSlot === undefined) return;

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
        if (!lobby) return;
        const voterSlot = lobby.userIdToSlot.get(tgUserId);
        if (voterSlot === undefined) return;

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
    });

    ws.on('close', () => {
      clearTimeout(handshakeTimer);

      if (ws.tgUserId !== undefined) {
        const updatedLobby = lobbyManager.removePlayer(ws.tgUserId, ws);
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
