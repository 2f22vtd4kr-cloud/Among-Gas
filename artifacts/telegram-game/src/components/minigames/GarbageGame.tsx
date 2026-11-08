import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

export function GarbageGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [lever, setLever] = useState(12);
  const [dragging, setDragging] = useState(false);
  const [cleared, setCleared] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const moveLever = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = Math.max(8, Math.min(92, ((clientY - rect.top) / rect.height) * 100));
    const removed = Math.min(6, Math.max(0, Math.floor(((next - 8) / 84) * 6)));
    setLever(next);
    setCleared(removed);
    if (removed === 6 && !doneRef.current) {
      doneRef.current = true;
      setTimeout(() => completeRef.current(), 350);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ width: 'min(290px,82vw)', height: 235, position: 'relative', borderRadius: 12,
        overflow: 'hidden', background: 'linear-gradient(180deg,#1a2631,#0b1119)',
        border: '1px solid rgba(220,170,70,0.32)' }}>
        <div style={{ position: 'absolute', inset: '12% 20% 9%', border: '3px solid #4f5b68',
          borderRadius: '14px 14px 30px 30px', background: 'linear-gradient(180deg,#252f39,#0a1016)' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)',
          fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', color: '#e1ad47' }}>{en ? 'CHUTE' : 'СЛИВ'}</div>
        <div style={{ position: 'absolute', left: '27%', right: '27%', top: '16%', bottom: '18%',
          display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: 7 }}>
          {Array.from({ length: 6 }, (_, i) => i).map(i => !(i < cleared) && (
            <div key={i} style={{ width: 28, height: 26, display: 'grid', placeItems: 'center',
              borderRadius: 6, background: ['#80644d','#596b77','#8b795a','#53656e','#84745f','#4c5964'][i],
              border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset -3px -3px 0 rgba(0,0,0,0.2)' }}>▰</div>
          ))}
        </div>
        <div ref={trackRef} style={{ position: 'absolute', right: '8%', top: '10%', bottom: '10%', width: 12,
          borderRadius: 8, background: '#101720', border: '1px solid #687684' }}>
          <button
            onPointerDown={e => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
              moveLever(e.clientY);
            }}
            onPointerMove={e => { if (dragging) moveLever(e.clientY); }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onLostPointerCapture={() => setDragging(false)}
            aria-label={en ? 'Drag garbage lever down' : 'Потяните рычаг мусора вниз'}
            style={{ position: 'absolute', left: '50%', top: `${(lever - 8) / 84 * 100}%`,
              transform: 'translate(-50%,-50%)', width: 48, height: 34, borderRadius: 8,
              background: dragging ? '#e5b34e' : '#986a2d', border: '2px solid #f3d18b',
              boxShadow: '0 3px 0 #412c15', touchAction: 'none', cursor: 'grab', color: '#fff', fontWeight: 950 }}>
            ↕
          </button>
        </div>
        <div style={{ position: 'absolute', left: '7%', top: '9%', color: '#7eecb4', fontSize: 9, fontWeight: 900 }}>{en ? 'UP' : 'ВВЕРХ'}</div>
        <div style={{ position: 'absolute', left: '7%', bottom: '9%', color: '#ffbf68', fontSize: 9, fontWeight: 900 }}>{en ? 'DOWN' : 'ВНИЗ'}</div>
      </div>
      <div style={{ color: '#e8f0ff', fontSize: 13, fontWeight: 800 }}>{en ? `${cleared}/6 pieces cleared` : `Убрано деталей: ${cleared}/6`}</div>
      <div style={{ width: 'min(280px,80vw)', height: 7, borderRadius: 9, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${cleared / 6 * 100}%`, background: '#68d9a0', transition: 'width 80ms linear' }} />
      </div>
      <p style={helpStyle}>{dragging ? (en ? 'Pull the lever all the way down…' : 'Потяните рычаг до упора вниз…') : (en ? 'Touch the lever and drag it down to empty the chute' : 'Потяните рычаг вниз, чтобы опустошить жёлоб')}</p>
    </div>
  );
}

// ── Clean Filters ─────────────────────────────────────────────────────────────
// A 4×4 grid of tiles; dirty ones must be tapped to clean them.

