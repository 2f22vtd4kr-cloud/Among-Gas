/**
 * ДВОРИК — Night Yard Bulletin Board
 *
 * Visual concept: A weathered cork bulletin board pinned to the courtyard fence
 * at night. Map's exact palette: dark cold blue-grey sky, amber lamppost glow,
 * concrete. Buttons are chunky Among-Us style with courtyard prop icons.
 */
import React, { useState } from 'react';

// ── Inline SVG icons themed to the courtyard map ────────────────────────────

const BenchIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="14" width="24" height="5" rx="2" fill="#c8d8e8" stroke="#0a1020" strokeWidth="2"/>
    <rect x="4" y="20" width="24" height="3" rx="1.5" fill="#9aabb8" stroke="#0a1020" strokeWidth="2"/>
    <rect x="7" y="23" width="3" height="6" rx="1" fill="#7a8c9a" stroke="#0a1020" strokeWidth="1.5"/>
    <rect x="22" y="23" width="3" height="6" rx="1" fill="#7a8c9a" stroke="#0a1020" strokeWidth="1.5"/>
  </svg>
);

const SwingsIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="4" width="24" height="3" rx="1.5" fill="#7a8c9a" stroke="#0a1020" strokeWidth="1.5"/>
    <line x1="10" y1="7" x2="10" y2="22" stroke="#c8d8e8" strokeWidth="1.5"/>
    <line x1="22" y1="7" x2="22" y2="22" stroke="#c8d8e8" strokeWidth="1.5"/>
    <rect x="8" y="22" width="8" height="4" rx="2" fill="#9aabb8" stroke="#0a1020" strokeWidth="1.5"/>
  </svg>
);

const LamppostIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="14" y="10" width="4" height="20" rx="2" fill="#7a8c9a" stroke="#0a1020" strokeWidth="1.5"/>
    <path d="M16 10 Q16 4 22 4" stroke="#7a8c9a" strokeWidth="3" strokeLinecap="round" fill="none"/>
    <ellipse cx="22" cy="4" rx="4" ry="3" fill="#f5d47a" stroke="#0a1020" strokeWidth="1.5"/>
    <ellipse cx="22" cy="7" rx="6" ry="4" fill="#f5d47a" fillOpacity="0.2"/>
  </svg>
);

const VanIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="2" y="12" width="28" height="14" rx="3" fill="#4a6040" stroke="#0a1020" strokeWidth="2"/>
    <path d="M2 16 L8 10 L24 10 L28 16" fill="#3a5030" stroke="#0a1020" strokeWidth="1.5"/>
    <circle cx="8" cy="26" r="3" fill="#1a2535" stroke="#0a1020" strokeWidth="1.5"/>
    <circle cx="24" cy="26" r="3" fill="#1a2535" stroke="#0a1020" strokeWidth="1.5"/>
    <rect x="10" y="11" width="6" height="5" rx="1" fill="#a8c8d8" fillOpacity="0.6" stroke="#0a1020" strokeWidth="1"/>
  </svg>
);

// ── Chunky Among-Us style button ─────────────────────────────────────────────

interface ChunkyButtonProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  color: string;
  shadowColor: string;
  onClick?: () => void;
  disabled?: boolean;
}

function ChunkyButton({ icon, label, sublabel, color, shadowColor, onClick, disabled }: ChunkyButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        border: '3px solid #0a1020',
        borderRadius: '14px',
        background: disabled ? '#4a5a6a' : color,
        boxShadow: pressed ? 'none' : `0 5px 0 ${shadowColor}, 0 5px 0 #0a1020`,
        transform: pressed ? 'translateY(4px)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.06s ease, box-shadow 0.06s ease',
        overflow: 'hidden',
        minHeight: 64,
      }}
    >
      {/* Icon thumbnail */}
      <div style={{
        width: 60,
        minWidth: 60,
        background: 'rgba(0,0,0,0.25)',
        borderRight: '3px solid #0a1020',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      {/* Label */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingLeft: 14,
        paddingRight: 10,
      }}>
        <span style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: 16,
          color: '#ffffff',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          lineHeight: 1.2,
        }}>{label}</span>
        {sublabel && (
          <span style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 400,
            fontSize: 11,
            color: 'rgba(255,255,255,0.65)',
            marginTop: 2,
          }}>{sublabel}</span>
        )}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Void() {
  const [botCount, setBotCount] = useState(4);
  const [code, setCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');

  // Simulated room view
  const mockPlayers = ['Алёша', 'Галя', 'Дядя Вова'];

  if (view === 'room') {
    return (
      <div style={styles.root}>
        <LampostGlow />
        <div style={styles.fenceWire} />

        <div style={styles.boardWrap}>
          <div style={styles.plankTop}>
            <span style={styles.plankText}>ДВОРОВОЙ ЧАРТ</span>
          </div>
          <div style={styles.corkBoard}>
            {/* Room code pinned card */}
            <div style={styles.pinnedCard}>
              <div style={styles.pin} />
              <p style={styles.cardLabel}>КОД ДВОРА</p>
              <p style={styles.roomCodeText}>XYZ789</p>
              <p style={styles.cardHint}>Скажи соседям</p>
            </div>

            {/* Player list */}
            <div style={{ ...styles.pinnedCard, marginTop: 12 }}>
              <div style={{ ...styles.pin, left: '50%' }} />
              <p style={styles.cardLabel}>ЖИТЕЛИ — {mockPlayers.length} / 15</p>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mockPlayers.map((name, i) => (
                  <div key={name} style={styles.playerRow}>
                    <span style={styles.playerAvatar}>{name[0]}</span>
                    <span style={styles.playerName}>{name}</span>
                    {i === 0 && <span style={styles.hostBadge}>ХОЗЯИН</span>}
                  </div>
                ))}
                <div style={{ ...styles.playerRow, opacity: 0.35 }}>
                  <span style={{ ...styles.playerAvatar, background: 'transparent', border: '2px dashed #7a8c9a' }}>?</span>
                  <span style={{ ...styles.playerName, fontStyle: 'italic' }}>Ждём соседей…</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '0 4px', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ChunkyButton
                icon={<VanIcon />}
                label="Начать игру"
                sublabel="Нужно минимум 2 игрока"
                color="#3a6050"
                shadowColor="#1a3828"
                onClick={() => {}}
              />
              <button onClick={() => setView('home')} style={styles.backBtn}>
                ← Покинуть двор
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <LampostGlow />
      <div style={styles.fenceWire} />

      <div style={styles.boardWrap}>
        {/* Wooden plank title */}
        <div style={styles.plankTop}>
          <span style={styles.plankText}>ДВОРИК</span>
          <span style={styles.plankSub}>• НАДЗОР СОСЕДЕЙ •</span>
        </div>

        {/* Cork board body */}
        <div style={styles.corkBoard}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px' }}>
            <ChunkyButton
              icon={<BenchIcon />}
              label="Занять двор"
              sublabel="Создать комнату для друзей"
              color="#3d6878"
              shadowColor="#1a3040"
              onClick={() => setView('room')}
            />
            <div style={styles.sectionDivider}>
              <div style={styles.dividerLine} />
              <span style={styles.dividerText}>или</span>
              <div style={styles.dividerLine} />
            </div>
            <div style={styles.soloBox}>
              <div style={styles.soloBanner}>
                <SwingsIcon />
                <div style={{ marginLeft: 10 }}>
                  <p style={styles.soloTitle}>Поиграть с ботами</p>
                  <p style={styles.soloHint}>Боты — заменители соседей</p>
                </div>
              </div>
              <div style={styles.stepperRow}>
                <button style={styles.stepBtn} onClick={() => setBotCount(c => Math.max(1, c - 1))}>−</button>
                <span style={styles.stepVal}>{botCount} {botCount === 1 ? 'бот' : botCount < 5 ? 'бота' : 'ботов'}</span>
                <button style={styles.stepBtn} onClick={() => setBotCount(c => Math.min(14, c + 1))}>+</button>
              </div>
              <ChunkyButton
                icon={<SwingsIcon />}
                label="Во двор!"
                color="#4a6a40"
                shadowColor="#1e3018"
              />
            </div>
            <div style={styles.sectionDivider}>
              <div style={styles.dividerLine} />
              <span style={styles.dividerText}>знаешь код?</span>
              <div style={styles.dividerLine} />
            </div>
            {/* Join form */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="КОД"
                maxLength={6}
                style={styles.codeInput}
              />
              <button
                disabled={code.length < 6}
                style={{ ...styles.joinBtn, opacity: code.length < 6 ? 0.45 : 1 }}
                onClick={() => setView('room')}
              >
                ВОЙТИ
              </button>
            </div>
          </div>
        </div>

        {/* Nail decorations */}
        <div style={{ ...styles.nail, top: 6, left: 16 }} />
        <div style={{ ...styles.nail, top: 6, right: 16 }} />
        <div style={{ ...styles.nail, bottom: 6, left: 16 }} />
        <div style={{ ...styles.nail, bottom: 6, right: 16 }} />
      </div>
    </div>
  );
}

// ── Background elements ───────────────────────────────────────────────────────

function LampostGlow() {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden'
    }}>
      {/* Ambient sky gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 40% at 80% 20%, rgba(245,212,122,0.10) 0%, transparent 70%)',
      }} />
      {/* Lamppost pole — right side */}
      <div style={{
        position: 'absolute', right: 28, top: 0, width: 6, height: '55%',
        background: 'linear-gradient(to right, #4a5a6a, #2a3540)',
        borderRadius: '0 0 3px 3px',
      }} />
      {/* Lamp head */}
      <div style={{
        position: 'absolute', right: 14, top: '20%', width: 30, height: 12,
        background: '#f5d47a',
        borderRadius: 4,
        boxShadow: '0 0 24px 12px rgba(245,212,122,0.35), 0 0 60px 30px rgba(245,212,122,0.10)',
      }} />
      {/* Ground fog */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
        background: 'linear-gradient(to top, rgba(15,25,40,0.6), transparent)',
      }} />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100%',
    height: 844,
    maxWidth: 390,
    margin: '0 auto',
    overflow: 'hidden',
    background: 'linear-gradient(160deg, #0d1825 0%, #1a2535 40%, #1e2d3a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Outfit', sans-serif",
  },
  fenceWire: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 8,
    background: 'repeating-linear-gradient(90deg, #3a4a5a 0px, #3a4a5a 18px, #0a1020 18px, #0a1020 20px)',
    opacity: 0.7,
  },
  boardWrap: {
    position: 'relative',
    width: 'calc(100% - 32px)',
    maxWidth: 340,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 2,
  },
  plankTop: {
    background: 'linear-gradient(to bottom, #6b4a2a, #4a3018)',
    border: '3px solid #0a1020',
    borderBottom: 'none',
    borderRadius: '10px 10px 0 0',
    padding: '10px 16px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.08)',
  },
  plankText: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 900,
    fontSize: 30,
    color: '#f5d47a',
    textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(245,212,122,0.3)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  plankSub: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 400,
    fontSize: 10,
    color: 'rgba(245,212,122,0.55)',
    letterSpacing: '0.25em',
    marginTop: 2,
  },
  corkBoard: {
    background: 'linear-gradient(135deg, #8B6F47 0%, #7A5C38 40%, #8B6F47 100%)',
    border: '3px solid #0a1020',
    borderRadius: '0 0 10px 10px',
    padding: '16px 12px 20px',
    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.06), 4px 8px 20px rgba(0,0,0,0.6)',
    position: 'relative',
  },
  pinnedCard: {
    background: '#f5f0e0',
    border: '2px solid #0a1020',
    borderRadius: 8,
    padding: '10px 12px 12px',
    position: 'relative',
    boxShadow: '2px 3px 8px rgba(0,0,0,0.4)',
  },
  pin: {
    position: 'absolute',
    top: -7,
    left: 20,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, #ff4444, #cc1111)',
    border: '2px solid #0a1020',
    zIndex: 2,
    boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
  },
  cardLabel: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 9,
    color: '#3a2a1a',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    margin: 0,
    marginBottom: 4,
  },
  roomCodeText: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 900,
    fontSize: 36,
    color: '#1a0a08',
    letterSpacing: '0.18em',
    margin: 0,
    lineHeight: 1,
  },
  cardHint: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 11,
    color: '#5a4a3a',
    margin: 0,
    marginTop: 4,
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 0',
  },
  playerAvatar: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: '#3d6878',
    border: '2px solid #0a1020',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 12,
    flexShrink: 0,
  } as React.CSSProperties,
  playerName: {
    flex: 1,
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 600,
    fontSize: 13,
    color: '#1a0a08',
  },
  hostBadge: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 9,
    color: '#8B6F47',
    background: '#f5d47a',
    border: '2px solid #0a1020',
    borderRadius: 4,
    padding: '2px 5px',
  },
  backBtn: {
    background: 'transparent',
    border: '2px solid rgba(245,212,122,0.4)',
    borderRadius: 8,
    color: 'rgba(245,212,122,0.7)',
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    padding: '8px',
    cursor: 'pointer',
    width: '100%',
  },
  sectionDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '2px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(0,0,0,0.2)',
  },
  dividerText: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 11,
    color: 'rgba(10,16,32,0.45)',
    whiteSpace: 'nowrap' as const,
  },
  soloBox: {
    background: 'rgba(0,0,0,0.18)',
    border: '2px solid rgba(0,0,0,0.25)',
    borderRadius: 10,
    padding: '10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  soloBanner: {
    display: 'flex',
    alignItems: 'center',
  },
  soloTitle: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 13,
    color: '#f5f0e0',
    margin: 0,
  },
  soloHint: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 10,
    color: 'rgba(245,240,224,0.55)',
    margin: 0,
    marginTop: 2,
  },
  stepperRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.3)',
    border: '2px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  } as React.CSSProperties,
  stepVal: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 14,
    color: '#f5f0e0',
    minWidth: 70,
    textAlign: 'center' as const,
  },
  codeInput: {
    flex: 1,
    background: 'rgba(0,0,0,0.22)',
    border: '3px solid #0a1020',
    borderRadius: 10,
    padding: '10px 12px',
    color: '#f5f0e0',
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
    outline: 'none',
  },
  joinBtn: {
    background: '#3d6878',
    border: '3px solid #0a1020',
    borderRadius: 10,
    boxShadow: '0 4px 0 #1a3040, 0 4px 0 #0a1020',
    color: '#fff',
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 800,
    fontSize: 13,
    padding: '0 16px',
    cursor: 'pointer',
    letterSpacing: '0.06em',
  },
  nail: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, #888, #444)',
    border: '1.5px solid #0a1020',
    zIndex: 10,
  },
};
