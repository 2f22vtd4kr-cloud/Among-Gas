/**
 * WebSocket server — Phase 1 (auth handshake) + Phase 2 (lobby control)
 *
 * Lifecycle:
 *   1. Client connects → 10s window to send initData (Telegram auth string)
 *   2. Server validates auth, sends [0x01, slotId] ACK
 *   3. Client sends [0x10, 0x01] to create a room  OR
 *              sends [0x10, 0x02, ...6-byte code] to join a room
 *   4. Server broadcasts [0x10, 0x03, ...] room update to all lobby members
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
        // Slot is assigned when the player creates/joins a lobby.
        // For now, echo a temporary slot=0 to satisfy the handshake protocol;
        // the real slot comes via the 0x10 0x03 room update.
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
          // Tell this client their authoritative slot before the broadcast
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

          if (result === 'not_found') {
            ws.send(buildJoinErrorPacket(0x01));
            return;
          }
          if (result === 'in_progress') {
            ws.send(buildJoinErrorPacket(0x02));
            return;
          }
          if (result === 'full') {
            ws.send(buildJoinErrorPacket(0x03));
            return;
          }

          // Success — send authoritative slot to this client, then broadcast
          ws.playerSlotId = result.userIdToSlot.get(tgUserId)!;
          ws.send(buildSlotAssignedPacket(ws.playerSlotId));
          lobbyManager.broadcastRoomUpdate(result);
          logger.info(`[WS] Join room ${roomCode} → slot=${ws.playerSlotId} (userId=${tgUserId})`);
          return;
        }

        return;
      }

      // Future opcodes (0x11 movement, 0x12 start, etc.) handled in later phases
    });

    ws.on('close', () => {
      clearTimeout(handshakeTimer);

      if (ws.tgUserId !== undefined) {
        // Pass the closing socket so removePlayer can skip stale close events
        // from reconnecting clients (reconnect-race guard).
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
