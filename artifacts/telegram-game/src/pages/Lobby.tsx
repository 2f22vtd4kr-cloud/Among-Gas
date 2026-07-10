/**
 * Lobby screen — Phase 2
 *
 * Shows when the player is authenticated but not yet in a game.
 * Lets the host create a room or any player join by room code.
 */
import { useState, useEffect } from 'react';
import { useGameState, useGameActions } from '@/context/GameContext';
import { useLocation } from 'wouter';
import { haptic } from '@/lib/haptics';

// ── Sub-components ────────────────────────────────────────────────────────────

function PlayerRow({ slot, username, isHost, isMe }: { slot: number; username: string; isHost: boolean; isMe: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/5">
      {/* Slot badge */}
      <span className="text-xs font-mono text-white/40 w-6 text-center">{slot}</span>
      {/* Crewmate icon placeholder */}
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold select-none">
        {username.slice(0, 1).toUpperCase()}
      </div>
      <span className="flex-1 text-sm text-white truncate">
        {username}
        {isMe && <span className="ml-1 text-white/40 text-xs">(you)</span>}
      </span>
      {isHost && (
        <span className="text-xs bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded-full">
          HOST
        </span>
      )}
    </div>
  );
}

function JoinForm({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '');
    if (clean.length === 6) { haptic.tap(); onJoin(clean); }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Za-z2-9]/g, '').slice(0, 6))}
        placeholder="ROOM CODE"
        maxLength={6}
        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 font-mono text-sm tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={code.replace(/[^A-Za-z2-9]/g, '').length < 6}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        Join
      </button>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Lobby() {
  const state = useGameState();
  const { createRoom, joinRoom, startGame } = useGameActions();
  const [, navigate] = useLocation();

  // Auto-navigate to /game when the server signals game has started (0x1A)
  useEffect(() => {
    if (state.phase === 'playing') navigate('/game');
  }, [state.phase, navigate]);

  const isInRoom = state.roomCode !== null;
  const isHost = state.mySlot !== null && state.mySlot === state.hostSlot;

  // ── Connecting spinner ───────────────────────────────────────────────────
  if (state.phase === 'connecting') {
    return (
      <div className="min-h-screen bg-[#0f111a] flex items-center justify-center">
        <div className="text-white/60 text-sm flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          Connecting…
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="min-h-screen bg-[#0f111a] flex items-center justify-center p-4">
        <div className="text-red-400 text-sm text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div>{state.errorMessage ?? 'Connection failed'}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs text-white/40 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f111a] text-white flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Among Us</h1>
        <p className="text-white/40 text-xs mt-1">Telegram Mini Game</p>
      </div>

      <div className="w-full max-w-sm space-y-4">

        {/* Error banner (dismissable, non-fatal) */}
        {state.errorMessage && state.phase === 'lobby' && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 text-sm text-center">
            {state.errorMessage}
          </div>
        )}

        {/* ── Not in a room yet ─────────────────────────────────────── */}
        {!isInRoom && (
          <>
            <button
              onClick={() => { haptic.tap(); createRoom(); }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold py-3 rounded-xl transition-all"
            >
              Create Room
            </button>

            <div className="flex items-center gap-3 text-white/20 text-xs">
              <div className="flex-1 h-px bg-white/10" />
              OR
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <JoinForm onJoin={joinRoom} />
          </>
        )}

        {/* ── In a room ─────────────────────────────────────────────── */}
        {isInRoom && (
          <div className="space-y-4">
            {/* Room code */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-white/40 text-xs mb-1 uppercase tracking-wider">Room Code</p>
              <p className="text-3xl font-mono font-bold tracking-[0.25em] text-white select-all">
                {state.roomCode}
              </p>
              <p className="text-white/30 text-xs mt-1">Share this code to invite friends</p>
            </div>

            {/* Player list */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1">
              <p className="text-white/40 text-xs uppercase tracking-wider px-2 mb-2">
                Players — {state.players.length} / 15
              </p>
              {state.players.map(p => (
                <PlayerRow
                  key={p.slot}
                  slot={p.slot}
                  username={p.username}
                  isHost={p.slot === state.hostSlot}
                  isMe={p.slot === state.mySlot}
                />
              ))}
              {state.players.length < 15 && (
                <div className="flex items-center gap-3 py-2 px-3 text-white/20 text-sm">
                  <span className="text-xs font-mono w-6 text-center">—</span>
                  <span>Waiting for players…</span>
                </div>
              )}
            </div>

            {/* Start game (host only) */}
            {isHost && (
              <button
                onClick={() => { haptic.medium(); startGame(); }}
                disabled={state.players.length < 2}
                className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-white font-semibold py-3 rounded-xl transition-all"
                title={state.players.length < 2 ? 'Need at least 2 players' : ''}
              >
                Start Game
              </button>
            )}

            {!isHost && (
              <p className="text-center text-white/30 text-sm">
                Waiting for the host to start…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
