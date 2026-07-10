/**
 * ПОДЪЕЗД — Soviet Apartment Stairwell Intercom Panel
 *
 * Visual concept: The UI is an old Soviet apartment building intercom/
 * directory panel mounted on a chipped institutional-green wall. Buttons
 * look like metal intercom keys. The room code is a door-entry code on a
 * tarnished metal display. Player list is an apartment directory.
 * The whole thing has patina, scratches, and dim fluorescent lighting.
 */
import React, { useState, useEffect } from 'react';

// ── Fluorescent flicker hook ──────────────────────────────────────────────────

function useFlicker() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    function flick() {
      setOn(false);
      setTimeout(() => setOn(true), 60 + Math.random() * 80);
      t = setTimeout(flick, 4000 + Math.random() * 8000);
    }
    t = setTimeout(flick, 2000 + Math.random() * 3000);
    return () => clearTimeout(t);
  }, []);
  return on;
}

// ── Metal intercom key button ─────────────────────────────────────────────────

interface IntercomKeyProps {
  label: string;
  sublabel?: string;
  color?: 'default' | 'action' | 'danger';
  wide?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function IntercomKey({ label, sublabel, color = 'default', wide, onClick, disabled }: IntercomKeyProps) {
  const [pressed, setPressed] = useState(false);

  const bg = {
    default: 'linear-gradient(180deg, #9a9a88 0%, #7a7a68 60%, #5a5a4a 100%)',
    action:  'linear-gradient(180deg, #7a9a7a 0%, #4a7a4a 60%, #2a5a2a 100%)',
    danger:  'linear-gradient(180deg, #9a6a5a 0%, #7a3a2a 60%, #5a1a0a 100%)',
  }[color];

  const shadowColor = {
    default: '#2a2a1a',
    action:  '#1a3a1a',
    danger:  '#3a0a0a',
  }[color];

  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: wide ? '100%' : '100%',
        padding: '10px 16px',
        border: '2px solid #1a1a0a',
        borderRadius: 4,
        background: disabled ? 'linear-gradient(180deg, #6a6a58 0%, #4a4a38 100%)' : bg,
        boxShadow: pressed
          ? 'inset 0 2px 4px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.1)'
          : `0 4px 0 ${shadowColor}, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.3)`,
        transform: pressed ? 'translateY(3px)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'transform 0.06s ease, box-shadow 0.06s ease',
        minHeight: 52,
        gap: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Metal sheen */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, height: '40%',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.12), transparent)',
        pointerEvents: 'none',
      }} />
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 800,
        fontSize: 13,
        color: '#f0ece0',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        position: 'relative',
        zIndex: 1,
      }}>{label}</span>
      {sublabel && (
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: 'rgba(240,236,224,0.6)',
          letterSpacing: '0.06em',
          position: 'relative',
          zIndex: 1,
          textAlign: 'center' as const,
        }}>{sublabel}</span>
      )}
    </button>
  );
}

// ── Apartment directory row ───────────────────────────────────────────────────

function AptRow({ number, name, role, vacant }: { number: string; name: string; role?: string; vacant?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 8px',
      borderBottom: '1px solid rgba(0,0,0,0.2)',
      opacity: vacant ? 0.35 : 1,
    }}>
      {/* Apartment button indicator */}
      <div style={{
        width: 8, height: 8,
        borderRadius: '50%',
        background: vacant ? '#3a4a3a' : '#7aaa7a',
        border: '1px solid #1a2a1a',
        boxShadow: vacant ? 'none' : '0 0 6px rgba(122,170,122,0.8)',
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 9,
        color: '#7a8a7a',
        minWidth: 24,
      }}>{number}</span>
      <span style={{
        flex: 1,
        fontFamily: "'Space Mono', monospace",
        fontWeight: 700,
        fontSize: 11,
        color: vacant ? '#5a6a5a' : '#d0dcc8',
        letterSpacing: '0.04em',
        fontStyle: vacant ? 'italic' : 'normal',
      }}>{name}</span>
      {role && (
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 8,
          color: '#9aaa7a',
          background: 'rgba(0,0,0,0.3)',
          padding: '1px 5px',
          borderRadius: 2,
          border: '1px solid rgba(154,170,122,0.3)',
        }}>{role}</span>
      )}
    </div>
  );
}

// ── LED display ───────────────────────────────────────────────────────────────

function LedDisplay({ text, label }: { text: string; label: string }) {
  return (
    <div style={{
      background: '#0a1208',
      border: '2px solid #1a1a0a',
      borderRadius: 4,
      padding: '8px 12px',
      boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8)',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 8,
        color: 'rgba(122,170,100,0.5)',
        letterSpacing: '0.2em',
        marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: "'Space Mono', monospace",
        fontWeight: 700,
        fontSize: 28,
        color: '#7aaa64',
        letterSpacing: '0.22em',
        textShadow: '0 0 12px rgba(122,170,100,0.7), 0 0 24px rgba(122,170,100,0.3)',
      }}>{text}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Warm() {
  const [botCount, setBotCount] = useState(4);
  const [code, setCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');
  const flickerOn = useFlicker();

  const mockPlayers = [
    { n: '12', name: 'Кузнецов А.', role: 'ОРГАН.' },
    { n: '07', name: 'Петрова С.', role: null },
  ];

  return (
    <div style={rootStyle}>
      {/* Chipped wall texture */}
      <div style={wallTexture} />

      {/* Fluorescent light bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: '20%', right: '20%', height: 6,
        background: flickerOn
          ? 'linear-gradient(to right, rgba(200,220,180,0.0), rgba(200,220,180,0.7), rgba(200,220,180,0.0))'
          : 'transparent',
        boxShadow: flickerOn ? '0 0 30px 10px rgba(200,220,180,0.25)' : 'none',
        transition: 'none',
      }} />

      {/* Light beam from above */}
      <div style={{
        position: 'absolute',
        top: 0, left: '30%', right: '30%', height: '50%',
        background: 'linear-gradient(to bottom, rgba(180,200,160,0.06), transparent)',
        pointerEvents: 'none',
      }} />

      {/* Intercom faceplate */}
      <div style={faceplate}>
        {/* Top label strip */}
        <div style={labelStrip}>
          <div style={stripScratch} />
          <span style={buildingLabel}>ЖЭК ФРУНЗЕНСКОГО Р-НА</span>
          <span style={buildingLabel2}>ПОДЪЕЗД №3 / ДОМОФОН</span>
        </div>

        {view === 'room' ? (
          <>
            {/* In-room view */}
            <LedDisplay text="XYZ789" label="КОД ДОСТУПА" />

            <div style={sectionStrip}>
              <span style={sectionLabel}>ЖИТЕЛИ В СЕТИ</span>
            </div>

            <div style={directoryPanel}>
              {mockPlayers.map(p => (
                <AptRow key={p.n} number={p.n} name={p.name} role={p.role ?? undefined} />
              ))}
              <AptRow number="—" name="ожидается…" vacant />
            </div>

            <div style={buttonGrid}>
              <IntercomKey
                label="НАЧАТЬ ИГРУ"
                sublabel="Открыть дверь для всех"
                color="action"
                onClick={() => {}}
              />
              <IntercomKey
                label="ПОКИНУТЬ"
                sublabel="Выйти из подъезда"
                color="danger"
                onClick={() => setView('home')}
              />
            </div>
          </>
        ) : (
          <>
            {/* Home view */}
            <div style={buttonGrid}>
              <IntercomKey
                label="ЗАНЯТЬ ДВОР"
                sublabel="Создать комнату"
                color="action"
                onClick={() => setView('room')}
              />
              <IntercomKey
                label="ВОЙТИ ПО КОДУ"
                sublabel="Ввести код"
                color="default"
              />
            </div>

            {/* Bot section */}
            <div style={sectionStrip}>
              <span style={sectionLabel}>РЕЖИМ ТРЕНИРОВКИ</span>
            </div>

            <div style={soloPanel}>
              {/* LED stepper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button style={metalStep} onClick={() => setBotCount(c => Math.max(1, c - 1))}>−</button>
                <div style={ledSmall}>
                  <span style={ledSmallText}>{String(botCount).padStart(2, '0')}</span>
                  <span style={ledSmallLabel}>БОТОВ</span>
                </div>
                <button style={metalStep} onClick={() => setBotCount(c => Math.min(14, c + 1))}>+</button>
              </div>
              <IntercomKey
                label="ТРЕНИРОВАТЬСЯ"
                sublabel="Боты — не настоящие соседи"
                color="action"
              />
            </div>

            {/* Code entry panel */}
            <div style={sectionStrip}>
              <span style={sectionLabel}>НАБРАТЬ КОД</span>
            </div>

            <div style={codePanel}>
              {/* LED code display */}
              <div style={codeDisplay}>
                <span style={codeDisplayText}>
                  {code.padEnd(6, '_')}
                </span>
              </div>

              {/* Keypad */}
              <div style={keypad}>
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => (
                  <button
                    key={k}
                    style={keypadKey}
                    onClick={() => {
                      if (k === '*') setCode('');
                      else if (k !== '#' && code.length < 6) setCode(c => c + k);
                      else if (k === '#' && code.length === 6) setView('room');
                    }}
                  >
                    <span style={keypadKeyText}>{k}</span>
                  </button>
                ))}
              </div>

              <p style={keypadHint}># для подтверждения · * для сброса</p>
            </div>
          </>
        )}

        {/* Bottom serial strip */}
        <div style={serialStrip}>
          <span style={serialText}>VIZIT SN-3 · ЗАВ. №447</span>
          <span style={serialText}>© ЗАВОД ЭЛЕКТРОНИКА 1988</span>
        </div>
      </div>

      {/* Shadows below the panel — wall depth */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)',
        pointerEvents: 'none',
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
  background: '#2a3828',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: "'Space Mono', monospace",
};

const wallTexture: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage: `
    repeating-linear-gradient(45deg, transparent 0px, transparent 8px, rgba(0,0,0,0.03) 8px, rgba(0,0,0,0.03) 9px),
    repeating-linear-gradient(-45deg, transparent 0px, transparent 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 9px)
  `,
  pointerEvents: 'none',
};

const faceplate: React.CSSProperties = {
  width: 'calc(100% - 48px)',
  maxWidth: 290,
  background: 'linear-gradient(175deg, #5a6050 0%, #4a5040 40%, #3a4030 100%)',
  border: '3px solid #1a1a0a',
  borderRadius: 6,
  padding: '0 0 8px',
  boxShadow: `
    0 0 0 1px rgba(255,255,255,0.06),
    4px 8px 24px rgba(0,0,0,0.7),
    inset 0 1px 0 rgba(255,255,255,0.1),
    inset 0 -1px 0 rgba(0,0,0,0.3)
  `,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 2,
  overflow: 'hidden',
  position: 'relative',
};

const labelStrip: React.CSSProperties = {
  background: 'linear-gradient(to bottom, #3a4030, #2a3020)',
  padding: '8px 12px 6px',
  borderBottom: '2px solid #1a1a0a',
  position: 'relative',
};

const stripScratch: React.CSSProperties = {
  position: 'absolute',
  top: 6, left: '30%', width: '20%', height: 1,
  background: 'rgba(255,255,255,0.06)',
};

const buildingLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 8,
  color: '#9aaa8a',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

const buildingLabel2: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#6a7a5a',
  letterSpacing: '0.08em',
  marginTop: 2,
};

const sectionStrip: React.CSSProperties = {
  background: 'rgba(0,0,0,0.25)',
  borderTop: '1px solid rgba(0,0,0,0.3)',
  borderBottom: '1px solid rgba(0,0,0,0.3)',
  padding: '4px 12px',
};

const sectionLabel: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: 'rgba(154,170,138,0.6)',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
};

const buttonGrid: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '0 12px',
};

const directoryPanel: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,0,0,0.4)',
  margin: '0 12px',
  borderRadius: 3,
  overflow: 'hidden',
};

const soloPanel: React.CSSProperties = {
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const codePanel: React.CSSProperties = {
  padding: '8px 12px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const codeDisplay: React.CSSProperties = {
  background: '#060e04',
  border: '2px solid #1a1a0a',
  borderRadius: 3,
  padding: '6px 10px',
  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9)',
  textAlign: 'center',
};

const codeDisplayText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 22,
  color: '#7aaa64',
  letterSpacing: '0.28em',
  textShadow: '0 0 10px rgba(122,170,100,0.6)',
};

const keypad: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
};

const keypadKey: React.CSSProperties = {
  background: 'linear-gradient(180deg, #7a8070 0%, #5a6050 60%, #3a4030 100%)',
  border: '2px solid #1a1a0a',
  borderRadius: 4,
  height: 36,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 3px 0 #1a1a0a, inset 0 1px 0 rgba(255,255,255,0.12)',
  position: 'relative',
  overflow: 'hidden',
};

const keypadKeyText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 14,
  color: '#d0dcc8',
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
};

const keypadHint: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: 'rgba(154,170,138,0.45)',
  textAlign: 'center',
  margin: 0,
  letterSpacing: '0.04em',
};

const metalStep: React.CSSProperties = {
  width: 32,
  height: 32,
  background: 'linear-gradient(180deg, #8a9080 0%, #5a6050 100%)',
  border: '2px solid #1a1a0a',
  borderRadius: 4,
  color: '#d0dcc8',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 0 #1a1a0a, inset 0 1px 0 rgba(255,255,255,0.1)',
  lineHeight: 1,
  fontFamily: "'Space Mono', monospace",
};

const ledSmall: React.CSSProperties = {
  flex: 1,
  background: '#060e04',
  border: '2px solid #1a1a0a',
  borderRadius: 3,
  padding: '4px 8px',
  textAlign: 'center',
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
};

const ledSmallText: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 20,
  color: '#7aaa64',
  letterSpacing: '0.1em',
  textShadow: '0 0 8px rgba(122,170,100,0.6)',
};

const ledSmallLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: 'rgba(122,170,100,0.4)',
  letterSpacing: '0.15em',
};

const serialStrip: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 12px',
  borderTop: '1px solid rgba(0,0,0,0.3)',
};

const serialText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 6,
  color: 'rgba(154,170,138,0.35)',
  letterSpacing: '0.06em',
};
