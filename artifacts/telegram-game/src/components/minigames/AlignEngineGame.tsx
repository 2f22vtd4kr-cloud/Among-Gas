import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

export function AlignEngineGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [target] = useState(() => 22 + Math.random() * 56);
  const [slider, setSlider] = useState(18);
  const [dragging, setDragging] = useState(false);
  const [stableMs, setStableMs] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef(slider);
  const doneRef = useRef(false);
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const move = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    sliderRef.current = next;
    setSlider(next);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setStableMs(previous => {
        const next = Math.abs(sliderRef.current - target) <= 5 ? Math.min(1500, previous + 50) : 0;
        if (next >= 1500 && !doneRef.current) {
          doneRef.current = true;
          setTimeout(() => completeRef.current(), 300);
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 19, padding: '18px 0' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', color: '#68e7a4', fontWeight: 900 }}>{en ? 'ALIGN ENGINE OUTPUT' : 'НАСТРОЙКА ДВИГАТЕЛЯ'}</div>
      <div ref={trackRef} style={{ position: 'relative', width: 'min(300px,82vw)', height: 52, borderRadius: 12,
        background: 'linear-gradient(180deg,#283a40,#111c24)', border: '1px solid rgba(100,220,160,0.35)', touchAction: 'none' }}>
        <div style={{ position: 'absolute', left: '5%', right: '5%', top: '50%', height: 8,
          transform: 'translateY(-50%)', borderRadius: 8, background: '#070e12' }} />
        <div style={{ position: 'absolute', left: `${target}%`, top: 0, bottom: 0, width: 3,
          background: '#61f59e', boxShadow: '0 0 14px #61f59e' }} />
        <button
          onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); move(e.clientX); }}
          onPointerMove={e => { if (dragging) move(e.clientX); }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onLostPointerCapture={() => setDragging(false)}
          aria-label={en ? 'Drag engine alignment lever to target' : 'Перетащите рычаг выравнивания двигателя к цели'}
          style={{ position: 'absolute', left: `${slider}%`, top: '50%', transform: 'translate(-50%,-50%)',
            width: 42, height: 44, borderRadius: 8, border: '2px solid #d7ffe6',
            background: dragging ? '#3ecb7e' : '#248b55', color: '#fff', fontWeight: 950,
            boxShadow: '0 3px 0 #0b3e24', touchAction: 'none' }}>↔</button>
      </div>
      <div style={{ width: 'min(280px,80vw)', height: 7, borderRadius: 9, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ width: `${stableMs / 1500 * 100}%`, height: '100%', background: '#56dd91', transition: 'width 50ms linear' }} />
      </div>
      <p style={helpStyle}>{stableMs ? (en ? `Aligned… ${(1.5 - stableMs / 1000).toFixed(1)}s` : `Совмещение… ${(1.5 - stableMs / 1000).toFixed(1)} с`) : (en ? 'Drag into the green target and keep it there for 1.5s' : 'Перетащите рычаг в зелёную зону и удерживайте 1,5 с')}</p>
    </div>
  );
}

// ── Fuel Engine ───────────────────────────────────────────────────────────────
// Hold to transfer fuel. Progress is retained if the player briefly releases.

