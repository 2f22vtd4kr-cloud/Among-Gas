/**
 * КАНИСТРА — Red Soviet Jerry Can
 *
 * The entire screen IS a big red 20-litre Soviet jerrycan (канистра),
 * viewed straight-on. Handle at top, warning labels as UI sections,
 * fill-level indicator on the side. Buttons are metal caps and stickers.
 * Among Us chunky flat cartoon style throughout.
 */
import React, { useState, useEffect } from 'react';

// ── Warning label sticker ─────────────────────────────────────────────────────

function WarnSticker({ text, small }: { text: string; small?: boolean }) {
  return (
    <div style={{
      background: '#f5e030',
      border: '2.5px solid #1a0a00',
      borderRadius: 4,
      padding: small ? '2px 6px' : '3px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: small ? 8 : 10,
        color: '#1a0a00',
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
      }}>{text}</span>
    </div>
  );
}

// ── Metal cap button ──────────────────────────────────────────────────────────

interface CapButtonProps {
  label: string;
  sublabel?: string;
  color: string;
  shadow: string;
  onClick?: () => void;
  disabled?: boolean;
  wide?: boolean;
}

function CapButton({ label, sublabel, color, shadow, onClick, disabled, wide }: CapButtonProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      style={{
        width: wide ? '100%' : undefined,
        background: disabled ? '#6a6a5a' : color,
        border: '3.5px solid #1a0a00',
        borderRadius: 12,
        padding: '10px 20px',
        boxShadow: pressed
          ? 'inset 0 2px 4px rgba(0,0,0,0.4)'
          : `0 5px 0 ${shadow}, 0 5px 0 #1a0a00, inset 0 1px 0 rgba(255,255,255,0.2)`,
        transform: pressed ? 'translateY(4px)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'transform 0.06s, box-shadow 0.06s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top sheen */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.18), transparent)',
        pointerEvents: 'none',
      }} />
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 14,
        color: '#fff',
        textShadow: '-1.5px -1.5px 0 #1a0a00, 1.5px -1.5px 0 #1a0a00, -1.5px 1.5px 0 #1a0a00, 1.5px 1.5px 0 #1a0a00',
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
        position: 'relative',
        zIndex: 1,
      }}>{label}</span>
      {sublabel && (
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: 'rgba(255,255,255,0.65)',
          position: 'relative',
          zIndex: 1,
          textAlign: 'center' as const,
        }}>{sublabel}</span>
      )}
    </button>
  );
}

// ── Fill level indicator ──────────────────────────────────────────────────────

function FillMeter({ level }: { level: number }) {
  return (
    <div style={{
      width: 18,
      height: 140,
      border: '2.5px solid #1a0a00',
      borderRadius: 6,
      background: '#1a0a00',
      overflow: 'hidden',
      position: 'relative',
      flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: `${level}%`,
        background: 'linear-gradient(to top, #c81818, #ff5030)',
        transition: 'height 0.5s ease',
      }} />
      {/* Level markers */}
      {[25, 50, 75].map(l => (
        <div key={l} style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: `${l}%`,
          height: 1.5,
          background: 'rgba(255,255,255,0.3)',
        }} />
      ))}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 2,
      }}>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 7,
          color: 'rgba(255,255,255,0.5)',
          writingMode: 'vertical-rl' as const,
          transform: 'rotate(180deg)',
        }}>ЛИТ</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Warm() {
  const [botCount, setBotCount] = useState(4);
  const [code, setCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');
  const [fillLevel, setFillLevel] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setFillLevel(15), 400);
    return () => clearTimeout(t);
  }, []);

  const mockPlayers = ['Борис', 'Надя'];

  if (view === 'room') {
    return (
      <div style={rootStyle}>
        <div style={canisterBody}>
          <CanisterTop />

          {/* Inner label area */}
          <div style={innerBody}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                {/* Brand label */}
                <div style={mainLabel}>
                  <WarnSticker text="⚠ КОМНАТА ОТКРЫТА" />
                  <div style={codeArea}>
                    <span style={codeLabel}>КОД КАНИСТРЫ</span>
                    <span style={codeText}>XYZ789</span>
                    <span style={codeHint}>Дай друзьям — пусть несут свой бензин</span>
                  </div>
                </div>

                {/* Player list */}
                <div style={playerListBox}>
                  <span style={sectionTitle}>В ОЧЕРЕДИ — {mockPlayers.length}/15</span>
                  {mockPlayers.map((name, i) => (
                    <div key={name} style={playerItem}>
                      <div style={playerDroplet} />
                      <span style={playerLabel}>{name}</span>
                      {i === 0 && <WarnSticker text="ХОЗЯИН" small />}
                    </div>
                  ))}
                  <div style={{ ...playerItem, opacity: 0.3 }}>
                    <div style={{ ...playerDroplet, background: 'transparent', border: '2px dashed #c81818' }} />
                    <span style={{ ...playerLabel, fontStyle: 'italic' }}>ждём ещё...</span>
                  </div>
                </div>
              </div>
              <FillMeter level={fillLevel + mockPlayers.length * 12} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <CapButton label="ЗАЛИТЬ ВСЕМ И ЕХАТЬ" sublabel="начать игру" color="#1a6a1a" shadow="#0a3a0a" wide onClick={() => {}} />
              <CapButton label="← ВЕРНУТЬ КАНИСТРУ" sublabel="покинуть комнату" color="#4a1808" shadow="#2a0808" wide onClick={() => setView('home')} />
            </div>
          </div>

          <CanisterBottom />
        </div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <div style={canisterBody}>
        <CanisterTop />

        <div style={innerBody}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Brand label */}
              <div style={mainLabel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <WarnSticker text="⚠ ОГНЕОПАСНО" />
                  <WarnSticker text="20Л" small />
                </div>
                <div style={logoBlock}>
                  <span style={logoText}>AMONG</span>
                  <div style={logoDroplet}>
                    <svg width="30" height="38" viewBox="0 0 30 38">
                      <path d="M15 1 C15 1 1 14 1 23 A14 14 0 0 0 29 23 C29 14 15 1 15 1Z" fill="#f5e030" stroke="#1a0a00" strokeWidth="2.5"/>
                      <ellipse cx="10" cy="22" rx="3" ry="5" fill="rgba(255,255,255,0.3)" transform="rotate(-15 10 22)"/>
                    </svg>
                  </div>
                  <span style={logoText}>GAS</span>
                </div>
                <div style={logoSubtitle}>ВЫСОКООКТАНОВАЯ МНОГОПОЛЬЗОВАТЕЛЬСКАЯ</div>
                <div style={logoSubtitle}>ИГРА ДЛЯ ВЫЖИВАЮЩИХ В КРИЗИСЕ</div>
                <div style={{ ...logoSubtitle, marginTop: 4, color: '#7a5a40' }}>АИ-95 · AMONG GAS S.A. · BATCH 2024</div>
              </div>

              {/* Action stickers */}
              <CapButton label="ЗАНЯТЬ КАНИСТРУ" sublabel="создать комнату" color="#c81818" shadow="#7a0808" wide onClick={() => setView('room')} />

              {/* Bot section */}
              <div style={stickerBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={sectionTitle}>ОДИН С БОТАМИ</span>
                  <WarnSticker text="УЧЕБНЫЙ" small />
                </div>
                <div style={stepperRow}>
                  <button style={stepBtn} onClick={() => setBotCount(c => Math.max(1, c - 1))}>−</button>
                  <div style={stepDisplay}>
                    <span style={stepVal}>{botCount}</span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: '#7a5a40' }}>БОТОВ</span>
                  </div>
                  <button style={stepBtn} onClick={() => setBotCount(c => Math.min(14, c + 1))}>+</button>
                </div>
                <CapButton label="ТРЕНИРОВАТЬСЯ" sublabel="бензин не настоящий" color="#c88018" shadow="#7a4808" wide />
              </div>

              {/* Join by code */}
              <div style={stickerBox}>
                <span style={sectionTitle}>ВОЙТИ ПО КОДУ</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    placeholder="______"
                    maxLength={6}
                    style={codeInput}
                  />
                  <CapButton
                    label="ВЪЕЗД"
                    color="#1a3a7a"
                    shadow="#0a1a4a"
                    disabled={code.length < 6}
                    onClick={() => setView('room')}
                  />
                </div>
              </div>
            </div>

            {/* Fill meter on the side */}
            <FillMeter level={fillLevel} />
          </div>
        </div>

        <CanisterBottom />
      </div>
    </div>
  );
}

// ── Canister structural pieces ────────────────────────────────────────────────

function CanisterTop() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
    }}>
      {/* Handle */}
      <div style={{
        width: 120,
        height: 26,
        border: '3.5px solid #1a0a00',
        borderBottom: 'none',
        borderRadius: '40px 40px 0 0',
        background: 'linear-gradient(to bottom, #e82020, #c81818)',
        boxShadow: 'inset 0 3px 6px rgba(255,255,255,0.2)',
      }} />
      {/* Neck */}
      <div style={{
        width: 80,
        height: 14,
        background: 'linear-gradient(to bottom, #b81010, #c81818)',
        border: '3.5px solid #1a0a00',
        borderTop: 'none',
        borderBottom: 'none',
        position: 'relative',
      }}>
        {/* Cap */}
        <div style={{
          position: 'absolute',
          left: '50%', top: -2,
          transform: 'translateX(-50%)',
          width: 30, height: 16,
          background: 'linear-gradient(to bottom, #4a4a38, #2a2a18)',
          border: '3px solid #1a0a00',
          borderRadius: '6px 6px 0 0',
          boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.15)',
        }}>
          {/* Screw lines */}
          {[4, 8, 12].map(y => (
            <div key={y} style={{
              position: 'absolute', top: y, left: 2, right: 2, height: 1,
              background: 'rgba(255,255,255,0.2)',
            }} />
          ))}
        </div>
      </div>
      {/* Shoulder */}
      <div style={{
        width: '100%',
        height: 16,
        background: 'linear-gradient(to bottom, #b81010, #c81818)',
        border: '3.5px solid #1a0a00',
        borderTop: 'none',
        borderBottom: 'none',
        clipPath: 'polygon(20px 0, calc(100% - 20px) 0, 100% 100%, 0 100%)',
      }} />
    </div>
  );
}

function CanisterBottom() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Foot */}
      <div style={{
        width: '100%',
        height: 14,
        background: 'linear-gradient(to bottom, #b81010, #8a0808)',
        border: '3.5px solid #1a0a00',
        borderTop: 'none',
        borderRadius: '0 0 0 0',
      }} />
      <div style={{
        width: 'calc(100% + 8px)',
        height: 10,
        background: '#8a0808',
        border: '3px solid #1a0a00',
        borderRadius: '0 0 8px 8px',
        boxShadow: '0 3px 0 #1a0a00',
      }} />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 844,
  maxWidth: 390,
  margin: '0 auto',
  overflow: 'hidden',
  background: 'linear-gradient(160deg, #1a2010 0%, #0d1808 50%, #151a08 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: "'Outfit', sans-serif",
};

const canisterBody: React.CSSProperties = {
  width: 'calc(100% - 32px)',
  maxWidth: 310,
  display: 'flex',
  flexDirection: 'column',
  filter: 'drop-shadow(4px 8px 20px rgba(0,0,0,0.8))',
};

const innerBody: React.CSSProperties = {
  background: 'linear-gradient(to right, #d81818, #c81818, #d02020)',
  border: '3.5px solid #1a0a00',
  borderTop: 'none',
  borderBottom: 'none',
  padding: '12px 12px',
};

const mainLabel: React.CSSProperties = {
  background: '#f8f4e4',
  border: '3px solid #1a0a00',
  borderRadius: 8,
  padding: '10px 10px',
  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
};

const stickerBox: React.CSSProperties = {
  background: 'rgba(0,0,0,0.2)',
  border: '2.5px solid rgba(0,0,0,0.4)',
  borderRadius: 8,
  padding: '10px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const logoBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  margin: '6px 0 4px',
};

const logoText: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 24,
  color: '#1a0a00',
  letterSpacing: '0.04em',
};

const logoDroplet: React.CSSProperties = {};

const logoSubtitle: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#5a4a30',
  letterSpacing: '0.08em',
  textAlign: 'center',
  textTransform: 'uppercase',
};

const codeArea: React.CSSProperties = {
  marginTop: 10,
  textAlign: 'center',
};

const codeLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#7a6a50',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  marginBottom: 4,
};

const codeText: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 34,
  color: '#c81818',
  letterSpacing: '0.18em',
  lineHeight: 1,
};

const codeHint: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#7a6a50',
  marginTop: 4,
  fontStyle: 'italic',
};

const playerListBox: React.CSSProperties = {
  marginTop: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 700,
  fontSize: 9,
  color: 'rgba(255,255,255,0.6)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
};

const playerItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
};

const playerDroplet: React.CSSProperties = {
  width: 14,
  height: 18,
  background: 'linear-gradient(to bottom, #f5e030, #e0c020)',
  border: '2px solid #1a0a00',
  borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%',
  flexShrink: 0,
};

const playerLabel: React.CSSProperties = {
  flex: 1,
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 700,
  fontSize: 12,
  color: '#fff',
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
};

const stepperRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  marginBottom: 8,
};

const stepBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  background: 'rgba(0,0,0,0.3)',
  border: '2.5px solid rgba(0,0,0,0.5)',
  borderRadius: 6,
  color: '#fff',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  fontFamily: "'Space Mono', monospace",
};

const stepDisplay: React.CSSProperties = {
  flex: 1,
  background: 'rgba(0,0,0,0.25)',
  border: '2px solid rgba(0,0,0,0.3)',
  borderRadius: 6,
  padding: '4px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const stepVal: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 20,
  color: '#fff',
  textShadow: '-1px -1px 0 #1a0a00, 1px -1px 0 #1a0a00, -1px 1px 0 #1a0a00, 1px 1px 0 #1a0a00',
  lineHeight: 1,
};

const codeInput: React.CSSProperties = {
  flex: 1,
  background: 'rgba(0,0,0,0.25)',
  border: '2.5px solid rgba(0,0,0,0.4)',
  borderRadius: 8,
  padding: '8px 8px',
  color: '#fff',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 18,
  letterSpacing: '0.2em',
  textAlign: 'center',
  outline: 'none',
};
