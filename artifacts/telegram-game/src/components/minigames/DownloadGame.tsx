import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import type { MinigameProps } from "./shared";

export function DownloadGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!started || doneRef.current) return;
    const id = setInterval(() => {
      setProgress(p => {
        const next = Math.min(100, p + 100 / 30); // ~3 seconds at 100ms intervals
        if (next >= 100 && !doneRef.current) {
          doneRef.current = true;
          setTimeout(onComplete, 200);
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [started, onComplete]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '20px 0' }}>
      <div style={{
        width: 'min(280px,80vw)', height: 18, borderRadius: 9,
        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${progress}%`, borderRadius: 9,
          background: 'linear-gradient(90deg, #3498db, #2ecc71)',
          transition: started ? 'width 0.1s linear' : 'none',
        }} />
      </div>
      <div style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontSize: 13 }}>
        {progress >= 100 ? (en ? 'Complete!' : 'Готово!') : started ? `${Math.round(progress)}%` : (en ? 'Ready' : 'Готово к запуску')}
      </div>
      {!started && (
        <button
          aria-label={en ? "Start data download" : "Начать загрузку данных"}
          onClick={() => setStarted(true)}
          style={{
            padding: '12px 32px', borderRadius: 10,
            background: 'rgba(52,152,219,0.85)', color: '#fff',
            border: '1px solid rgba(100,180,255,0.35)',
            fontFamily: 'sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {en ? '⬇ Download' : '⬇ Скачать'}
        </button>
      )}
    </div>
  );
}

// ── Calibrate Distributor ─────────────────────────────────────────────────────
// A needle sweeps the dial. Tap when it's in the green zone.

