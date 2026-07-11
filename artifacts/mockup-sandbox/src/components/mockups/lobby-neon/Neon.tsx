/**
 * ТАЛОН НА ТОПЛИВО — v2 с генерацией
 *
 * Использует сгенерированные изображения:
 * - paper-texture.jpg  — бумага советского документа
 * - coupon-scan.jpg    — шапка как отсканированный оригинал
 * - soviet-stamp.png   — настоящая гербовая печать
 */
import React, { useState } from 'react';

import _paperTexture from '../../../assets/gen/paper-texture.jpg';
import _couponHeader from '../../../assets/gen/coupon-header.jpg';
import _sovietStamp from '../../../assets/gen/soviet-stamp.png';
import _stampsDouble from '../../../assets/gen/stamps-double.jpg';
import _guilloche from '../../../assets/gen/guilloche.jpg';
import _woodDesk from '../../../assets/gen/wood-desk.jpg';
import _monthlyTabs from '../../../assets/gen/monthly-tabs.jpg';
import _couponScan from '../../../assets/gen/coupon-scan.jpg';

const IMG = {
  paperTexture: _paperTexture,
  couponHeader: _couponHeader,
  sovietStamp: _sovietStamp,
  stampsDouble: _stampsDouble,
  guilloche: _guilloche,
  woodDesk: _woodDesk,
  monthlyTabs: _monthlyTabs,
  couponScan: _couponScan,
};

// ── Разделитель-перфорация ────────────────────────────────────────────────────

function PerforatedEdge({ vertical }: { vertical?: boolean }) {
  const count = vertical ? 20 : 24;
  return (
    <div style={{
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: vertical ? '4px 0' : '0 4px',
      ...(vertical
        ? { width: 14, alignSelf: 'stretch' }
        : { height: 14, width: '100%' }),
      flexShrink: 0,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: vertical ? 7 : 5,
          height: vertical ? 5 : 7,
          borderRadius: '50%',
          background: 'rgba(160,140,100,0.6)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
          flexShrink: 0,
        }} />
      ))}
    </div>
  );
}

// ── Секция талона ─────────────────────────────────────────────────────────────

interface SectionProps {
  letter: string;
  series: string;
  title: string;
  subtitle?: string;
  accent?: string;
  children: React.ReactNode;
}

function CouponSection({ letter, series, title, subtitle, accent = '#8a1a1a', children }: SectionProps) {
  return (
    <div style={{ display: 'flex', background: 'transparent' }}>
      {/* Боковая вкладка */}
      <div style={{
        width: 34,
        background: accent,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 3px',
        flexShrink: 0,
        gap: 4,
        borderRight: '1.5px solid rgba(0,0,0,0.25)',
      }}>
        <span style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 900,
          fontSize: 18,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}>{letter}</span>
        <span style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 6,
          color: 'rgba(255,255,255,0.55)',
          writingMode: 'vertical-rl' as const,
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
        }}>{series}</span>
      </div>

      <PerforatedEdge vertical />

      {/* Контент */}
      <div style={{ flex: 1, padding: '9px 10px' }}>
        <div style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 900,
          fontSize: 11,
          color: '#1a0800',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          marginBottom: subtitle ? 1 : 7,
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 7.5,
            color: '#7a6040',
            marginBottom: 7,
          }}>{subtitle}</div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Кнопка (Among Us chunky, paper edition) ───────────────────────────────────

function CouponButton({ label, color, shadow, onClick, disabled }: {
  label: string; color: string; shadow: string; onClick?: () => void; disabled?: boolean;
}) {
  const [p, setP] = useState(false);
  return (
    <button
      onPointerDown={() => setP(true)}
      onPointerUp={() => { setP(false); onClick?.(); }}
      onPointerLeave={() => setP(false)}
      disabled={disabled}
      style={{
        width: '100%',
        background: disabled ? '#b0a888' : color,
        border: '3px solid #1a0800',
        borderRadius: 10,
        padding: '10px',
        boxShadow: p ? 'none' : `0 4px 0 ${shadow}`,
        transform: p ? 'translateY(4px)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 13,
        color: '#fff',
        textShadow: '0 1px 3px rgba(0,0,0,0.55)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        transition: 'transform 0.06s, box-shadow 0.06s',
      }}
    >{label}</button>
  );
}

// ── Шапка — сканированный оригинал + бренд ───────────────────────────────────

function CouponHeader() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Реальная шапка советского талона — как img */}
      <img
        src={IMG.couponHeader}
        style={{
          display: 'block',
          width: '100%',
          height: 90,
          objectFit: 'cover',
          objectPosition: 'top center',
          filter: 'saturate(0.85) brightness(0.92)',
        }}
        alt="ТАЛОН НА ТОПЛИВО"
      />
      {/* «AMONG GAS» поверх — как оверлей */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(248,240,210,0.0) 0%, rgba(248,240,210,0.72) 60%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: 12,
      }}>
        <div style={{ textAlign: 'right' }}>
          <div style={brandName}>AMONG GAS</div>
          <div style={brandSub}>ТОПЛИВНЫЙ ТАЛОН / FUEL COUPON</div>
          <div style={{ ...seriesLabel, marginTop: 2 }}>СЕРИЯ ГАЗ-2024 · № 802581</div>
        </div>
      </div>
    </div>
  );
}

// ── Линия-пунктир ─────────────────────────────────────────────────────────────

function DashRule({ color = '#8a1a1a' }: { color?: string }) {
  return (
    <div style={{
      height: 2,
      margin: '0',
      background: `repeating-linear-gradient(90deg, ${color} 0px, ${color} 5px, transparent 5px, transparent 9px)`,
    }} />
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────

export function Neon() {
  const [botCount, setBotCount] = useState(4);
  const [code, setCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');
  const mockPlayers = ['Михаил К.', 'Светлана Д.'];

  const paperBg: React.CSSProperties = {
    backgroundImage: `url(${IMG.paperTexture})`,
    backgroundSize: 'cover',
  };

  if (view === 'room') {
    return (
      <div style={rootStyle}>
        <div style={{ ...outerCoupon, ...paperBg }}>
          {/* Печати */}
          <Stamp x={200} y={100} rotate={-14} />
          <Stamp x={18} y={380} rotate={10} />

          <CouponHeader />
          <DashRule />
          <PerforatedEdge />

          <CouponSection letter="★" series="КОМНАТА" title="Код доступа на АЗС" accent="#8a1a1a">
            <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                fontSize: 38,
                color: '#8a1a1a',
                letterSpacing: '0.2em',
              }}>XYZ789</span>
            </div>
            <p style={hintText}>Сообщить устно. Не писать мелом на асфальте.</p>
          </CouponSection>

          <PerforatedEdge />
          <DashRule color="#1a3060" />
          <PerforatedEdge />

          <CouponSection letter="Б" series="УЧАСТНИКИ" title={`В очереди — ${mockPlayers.length}/15`} accent="#1a3060">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {mockPlayers.map((name, i) => (
                <div key={name} style={rosterRow}>
                  <span style={rosterNum}>{String(i+1).padStart(2,'0')}</span>
                  <span style={rosterName}>{name}</span>
                  {i === 0 && <span style={rosterRole}>ОРГАН.</span>}
                </div>
              ))}
              <div style={{ ...rosterRow, opacity: 0.3 }}>
                <span style={rosterNum}>03</span>
                <span style={{ ...rosterName, fontStyle: 'italic' }}>ожидается...</span>
              </div>
            </div>
            <CouponButton label="ВЫДАТЬ БЕНЗИН ВСЕМ" color="#1a5a1a" shadow="#0a3a0a" onClick={() => {}} />
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
      <div style={{ ...outerCoupon, ...paperBg }}>
        {/* Гильоше СССР как водяной знак */}
        <img src={IMG.guilloche} style={{
          position: 'absolute', right: -30, top: '30%',
          width: 220, height: 220,
          opacity: 0.06,
          pointerEvents: 'none',
          zIndex: 0,
          mixBlendMode: 'multiply' as const,
        }} alt="" />

        {/* Советские печати */}
        <Stamp x={198} y={108} rotate={-16} />
        <Stamp x={14} y={290} rotate={11} />
        <Stamp x={208} y={490} rotate={-6} size={70} />

        <CouponHeader />

        <div style={{ padding: '4px 12px 3px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={metaText}>ДЕЙСТВИТЕЛЕН ДО: КОНЦА КРИЗИСА</span>
          <span style={metaText}>ОБМЕНУ НЕ ПОДЛЕЖИТ</span>
        </div>

        <DashRule />
        <PerforatedEdge />

        {/* Секция А: Создать комнату */}
        <CouponSection
          letter="А"
          series="СЕРИЯ ГАЗ-1"
          title="Занять заправку"
          subtitle="Создать комнату — стать организатором"
          accent="#8a1a1a"
        >
          <CouponButton label="ОТКРЫТЬ АЗС ДЛЯ ВСЕХ" color="#8a1a1a" shadow="#4a0808" onClick={() => setView('room')} />
        </CouponSection>

        <PerforatedEdge />
        <DashRule color="#b06010" />
        <PerforatedEdge />

        {/* Секция Б: Боты */}
        <CouponSection
          letter="Б"
          series="СЕРИЯ ГАЗ-2"
          title="Тренировочный заезд"
          subtitle="С ботами. Бензин условный."
          accent="#b06010"
        >
          <div style={stepperRow}>
            <span style={stepperLabel}>БОТОВ В ОЧЕРЕДИ:</span>
            <div style={stepperCtrl}>
              <button style={stepBtn} onClick={() => setBotCount(c => Math.max(1, c-1))}>−</button>
              <span style={stepVal}>{botCount}</span>
              <button style={stepBtn} onClick={() => setBotCount(c => Math.min(14, c+1))}>+</button>
            </div>
          </div>
          <CouponButton label="ТРЕНИРОВАТЬСЯ" color="#b06010" shadow="#6a3508" />
        </CouponSection>

        <PerforatedEdge />
        <DashRule color="#1a3060" />
        <PerforatedEdge />

        {/* Секция В: Войти по коду */}
        <CouponSection
          letter="В"
          series="СЕРИЯ ГАЗ-3"
          title="Войти по коду талона"
          subtitle="Код вам выдали лично"
          accent="#1a3060"
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))}
              placeholder="______"
              maxLength={6}
              style={codeInput}
            />
            <CouponButton
              label="ВЪЕЗД"
              color="#1a3060"
              shadow="#0a1840"
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

// ── Печать (реальная картинка) ────────────────────────────────────────────────

function Stamp({ x, y, rotate, size = 88 }: { x: number; y: number; rotate: number; size?: number }) {
  return (
    <img
      src={IMG.sovietStamp}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        transform: `rotate(${rotate}deg)`,
        opacity: 0.09,
        pointerEvents: 'none',
        mixBlendMode: 'multiply' as const,
        zIndex: 0,
      }}
    />
  );
}

// ── Подвал ────────────────────────────────────────────────────────────────────

function CouponFooter() {
  return (
    <div style={footerWrap}>
      {/* Двойная советская печать */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: 64,
        overflow: 'hidden',
        marginBottom: 4,
      }}>
        <img
          src={IMG.stampsDouble}
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 80,
            width: 'auto',
            opacity: 0.35,
            mixBlendMode: 'multiply' as const,
            filter: 'saturate(1.3)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={metaText}>ВЫДАН: АЗС «СРЕДИ НАС», г. Россия</div>
          <div style={{ ...metaText, marginTop: 3 }}>ОСНОВАНИЕ: Топливный кризис пост. №2024-∞</div>
          <div style={{ ...metaText, marginTop: 3, color: '#8a1a1a' }}>ДЕЙСТВИТЕЛЕН: при наличии печати и подписи</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ ...metaText, fontSize: 6, color: '#9a7850', fontStyle: 'italic' }}>
          Форма ТТ-1 · Серия АИ · №802581
        </div>
        <Barcode />
      </div>
    </div>
  );
}

function Barcode() {
  const bars = [3,2,3,2,2,3,2,2,3,2,3,2,2,3,2,3];
  const heights = [28,20,22,28,20,24,28,20,26,20,28,22,20,28,24,20];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
      {bars.map((w, i) => (
        <div key={i} style={{
          width: w,
          height: heights[i],
          background: '#1a0800',
          borderRadius: 0.5,
        }} />
      ))}
    </div>
  );
}

// ── Стили ─────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 844,
  maxWidth: 390,
  margin: '0 auto',
  overflow: 'hidden',
  backgroundImage: `url(${IMG.woodDesk})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 12,
  fontFamily: "'Outfit', sans-serif",
};

const outerCoupon: React.CSSProperties = {
  width: 'calc(100% - 18px)',
  maxWidth: 354,
  border: '2.5px solid #6a5030',
  borderRadius: 4,
  overflow: 'hidden',
  position: 'relative',
  boxShadow: '2px 6px 28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
};

const brandName: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 22,
  color: '#8a1a1a',
  letterSpacing: '0.08em',
  textShadow: `-1.5px -1.5px 0 #1a0800, 1.5px -1.5px 0 #1a0800, -1.5px 1.5px 0 #1a0800, 1.5px 1.5px 0 #1a0800`,
  lineHeight: 1,
};

const brandSub: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#5a4020',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginTop: 2,
};

const seriesLabel: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#8a6840',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const seriesNum: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 12,
  color: '#1a0800',
};

const metaText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7,
  color: '#7a5830',
  letterSpacing: '0.04em',
};

const hintText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7.5,
  color: '#8a6840',
  margin: '6px 0 0',
  fontStyle: 'italic',
};

const rosterRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderBottom: '1px solid rgba(26,8,0,0.1)',
  paddingBottom: 4,
};

const rosterNum: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: '#8a6840',
  minWidth: 18,
};

const rosterName: React.CSSProperties = {
  flex: 1,
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 600,
  fontSize: 12,
  color: '#1a0800',
};

const rosterRole: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#8a1a1a',
  fontWeight: 700,
};

const backBtn: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  background: 'transparent',
  border: '1.5px dashed rgba(26,8,0,0.22)',
  borderRadius: 6,
  padding: '7px',
  color: '#7a5830',
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
  color: '#5a3808',
  letterSpacing: '0.05em',
};

const stepperCtrl: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const stepBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: '2px solid #1a0800',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.4)',
  color: '#1a0800',
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
  color: '#1a0800',
  minWidth: 28,
  textAlign: 'center',
};

const codeInput: React.CSSProperties = {
  flex: 1,
  border: '2px solid #1a0800',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.5)',
  padding: '8px 8px',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 18,
  color: '#1a0800',
  letterSpacing: '0.2em',
  textAlign: 'center',
  outline: 'none',
};

const footerWrap: React.CSSProperties = {
  padding: '0 12px 10px',
  background: 'transparent',
  borderTop: '1px solid rgba(26,8,0,0.12)',
};
