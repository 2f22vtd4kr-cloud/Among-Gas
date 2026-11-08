import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

export function FuelGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!holding || completedRef.current) return;
    const id = setInterval(() => {
      setProgress(current => {
        const next = Math.min(100, current + 2.5);
        if (next >= 100 && !completedRef.current) {
          completedRef.current = true;
          setTimeout(onComplete, 250);
        }
        return next;
      });
    }, 60);
    return () => clearInterval(id);
  }, [holding, onComplete]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '18px 0' }}>
      <div style={{ fontSize: 42 }}>⛽</div>
      <div style={{ width: 'min(280px,80vw)', height: 18, borderRadius: 9, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#e6a23c,#56d98a)', transition: 'width 60ms linear' }} />
      </div>
      <div style={{ color: '#e8f0ff', fontFamily: 'monospace', fontSize: 13 }}>{Math.round(progress)}%</div>
      <button
        onPointerDown={e => { e.preventDefault(); setHolding(true); }}
        onPointerUp={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        style={{
          width: 132, height: 64, borderRadius: 12,
          border: '2px solid rgba(255,190,80,0.6)',
          background: holding ? '#b66b16' : '#71440f',
          color: '#fff3d7', fontSize: 14, fontWeight: 900, touchAction: 'none',
        }}
      >
        {holding ? (en ? 'FUELING…' : 'ЗАПРАВКА…') : (en ? 'HOLD' : 'ДЕРЖАТЬ')}
      </button>
      <p style={helpStyle}>{en ? 'Hold the button to refuel the engine' : 'Удерживайте кнопку, чтобы заправить двигатель'}</p>
    </div>
  );
}

// ── Start Reactor ──────────────────────────────────────────────────────────────
// Five-step memory sequence across six reactor pads, as in the established clone.

