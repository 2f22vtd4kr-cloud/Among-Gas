import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

const REACTOR_COLORS = ['#f05d65', '#edb84a', '#58c8f5', '#57d88d', '#b879ed', '#f47ec5'];


export function ReactorGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [sequence] = useState(() => Array.from({ length: 5 }, () => Math.floor(Math.random() * 6)));
  const [showSequence, setShowSequence] = useState(true);
  const [currentLight, setCurrentLight] = useState<number | null>(sequence[0]);
  const [input, setInput] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const completeRef = useRef(false);
  const completeCb = useRef(onComplete);
  useEffect(() => { completeCb.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!showSequence) return;
    let index = 0;
    setCurrentLight(sequence[0]);
    const interval = setInterval(() => {
      index += 1;
      if (index >= sequence.length) {
        clearInterval(interval);
        setCurrentLight(null);
        setShowSequence(false);
        setError(false);
        return;
      }
      setCurrentLight(sequence[index]);
    }, 700);
    return () => clearInterval(interval);
  }, [showSequence, sequence]);

  const pressPad = (pad: number) => {
    if (showSequence || completeRef.current) return;
    if (sequence[input.length] !== pad) {
      setInput([]);
      setError(true);
      setShowSequence(true);
      return;
    }
    const next = [...input, pad];
    setInput(next);
    if (next.length === sequence.length && !completeRef.current) {
      completeRef.current = true;
      setTimeout(() => completeCb.current(), 300);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{ color: 'rgba(255,255,255,0.78)', textAlign: 'center', fontSize: 13 }}>
        {showSequence ? (en ? 'Memorize the sequence' : 'Запомните последовательность') : error ? (en ? 'Error — sequence will repeat' : 'Ошибка — последовательность повторится') : (en ? 'Repeat the panel sequence' : 'Повторите сигнал на панели')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(64px, 1fr))', gap: 9, width: 'min(296px,82vw)' }}>
        {REACTOR_COLORS.map((color, i) => {
          const lit = showSequence && currentLight === i;
          return (
            <button key={i} onClick={() => pressPad(i)} disabled={showSequence || completeRef.current}
              style={{
                minWidth: 0, height: 66, borderRadius: 11, border: `2px solid ${color}`,
                background: lit ? color : `${color}30`,
                boxShadow: lit ? `0 0 20px ${color}` : 'inset 0 0 12px rgba(255,255,255,0.03)',
                color: '#fff', fontSize: 22, fontWeight: 900, touchAction: 'manipulation',
              }}
              aria-label={en ? `Reactor pad ${i + 1}` : `Панель реактора ${i + 1}`}
            >{['▲', '●', '◆', '■', '✦', '⬟'][i]}</button>
          );
        })}
      </div>
      <p style={helpStyle}>{showSequence ? 'Watch five flashes, then repeat them in order' : `${input.length} of ${sequence.length}`}</p>
    </div>
  );
}

// ── Clear Asteroids ────────────────────────────────────────────────────────────
// Tap to aim and fire; holding a pointer auto-fires every 300ms. Asteroids move,
// bullets travel towards the selected point, and only actual collisions count.

