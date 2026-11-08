import { useState, useEffect, useRef, useCallback } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

const CALIBRATE_TARGETS = [
  { start: 55, end: 95 },   // step 0
  { start: 195, end: 245 }, // step 1
];
const NEEDLE_DEG_PER_SEC = 110;

export function CalibrateGame({ stepIndex, onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [angle, setAngle] = useState(0);
  const [status, setStatus] = useState<'idle' | 'hit' | 'miss'>('idle');
  const angleRef = useRef(0);
  const startRef = useRef(performance.now());
  const statusRef = useRef<'idle' | 'hit' | 'miss'>('idle');
  const target = CALIBRATE_TARGETS[stepIndex % CALIBRATE_TARGETS.length];

  useEffect(() => {
    startRef.current = performance.now();
    const id = setInterval(() => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const a = (elapsed * NEEDLE_DEG_PER_SEC) % 360;
      angleRef.current = a;
      setAngle(a);
    }, 33);
    return () => clearInterval(id);
  }, []);

  const handleTap = useCallback(() => {
    if (statusRef.current === 'hit') return;
    const a = angleRef.current;
    const inZone = a >= target.start && a <= target.end;
    statusRef.current = inZone ? 'hit' : 'miss';
    setStatus(inZone ? 'hit' : 'miss');
    if (inZone) {
      setTimeout(onComplete, 450);
    } else {
      setTimeout(() => {
        statusRef.current = 'idle';
        setStatus('idle');
        startRef.current = performance.now();
      }, 700);
    }
  }, [target, onComplete]);

  // SVG arc path helper (0° = top, clockwise)
  const CX = 100; const CY = 100; const R = 78;
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  };
  const arcD = (s: number, e: number) => {
    const p1 = toXY(s); const p2 = toXY(e);
    const large = e - s > 180 ? 1 : 0;
    return `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} A${R},${R} 0 ${large},1 ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  };
  const needleTip = toXY(angle);
  const zoneColor = status === 'hit' ? '#2ecc71' : status === 'miss' ? '#e74c3c' : 'rgba(46,204,113,0.75)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <button
        onClick={handleTap}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        aria-label={en ? 'Tap when needle is in green zone' : 'Нажмите, когда стрелка в зелёной зоне'}
      >
        <svg width={200} height={200} viewBox="0 0 200 200">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
          <path d={arcD(target.start, target.end)} fill="none"
            stroke={zoneColor} strokeWidth={10} strokeLinecap="round" />
          <line x1={CX} y1={CY} x2={needleTip.x.toFixed(1)} y2={needleTip.y.toFixed(1)}
            stroke={status === 'hit' ? '#2ecc71' : status === 'miss' ? '#e74c3c' : '#fff'}
            strokeWidth={3} strokeLinecap="round" />
          <circle cx={CX} cy={CY} r={5} fill="#fff" />
        </svg>
      </button>
      <p style={helpStyle}>
        {status === 'hit' ? (en ? '✓ Calibrated!' : '✓ Настроено!') : status === 'miss' ? (en ? 'Missed — try again' : 'Промах — попробуйте ещё раз') : (en ? 'Tap when needle hits the green arc' : 'Нажмите, когда стрелка на зелёной дуге')}
      </p>
    </div>
  );
}

// ── Empty Garbage ─────────────────────────────────────────────────────────────
// Press and hold for 2 seconds.

// ── Empty Garbage ─────────────────────────────────────────────────────────────
// Drag the lever down to pull six pieces into the chute, matching the clone's
// drag mechanic while keeping the touch target large enough for Telegram.

