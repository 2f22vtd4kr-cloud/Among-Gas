import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { verifyTelegramAuth, validateAuthConfig } from './auth.js';
import { logger } from '../lib/logger.js';

// ─── Per-connection state ───────────────────────────────────────────────────

interface AuthSocket extends WebSocket {
  isVerified: boolean;
  tgUserId?: number;
  username?: string;
  /** Player slot ID — placeholder in Phase 1; real slot assigned by LobbyManager in Phase 2. */
  playerSlotId?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** URL path for WebSocket upgrades (must match Replit proxy routing for /api). */
const WS_PATH = '/api/ws';

/** Milliseconds a new connection has to complete auth before being closed. */
const HANDSHAKE_TIMEOUT_MS = 10_000;

// ─── Attach WebSocket server to an existing HTTP server ─────────────────────

/**
 * Validates auth config (fails hard in production without a bot token), then
 * upgrades the given HTTP server to also handle WebSocket connections at /api/ws.
 *
 * Must be called before httpServer.listen().
 */
export function attachWsServer(httpServer: HttpServer): WebSocketServer {
  validateAuthConfig();

  const wss = new WebSocketServer({ noServer: true });

  // Only upgrade connections that arrive on the correct path.
  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: AuthSocket) => {
    ws.isVerified = false;

    // Kick unauthenticated connections that never send their auth frame.
    const handshakeTimer = setTimeout(() => {
      if (!ws.isVerified) {
        logger.warn('WS handshake timeout — closing unauthenticated connection');
        ws.send(Buffer.from([0x00]));
        ws.close();
      }
    }, HANDSHAKE_TIMEOUT_MS);

    ws.on('message', (raw: Buffer) => {
      if (!Buffer.isBuffer(raw) || raw.length === 0) return;

      // ── Phase 1: authentication gateway ───────────────────────────────────
      if (!ws.isVerified) {
        clearTimeout(handshakeTimer);

        const initData = raw.toString('utf8');
        const user = verifyTelegramAuth(initData);

        if (!user) {
          logger.warn('WS handshake failed — invalid auth payload');
          ws.send(Buffer.from([0x00])); // 0x00 = Handshake Fail
          ws.close();
          return;
        }

        ws.isVerified = true;
        ws.tgUserId = user.id;
        ws.username = user.username ?? `User${user.id}`;
        ws.playerSlotId = 0; // placeholder — real slot assigned by LobbyManager in Phase 2

        logger.info(
          { tgUserId: ws.tgUserId, username: ws.username },
          'WS handshake OK',
        );

        // 0x01 = Handshake OK; Byte 1 = assigned player slot
        const ack = Buffer.alloc(2);
        ack.writeUint8(0x01, 0);
        ack.writeUint8(ws.playerSlotId, 1);
        ws.send(ack);
        return;
      }

      // ── Authenticated: guard minimum frame length before any read ──────────
      if (raw.length < 1) return;

      // Route by opcode — Phase 2+ adds handlers for 0x10 lobby, 0x11 move, etc.
      const opcode = raw.readUint8(0);
      logger.debug(
        { opcode: `0x${opcode.toString(16).padStart(2, '0')}`, tgUserId: ws.tgUserId },
        'WS frame received (unhandled opcode)',
      );
    });

    ws.on('close', () => {
      clearTimeout(handshakeTimer);
      logger.info({ tgUserId: ws.tgUserId, username: ws.username }, 'WS connection closed');
    });

    ws.on('error', (err) => {
      clearTimeout(handshakeTimer);
      logger.error({ err, tgUserId: ws.tgUserId }, 'WS socket error');
    });
  });

  logger.info({ path: WS_PATH }, 'WebSocket server attached');
  return wss;
}
