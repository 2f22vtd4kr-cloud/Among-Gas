/**
 * АЗС ТАБЛО — Gas Station Price Board
 *
 * The lobby screen IS a gas station price sign at night.
 * Fuel grades (АИ-92, АИ-95, ДТ) map to game actions.
 * Amber LED segments, thick black outlines, chunky Among Us style.
 */
import React, { useState } from 'react';

// ── 7-segment-ish LED digit display ──────────────────────────────────────────

function LedPrice({ value, dim }: { value: string; dim?: boolean }) {
  return (
    <span style={{
      fontFamily: "'Space Mono', monospace",
      fontWeight: 700,
      fontSize: 26,
      color: dim ? '#3a2800' : '#ff9c00',
      textShadow: dim ? 'none' : '0 0 10px rgba(255,156,0,0.9), 0 0 22px rgba(255,156,0,0.5)',
      letterSpacing: '0.08em',
    }}>{value}</span>
  );
}

// ── Fuel grade badge ──────────────────────────────────────────────────────────

function GradeBadge({ grade, color }: { grade: string; color: string }) {
  return (
    <div style={{
      background: color,
      border: '3px solid #0a0a08',
      borderRadius: 8,
      padding: '4px 8px',
      minWidth: 62,
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 10,
        color: '#fff',
        letterSpacing: '0.05em',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }}>АИ</span>
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 18,
        color: '#fff',
        lineHeight: 1,
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }}>{grade}</span>
    </div>
  );
}

// ── Price board row (main action button) ──────────────────────────────────────

interface PriceRowProps {
  grade: string;
  gradeColor: string;
  actionText: string;
  priceDisplay: React.ReactNode;
  dim?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function PriceRow({ grade, gradeColor, actionText, priceDisplay, dim, onClick, disabled }: PriceRowProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onPointerDown={() => !dim && setPressed(true)}
      onPointerUp={() => { setPressed(false); !dim && onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled || dim}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        background: dim ? '#0c0c0a' : (pressed ? '#1a1a10' : '#111108'),
        border: '3px solid #0a0a08',
        borderBottom: 'none',
        padding: '10px 10px',
        gap: 10,
        cursor: dim ? 'default' : 'pointer',
        opacity: 1,
        textAlign: 'left' as const,
        transform: pressed ? 'scaleY(0.97)' : 'none',
        transition: 'background 0.06s ease, transform 0.06s ease',
      }}
    >
      {/* Fuel grade badge */}
      <GradeBadge grade={grade} color={dim ? '#2a2a1a' : gradeColor} />

      {/* Divider line */}
      <div style={{
        width: 2, alignSelf: 'stretch',
        background: dim ? '#1a1a10' : '#2a2000',
        flexShrink: 0,
      }} />

      {/* Action text */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: 13,
          color: dim ? '#3a3a28' : '#f0e8c8',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.04em',
          lineHeight: 1.2,
        }}>{actionText}</div>
      </div>

      {/* LED price display */}
      <div style={{
        minWidth: 90,
        textAlign: 'right' as const,
        paddingRight: 6,
      }}>
        {priceDisplay}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Void() {
  const [botCount, setBotCount] = useState(4);
  const [code, setCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');

  const mockPlayers = ['Алёша', 'Дядя Вова', 'Галя'];

  if (view === 'room') {
    return (
      <div style={rootStyle}>
        <Ground />
        <StarField />
        <div style={sceneWrap}>
          <StationCanopy title="СРЕДИ НАС" subtitle="СРЕДИ НАС — AMONG GAS" />
          <div style={signBoard}>
            <div style={signHeader}>
              <LedPrice value="КОМНАТА ОТКРЫТА" />
            </div>
            <div style={{ padding: '0 0 12px' }}>
              <div style={{ padding: '12px 14px 8px' }}>
                <div style={{ ...ledLabel, marginBottom: 8 }}>КОД ДЛЯ ДРУЗЕЙ</div>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <span style={{
                    fontFamily: "'Space Mono', monospace",
                    fontWeight: 700,
                    fontSize: 40,
                    color: '#ff9c00',
                    textShadow: '0 0 14px rgba(255,156,0,1), 0 0 30px rgba(255,156,0,0.5)',
                    letterSpacing: '0.2em',
                  }}>XYZ789</span>
                </div>
                <div style={{ ...ledLabel, marginTop: 8, marginBottom: 10 }}>
                  В ОЧЕРЕДИ ({mockPlayers.length}/15)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {mockPlayers.map((name, i) => (
                    <div key={name} style={playerRow}>
                      <span style={playerDot} />
                      <span style={playerName}>{name}</span>
                      {i === 0 && <span style={hostTag}>ЗАПРАВЩИК</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ActionButton label="РАЗДАТЬ ВСЕМ ПО ЛИТРУ" sublabel="начать игру" color="#1a7a1a" onClick={() => {}} />
                <ActionButton label="← УЙТИ С ЗАПРАВКИ" sublabel="покинуть комнату" color="#4a3010" onClick={() => setView('home')} />
              </div>
            </div>
          </div>
          <SignPole />
        </div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <Ground />
      <StarField />
      <div style={sceneWrap}>
        {/* Gas station canopy */}
        <StationCanopy title="AMONG GAS" subtitle="АЗС «СРЕДИ НАС» / ЗАПРАВЬ СОСЕДА" />

        {/* Price board */}
        <div style={signBoard}>
          <div style={signHeader}>
            <span style={signHeaderText}>ТОПЛИВО / ДЕЙСТВИЕ</span>
            <span style={signHeaderText}>КОЛ-ВО</span>
          </div>

          {/* Row 1: Create Room */}
          <PriceRow
            grade="95"
            gradeColor="#c81818"
            actionText="Занять заправку"
            priceDisplay={<LedPrice value="→ СТАРТ" />}
            onClick={() => setView('room')}
          />

          {/* Row 2: Play Solo — rendered as div (not button) to avoid nested-button */}
          <div style={{ borderTop: '2px solid #1a1800', background: '#0e0e08' }}>
            <div style={{
              display: 'flex', alignItems: 'center', width: '100%',
              background: '#111108', border: '3px solid #0a0a08', borderBottom: 'none',
              padding: '10px 10px', gap: 10,
            }}>
              <GradeBadge grade="92" color="#c88018" />
              <div style={{ width: 2, alignSelf: 'stretch', background: '#2a2000', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 13,
                  color: '#f0e8c8', textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: 1.2,
                }}>Один в поле бот</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 90, justifyContent: 'flex-end', paddingRight: 6 }}>
                <button style={microBtn} onClick={() => setBotCount(c => Math.max(1, c - 1))}>−</button>
                <LedPrice value={String(botCount).padStart(2,'0')} />
                <button style={microBtn} onClick={() => setBotCount(c => Math.min(14, c + 1))}>+</button>
              </div>
            </div>
            <div style={{ padding: '6px 12px 10px' }}>
              <ActionButton label="ТРЕНИРОВКА С БОТАМИ" sublabel="результаты не зачитываются" color="#2a5a18" onClick={() => {}} />
            </div>
          </div>

          {/* Row 3: Join by code */}
          <div style={{ borderTop: '2px solid #1a1800', background: '#0e0e08' }}>
            <PriceRow
              grade="ДТ"
              gradeColor="#184a7a"
              actionText="Войти по коду"
              priceDisplay={<LedPrice value="[КОД]" dim />}
            />
            <div style={{ padding: '6px 12px 10px', display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="______"
                maxLength={6}
                style={codeInput}
              />
              <button
                style={{ ...joinBtn, opacity: code.length < 6 ? 0.4 : 1 }}
                disabled={code.length < 6}
                onClick={() => setView('room')}
              >
                ВЪЕЗД
              </button>
            </div>
          </div>

          {/* Row 4: Unavailable (joke) */}
          <PriceRow
            grade="98"
            gradeColor="#3a2a5a"
            actionText="Евро-5 бензин"
            priceDisplay={<LedPrice value="НЕТ" dim />}
            dim
          />

          {/* Bottom of sign */}
          <div style={{ borderTop: '3px solid #0a0a08', background: '#0a0a08', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: '#2a2000' }}>ЛИЦЕНЗИЯ №ГАЗ-2024-∞</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: '#3a2800' }}>◉ РАБОТАЕМ 24/7 (ПОЧТИ)</span>
          </div>
        </div>

        {/* Ground-level gas pumps */}
        <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', paddingBottom: 8 }}>
          <GasPump color="#c81818" label="АИ-95" />
          <GasPump color="#c88018" label="АИ-92" />
          <GasPump color="#184a7a" label="ДТ" />
        </div>

        <SignPole />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StationCanopy({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{
      width: '100%',
      background: 'linear-gradient(to bottom, #1a5a1a, #0e3a0e)',
      border: '3px solid #0a0a08',
      borderBottom: 'none',
      padding: '10px 16px 8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Canopy lights */}
      {[60, 155, 255].map(x => (
        <div key={x} style={{
          position: 'absolute',
          top: 6,
          left: x,
          width: 14,
          height: 8,
          background: '#f5e030',
          borderRadius: 4,
          boxShadow: '0 0 10px rgba(245,224,48,0.8)',
          border: '2px solid #0a0a08',
        }} />
      ))}
      <h1 style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 32,
        color: '#f5e030',
        textShadow: `-2px -2px 0 #0a0a08, 2px -2px 0 #0a0a08, -2px 2px 0 #0a0a08, 2px 2px 0 #0a0a08, 0 0 20px rgba(245,224,48,0.5)`,
        letterSpacing: '0.06em',
        margin: '6px 0 2px',
      }}>{title}</h1>
      <p style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 9,
        color: 'rgba(245,224,48,0.55)',
        letterSpacing: '0.15em',
        margin: 0,
      }}>{subtitle}</p>
    </div>
  );
}

function GasPump({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      width: 52,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
    }}>
      {/* Pump body */}
      <div style={{
        width: 40,
        height: 56,
        background: color,
        border: '3px solid #0a0a08',
        borderRadius: '8px 8px 4px 4px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 3px 4px',
        boxShadow: '2px 3px 0 #0a0a08',
      }}>
        {/* Small screen */}
        <div style={{
          width: 28, height: 14,
          background: '#0a0a08',
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 6, color: '#ff9c00' }}>НЕТ</span>
        </div>
        {/* Nozzle hook */}
        <div style={{
          width: 14, height: 8,
          background: '#2a2a18',
          border: '2px solid #0a0a08',
          borderRadius: '2px 8px 8px 2px',
          alignSelf: 'flex-end',
          marginRight: -8,
        }} />
        {/* Label */}
        <div style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: 9,
          color: '#fff',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}>{label}</div>
      </div>
      {/* Base */}
      <div style={{
        width: 48, height: 8,
        background: '#2a2a18',
        border: '2px solid #0a0a08',
        borderTop: 'none',
        borderRadius: '0 0 4px 4px',
      }} />
    </div>
  );
}

function SignPole() {
  return null; // ground handles this
}

function Ground() {
  return (
    <>
      {/* Asphalt stripe */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 90,
        background: '#0e0e0a',
        borderTop: '3px solid #1a1a10',
      }}>
        {/* Lane markings */}
        <div style={{
          position: 'absolute', top: 36, left: 0, right: 0, height: 4,
          background: 'repeating-linear-gradient(90deg, #2a2800 0px, #2a2800 24px, transparent 24px, transparent 48px)',
        }} />
      </div>
    </>
  );
}

function StarField() {
  const stars = [
    {x:15,y:8},{x:40,y:15},{x:70,y:6},{x:95,y:18},{x:130,y:5},{x:160,y:12},
    {x:200,y:7},{x:240,y:15},{x:290,y:4},{x:330,y:10},{x:360,y:18},{x:375,y:6},
  ];
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 90, overflow: 'hidden' }}>
      {stars.map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: s.x,
          top: s.y + '%',
          width: i % 3 === 0 ? 3 : 2,
          height: i % 3 === 0 ? 3 : 2,
          background: '#f0f0e0',
          borderRadius: '50%',
          opacity: 0.6 + (i % 4) * 0.1,
        }} />
      ))}
    </div>
  );
}

function ActionButton({ label, sublabel, color, onClick }: { label: string; sublabel?: string; color: string; onClick?: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        width: '100%',
        background: color,
        border: '3px solid #0a0a08',
        borderRadius: 10,
        padding: '9px 14px',
        boxShadow: pressed ? 'none' : '0 4px 0 #0a0a08',
        transform: pressed ? 'translateY(4px)' : 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transition: 'transform 0.06s, box-shadow 0.06s',
      }}
    >
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 800,
        fontSize: 14,
        color: '#fff',
        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase' as const,
      }}>{label}</span>
      {sublabel && <span style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 9,
        color: 'rgba(255,255,255,0.55)',
        marginTop: 2,
      }}>{sublabel}</span>}
    </button>
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
  background: 'linear-gradient(to bottom, #04080e 0%, #0a1020 50%, #10180a 100%)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 24,
  fontFamily: "'Montserrat', sans-serif",
};

const sceneWrap: React.CSSProperties = {
  width: 'calc(100% - 24px)',
  maxWidth: 340,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0,
  zIndex: 2,
};

const signBoard: React.CSSProperties = {
  width: '100%',
  background: '#111108',
  border: '3px solid #0a0a08',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '4px 6px 20px rgba(0,0,0,0.8)',
};

const signHeader: React.CSSProperties = {
  background: '#0a0a08',
  padding: '6px 12px',
  display: 'flex',
  justifyContent: 'space-between',
  borderBottom: '2px solid #1a1800',
};

const signHeaderText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: '#3a3000',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const ledLabel: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: 'rgba(255,156,0,0.4)',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
};

const playerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
};

const playerDot: React.CSSProperties = {
  width: 8, height: 8,
  borderRadius: '50%',
  background: '#7aaa64',
  border: '2px solid #0a0a08',
  boxShadow: '0 0 6px rgba(122,170,100,0.7)',
  flexShrink: 0,
};

const playerName: React.CSSProperties = {
  flex: 1,
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 600,
  fontSize: 13,
  color: '#f0e8c8',
};

const hostTag: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#ff9c00',
  background: 'rgba(255,156,0,0.15)',
  border: '1px solid rgba(255,156,0,0.3)',
  padding: '1px 5px',
  borderRadius: 3,
};

const microBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  background: '#2a2000',
  border: '2px solid #0a0a08',
  borderRadius: 4,
  color: '#ff9c00',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  flexShrink: 0,
};

const codeInput: React.CSSProperties = {
  flex: 1,
  background: '#0a0a08',
  border: '3px solid #2a2000',
  borderRadius: 8,
  padding: '8px 10px',
  color: '#ff9c00',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 18,
  letterSpacing: '0.2em',
  textAlign: 'center',
  outline: 'none',
};

const joinBtn: React.CSSProperties = {
  background: '#1a6a1a',
  border: '3px solid #0a0a08',
  borderRadius: 8,
  boxShadow: '0 4px 0 #0a0a08',
  color: '#fff',
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 800,
  fontSize: 12,
  padding: '0 14px',
  cursor: 'pointer',
  letterSpacing: '0.06em',
};
