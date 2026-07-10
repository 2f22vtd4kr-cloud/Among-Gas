/**
 * GameContext — shared multiplayer state & socket actions
 *
 * Wraps the WebSocket lifecycle and exposes lobby state + actions to the
 * whole component tree. Replaces the old WsManager + useGameSocket pattern.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LobbyPlayer {
  slot: number;
  username: string;
}

export type GamePhase = 'connecting' | 'lobby' | 'playing' | 'error';

export interface GameState {
  phase: GamePhase;
  mySlot: number | null;
  roomCode: string | null;
  hostSlot: number;
  players: LobbyPlayer[];
  errorMessage: string | null;
}

export interface GameActions {
  createRoom: () => void;
  joinRoom: (code: string) => void;
}

const DEFAULT_STATE: GameState = {
  phase: 'connecting',
  mySlot: null,
  roomCode: null,
  hostSlot: 0,
  players: [],
  errorMessage: null,
};

// ── Context ──────────────────────────────────────────────────────────────────

const GameStateCtx = createContext<GameState>(DEFAULT_STATE);
const GameActionsCtx = createContext<GameActions>({ createRoom: () => {}, joinRoom: () => {} });

export function useGameState(): GameState {
  return useContext(GameStateCtx);
}

export function useGameActions(): GameActions {
  return useContext(GameActionsCtx);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Provider ─────────────────────────────────────────────────────────────────

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(DEFAULT_STATE);
  const socketRef = useRef<WebSocket | null>(null);
  // Track mySlot in a ref so callbacks can read the current value without
  // causing stale closures.
  const mySlotRef = useRef<number | null>(null);

  const send = useCallback((buf: Uint8Array | number[]) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    }
  }, []);

  const createRoom = useCallback(() => {
    send([0x10, 0x01]);
  }, [send]);

  const joinRoom = useCallback((code: string) => {
    const codeUpper = code.toUpperCase().slice(0, 6).padEnd(6, ' ');
    const buf = new Uint8Array(8);
    buf[0] = 0x10;
    buf[1] = 0x02;
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(codeUpper);
    buf.set(codeBytes.slice(0, 6), 2);
    send(buf);
  }, [send]);

  useEffect(() => {
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

      // ── 0x01: handshake ACK (slot assigned) ────────────────────────────
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

        // 0x03: room update (broadcast to all lobby members)
        if (sub === 0x03) {
          const parsed = parseRoomUpdate(view);
          if (!parsed) return;
          setState(s => ({
            ...s,
            // Preserve mySlot — it is set authoritatively by 0x10 0x05
            roomCode: parsed.roomCode,
            hostSlot: parsed.hostSlot,
            players: parsed.players,
            errorMessage: null,
          }));
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
          setState(s => ({
            ...s,
            errorMessage: messages[errCode] ?? 'Unknown error',
          }));
          return;
        }

        // 0x05: slot assignment — authoritative per-client slot after create/join
        if (sub === 0x05 && event.data.byteLength >= 3) {
          const slot = view.getUint8(2);
          mySlotRef.current = slot;
          setState(s => ({ ...s, mySlot: slot }));
          return;
        }
      }
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
  }, []); // intentionally empty — socket is created once

  const actions: GameActions = { createRoom, joinRoom };

  return (
    <GameStateCtx.Provider value={state}>
      <GameActionsCtx.Provider value={actions}>
        {children}
      </GameActionsCtx.Provider>
    </GameStateCtx.Provider>
  );
}
