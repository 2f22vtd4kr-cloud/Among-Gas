import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

export function StabilizeNavigationGame({ onComplete }: MinigameProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [target] = useState(() => ({ x: 28 + Math.random() * 48, y: 22 + Math.random() * 45 }));
  const [marker, setMarker] = useState({ x: 22, y: 68 });
  const [dragging, setDragging] = useState(false);
  const [stableMs, setStableMs] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef(marker);
  const doneRef = useRef(false);
  const completeRef = useRef(onComplete);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const moveMarker = (clientX: number, clientY: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = {
      x: Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(8, Math.min(92, ((clientY - rect.top) / rect.height) * 100)),
    };
    markerRef.current = next;
    setMarker(next);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const distance = Math.hypot(markerRef.current.x - target.x, markerRef.current.y - target.y);
      setStableMs(previous => {
        const next = distance < 7 ? Math.min(2500, previous + 50) : 0;
        if (next >= 2500 && !doneRef.current) {
          doneRef.current = true;
          setTimeout(() => completeRef.current(), 300);
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ width: 'min(300px,82vw)', height: 205, position: 'relative', borderRadius: 12,
        overflow: 'hidden', background: 'radial-gradient(ellipse at center,#172e42,#080e18)',
        border: '1px solid rgba(90,160,220,0.45)', touchAction: 'none' }} ref={areaRef}>
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} style={{ position: 'absolute', left: `${(i * 37 + 11) % 97}%`,
            top: `${(i * 29 + 17) % 91}%`, width: 2, height: 2, borderRadius: '50%',
            background: 'rgba(170,210,255,0.35)' }} />
        ))}
        <div style={{ position: 'absolute', left: `${target.x}%`, top: `${target.y}%`,
          transform: 'translate(-50%,-50%)', width: 42, height: 42, borderRadius: '50%',
          border: '2px solid #ff6b42', boxShadow: '0 0 0 7px rgba(255,100,50,0.12)',
          display: 'grid', placeItems: 'center', color: '#ff9b79', fontSize: 24 }}>⌖</div>
        <button
          onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); moveMarker(e.clientX,e.clientY); }}
          onPointerMove={e => { if (dragging) moveMarker(e.clientX,e.clientY); }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onLostPointerCapture={() => setDragging(false)}
          aria-label={en ? 'Drag navigation marker to target' : 'Перетащите маркер навигации к цели'}
          style={{ position: 'absolute', left: `${marker.x}%`, top: `${marker.y}%`,
            transform: 'translate(-50%,-50%)', width: 48, height: 48, borderRadius: '50%',
            border: '2px solid #d7fffb', background: dragging ? '#00cdbb' : '#078e89',
            color: '#fff', fontSize: 20, fontWeight: 950, boxShadow: '0 0 18px rgba(0,220,200,0.5)',
            touchAction: 'none', cursor: 'grab' }}>●</button>
      </div>
      <div style={{ width: 'min(280px,80vw)', height: 8, borderRadius: 9, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ width: `${stableMs / 2500 * 100}%`, height: '100%', background: '#42ddb6', transition: 'width 50ms linear' }} />
      </div>
      <p style={helpStyle}>{stableMs > 0 ? (en ? `Stabilizing… ${(2.5 - stableMs / 1000).toFixed(1)}s` : `Стабилизация… ${(2.5 - stableMs / 1000).toFixed(1)} с`) : (en ? 'Drag the green marker onto the orange target and hold for 2.5s' : 'Перетащите зелёный маркер на оранжевую цель и удерживайте 2,5 с')}</p>
    </div>
  );
}

// ── Reboot WiFi ───────────────────────────────────────────────────────────────
// Drag the power lever from OFF at the bottom up to ON.

