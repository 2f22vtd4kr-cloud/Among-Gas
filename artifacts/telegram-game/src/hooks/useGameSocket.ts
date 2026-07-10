import { useEffect, useRef } from 'react';

// ─── URL helpers ────────────────────────────────────────────────────────────

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/api/ws`;
}

function getInitData(): string {
  // Production: real Telegram Mini App initData
  const twa = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram
    ?.WebApp;
  if (twa?.initData) return twa.initData;

  // Dev fallback: JSON mock accepted by server DEV_MODE
  return JSON.stringify({ id: (Date.now() % 90000) + 10000, username: 'DevPlayer' });
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Manages the game's WebSocket connection lifecycle.
 * Phase 1: connects, authenticates, and logs the result to the console.
 * Later phases: exposes send/message handlers for game opcodes.
 */
export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = getWsUrl();
    console.log('[WS] connecting →', url);

    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('[WS] open — sending auth');
      const payload = new TextEncoder().encode(getInitData());
      socket.send(payload);
    };

    socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      // Guard: must have at least 1 byte to read opcode
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 1) return;
      const view = new DataView(event.data);
      const opcode = view.getUint8(0);

      switch (opcode) {
        case 0x00:
          console.error('[WS] ❌ handshake rejected by server');
          break;
        case 0x01: {
          // Guard: must have byte 1 for slot
          if (event.data.byteLength < 2) break;
          const slot = view.getUint8(1);
          console.log(`[WS] ✅ handshake OK — assigned slot ${slot}`);
          break;
        }
        default:
          console.log(`[WS] opcode 0x${opcode.toString(16).padStart(2, '0')}`);
      }
    };

    socket.onclose = (e) => console.log('[WS] closed', e.code, e.reason);
    socket.onerror = () => console.error('[WS] connection error');

    return () => {
      socket.close();
    };
  }, []);

  return socketRef;
}
