/**
 * Lobby screen — Among Gas visual style
 *
 * Among Us-inspired UI with Russian text throughout.
 * Title "Among Gas" stays in English per product spec.
 */
import { useState, useEffect } from 'react';
import { useGameState, useGameActions } from '@/context/GameContext';
import { useLocation } from 'wouter';
import { haptic } from '@/lib/haptics';
import './lobby.css';

// ── Sprite sheet constants (mirrors characterSprites.ts) ─────────────────────
const SHEET_W = 1123;
const SHEET_H = 1401;
const COLS = 7;
const ROWS_S = 9;
const CELL_W = SHEET_W / COLS;   // ≈ 160.43
const CELL_H = SHEET_H / ROWS_S; // ≈ 155.67

const COLOR_COL: Record<string, number> = {
  teal: 0, maroon: 1, navy: 2, purple: 3, brown: 4, 'dark-gray': 5, magenta: 6,
};
const POSE_ROW: Record<string, number> = {
  idle: 0, 'walk-1': 1, 'walk-2': 2, 'run-lean': 3, ghost: 4,
  mask: 5, 'hold-item': 6, 'sit-hug-knees': 7, 'sit-crouch': 8,
};
const SLOT_COLORS = ['teal', 'maroon', 'navy', 'purple', 'brown', 'dark-gray', 'magenta'];

/** Renders one frame of the balaclava character sprite sheet via CSS background. */
function CharSprite({
  color, pose = 'idle', size = 64, flipped = false,
}: {
  color: string; pose?: string; size?: number; flipped?: boolean;
}) {
  const col = COLOR_COL[color] ?? 0;
  const row = POSE_ROW[pose] ?? 0;
  const scale = size / CELL_W;
  const sheetW = SHEET_W * scale;
  const sheetH = SHEET_H * scale;
  const posX = -(col * CELL_W * scale);
  const posY = -(row * CELL_H * scale);
  const height = Math.round(CELL_H * scale);

  return (
    <div style={{
      width: size,
      height,
      backgroundImage: 'url(/sprites/characters.png?v=4)',
      backgroundSize: `${sheetW}px ${sheetH}px`,
      backgroundPosition: `${posX}px ${posY}px`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
      transform: flipped ? 'scaleX(-1)' : undefined,
      flexShrink: 0,
    }} />
  );
}

// ── Gas particle background ───────────────────────────────────────────────────
const PARTICLE_DATA = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: `${3 + ((i * 4.7 + i * i * 0.3) % 94)}%`,
  delay: `${((i * 0.63) % 4).toFixed(2)}s`,
  duration: `${(3.5 + (i * 0.41) % 3.5).toFixed(2)}s`,
  size: `${4 + (i * 1.3) % 7}px`,
  opacity: `${(0.12 + (i % 6) * 0.06).toFixed(2)}`,
}));

function GasParticles() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {PARTICLE_DATA.map(p => (
        <div
          key={p.id}
          className="gas-particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            '--p-delay': p.delay,
            '--p-duration': p.duration,
            '--p-opacity': p.opacity,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Russian pluralization for bot count ──────────────────────────────────────
function botLabel(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} бот`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${n} бота`;
  return `${n} ботов`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlayerRow({
  slot, username, isHost, isMe,
}: { slot: number; username: string; isHost: boolean; isMe: boolean }) {
  const color = SLOT_COLORS[slot % SLOT_COLORS.length];
  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.06)' }}
    >
      <CharSprite color={color} pose="idle" size={26} />
      <span className="flex-1 text-sm text-white truncate font-medium">
        {username}
        {isMe && (
          <span className="ml-1 text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>(вы)</span>
        )}
      </span>
      {isHost && (
        <span
          className="text-xs px-2 py-0.5 rounded-full font-bold tracking-wide"
          style={{ background: 'rgba(255,210,50,0.18)', color: '#ffd23f' }}
        >
          ХОСТ
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
        placeholder="КОД КОМНАТЫ"
        maxLength={6}
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.08)',
          border: '2px solid rgba(255,255,255,0.14)',
          borderRadius: 20,
          padding: '12px 14px',
          color: 'white',
          fontFamily: 'monospace',
          fontSize: 14,
          letterSpacing: '0.25em',
          textAlign: 'center',
          textTransform: 'uppercase',
          outline: 'none',
        }}
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={code.replace(/[^A-Za-z2-9]/g, '').length < 6}
        className="ag-btn ag-btn-blue disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ width: 90, padding: '12px 8px', fontSize: 15 }}
      >
        Войти
      </button>
    </form>
  );
}

// ── Main Lobby ────────────────────────────────────────────────────────────────
export default function Lobby() {
  const state = useGameState();
  const { createRoom, createSolo, joinRoom, startGame } = useGameActions();
  const [, navigate] = useLocation();
  const [botCount, setBotCount] = useState(4);

  // Auto-navigate to /game when server signals game start (0x1A)
  useEffect(() => {
    if (state.phase === 'playing') navigate('/game');
  }, [state.phase, navigate]);

  const isInRoom = state.roomCode !== null;
  const isHost = state.mySlot !== null && state.mySlot === state.hostSlot;

  // ── Connecting spinner ───────────────────────────────────────────────────
  if (state.phase === 'connecting') {
    return (
      <div className="lobby-bg min-h-screen flex items-center justify-center relative overflow-hidden">
        <GasParticles />
        <div className="z-10 text-sm flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <span
            className="w-3 h-3 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(255,255,255,0.25)', borderTopColor: 'white' }}
          />
          Подключение…
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="lobby-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <GasParticles />
        <div className="z-10 text-sm text-center" style={{ color: '#ff9090' }}>
          <div className="text-2xl mb-2">⚠️</div>
          <div>{state.errorMessage ?? 'Ошибка подключения'}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs underline"
            style={{ color: 'rgba(255,255,255,0.38)' }}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-bg min-h-screen text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <GasParticles />

      {/* ── Logo area ─────────────────────────────────────────────── */}
      <div className="z-10 relative flex flex-col items-center mb-6">
        {/* Characters flanking the title */}
        <div className="flex items-end gap-3 mb-1">
          <CharSprite color="teal"   pose="idle" size={68} />
          <div className="flex flex-col items-center">
            <h1 className="ag-title">Among Gas</h1>
          </div>
          <CharSprite color="maroon" pose="idle" size={68} flipped />
        </div>
        <p
          className="text-xs tracking-widest"
          style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}
        >
          МИНИ-ИГРА В TELEGRAM
        </p>
      </div>

      {/* ── Main card ─────────────────────────────────────────────── */}
      <div className="w-full max-w-sm space-y-3 z-10 relative">

        {/* Non-fatal error banner */}
        {state.errorMessage && state.phase === 'lobby' && (
          <div
            className="rounded-2xl px-4 py-3 text-sm text-center"
            style={{
              background: 'rgba(220,60,60,0.18)',
              border: '1px solid rgba(220,60,60,0.3)',
              color: '#ff9090',
            }}
          >
            {state.errorMessage}
          </div>
        )}

        {/* ─── Not in a room ─────────────────────────────────────── */}
        {!isInRoom && (
          <>
            <button
              onClick={() => { haptic.tap(); createRoom(); }}
              className="ag-btn ag-btn-green"
            >
              Создать комнату
            </button>

            {/* Play solo section */}
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <p
                className="text-center text-xs uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.38)' }}
              >
                Соло против ботов
              </p>

              {/* Bot count stepper */}
              <div className="flex items-center justify-center gap-4">
                <button
                  className="ag-stepper"
                  onClick={() => setBotCount(c => Math.max(1, c - 1))}
                >
                  −
                </button>
                <span className="font-semibold w-28 text-center text-sm">{botLabel(botCount)}</span>
                <button
                  className="ag-stepper"
                  onClick={() => setBotCount(c => Math.min(14, c + 1))}
                >
                  +
                </button>
              </div>

              <button
                onClick={() => { haptic.medium(); createSolo(botCount); }}
                className="ag-btn ag-btn-green"
                style={{ fontSize: 15 }}
              >
                Играть соло
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.22)' }}>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              ИЛИ ВОЙТИ В КОМНАТУ
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>

            <JoinForm onJoin={joinRoom} />
          </>
        )}

        {/* ─── In a room ─────────────────────────────────────────── */}
        {isInRoom && (
          <div className="space-y-3">
            {/* Room code card */}
            <div
              className="rounded-2xl p-4 text-center"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <p
                className="text-xs mb-1 uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.38)' }}
              >
                Код комнаты
              </p>
              <p
                className="text-3xl font-mono font-bold select-all"
                style={{ letterSpacing: '0.28em', color: '#c8f0ff' }}
              >
                {state.roomCode}
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.28)' }}>
                Поделитесь кодом для приглашения
              </p>
            </div>

            {/* Player list */}
            <div
              className="rounded-2xl p-3 space-y-1"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <p
                className="text-xs uppercase tracking-widest px-2 mb-2"
                style={{ color: 'rgba(255,255,255,0.38)' }}
              >
                Игроки — {state.players.length} / 15
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
                <div
                  className="flex items-center gap-3 py-2 px-3 text-sm"
                  style={{ color: 'rgba(255,255,255,0.2)' }}
                >
                  <span className="text-xs font-mono w-6 text-center">—</span>
                  <span>Ждём игроков…</span>
                </div>
              )}
            </div>

            {/* Start game — host only, need 2+ players */}
            {isHost && (
              <button
                onClick={() => { haptic.medium(); startGame(); }}
                disabled={state.players.length < 2}
                className="ag-btn ag-btn-green disabled:opacity-40 disabled:cursor-not-allowed"
                title={state.players.length < 2 ? 'Нужно минимум 2 игрока' : ''}
              >
                Начать игру
              </button>
            )}

            {/* Dev test run — 1 player solo */}
            {isHost && state.players.length === 1 && (
              <button
                onClick={() => { haptic.medium(); startGame(); }}
                className="w-full py-3 rounded-2xl text-sm font-medium transition-all active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.60)',
                }}
              >
                Тест (Соло)
              </button>
            )}

            {!isHost && (
              <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.32)' }}>
                Ждём начала игры…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
