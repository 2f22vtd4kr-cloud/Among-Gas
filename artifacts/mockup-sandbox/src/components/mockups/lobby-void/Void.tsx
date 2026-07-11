/**
 * АЗС ТАБЛО — v2 с генерацией
 *
 * Использует сгенерированные изображения:
 * - gas-station-night.jpg — ночная заправка как полноэкранный фон
 * - led-board.jpg         — настоящее LED-табло как фон панели
 * - soviet-stamp.png      — печати на стекле
 */
import React, { useState } from 'react';

import _gasSignDark from '../../../assets/gen/gas-sign-dark.jpg';
import _ledCloseup from '../../../assets/gen/led-closeup.jpg';
import _wetAsphalt from '../../../assets/gen/wet-asphalt.jpg';

const IMG = {
  gasSignDark: _gasSignDark,
  ledCloseup: _ledCloseup,
  wetAsphalt: _wetAsphalt,
};

// ── LED-цифры (светятся поверх фото табло) ───────────────────────────────────

function LedPrice({ value, dim }: { value: string; dim?: boolean }) {
  return (
    <span style={{
      fontFamily: "'Space Mono', monospace",
      fontWeight: 700,
      fontSize: 24,
      color: dim ? '#3a2800' : '#ff9c00',
      textShadow: dim ? 'none' : '0 0 8px rgba(255,156,0,1), 0 0 20px rgba(255,156,0,0.6)',
      letterSpacing: '0.06em',
    }}>{value}</span>
  );
}

// ── Бейдж марки топлива (как на реальном табло) ───────────────────────────────

function GradeBadge({ grade, color, dim }: { grade: string; color: string; dim?: boolean }) {
  return (
    <div style={{
      background: dim ? 'rgba(30,20,0,0.7)' : color,
      border: `3px solid ${dim ? '#1a1000' : '#0a0a06'}`,
      borderRadius: 7,
      padding: '3px 7px',
      minWidth: 58,
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      boxShadow: dim ? 'none' : '0 2px 8px rgba(0,0,0,0.5)',
    }}>
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 9,
        color: dim ? '#3a2800' : '#fff',
        letterSpacing: '0.05em',
      }}>{grade.length <= 2 ? 'АИ' : ''}</span>
      <span style={{
        fontFamily: "'Montserrat', sans-serif",
        fontWeight: 900,
        fontSize: 17,
        color: dim ? '#2a1800' : '#fff',
        lineHeight: 1,
        textShadow: dim ? 'none' : '0 1px 3px rgba(0,0,0,0.6)',
      }}>{grade}</span>
    </div>
  );
}

// ── Строка табло (кнопка-действие) ───────────────────────────────────────────

interface RowProps {
  grade: string;
  gradeColor: string;
  actionText: string;
  priceNode: React.ReactNode;
  dim?: boolean;
  onClick?: () => void;
}

function BoardRow({ grade, gradeColor, actionText, priceNode, dim, onClick }: RowProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => !dim && setPressed(true)}
      onPointerUp={() => { setPressed(false); !dim && onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      disabled={dim}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        background: dim
          ? 'rgba(8,6,2,0.72)'
          : pressed ? 'rgba(26,22,6,0.88)' : 'rgba(16,14,4,0.82)',
        borderTop: '1.5px solid rgba(60,40,0,0.4)',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        padding: '10px 10px',
        gap: 10,
        cursor: dim ? 'default' : 'pointer',
        textAlign: 'left' as const,
        transform: pressed ? 'scaleY(0.97)' : 'none',
        transition: 'background 0.07s, transform 0.07s',
        backdropFilter: 'blur(2px)',
      }}
    >
      <GradeBadge grade={grade} color={gradeColor} dim={dim} />
      <div style={{ width: 2, alignSelf: 'stretch', background: 'rgba(60,40,0,0.4)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: 13,
          color: dim ? '#3a2800' : '#f0e4b0',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.04em',
          lineHeight: 1.2,
        }}>{actionText}</div>
      </div>
      <div style={{ minWidth: 84, textAlign: 'right' as const, paddingRight: 4 }}>
        {priceNode}
      </div>
    </button>
  );
}

// ── Кнопка-действие (зелёная, под строкой) ───────────────────────────────────

function ActionBtn({ label, sublabel, color, onClick }: {
  label: string; sublabel?: string; color: string; onClick?: () => void;
}) {
  const [p, setP] = useState(false);
  return (
    <button
      onPointerDown={() => setP(true)}
      onPointerUp={() => { setP(false); onClick?.(); }}
      onPointerLeave={() => setP(false)}
      onClick={onClick}
      style={{
        width: '100%',
        background: color,
        border: '3px solid #0a0a06',
        borderRadius: 10,
        padding: '9px 14px',
        boxShadow: p ? 'none' : '0 4px 0 #0a0a06',
        transform: p ? 'translateY(4px)' : 'none',
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
        color: 'rgba(255,255,255,0.5)',
        marginTop: 2,
      }}>{sublabel}</span>}
    </button>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────

export function Void() {
  const [botCount, setBotCount] = useState(4);
  const [code, setCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');
  const mockPlayers = ['Алёша', 'Дядя Вова', 'Галя'];

  if (view === 'room') {
    return (
      <div style={rootStyle}>
        <NightBg />
        <div style={glassPanel}>
          {/* Панель комнаты поверх LED-фото */}
          <div style={ledBgPanel}>
            <div style={ledOverlay} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={panelHeader}>
                <LedPrice value="КОМНАТА ОТКРЫТА" />
              </div>
              <div style={{ padding: '10px 14px 8px' }}>
                <div style={dimLabel}>КОД ДЛЯ ДРУЗЕЙ</div>
                <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
                  <span style={{
                    fontFamily: "'Space Mono', monospace",
                    fontWeight: 700,
                    fontSize: 40,
                    color: '#ff9c00',
                    textShadow: '0 0 14px rgba(255,156,0,1), 0 0 30px rgba(255,156,0,0.5)',
                    letterSpacing: '0.2em',
                  }}>XYZ789</span>
                </div>
                <div style={{ ...dimLabel, marginBottom: 10 }}>В ОЧЕРЕДИ ({mockPlayers.length}/15)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                  {mockPlayers.map((name, i) => (
                    <div key={name} style={playerRow}>
                      <div style={playerDot} />
                      <span style={playerName}>{name}</span>
                      {i === 0 && <span style={hostTag}>ЗАПРАВЩИК</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <ActionBtn label="РАЗДАТЬ ВСЕМ ПО ЛИТРУ" sublabel="начать игру" color="#1a7a1a" onClick={() => {}} />
                  <ActionBtn label="← УЙТИ С ЗАПРАВКИ" sublabel="покинуть комнату" color="#4a3010" onClick={() => setView('home')} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <NightBg />

      {/* Канопи АЗС поверх фото */}
      <div style={canopyOverlay}>
        <h1 style={canopyTitle}>AMONG GAS</h1>
        <p style={canopySub}>АЗС «СРЕДИ НАС» / ЗАПРАВЬ СОСЕДА</p>
      </div>

      {/* Стеклянная панель снизу с настоящим LED-табло как фоном */}
      <div style={glassPanel}>
        <div style={ledBgPanel}>
          {/* Полупрозрачный оверлей поверх фото LED */}
          <div style={ledOverlay} />

          {/* Интерактивные строки поверх фото */}
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Шапка табло */}
            <div style={panelHeader}>
              <span style={dimLabel}>ТОПЛИВО / ДЕЙСТВИЕ</span>
              <span style={dimLabel}>КОЛ-ВО</span>
            </div>

            {/* Ряд 1: Создать комнату */}
            <BoardRow
              grade="95"
              gradeColor="#c81818"
              actionText="Занять заправку"
              priceNode={<LedPrice value="→ СТАРТ" />}
              onClick={() => setView('room')}
            />
            <div style={{ padding: '0 12px 8px', paddingTop: 6 }}>
              {/* пустой — кнопка идёт внутрь ряда, чтобы избежать nested button */}
            </div>

            {/* Ряд 2: Боты — div не button, чтобы не было nested */}
            <div style={{
              borderTop: '1.5px solid rgba(60,40,0,0.4)',
              background: 'rgba(16,14,4,0.82)',
              backdropFilter: 'blur(2px)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', padding: '10px 10px', gap: 10,
              }}>
                <GradeBadge grade="92" color="#c88018" />
                <div style={{ width: 2, alignSelf: 'stretch', background: 'rgba(60,40,0,0.4)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 13,
                    color: '#f0e4b0', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  }}>Один в поле бот</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button style={microBtn} onClick={() => setBotCount(c => Math.max(1, c-1))}>−</button>
                  <LedPrice value={String(botCount).padStart(2,'0')} />
                  <button style={microBtn} onClick={() => setBotCount(c => Math.min(14, c+1))}>+</button>
                </div>
              </div>
              <div style={{ padding: '0 12px 10px' }}>
                <ActionBtn label="ТРЕНИРОВКА С БОТАМИ" sublabel="результаты не зачитываются" color="#1a5a10" />
              </div>
            </div>

            {/* Ряд 3: Войти по коду */}
            <div style={{
              borderTop: '1.5px solid rgba(60,40,0,0.4)',
              background: 'rgba(12,10,2,0.82)',
              backdropFilter: 'blur(2px)',
            }}>
              <BoardRow
                grade="ДТ"
                gradeColor="#184a7a"
                actionText="Войти по коду"
                priceNode={<LedPrice value="[КОД]" dim />}
              />
              <div style={{ padding: '6px 12px 10px', display: 'flex', gap: 8 }}>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))}
                  placeholder="— — — — — —"
                  maxLength={6}
                  style={codeInput}
                />
                <button
                  style={{ ...joinBtn, opacity: code.length < 6 ? 0.4 : 1 }}
                  disabled={code.length < 6}
                  onClick={() => setView('room')}
                >ВЪЕЗД</button>
              </div>
            </div>

            {/* Ряд 4: Недоступно */}
            <BoardRow
              grade="98"
              gradeColor="#3a2a5a"
              actionText="Евро-5 бензин"
              priceNode={<LedPrice value="НЕТ" dim />}
              dim
            />

            {/* Подвал табло */}
            <div style={panelFooter}>
              <span style={footerText}>ЛИЦЕНЗИЯ №ГАЗ-2024-∞</span>
              <span style={footerText}>◉ РАБОТАЕМ 24/7 (ПОЧТИ)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Фоновые компоненты ────────────────────────────────────────────────────────

function NightBg() {
  return (
    <>
      {/* Тёмный fallback */}
      <div style={{ position: 'absolute', inset: 0, background: '#04060e', zIndex: 0 }} />
      {/* LED-табло как img — надёжно рендерится */}
      <img
        src={IMG.gasSignDark}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center top',
          filter: 'brightness(0.55) saturate(1.8)',
          zIndex: 1,
        }}
        alt=""
      />
      {/* Затемнение снизу */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '62%',
        background: 'linear-gradient(to bottom, transparent 0%, rgba(3,2,0,0.85) 45%, rgba(3,2,0,0.99) 100%)',
        zIndex: 2,
      }} />
    </>
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
  fontFamily: "'Montserrat', sans-serif",
};

const canopyOverlay: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 88,
  background: 'linear-gradient(to bottom, rgba(6,24,6,0.88), rgba(6,24,6,0.0))',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2,
};

const canopyTitle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 900,
  fontSize: 36,
  color: '#f5e030',
  textShadow: `-2px -2px 0 #0a0a06, 2px -2px 0 #0a0a06, -2px 2px 0 #0a0a06, 2px 2px 0 #0a0a06, 0 0 24px rgba(245,224,48,0.6)`,
  letterSpacing: '0.06em',
  margin: 0,
};

const canopySub: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 9,
  color: 'rgba(245,224,48,0.5)',
  letterSpacing: '0.12em',
  margin: '2px 0 0',
};

const glassPanel: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  top: 70,
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
};

const ledBgPanel: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  backgroundImage: `url(${IMG.ledCloseup})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  borderTop: '3px solid #0a0a06',
  boxShadow: '0 -6px 30px rgba(0,0,0,0.7)',
};

const ledOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(8,7,2,0.70)',
  zIndex: 0,
};

const panelHeader: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  background: 'rgba(4,3,0,0.85)',
  padding: '6px 12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1.5px solid rgba(60,40,0,0.4)',
};

const panelFooter: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  background: 'rgba(4,3,0,0.9)',
  padding: '5px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  borderTop: '2px solid #0a0a06',
};

const dimLabel: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: 'rgba(255,156,0,0.35)',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

const footerText: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 7.5,
  color: 'rgba(255,156,0,0.2)',
};

const playerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '3px 0',
};

const playerDot: React.CSSProperties = {
  width: 8, height: 8,
  borderRadius: '50%',
  background: '#7aaa64',
  border: '2px solid #0a0a06',
  boxShadow: '0 0 6px rgba(122,170,100,0.7)',
  flexShrink: 0,
};

const playerName: React.CSSProperties = {
  flex: 1,
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 600,
  fontSize: 13,
  color: '#f0e4b0',
};

const hostTag: React.CSSProperties = {
  fontFamily: "'Space Mono', monospace",
  fontSize: 8,
  color: '#ff9c00',
  background: 'rgba(255,156,0,0.12)',
  border: '1px solid rgba(255,156,0,0.3)',
  padding: '1px 5px',
  borderRadius: 3,
};

const microBtn: React.CSSProperties = {
  width: 22, height: 22,
  background: '#2a2000',
  border: '2px solid #0a0a06',
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
  background: 'rgba(4,3,0,0.9)',
  border: '3px solid rgba(60,40,0,0.7)',
  borderRadius: 8,
  padding: '8px 8px',
  color: '#ff9c00',
  fontFamily: "'Space Mono', monospace",
  fontWeight: 700,
  fontSize: 16,
  letterSpacing: '0.2em',
  textAlign: 'center',
  outline: 'none',
};

const joinBtn: React.CSSProperties = {
  background: '#1a6a1a',
  border: '3px solid #0a0a06',
  borderRadius: 8,
  boxShadow: '0 4px 0 #0a0a06',
  color: '#fff',
  fontFamily: "'Montserrat', sans-serif",
  fontWeight: 800,
  fontSize: 12,
  padding: '0 14px',
  cursor: 'pointer',
  letterSpacing: '0.06em',
};
