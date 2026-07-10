/**
 * СОСЕД — Soviet Nosy Neighbor Clipboard
 *
 * Visual concept: You've been handed an official-looking clipboard by the
 * overly-serious neighbor. Aged yellowed paper, red rubber stamps, typewriter
 * labels, Soviet-era form aesthetics. Satirical propaganda parody of "yard
 * surveillance." Every button is a form row to fill out.
 */
import React, { useState } from 'react';

// ── Rubber stamp SVG ─────────────────────────────────────────────────────────

const StampWatermark = () => (
  <svg
    width="160" height="160"
    viewBox="0 0 160 160"
    style={{ position: 'absolute', right: -20, top: 40, opacity: 0.06, pointerEvents: 'none', transform: 'rotate(-25deg)' }}
  >
    <circle cx="80" cy="80" r="74" stroke="#b01c1c" strokeWidth="5" fill="none"/>
    <circle cx="80" cy="80" r="60" stroke="#b01c1c" strokeWidth="2" fill="none"/>
    <text x="80" y="72" textAnchor="middle" fontFamily="'Montserrat', sans-serif" fontWeight="900" fontSize="13" fill="#b01c1c" letterSpacing="3">ОДОБРЕНО</text>
    <text x="80" y="92" textAnchor="middle" fontFamily="'Montserrat', sans-serif" fontWeight="700" fontSize="9" fill="#b01c1c" letterSpacing="2">ДВОРОВОЙ</text>
    <text x="80" y="104" textAnchor="middle" fontFamily="'Montserrat', sans-serif" fontWeight="700" fontSize="9" fill="#b01c1c" letterSpacing="2">КОМИТЕТ</text>
  </svg>
);

// ── Soviet star SVG ──────────────────────────────────────────────────────────

const SovietStar = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <polygon
      points="8,1 9.8,6.2 15.5,6.2 10.8,9.5 12.6,14.7 8,11.4 3.4,14.7 5.2,9.5 0.5,6.2 6.2,6.2"
      fill="#b01c1c"
    />
  </svg>
);

// ── Form row button ───────────────────────────────────────────────────────────

interface FormRowProps {
  number: string;
  label: string;
  sublabel?: string;
  checked?: boolean;
  accent?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function FormRow({ number, label, sublabel, checked, accent, onClick, disabled }: FormRowProps) {
  const [active, setActive] = useState(false);

  return (
    <button
      onPointerDown={() => setActive(true)}
      onPointerUp={() => { setActive(false); onClick?.(); }}
      onPointerLeave={() => setActive(false)}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        border: `2px solid ${accent ? '#b01c1c' : '#2a1a0a'}`,
        borderRadius: 0,
        borderBottom: `2px solid ${accent ? '#b01c1c' : '#2a1a0a'}`,
        background: active ? (accent ? 'rgba(176,28,28,0.08)' : 'rgba(42,26,10,0.06)') : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        padding: '10px 12px',
        textAlign: 'left' as const,
        transition: 'background 0.08s ease',
        gap: 12,
      }}
    >
      {/* Row number */}
      <span style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 11,
        color: '#8a7060',
        minWidth: 22,
      }}>{number}.</span>

      {/* Big checkbox */}
      <div style={{
        width: 22,
        height: 22,
        border: `2px solid ${accent ? '#b01c1c' : '#4a3020'}`,
        background: checked ? '#b01c1c' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderRadius: 2,
      }}>
        {checked && <span style={{ color: '#fff', fontSize: 14, lineHeight: 1, fontWeight: 900 }}>✓</span>}
      </div>

      {/* Label */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          color: accent ? '#b01c1c' : '#2a1a0a',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.04em',
        }}>{label}</div>
        {sublabel && (
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            color: '#8a7060',
            marginTop: 1,
          }}>{sublabel}</div>
        )}
      </div>

      {/* Arrow */}
      <span style={{
        fontFamily: "'Space Mono', monospace",
        fontSize: 12,
        color: accent ? '#b01c1c' : '#8a7060',
      }}>›</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Neon() {
  const [botCount, setBotCount] = useState(4);
  const [code, setCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');

  const mockPlayers = ['Михаил К.', 'Светлана Д.'];

  if (view === 'room') {
    return (
      <div style={rootStyle}>
        <div style={clipboardWrap}>
          <ClipboardHeader title="ДВОРОВОЙ ПРОТОКОЛ №2" subtitle="Журнал участников" />
          <div style={clipboardBody}>
            <StampWatermark />

            {/* Room code */}
            <div style={fieldGroup}>
              <label style={fieldLabel}>КОД ЯВКИ <SovietStar size={10} /></label>
              <div style={stampBox}>
                <span style={stampCodeText}>XYZ789</span>
              </div>
              <p style={fieldHint}>Сообщить лично. Не по телефону.</p>
            </div>

            <div style={fieldGroupDivider} />

            {/* Player list */}
            <div style={fieldGroup}>
              <label style={fieldLabel}>СПИСОК ЯВИВШИХСЯ ({mockPlayers.length} / 15)</label>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {mockPlayers.map((name, i) => (
                  <div key={name} style={tableRow}>
                    <span style={tableNum}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={tableName}>{name}</span>
                    {i === 0 && <span style={tableRole}>ОРГАН.</span>}
                  </div>
                ))}
                <div style={{ ...tableRow, opacity: 0.3 }}>
                  <span style={tableNum}>03</span>
                  <span style={{ ...tableName, fontStyle: 'italic' }}>____________</span>
                  <span style={tableRole}>_____</span>
                </div>
              </div>
            </div>

            <div style={fieldGroupDivider} />

            <FormRow
              number="А"
              label="НАЧАТЬ ИГРУ"
              sublabel="Минимум 2 участника обязательно"
              accent
              onClick={() => {}}
            />
            <button onClick={() => setView('home')} style={backBtn}>
              ← Отозвать заявку
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <div style={clipboardWrap}>
        <ClipboardHeader title="ДВОРОВОЙ ПРОТОКОЛ" subtitle="Надзорный комитет — р-н №7" />

        <div style={clipboardBody}>
          <StampWatermark />

          {/* Form header */}
          <div style={formHeader}>
            <SovietStar size={12} />
            <span style={formHeaderText}>ЗАЯВЛЕНИЕ НА УЧАСТИЕ</span>
            <SovietStar size={12} />
          </div>

          {/* Main action rows */}
          <div style={{ border: '2px solid #2a1a0a', marginBottom: 12 }}>
            <FormRow
              number="01"
              label="Занять двор"
              sublabel="Создать комнату — стать организатором"
              accent
              onClick={() => setView('room')}
            />
            <FormRow
              number="02"
              label="Войти по коду"
              sublabel="Код вам должны были передать"
            />
          </div>

          <div style={fieldGroupDivider} />

          {/* Solo box */}
          <div style={soloSection}>
            <div style={soloHeader}>
              <span style={soloHeaderText}>☐ ТРЕНИРОВКА С БОТАМИ</span>
              <span style={{ ...fieldHint, margin: 0 }}>Самостоятельная подготовка</span>
            </div>

            {/* Bot stepper — styled as a form field */}
            <div style={formField}>
              <span style={fieldLabel}>КОЛ-ВО БОТОВ</span>
              <div style={stepperRow}>
                <button style={stepBtn} onClick={() => setBotCount(c => Math.max(1, c - 1))}>−</button>
                <div style={stepDisplay}>
                  <span style={stepVal}>{botCount}</span>
                </div>
                <button style={stepBtn} onClick={() => setBotCount(c => Math.min(14, c + 1))}>+</button>
              </div>
            </div>

            <FormRow
              number="03"
              label="НАЧАТЬ ТРЕНИРОВКУ"
              sublabel="Результаты не считаются"
              accent
            />
          </div>

          <div style={fieldGroupDivider} />

          {/* Code input */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>ВВЕСТИ КОД ЯВКИ</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="______"
                maxLength={6}
                style={codeInput}
              />
              <button
                disabled={code.length < 6}
                style={{ ...submitBtn, opacity: code.length < 6 ? 0.4 : 1 }}
                onClick={() => setView('room')}
              >
                ПОДАТЬ
              </button>
            </div>
            <p style={fieldHint}>* Код выдаётся организатором лично в руки</p>
          </div>

          {/* Footer stamp line */}
          <div style={footerLine}>
            <span style={footerText}>Форма ДК-7 / Ред. 1991 г.</span>
            <SovietStar size={10} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Clipboard header sub-component ───────────────────────────────────────────

function ClipboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={clipHeader}>
      {/* Clip mechanism */}
      <div style={clip}>
        <div style={clipArm} />
        <div style={clipBody} />
      </div>
      <div style={clipHeaderInner}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
          <SovietStar size={14} />
          <SovietStar size={14} />
          <SovietStar size={14} />
        </div>
        <h1 style={clipTitle}>{title}</h1>
        <p style={clipSubtitle}>{subtitle}</p>
      </div>
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
  background: '#8a7a6a',
  backgroundImage: `
    repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(0,0,0,0.04) 28px, rgba(0,0,0,0.04) 29px),
    repeating-linear-gradient(90deg, transparent, transparent 28px, rgba(0,0,0,0.04) 28px, rgba(0,0,0,0.04) 29px)
  `,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 20,
  fontFamily: "'Outfit', sans-serif",
};

const clipboardWrap: React.CSSProperties = {
  width: 'calc(100% - 28px)',
  maxWidth: 340,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '3px 6px 24px rgba(0,0,0,0.45), 1px 2px 6px rgba(0,0,0,0.3)',
  borderRadius: 4,
  overflow: 'hidden',
};

const clipHeader: React.CSSProperties = {
  background: '#c8311a',
  position: 'relative',
  padding: '12px 16px 14px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  borderBottom: '4px solid #8a1a08',
};

const clip: React.CSSProperties = {
  position: 'absolute',
  top: -8,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  zIndex: 5,
};

const clipArm: React.CSSProperties = {
  width: 60,
  height: 10,
  background: '#606870',
  border: '2px solid #303840',
  borderRadius: 3,
};

const clipBody: React.CSSProperties = {
  width: 44,
  height: 16,
  background: '#808890',
  border: '2px solid #404850',
  borderRadius: '0 0 4px 4px',
  borderTop: 'none',
};

const clipHeaderInner: React.CSSProperties = {
  marginTop: 10,
  textAlign: 'center',
};

const clipTitle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 16,
  color: '#fff9f0',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  margin: '4px 0 2px',
  textShadow: '0 1px 3px rgba(0,0,0,0.4)',
};

const clipSubtitle: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: 'rgba(255,249,240,0.65)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  margin: 0,
};

const clipboardBody: React.CSSProperties = {
  background: '#f0e8d0',
  backgroundImage: 'repeating-linear-gradient(transparent, transparent 24px, rgba(176,28,28,0.06) 24px, rgba(176,28,28,0.06) 25px)',
  padding: '14px 14px 16px',
  position: 'relative',
  overflow: 'hidden',
};

const formHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  marginBottom: 10,
};

const formHeaderText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: '#8a2010',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
};

const fieldGroup: React.CSSProperties = {
  marginBottom: 10,
};

const fieldGroupDivider: React.CSSProperties = {
  height: 1,
  background: 'rgba(42,26,10,0.18)',
  margin: '10px 0',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  fontWeight: 700,
  color: '#5a3a1a',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  marginBottom: 5,
};

const fieldHint: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#8a7060',
  margin: '4px 0 0',
  fontStyle: 'italic',
};

const stampBox: React.CSSProperties = {
  border: '2px solid #b01c1c',
  borderRadius: 4,
  padding: '8px 14px',
  display: 'inline-block',
  background: 'rgba(176,28,28,0.04)',
};

const stampCodeText: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 32,
  color: '#b01c1c',
  letterSpacing: '0.2em',
};

const tableRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  borderBottom: '1px solid rgba(42,26,10,0.12)',
  padding: '5px 0',
  gap: 10,
};

const tableNum: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 10,
  color: '#8a7060',
  minWidth: 22,
};

const tableName: React.CSSProperties = {
  flex: 1,
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 600,
  fontSize: 12,
  color: '#2a1a0a',
};

const tableRole: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: '#b01c1c',
  fontWeight: 700,
};

const soloSection: React.CSSProperties = {
  border: '1px dashed rgba(42,26,10,0.25)',
  padding: '10px',
  marginBottom: 0,
};

const soloHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const soloHeaderText: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 700,
  fontSize: 11,
  color: '#2a1a0a',
  letterSpacing: '0.04em',
};

const formField: React.CSSProperties = {
  marginBottom: 8,
};

const stepperRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 4,
};

const stepBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '2px solid #2a1a0a',
  borderRadius: 2,
  background: 'transparent',
  color: '#2a1a0a',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: "'Space Mono', monospace",
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

const stepDisplay: React.CSSProperties = {
  border: '2px solid #2a1a0a',
  borderRadius: 2,
  padding: '2px 12px',
  background: 'rgba(255,255,255,0.5)',
  minWidth: 44,
  textAlign: 'center',
};

const stepVal: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 16,
  color: '#2a1a0a',
};

const codeInput: React.CSSProperties = {
  flex: 1,
  border: '2px solid #2a1a0a',
  borderRadius: 2,
  background: 'rgba(255,255,255,0.5)',
  padding: '8px 10px',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 18,
  color: '#2a1a0a',
  letterSpacing: '0.2em',
  textAlign: 'center',
  outline: 'none',
};

const submitBtn: React.CSSProperties = {
  background: '#b01c1c',
  border: '2px solid #2a1a0a',
  borderRadius: 2,
  color: '#fff',
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 800,
  fontSize: 11,
  padding: '0 14px',
  cursor: 'pointer',
  letterSpacing: '0.08em',
};

const backBtn: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: '1px dashed rgba(42,26,10,0.3)',
  borderRadius: 2,
  color: '#5a3a1a',
  fontFamily: "'Space Mono', monospace",
  fontSize: 10,
  padding: '8px',
  cursor: 'pointer',
  marginTop: 10,
};

const footerLine: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 12,
  paddingTop: 8,
  borderTop: '1px solid rgba(42,26,10,0.15)',
};

const footerText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#8a7060',
};
