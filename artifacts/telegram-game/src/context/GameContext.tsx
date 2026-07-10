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
import { fromWire, MAP_W, MAP_H } from '@workspace/shared/coords';

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
}

export type GamePhase = 'connecting' | 'lobby' | 'playing' | 'error';

export type PlayerRole = 'crewmate' | 'impostor';

export interface GameState {
  phase: GamePhase;
  mySlot: number | null;
  roomCode: string | null;
  hostSlot: number;
  players: LobbyPlayer[];
  errorMessage: string | null;
  /** Set by the server's 0x1A packet at game start. Never trust other clients. */
  myRole: PlayerRole | null;
  /** Fellow impostor slots — only populated when myRole === 'impostor'. */
  impostorSlots: number[];
}

export interface GameActions {
  createRoom: () => void;
  joinRoom: (code: string) => void;
  startGame: () => void;
  /** Send a 0x11 Move Intent packet (wire coords 0–32000). */
  sendMove: (wireX: number, wireY: number) => void;
}

const DEFAULT_STATE: GameState = {
  phase: 'connecting',
  mySlot: null,
  roomCode: null,
  hostSlot: 0,
  players: [],
  errorMessage: null,
  myRole: null,
  impostorSlots: [],
};

// ── Contexts ─────────────────────────────────────────────────────────────────

const GameStateCtx = createContext<GameState>(DEFAULT_STATE);
const GameActionsCtx = createContext<GameActions>({
  createRoom: () => {},
  joinRoom: () => {},
  startGame: () => {},
  sendMove: () => {},
});

/** Mutable ref holding the latest remote-player positions (slot → RemotePlayer).
 *  Updated by 0xFF packets; read by the rAF loop in GameMap without triggering re-renders. */
const GameRemotePlayersCtx = createContext<React.RefObject<Map<number, RemotePlayer>>>(
  { current: new Map() },
);

/** Mutable ref holding a pending server position correction for the local player.
 *  Set by the 0xFF handler when the server disagrees with local position.
 *  Cleared by the rAF loop after applying. */
const GameCorrectionCtx = createContext<React.RefObject<{ x: number; y: number } | null>>(
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

/** Returns a stable ref to the pending server correction ({x,y} or null). */
export function useCorrectionRef(): React.RefObject<{ x: number; y: number } | null> {
  return useContext(GameCorrectionCtx);
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
  onCorrection: (x: number, y: number) => void,
): void {
  if (view.byteLength < 2) return;
  const count = view.getUint8(1);
  let off = 2;

  for (let i = 0; i < count; i++) {
    if (off + 5 > view.byteLength) break;
    const slot = view.getUint8(off++);
    const wireX = view.getInt16(off, true); off += 2;
    const wireY = view.getInt16(off, true); off += 2;

    const x = fromWire(wireX, MAP_W);
    const y = fromWire(wireY, MAP_H);

    if (slot === mySlot) {
      // Server correction for our own position (wall clip rejection).
      // The snap threshold (~5 wire units ≈ 0.5px) avoids jitter from
      // floating-point round-trip differences.
      onCorrection(x, y);
    } else {
      remotePlayersMap.set(slot, { slot, x, y });
    }
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(DEFAULT_STATE);
  const socketRef = useRef<WebSocket | null>(null);

  // mySlot in a ref so callbacks don't need stale-closure workarounds
  const mySlotRef = useRef<number | null>(null);

  // Remote player positions — updated every 40ms, never triggers re-renders
  const remotePlayersRef = useRef<Map<number, RemotePlayer>>(new Map());

  // Pending server correction for local player — read & cleared by GameMap's rAF loop
  const correctionRef = useRef<{ x: number; y: number } | null>(null);

  const send = useCallback((buf: Uint8Array | number[]) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    }
  }, []);

  const createRoom = useCallback(() => { send([0x10, 0x01]); }, [send]);

  const joinRoom = useCallback((code: string) => {
    const codeUpper = code.toUpperCase().slice(0, 6).padEnd(6, ' ');
    const buf = new Uint8Array(8);
    buf[0] = 0x10; buf[1] = 0x02;
    const codeBytes = new TextEncoder().encode(codeUpper);
    buf.set(codeBytes.slice(0, 6), 2);
    send(buf);
  }, [send]);

  const startGame = useCallback(() => {
    send([0x12]);
  }, [send]);

  const sendMove = useCallback((wireX: number, wireY: number) => {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x11);
    view.setInt16(1, wireX, true); // Little-Endian
    view.setInt16(3, wireY, true);
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

      // ── 0x01: handshake ACK ─────────────────────────────────────────────
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

        // 0x03: room update
        if (sub === 0x03) {
          const parsed = parseRoomUpdate(view);
          if (!parsed) return;
          setState(s => ({
            ...s,
            roomCode: parsed.roomCode,
            hostSlot: parsed.hostSlot,
            players: parsed.players,
            errorMessage: null,
          }));
          // Prune remote players that are no longer in the room.
          // This prevents departed players from rendering as ghost circles.
          const activeSlots = new Set(parsed.players.map(p => p.slot));
          const mySlot = mySlotRef.current;
          for (const slot of remotePlayersRef.current.keys()) {
            if (!activeSlots.has(slot) || slot === mySlot) {
              remotePlayersRef.current.delete(slot);
            }
          }
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
          setState(s => ({ ...s, errorMessage: messages[errCode] ?? 'Unknown error' }));
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

      // ── 0x1A: role reveal → transition to playing ───────────────────────
      // Crewmate: [0x1A, 0x00]
      // Impostor: [0x1A, 0x01, impostorCount, slot_0, slot_1, ...]
      if (opcode === 0x1A && event.data.byteLength >= 2) {
        const roleByte = view.getUint8(1);
        const myRole: PlayerRole = roleByte === 1 ? 'impostor' : 'crewmate';

        const impostorSlots: number[] = [];
        if (roleByte === 1 && event.data.byteLength >= 3) {
          const count = view.getUint8(2);
          for (let i = 0; i < count && 3 + i < event.data.byteLength; i++) {
            impostorSlots.push(view.getUint8(3 + i));
          }
        }

        // Clear stale remote player data from the previous session
        remotePlayersRef.current.clear();
        setState(s => ({ ...s, phase: 'playing', myRole, impostorSlots }));
        console.log(`[WS] 🎮 Role reveal received — role=${myRole}`);
        return;
      }

      // ── 0xFF: delta sync — update remote player positions ───────────────
      if (opcode === 0xFF) {
        applyDeltaPacket(
          view,
          mySlotRef.current,
          remotePlayersRef.current,
          (x, y) => { correctionRef.current = { x, y }; },
        );
        return;
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
  }, []); // socket is created once

  const actions: GameActions = { createRoom, joinRoom, startGame, sendMove };

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
