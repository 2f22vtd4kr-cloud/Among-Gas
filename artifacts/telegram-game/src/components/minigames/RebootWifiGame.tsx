import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

export function RebootWifiGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [lever, setLever] = useState(88);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const move = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = Math.max(4, Math.min(96, ((clientY - rect.top) / rect.height) * 100));
    setLever(next);
    if (next <= 7 && !doneRef.current) {
      doneRef.current = true;
      setTimeout(() => completeRef.current(), 350);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ width: 'min(285px,80vw)', height: 285, position: 'relative', borderRadius: 14,
        overflow: 'hidden', border: '1px solid rgba(80,210,255,0.35)',
        background: 'linear-gradient(145deg,#172a37,#08111a)' }}>
        <div style={{ padding: '16px 12px 0', textAlign: 'center', color: '#63dfff', fontWeight: 950, letterSpacing: '0.1em' }}>{en ? 'REBOOT THE WIFI' : 'ПЕРЕЗАПУСК СВЯЗИ'}</div>
        <div ref={trackRef} style={{ position: 'absolute', top: 57, bottom: 30, left: '50%', transform: 'translateX(-50%)',
          width: 22, borderRadius: 9, background: '#090f17', border: '1px solid #50616d' }}>
          <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', color: '#52e6a5', fontSize: 10, fontWeight: 950 }}>{en ? 'ON' : 'ВКЛ'}</div>
          <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', color: '#ff7676', fontSize: 10, fontWeight: 950 }}>{en ? 'OFF' : 'ВЫКЛ'}</div>
          <button
            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); move(e.clientY); }}
            onPointerMove={e => { if (dragging) move(e.clientY); }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onLostPointerCapture={() => setDragging(false)}
            aria-label={en ? 'Drag WiFi lever up to ON' : 'Перетащите рычаг связи вверх до ВКЛ'}
            style={{ position: 'absolute', left: '50%', top: `${lever}%`, transform: 'translate(-50%,-50%)',
              width: 83, height: 48, borderRadius: 9, border: '2px solid #b5f5ff',
              background: dragging ? '#21a9d0' : '#117da4', color: '#fff', fontSize: 20, fontWeight: 950,
              boxShadow: '0 4px 0 #063a51', touchAction: 'none', cursor: 'grab' }}>↕</button>
        </div>
      </div>
      <p style={helpStyle}>{lever <= 7 ? (en ? '✓ WiFi rebooted' : '✓ Связь восстановлена') : (en ? 'Drag the blue lever all the way up to ON' : 'Перетащите синий рычаг до упора вверх')}</p>
    </div>
  );
}

// ── Align Engine ──────────────────────────────────────────────────────────────
// Drag the engine lever into the target zone and keep it aligned for 1.5s.

