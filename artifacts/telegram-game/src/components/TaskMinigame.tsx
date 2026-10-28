/**
 * Phase 7 — Task minigame overlay.
 * One component per task type; selected by taskId prop.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { TASK_DEFS } from '@workspace/shared/tasks';
import { useLanguage } from '../lib/language';

interface Props {
  taskId: number;
  stepIndex: number;
  onComplete: () => void;
  onClose: () => void;
}

// ── Shared panel styles ────────────────────────────────────────────────────────

const TASK_NAME_RU: Record<string, string> = {
  'Fix Wiring': 'Починить проводку',
  'Download Data': 'Скачать данные',
  'Calibrate Distributor': 'Настроить распределитель',
  'Empty Garbage': 'Вынести мусор',
  'Clean Filters': 'Почистить фильтры',
  'Stabilize Navigation': 'Стабилизировать навигацию',
  'Reboot WiFi': 'Перезапустить связь',
  'Fuel Engine': 'Заправить двигатель',
  'Start Reactor': 'Запустить реактор',
  'Align Engine': 'Выровнять двигатель',
  'Clear Asteroids': 'Уничтожить астероиды',
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(10,18,34,0.98)',
  border: '1px solid rgba(100,150,200,0.25)',
  borderRadius: 16,
  padding: '20px 20px 28px',
  width: 'min(360px, 94vw)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif',
  letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4,
};

const helpStyle: React.CSSProperties = {
  fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif',
  textAlign: 'center', marginTop: 10,
};

// ── Fix Wiring ─────────────────────────────────────────────────────────────────
// Match 4 coloured wires from the left column to the right column.

const WIRE_COLORS = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'];
const WIRE_LABELS = ['Red', 'Yellow', 'Green', 'Blue'];
const WIRE_LABELS_RU = ['Красный', 'Жёлтый', 'Зелёный', 'Синий'];
// Right-column permutation per step (index → left-side color index)
const WIRE_RIGHT: [number, number, number, number][] = [
  [2, 0, 3, 1], // step 0: Green, Red, Blue, Yellow
  [3, 1, 0, 2], // step 1: Blue, Yellow, Red, Green
];

function WiringGame({ stepIndex, onComplete }: { stepIndex: number; onComplete: () => void }) {
  const { language } = useLanguage();
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [connections, setConnections] = useState<Map<number, number>>(new Map());
  const rightOrder = WIRE_RIGHT[stepIndex % WIRE_RIGHT.length];

  const handleLeft = (i: number) => {
    if (connections.has(i)) return;
    setSelectedLeft(prev => (prev === i ? null : i));
  };

  const handleRight = (rightIdx: number) => {
    if (selectedLeft === null) return;
    if (Array.from(connections.values()).includes(rightIdx)) return;
    if (WIRE_COLORS[rightOrder[rightIdx]] !== WIRE_COLORS[selectedLeft]) {
      setSelectedLeft(null); // wrong colour — deselect
      return;
    }
    const next = new Map(connections);
    next.set(selectedLeft, rightIdx);
    setConnections(next);
    setSelectedLeft(null);
    if (next.size === 4) setTimeout(onComplete, 350);
  };

  const GAP = 52;
  const TOP = 20;
  const svgH = TOP * 2 + GAP * 3;

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP - 40}px` }}>
        {WIRE_COLORS.map((color, i) => {
          const connected = connections.has(i);
          const selected = selectedLeft === i;
          return (
            <button
              key={i}
              onClick={() => handleLeft(i)}
              disabled={connected}
              aria-label={(language === 'en' ? WIRE_LABELS : WIRE_LABELS_RU)[i]}
              style={{
                width: 56, height: 40, borderRadius: 8,
                background: connected ? 'rgba(60,60,60,0.5)' : color,
                border: selected ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                opacity: connected ? 0.35 : 1,
                cursor: connected ? 'default' : 'pointer',
                transition: 'all 0.12s',
              }}
            />
          );
        })}
      </div>

      {/* Connector SVG */}
      <svg width={72} height={svgH} style={{ flex: '0 0 72px', overflow: 'visible' }}>
        {Array.from(connections.entries()).map(([leftIdx, rightIdx]) => {
          const ly = TOP + leftIdx * GAP;
          const ry = TOP + rightIdx * GAP;
          return (
            <path key={leftIdx}
              d={`M8,${ly} C36,${ly} 36,${ry} 64,${ry}`}
              stroke={WIRE_COLORS[leftIdx]} strokeWidth={3} fill="none" strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP - 40}px` }}>
        {rightOrder.map((colorIdx, rightIdx) => {
          const connected = Array.from(connections.values()).includes(rightIdx);
          return (
            <button
              key={rightIdx}
              onClick={() => handleRight(rightIdx)}
              disabled={connected}
              aria-label={(language === 'en' ? WIRE_LABELS : WIRE_LABELS_RU)[colorIdx]}
              style={{
                width: 56, height: 40, borderRadius: 8,
                background: connected ? 'rgba(60,60,60,0.5)' : WIRE_COLORS[colorIdx],
                border: '2px solid rgba(255,255,255,0.15)',
                opacity: connected ? 0.35 : 1,
                cursor: connected ? 'default' : 'pointer',
                transition: 'all 0.12s',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Download Data ──────────────────────────────────────────────────────────────
// Press Download, then wait 3 seconds for the bar to fill.

function DownloadGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
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

const CALIBRATE_TARGETS = [
  { start: 55, end: 95 },   // step 0
  { start: 195, end: 245 }, // step 1
];
const NEEDLE_DEG_PER_SEC = 110;

function CalibrateGame({ stepIndex, onComplete }: { stepIndex: number; onComplete: () => void }) {
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

function GarbageGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
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

const FILTER_DIRTY_SETS: number[][] = [
  [1, 5, 7, 10, 13], // step 0
  [0, 3, 8, 11, 14], // step 1
];

function FiltersGame({ stepIndex, onComplete }: { stepIndex: number; onComplete: () => void }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const initDirty = FILTER_DIRTY_SETS[stepIndex % FILTER_DIRTY_SETS.length];
  const [dirty, setDirty] = useState(() => new Set(initDirty));

  const tap = (i: number) => {
    if (!dirty.has(i)) return;
    const next = new Set(dirty);
    next.delete(i);
    setDirty(next);
    if (next.size === 0) setTimeout(onComplete, 280);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
        {Array.from({ length: 16 }, (_, i) => (
          <button
            key={i}
            onClick={() => tap(i)}
            style={{
              width: 52, height: 52, borderRadius: 8, fontSize: 20,
              background: dirty.has(i) ? 'rgba(160,80,15,0.85)' : 'rgba(35,140,70,0.6)',
              border: dirty.has(i) ? '2px solid rgba(210,130,30,0.55)' : '2px solid rgba(50,190,90,0.4)',
              cursor: dirty.has(i) ? 'pointer' : 'default',
              transition: 'all 0.12s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label={dirty.has(i) ? (en ? 'Dirty filter — tap to clean' : 'Грязный фильтр — нажмите, чтобы очистить') : (en ? 'Clean filter' : 'Чистый фильтр')}
          >
            {dirty.has(i) ? '🟫' : '✓'}
          </button>
        ))}
      </div>
      <p style={helpStyle}>{en ? `${dirty.size} filter${dirty.size !== 1 ? 's' : ''} remaining` : `Осталось фильтров: ${dirty.size}`}</p>
    </div>
  );
}

// ── Stabilize Navigation ──────────────────────────────────────────────────────
// Drag the marker onto the target and keep it there for 2.5 seconds.

function StabilizeNavigationGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
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
            transform: 'translate(-50%,-50%)', width: 42, height: 42, borderRadius: '50%',
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

function RebootWifiGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
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
              width: 83, height: 44, borderRadius: 9, border: '2px solid #b5f5ff',
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

function AlignEngineGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
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

function FuelGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
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

const REACTOR_COLORS = ['#f05d65', '#edb84a', '#58c8f5', '#57d88d', '#b879ed', '#f47ec5'];

function ReactorGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
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

interface AsteroidTarget {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}
interface AsteroidBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
const ASTEROID_TARGET = 30;
const ASTEROID_ACTIVE = 10;
const ASTEROID_FIRE_RATE_MS = 300;
const ASTEROID_BULLET_SPEED = 0.82; // normalized board widths/height per second, direction adjusted for aspect ratio

function createAsteroid(id: number): AsteroidTarget {
  const x = 0.07 + ((id * 37) % 85) / 100;
  const y = 0.06 + ((id * 23) % 52) / 100;
  const vx = (((id * 17) % 5) - 2) * 0.012;
  const vy = 0.022 + ((id * 11) % 5) * 0.008;
  return { id, x, y, vx, vy, size: 0.036 + (id % 3) * 0.004 };
}

function AsteroidsGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const boardRef = useRef<HTMLDivElement>(null);
  const asteroidsRef = useRef<AsteroidTarget[]>(Array.from({ length: ASTEROID_ACTIVE }, (_, i) => createAsteroid(i + 1)));
  const bulletsRef = useRef<AsteroidBullet[]>([]);
  const nextAsteroidIdRef = useRef(ASTEROID_ACTIVE + 1);
  const nextBulletIdRef = useRef(1);
  const destroyedRef = useRef(0);
  const firingRef = useRef(false);
  const aimRef = useRef({ x: 0.5, y: 0.25 });
  const lastFireAtRef = useRef(0);
  const doneRef = useRef(false);
  const completeRef = useRef(onComplete);
  const [destroyed, setDestroyed] = useState(0);
  const [firing, setFiring] = useState(false);
  const [, setRenderTick] = useState(0);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);

  const fireAt = (aim: { x: number; y: number }) => {
    const board = boardRef.current;
    if (!board || doneRef.current) return;
    const width = Math.max(1, board.clientWidth);
    const height = Math.max(1, board.clientHeight);
    const startX = 0.5;
    const startY = 0.88;
    const dxPx = (aim.x - startX) * width;
    const dyPx = (aim.y - startY) * height;
    const length = Math.hypot(dxPx, dyPx) || 1;
    const speedPx = Math.max(width, height) * ASTEROID_BULLET_SPEED;
    bulletsRef.current = [...bulletsRef.current, {
      id: nextBulletIdRef.current++,
      x: startX,
      y: startY,
      vx: (dxPx / length * speedPx) / width,
      vy: (dyPx / length * speedPx) / height,
    }];
    lastFireAtRef.current = performance.now();
  };

  const updateAim = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    aimRef.current = {
      x: Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width)),
      y: Math.max(0.02, Math.min(0.92, (clientY - rect.top) / rect.height)),
    };
  };

  useEffect(() => {
    let lastTime = performance.now();
    const interval = setInterval(() => {
      const board = boardRef.current;
      if (!board || doneRef.current) return;
      const width = Math.max(1, board.clientWidth);
      const height = Math.max(1, board.clientHeight);
      const now = performance.now();
      const dt = Math.min(0.06, (now - lastTime) / 1000);
      lastTime = now;

      if (firingRef.current && now - lastFireAtRef.current >= ASTEROID_FIRE_RATE_MS) {
        fireAt(aimRef.current);
      }

      const bullets = bulletsRef.current.map(b => ({
        ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt,
      })).filter(b => b.x > -0.05 && b.x < 1.05 && b.y > -0.1 && b.y < 1.1);

      const asteroids = asteroidsRef.current.map(a => {
        let x = a.x + a.vx * dt;
        let y = a.y + a.vy * dt;
        if (x < 0.04 || x > 0.96) return { ...a, x: Math.max(0.04, Math.min(0.96, x)), y, vx: -a.vx };
        if (y > 0.77) return { ...a, x: 0.07 + ((a.id * 29) % 85) / 100, y: 0.03, vx: -a.vx };
        return { ...a, x, y };
      });

      const hitAsteroids = new Set<number>();
      const spentBullets = new Set<number>();
      for (const bullet of bullets) {
        for (const asteroid of asteroids) {
          if (hitAsteroids.has(asteroid.id)) continue;
          const dx = (bullet.x - asteroid.x) * width;
          const dy = (bullet.y - asteroid.y) * height;
          if (Math.hypot(dx, dy) <= asteroid.size * width + 3) {
            hitAsteroids.add(asteroid.id);
            spentBullets.add(bullet.id);
            break;
          }
        }
      }

      let nextDestroyed = destroyedRef.current + hitAsteroids.size;
      nextDestroyed = Math.min(ASTEROID_TARGET, nextDestroyed);
      let remaining = asteroids.filter(a => !hitAsteroids.has(a.id));
      const activeTargetCount = Math.min(ASTEROID_ACTIVE, ASTEROID_TARGET - nextDestroyed);
      while (remaining.length < activeTargetCount) remaining.push(createAsteroid(nextAsteroidIdRef.current++));

      bulletsRef.current = bullets.filter(b => !spentBullets.has(b.id));
      asteroidsRef.current = remaining;
      if (nextDestroyed !== destroyedRef.current) {
        destroyedRef.current = nextDestroyed;
        setDestroyed(nextDestroyed);
      }
      setRenderTick(tick => tick + 1);

      if (nextDestroyed >= ASTEROID_TARGET && !doneRef.current) {
        doneRef.current = true;
        firingRef.current = false;
        setFiring(false);
        setTimeout(() => completeRef.current(), 350);
      }
    }, 33);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <div
        ref={boardRef}
        onPointerDown={event => {
          if (doneRef.current) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          updateAim(event.clientX, event.clientY);
          firingRef.current = true;
          setFiring(true);
          fireAt(aimRef.current);
        }}
        onPointerMove={event => {
          updateAim(event.clientX, event.clientY);
        }}
        onPointerUp={() => { firingRef.current = false; setFiring(false); }}
        onPointerCancel={() => { firingRef.current = false; setFiring(false); }}
        onLostPointerCapture={() => { firingRef.current = false; setFiring(false); }}
        role="application"
        aria-label={en ? 'Aim and shoot moving asteroids' : 'Прицеливайтесь и стреляйте по астероидам'}
        style={{
          position: 'relative', width: 'min(300px,82vw)', height: 220, overflow: 'hidden', borderRadius: 12,
          background: 'radial-gradient(ellipse at 50% 35%,#1a3555,#080d19 75%)',
          border: '1px solid rgba(120,180,220,0.28)', touchAction: 'none', cursor: 'crosshair',
        }}
      >
        {Array.from({ length: 36 }, (_, i) => (
          <span key={i} style={{ position: 'absolute', left: `${(i * 31 + 7) % 99}%`, top: `${(i * 47 + 11) % 98}%`,
            width: i % 4 === 0 ? 2 : 1, height: i % 4 === 0 ? 2 : 1, borderRadius: '50%',
            background: 'rgba(220,240,255,0.7)', pointerEvents: 'none' }} />
        ))}
        {asteroidsRef.current.map(asteroid => (
          <div key={asteroid.id} style={{
            position: 'absolute', left: `${asteroid.x * 100}%`, top: `${asteroid.y * 100}%`,
            width: `${asteroid.size * 100}%`, aspectRatio: '1', display: 'grid', placeItems: 'center',
            borderRadius: '37% 54% 44% 57%', transform: `rotate(${asteroid.id * 29 % 360}deg)`,
            background: 'linear-gradient(135deg,#9caab8,#465566)', border: '1px solid rgba(255,255,255,0.35)',
            color: '#d6e3ef', fontSize: 18, boxShadow: 'inset -4px -5px 0 rgba(0,0,0,0.25)', pointerEvents: 'none',
          }}>✦</div>
        ))}
        {bulletsRef.current.map(bullet => (
          <span key={bullet.id} style={{
            position: 'absolute', left: `${bullet.x * 100}%`, top: `${bullet.y * 100}%`,
            transform: 'translate(-50%,-50%)', width: 4, height: 12, borderRadius: 4,
            background: '#8fffff', boxShadow: '0 0 7px #72fbff', pointerEvents: 'none',
          }} />
        ))}
        <div style={{ position: 'absolute', left: '50%', bottom: 5, transform: 'translateX(-50%)',
          fontSize: 25, filter: 'drop-shadow(0 0 5px rgba(80,190,255,0.4))', pointerEvents: 'none' }}>🚀</div>
        <div style={{ position: 'absolute', left: 8, top: 8, padding: '4px 7px', borderRadius: 5,
          background: 'rgba(0,0,0,0.6)', color: '#ffef93', fontFamily: 'monospace', fontSize: 12, pointerEvents: 'none' }}>
          TARGETS {destroyed}/{ASTEROID_TARGET}
        </div>
        {firing && <div style={{
          position: 'absolute', left: 'calc(50% - 2px)', bottom: 36, width: 4, height: 20,
          background: 'linear-gradient(180deg,rgba(130,255,255,0),#72fbff)',
          filter: 'drop-shadow(0 0 5px #72fbff)', pointerEvents: 'none',
        }} />}
      </div>
      <div style={{ width: 'min(280px,80vw)', height: 7, borderRadius: 9, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ width: `${destroyed / ASTEROID_TARGET * 100}%`, height: '100%', background: 'linear-gradient(90deg,#54baff,#8fffd7)', transition: 'width 150ms linear' }} />
      </div>
      <p style={helpStyle}>{destroyed < ASTEROID_TARGET ? (firing ? (en ? 'Fire! Move the reticle to aim' : 'Огонь! Двигайте прицел, чтобы попасть') : (en ? 'Tap or hold the field to shoot asteroids' : 'Нажмите или удерживайте поле, чтобы стрелять по астероидам')) : (en ? '✓ Asteroids destroyed' : '✓ Астероиды уничтожены')}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TaskMinigame({ taskId, stepIndex, onComplete, onClose }: Props) {
  const { language } = useLanguage();
  const en = language === 'en';
  const def = TASK_DEFS[taskId];
  if (!def) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,8,16,0.93)', backdropFilter: 'blur(4px)',
      padding: 16,
    }}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={labelStyle}>{en ? `Step ${stepIndex + 1} of ${def.steps}` : `Шаг ${stepIndex + 1} из ${def.steps}`}</div>
            <div style={{ fontSize: 16, color: '#e8f0ff', fontFamily: 'sans-serif', fontWeight: 700 }}>
              {en ? def.name : (TASK_NAME_RU[def.name] ?? def.name)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={en ? 'Close' : 'Закрыть'}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: 'sans-serif', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Minigame body */}
        {taskId === 0 && <WiringGame                 key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 1 && <DownloadGame               key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 2 && <CalibrateGame              key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 3 && <GarbageGame                key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 4 && <FiltersGame                key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 5 && <StabilizeNavigationGame    key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 6 && <RebootWifiGame             key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 7 && <FuelGame                   key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 8 && <ReactorGame                key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 9 && <AlignEngineGame             key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 10 && <AsteroidsGame             key={stepIndex} stepIndex={stepIndex} onComplete={onComplete} />}
      </div>
    </div>
  );
}
