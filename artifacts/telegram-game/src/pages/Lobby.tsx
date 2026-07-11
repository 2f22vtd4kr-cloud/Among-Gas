/**
 * Lobby — Among Gas menu
 *
 * Portrait-mobile Among Us-accurate design:
 * • Dark teal panel background (#1A3330)
 * • Teal buttons with left icon zone + diagonal stripe highlight + 3D bottom shadow
 * • Fredoka One font, thick outline title
 * • All UI text in Russian; title "Among Gas" stays English per spec
 */
import { useState, useEffect } from 'react';
import { useGameState, useGameActions } from '@/context/GameContext';
import { useLocation } from 'wouter';
import { haptic } from '@/lib/haptics';
import './lobby.css';

// ── Sprite sheet constants (mirrors characterSprites.ts) ─────────────────────
const SHEET_W = 1123;
const SHEET_H = 1401;
const COLS    = 7;
const ROWS_S  = 9;
const CELL_W  = SHEET_W / COLS;   // ≈ 160.43
const CELL_H  = SHEET_H / ROWS_S; // ≈ 155.67

const COLOR_COL: Record<string, number> = {
  teal: 0, maroon: 1, navy: 2, purple: 3, brown: 4, 'dark-gray': 5, magenta: 6,
};
const POSE_ROW: Record<string, number> = {
  idle: 0, 'walk-1': 1, 'walk-2': 2, 'run-lean': 3, ghost: 4,
  mask: 5, 'hold-item': 6, 'sit-hug-knees': 7, 'sit-crouch': 8,
};
const SLOT_COLORS = ['teal', 'maroon', 'navy', 'purple', 'brown', 'dark-gray', 'magenta'];

/** One frame of the balaclava sprite sheet via CSS background. */
function CharSprite({
  color, pose = 'idle', size = 48, flipped = false,
}: {
  color: string; pose?: string; size?: number; flipped?: boolean;
}) {
  const col    = COLOR_COL[color] ?? 0;
  const row    = POSE_ROW[pose]   ?? 0;
  const scale  = size / CELL_W;
  const sheetW = SHEET_W * scale;
  const sheetH = SHEET_H * scale;
  const posX   = -(col * CELL_W * scale);
  const posY   = -(row * CELL_H * scale);
  const height = Math.round(CELL_H * scale);

  return (
    <div style={{
      width: size, height,
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

// ── Gas particles ─────────────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left:     `${4 + ((i * 5.1 + i * i * 0.3) % 92)}%`,
  delay:    `${((i * 0.67) % 4).toFixed(2)}s`,
  duration: `${(3.8 + (i * 0.43) % 3.5).toFixed(2)}s`,
  size:     `${4 + (i * 1.4) % 7}px`,
  opacity:  `${(0.1 + (i % 6) * 0.055).toFixed(2)}`,
}));

function GasParticles() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {PARTICLES.map(p => (
        <div key={p.id} className="gas-particle" style={{
          left: p.left, width: p.size, height: p.size,
          '--p-delay': p.delay, '--p-duration': p.duration, '--p-opacity': p.opacity,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

// ── Bot count pluralisation ───────────────────────────────────────────────────
function botLabel(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} бот`;
  if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100)) return `${n} бота`;
  return `${n} ботов`;
}

// ── Player row (in-room list) ─────────────────────────────────────────────────
function PlayerRow({ slot, username, isHost, isMe }: {
  slot: number; username: string; isHost: boolean; isMe: boolean;
}) {
  const color = SLOT_COLORS[slot % SLOT_COLORS.length];
  return (
    <div className="au-player-row">
      <CharSprite color={color} pose="idle" size={26} />
      <span style={{ flex: 1, fontSize: 14, color: 'white', fontWeight: 500 }} className="truncate">
        {username}
        {isMe && <span style={{ marginLeft: 4, fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>(вы)</span>}
      </span>
      {isHost && (
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
          background: 'rgba(255,210,50,0.16)', color: '#ffd23f', letterSpacing: '0.06em',
          fontFamily: "'Fredoka One', sans-serif",
        }}>
          ХОСТ
        </span>
      )}
    </div>
  );
}

// ── Title block ───────────────────────────────────────────────────────────────
function TitleBlock() {
  return (
    <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, marginBottom: 18 }}>
      {/* Title row */}
      <h1 className="ag-title" style={{ marginBottom: 6 }}>Among Gas</h1>
      {/* Characters + subtitle row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <CharSprite color="teal"   pose="walk-1" size={52} />
        <p style={{
          fontFamily: "'Fredoka One', sans-serif",
          fontSize: 11,
          letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.28)',
        }}>
          МИНИ-ИГРА В TELEGRAM
        </p>
        <CharSprite color="maroon" pose="walk-1" size={52} flipped />
      </div>
    </div>
  );
}

// ── Main Lobby ────────────────────────────────────────────────────────────────
export default function Lobby() {
  const state = useGameState();
  const { createRoom, createSolo, joinRoom, startGame } = useGameActions();
  const [, navigate] = useLocation();
  const [botCount,     setBotCount]     = useState(4);
  const [joinExpanded, setJoinExpanded] = useState(false);
  const [code,         setCode]         = useState('');

  useEffect(() => {
    if (state.phase === 'playing') navigate('/game');
  }, [state.phase, navigate]);

  const isInRoom = state.roomCode !== null;
  const isHost   = state.mySlot !== null && state.mySlot === state.hostSlot;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (state.phase === 'connecting') {
    return (
      <div className="lobby-bg" style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <GasParticles />
        <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="au-spinner" />
          <span style={{
            fontFamily: "'Fredoka One', sans-serif", fontSize: 16,
            color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
          }}>
            Подключение…
          </span>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="lobby-bg" style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        <GasParticles />
        <div style={{
          zIndex: 1, textAlign: 'center',
          background: 'rgba(200,50,50,0.15)',
          border: '2px solid rgba(200,50,50,0.3)',
          borderRadius: 12, padding: '20px 24px',
          fontFamily: "'Fredoka One', sans-serif",
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>☠</div>
          <div style={{ color: '#ff9090', fontSize: 16, marginBottom: 16 }}>
            {state.errorMessage ?? 'Ошибка подключения'}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="au-btn-ghost"
            style={{ margin: '0 auto' }}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // ── Join handler ─────────────────────────────────────────────────────────
  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '');
    if (clean.length === 6) { haptic.tap(); joinRoom(clean); }
  }

  // ── In a room ─────────────────────────────────────────────────────────────
  if (isInRoom) {
    return (
      <div className="lobby-bg" style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', position: 'relative', overflow: 'hidden',
      }}>
        <GasParticles />

        <TitleBlock />

        {/* Error banner */}
        {state.errorMessage && (
          <div style={{
            width: '100%', maxWidth: 340, marginBottom: 10,
            background: 'rgba(220,60,60,0.18)', border: '1.5px solid rgba(220,60,60,0.3)',
            borderRadius: 10, padding: '10px 14px',
            fontFamily: "'Fredoka One', sans-serif", fontSize: 14,
            color: '#ff9090', textAlign: 'center', zIndex: 1, position: 'relative',
          }}>
            {state.errorMessage}
          </div>
        )}

        <div className="au-panel" style={{ maxWidth: 340, zIndex: 1, position: 'relative' }}>

          {/* Room code */}
          <div style={{
            background: 'rgba(0,0,0,0.28)', border: '2px solid rgba(0,0,0,0.45)',
            borderRadius: 10, padding: '14px 12px', textAlign: 'center', marginBottom: 10,
          }}>
            <p style={{
              fontFamily: "'Fredoka One', sans-serif", fontSize: 11,
              letterSpacing: '0.2em', color: 'rgba(255,255,255,0.35)', marginBottom: 4,
            }}>КОД КОМНАТЫ</p>
            <p style={{
              fontFamily: "'Fredoka One', monospace", fontSize: 32,
              letterSpacing: '0.3em', color: '#7DF5E8', userSelect: 'all',
              textShadow: '0 0 18px rgba(125,245,232,0.3)',
            }}>
              {state.roomCode}
            </p>
            <p style={{
              fontFamily: "'Fredoka One', sans-serif", fontSize: 12,
              color: 'rgba(255,255,255,0.25)', marginTop: 4, letterSpacing: '0.06em',
            }}>
              Поделитесь кодом для приглашения
            </p>
          </div>

          {/* Player list */}
          <div style={{
            background: 'rgba(0,0,0,0.18)', border: '2px solid rgba(0,0,0,0.35)',
            borderRadius: 10, padding: '10px 10px 6px', marginBottom: 10,
          }}>
            <p style={{
              fontFamily: "'Fredoka One', sans-serif", fontSize: 11,
              letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)',
              marginBottom: 8, paddingLeft: 2,
            }}>
              ИГРОКИ — {state.players.length} / 15
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {state.players.map(p => (
                <PlayerRow
                  key={p.slot} slot={p.slot} username={p.username}
                  isHost={p.slot === state.hostSlot} isMe={p.slot === state.mySlot}
                />
              ))}
              {state.players.length < 15 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px',
                  fontFamily: "'Fredoka One', sans-serif",
                  fontSize: 13, color: 'rgba(255,255,255,0.2)',
                  letterSpacing: '0.06em',
                }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', width: 26, textAlign: 'center' }}>—</span>
                  Ждём игроков…
                </div>
              )}
            </div>
          </div>

          {/* Host actions */}
          {isHost && (
            <>
              <button
                className={`au-btn${state.players.length >= 2 ? ' au-btn-green' : ''}`}
                onClick={() => { haptic.medium(); startGame(); }}
                disabled={state.players.length < 2}
                style={{ marginBottom: 8 }}
              >
                <div className="au-btn-icon">
                  <CharSprite color="teal" pose="run-lean" size={44} />
                </div>
                <div className="au-btn-label" style={{
                  background: state.players.length >= 2
                    ? undefined
                    : 'rgba(40,40,40,0.5)',
                  backgroundImage: state.players.length >= 2 ? undefined : 'none',
                }}>
                  {state.players.length < 2 ? 'Нужно 2+ игрока' : 'Начать игру'}
                </div>
              </button>

              {state.players.length === 1 && (
                <button
                  className="au-btn-ghost"
                  onClick={() => { haptic.medium(); startGame(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'center' }}
                >
                  Тест (Соло)
                </button>
              )}
            </>
          )}

          {!isHost && (
            <div style={{
              textAlign: 'center', padding: '10px 0 4px',
              fontFamily: "'Fredoka One', sans-serif",
              fontSize: 15, color: 'rgba(255,255,255,0.32)',
              letterSpacing: '0.06em',
            }}>
              Ждём начала игры…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main menu (not in room) ───────────────────────────────────────────────
  return (
    <div className="lobby-bg" style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px 16px', position: 'relative', overflow: 'hidden',
    }}>
      <GasParticles />

      <TitleBlock />

      {/* Non-fatal error */}
      {state.errorMessage && state.phase === 'lobby' && (
        <div style={{
          width: '100%', maxWidth: 340, marginBottom: 10,
          background: 'rgba(220,60,60,0.18)', border: '1.5px solid rgba(220,60,60,0.3)',
          borderRadius: 10, padding: '10px 14px',
          fontFamily: "'Fredoka One', sans-serif", fontSize: 14,
          color: '#ff9090', textAlign: 'center', zIndex: 1, position: 'relative',
        }}>
          {state.errorMessage}
        </div>
      )}

      <div className="au-panel" style={{ maxWidth: 340, zIndex: 1, position: 'relative' }}>

        {/* ── СОЗДАТЬ КОМНАТУ ─────────────────────────────────────────── */}
        <button
          className="au-btn"
          onClick={() => { haptic.medium(); createRoom(); }}
          style={{ marginBottom: 8 }}
        >
          <div className="au-btn-icon">
            <CharSprite color="teal" pose="walk-2" size={46} />
          </div>
          <div className="au-btn-label">СОЗДАТЬ КОМНАТУ</div>
        </button>

        {/* ── СОЛО vs БОТЫ ────────────────────────────────────────────── */}
        <button
          className="au-btn"
          onClick={() => { haptic.medium(); createSolo(botCount); }}
          style={{ marginBottom: 0 }}
        >
          <div className="au-btn-icon">
            <CharSprite color="maroon" pose="idle" size={46} />
          </div>
          <div className="au-btn-label">СОЛО vs БОТЫ</div>
        </button>

        {/* Bot stepper — lives between buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18,
          padding: '10px 0 12px',
          background: 'rgba(0,0,0,0.12)',
          borderLeft: '2.5px solid rgba(0,0,0,0.45)',
          borderRight: '2.5px solid rgba(0,0,0,0.45)',
          marginBottom: 8,
        }}>
          <button
            className="au-stepper"
            onClick={() => setBotCount(c => Math.max(1, c - 1))}
          >−</button>
          <span style={{
            fontFamily: "'Fredoka One', sans-serif",
            fontSize: 17, color: 'rgba(255,255,255,0.75)',
            letterSpacing: '0.06em', minWidth: 90, textAlign: 'center',
          }}>
            {botLabel(botCount)}
          </span>
          <button
            className="au-stepper"
            onClick={() => setBotCount(c => Math.min(14, c + 1))}
          >+</button>
        </div>

        {/* ── ВОЙТИ В КОМНАТУ ─────────────────────────────────────────── */}
        <button
          className="au-btn"
          onClick={() => { haptic.tap(); setJoinExpanded(v => !v); }}
          style={{ marginBottom: joinExpanded ? 0 : 0 }}
        >
          <div className="au-btn-icon">
            <CharSprite color="navy" pose="hold-item" size={46} />
          </div>
          <div className="au-btn-label">ВОЙТИ С КОДОМ</div>
        </button>

        {/* Code input — expands below ВОЙТИ button */}
        {joinExpanded && (
          <form
            onSubmit={handleJoin}
            style={{
              display: 'flex', gap: 8, padding: '10px',
              background: 'rgba(0,0,0,0.18)',
              borderLeft: '2.5px solid rgba(0,0,0,0.45)',
              borderRight: '2.5px solid rgba(0,0,0,0.45)',
              borderBottom: '2.5px solid rgba(0,0,0,0.45)',
              borderRadius: '0 0 8px 8px',
              marginTop: -2,
            }}
          >
            <input
              className="au-input"
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Za-z2-9]/g, '').slice(0, 6))}
              placeholder="КОД"
              maxLength={6}
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button
              type="submit"
              className="au-btn-join"
              disabled={code.replace(/[^A-Za-z2-9]/g, '').length < 6}
            >
              ВОЙТИ
            </button>
          </form>
        )}
      </div>

      {/* Version footer */}
      <p style={{
        marginTop: 20, zIndex: 1, position: 'relative',
        fontFamily: "'Fredoka One', sans-serif",
        fontSize: 11, color: 'rgba(255,255,255,0.2)',
        letterSpacing: '0.1em',
      }}>
        v1.0 · AMONG GAS
      </p>
    </div>
  );
}
