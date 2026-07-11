/**
 * ТАЛОН НА ТОПЛИВО — Soviet Fuel Ration Coupon
 *
 * The lobby is a Soviet-era fuel ration coupon.
 * Cream/white paper, red stamps, perforated tearoff edges,
 * numbered sections, bureaucratic form aesthetic.
 * Among Us chunky cartoon style on top.
 */
import React, { useState } from 'react';

// ── Perforated edge component ─────────────────────────────────────────────────

function PerforatedEdge({ vertical }: { vertical?: boolean }) {
  const count = vertical ? 18 : 22;
  return (
    <div style={{
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: vertical ? '4px 0' : '0 4px',
      ...(vertical
        ? { width: 16, alignSelf: 'stretch' }
        : { height: 16, width: '100%' }
      ),
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: vertical ? 8 : 6,
          height: vertical ? 6 : 8,
          borderRadius: '50%',
          background: '#e0d8c0',
          border: '1.5px solid #c8c0a0',
          flexShrink: 0,
        }} />
      ))}
    </div>
  );
}

// ── Coupon section ────────────────────────────────────────────────────────────

interface CouponSectionProps {
  letter: string;
  series: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: string;
}

function CouponSection({ letter, series, title, subtitle, children, accent = '#1a3a7a' }: CouponSectionProps) {
  return (
    <div style={{
      background: '#f8f4e4',
      display: 'flex',
      gap: 0,
    }}>
      {/* Left margin tab */}
      <div style={{
        width: 36,
        background: accent,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 4px',
        flexShrink: 0,
        gap: 4,
      }}>
        <span style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 900,
          fontSize: 20,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }}>{letter}</span>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 7,
          color: 'rgba(255,255,255,0.6)',
          writingMode: 'vertical-rl' as const,
          letterSpacing: '0.1em',
        }}>{series}</span>
      </div>

      {/* Perforated separator */}
      <PerforatedEdge vertical />

      {/* Content */}
      <div style={{ flex: 1, padding: '10px 10px' }}>
        <div style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 900,
          fontSize: 12,
          color: '#1a0a00',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          marginBottom: subtitle ? 1 : 6,
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 8,
            color: '#7a6a50',
            marginBottom: 8,
          }}>{subtitle}</div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Chunky action button (Among-Us style, paper-toned) ────────────────────────

function CouponButton({ label, color, shadowColor, onClick, disabled }: {
  label: string; color: string; shadowColor: string; onClick?: () => void; disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      disabled={disabled}
      style={{
        width: '100%',
        background: disabled ? '#c8c0a0' : color,
        border: '3px solid #1a0a00',
        borderRadius: 10,
        padding: '10px',
        boxShadow: pressed ? 'none' : `0 4px 0 ${shadowColor}`,
        transform: pressed ? 'translateY(4px)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 14,
        color: '#fff',
        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        transition: 'transform 0.06s, box-shadow 0.06s',
      }}
    >{label}</button>
  );
}

// ── Soviet stamp circle ───────────────────────────────────────────────────────

function StampMark({ text, subtext, x, y, rotate, color = '#c81818' }: {
  text: string; subtext: string; x: number; y: number; rotate: number; color?: string;
}) {
  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `rotate(${rotate}deg)`,
      pointerEvents: 'none',
      opacity: 0.12,
    }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" stroke={color} strokeWidth="4" fill="none"/>
        <circle cx="50" cy="50" r="36" stroke={color} strokeWidth="2" fill="none"/>
        <text x="50" y="46" textAnchor="middle" fontFamily="Montserrat" fontWeight="900" fontSize="11" fill={color} letterSpacing="2">{text}</text>
        <text x="50" y="60" textAnchor="middle" fontFamily="Montserrat" fontWeight="700" fontSize="8" fill={color} letterSpacing="1">{subtext}</text>
      </svg>
    </div>
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
        <div style={outerCoupon}>
          <CouponHeader />
          <PerforatedEdge />

          <CouponSection letter="★" series="ВАША КОМНАТА" title="КОД ДОСТУПА НА АЗС" accent="#c81818">
            <div style={{ textAlign: 'center', padding: '4px 0 8px' }}>
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                fontSize: 38,
                color: '#c81818',
                letterSpacing: '0.18em',
              }}>XYZ789</span>
            </div>
            <p style={hintText}>Сообщить устно. Не писать мелом на асфальте.</p>
          </CouponSection>

          <PerforatedEdge />

          <CouponSection letter="Б" series="УЧАСТНИКИ" title={`СТОЯТ В ОЧЕРЕДИ — ${mockPlayers.length}/15`} accent="#1a3a7a">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {mockPlayers.map((name, i) => (
                <div key={name} style={rosterRow}>
                  <span style={rosterNum}>{String(i + 1).padStart(2,'0')}</span>
                  <span style={rosterName}>{name}</span>
                  {i === 0 && <span style={rosterRole}>ОРГАН.</span>}
                </div>
              ))}
              <div style={{ ...rosterRow, opacity: 0.3 }}>
                <span style={rosterNum}>03</span>
                <span style={{ ...rosterName, fontStyle: 'italic' }}>ожидается...</span>
              </div>
            </div>
            <CouponButton label="ВЫДАТЬ БЕНЗИН ВСЕМ" color="#1a6a1a" shadowColor="#0a3a0a" onClick={() => {}} />
            <button style={backBtn} onClick={() => setView('home')}>← вернуть талон</button>
          </CouponSection>

          <PerforatedEdge />
          <CouponFooter />
        </div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <div style={outerCoupon}>
        {/* Stamp watermarks */}
        <StampMark text="ОДОБРЕНО" subtext="АЗС №47" x={200} y={120} rotate={-18} />
        <StampMark text="ТОПЛИВО" subtext="ВЫДАНО" x={20} y={300} rotate={12} color="#1a3a7a" />
        <StampMark text="AMONG GAS" subtext="© 2024" x={210} y={480} rotate={-8} />

        <CouponHeader />
        <PerforatedEdge />

        {/* Section A: Create Room */}
        <CouponSection
          letter="А"
          series="СЕРИЯ ГАЗ-1"
          title="Занять заправку"
          subtitle="Создать комнату — стать организатором"
          accent="#c81818"
        >
          <CouponButton label="ОТКРЫТЬ АЗС ДЛЯ ВСЕХ" color="#c81818" shadowColor="#7a0808" onClick={() => setView('room')} />
        </CouponSection>

        <PerforatedEdge />

        {/* Section B: Solo bots */}
        <CouponSection
          letter="Б"
          series="СЕРИЯ ГАЗ-2"
          title="Тренировочный заезд"
          subtitle="С ботами. Бензин условный."
          accent="#c88018"
        >
          <div style={stepperRow}>
            <span style={stepperLabel}>БОТОВ В ОЧЕРЕДИ:</span>
            <div style={stepperControl}>
              <button style={stepBtn} onClick={() => setBotCount(c => Math.max(1, c - 1))}>−</button>
              <span style={stepVal}>{botCount}</span>
              <button style={stepBtn} onClick={() => setBotCount(c => Math.min(14, c + 1))}>+</button>
            </div>
          </div>
          <CouponButton label="ТРЕНИРОВАТЬСЯ" color="#c88018" shadowColor="#7a4a08" />
        </CouponSection>

        <PerforatedEdge />

        {/* Section C: Join by code */}
        <CouponSection
          letter="В"
          series="СЕРИЯ ГАЗ-3"
          title="Войти по коду талона"
          subtitle="Код вам выдали лично"
          accent="#1a3a7a"
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="______"
              maxLength={6}
              style={codeInput}
            />
            <CouponButton
              label="ВЪЕ-ЗД"
              color="#1a3a7a"
              shadowColor="#0a1a4a"
              disabled={code.length < 6}
              onClick={() => setView('room')}
            />
          </div>
          <p style={hintText}>* Без кода — в конец очереди. Такие правила.</p>
        </CouponSection>

        <PerforatedEdge />
        <CouponFooter />
      </div>
    </div>
  );
}

// ── Coupon header & footer ────────────────────────────────────────────────────

function CouponHeader() {
  return (
    <div style={headerWrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Gas droplet logo */}
        <div style={dropletLogo}>
          <svg width="36" height="44" viewBox="0 0 36 44">
            <path d="M18 2 C18 2 2 18 2 28 A16 16 0 0 0 34 28 C34 18 18 2 18 2Z" fill="#c81818" stroke="#1a0a00" strokeWidth="2.5"/>
            <ellipse cx="13" cy="26" rx="4" ry="6" fill="rgba(255,255,255,0.25)" transform="rotate(-15 13 26)"/>
          </svg>
        </div>
        <div>
          <div style={brandName}>AMONG GAS</div>
          <div style={brandSub}>ТОПЛИВНЫЙ ТАЛОН / FUEL COUPON</div>
        </div>
        {/* Series number top right */}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={seriesLabel}>СЕРИЯ</div>
          <div style={seriesNum}>ГАЗ-2024</div>
          <div style={seriesLabel}>№ 001337</div>
        </div>
      </div>
      <div style={headerRule} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={metaText}>ДЕЙСТВИТЕЛЕН ДО: КОНЦА КРИЗИСА</span>
        <span style={metaText}>ОБМЕНУ НЕ ПОДЛЕЖИТ</span>
      </div>
    </div>
  );
}

function CouponFooter() {
  return (
    <div style={footerWrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={metaText}>ВЫДАН: АЗС «СРЕДИ НАС», г. Россия</div>
          <div style={metaText}>ОСНОВАНИЕ: Топливный кризис пост. №2024-∞</div>
        </div>
        <div style={barcodeWrap}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} style={{
              width: i % 3 === 0 ? 3 : 2,
              height: i % 5 === 0 ? 28 : 20,
              background: '#1a0a00',
              borderRadius: 1,
            }} />
          ))}
        </div>
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
  background: '#8a8070',
  backgroundImage: `
    repeating-linear-gradient(0deg, transparent, transparent 30px, rgba(0,0,0,0.05) 30px, rgba(0,0,0,0.05) 31px)
  `,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 14,
  fontFamily: "'Outfit', sans-serif",
};

const outerCoupon: React.CSSProperties = {
  width: 'calc(100% - 20px)',
  maxWidth: 350,
  background: '#f8f4e4',
  border: '3px solid #1a0a00',
  borderRadius: 6,
  overflow: 'hidden',
  position: 'relative',
  boxShadow: '3px 5px 20px rgba(0,0,0,0.4)',
};

const headerWrap: React.CSSProperties = {
  padding: '12px 14px 8px',
  background: '#f8f4e4',
};

const dropletLogo: React.CSSProperties = {
  flexShrink: 0,
};

const brandName: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 22,
  color: '#c81818',
  letterSpacing: '0.08em',
  textShadow: `-1.5px -1.5px 0 #1a0a00, 1.5px -1.5px 0 #1a0a00, -1.5px 1.5px 0 #1a0a00, 1.5px 1.5px 0 #1a0a00`,
  lineHeight: 1,
};

const brandSub: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#5a4a30',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginTop: 2,
};

const seriesLabel: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#8a7a60',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const seriesNum: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 12,
  color: '#1a0a00',
};

const headerRule: React.CSSProperties = {
  height: 2,
  background: 'repeating-linear-gradient(90deg, #c81818 0px, #c81818 6px, transparent 6px, transparent 10px)',
  margin: '6px 0',
};

const metaText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#7a6a50',
  letterSpacing: '0.04em',
};

const hintText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#8a7a60',
  margin: '6px 0 0',
  fontStyle: 'italic',
};

const rosterRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderBottom: '1px solid rgba(26,10,0,0.1)',
  paddingBottom: 4,
};

const rosterNum: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: '#8a7a60',
  minWidth: 20,
};

const rosterName: React.CSSProperties = {
  flex: 1,
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 600,
  fontSize: 12,
  color: '#1a0a00',
};

const rosterRole: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#c81818',
  fontWeight: 700,
};

const backBtn: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  background: 'transparent',
  border: '1.5px dashed rgba(26,10,0,0.25)',
  borderRadius: 6,
  padding: '7px',
  color: '#7a6a50',
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  cursor: 'pointer',
};

const stepperRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const stepperLabel: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: '#5a4a30',
  letterSpacing: '0.05em',
};

const stepperControl: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const stepBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: '2px solid #1a0a00',
  borderRadius: 4,
  background: 'transparent',
  color: '#1a0a00',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: "'Space Mono', monospace",
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

const stepVal: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 18,
  color: '#1a0a00',
  minWidth: 30,
  textAlign: 'center',
};

const codeInput: React.CSSProperties = {
  flex: 1,
  border: '2px solid #1a0a00',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.6)',
  padding: '8px 10px',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 18,
  color: '#1a0a00',
  letterSpacing: '0.2em',
  textAlign: 'center',
  outline: 'none',
};

const footerWrap: React.CSSProperties = {
  padding: '8px 14px 10px',
  background: '#f0ecd6',
  borderTop: '1px solid rgba(26,10,0,0.1)',
};

const barcodeWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 2,
};
