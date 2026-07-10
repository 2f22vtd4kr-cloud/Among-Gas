/**
 * Phase 7 — Task minigame overlay.
 * One component per task type; selected by taskId prop.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { TASK_DEFS } from '@workspace/shared/tasks';

interface Props {
  taskId: number;
  stepIndex: number;
  onComplete: () => void;
  onClose: () => void;
}

// ── Shared panel styles ────────────────────────────────────────────────────────

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
// Right-column permutation per step (index → left-side color index)
const WIRE_RIGHT: [number, number, number, number][] = [
  [2, 0, 3, 1], // step 0: Green, Red, Blue, Yellow
  [3, 1, 0, 2], // step 1: Blue, Yellow, Red, Green
];

function WiringGame({ stepIndex, onComplete }: { stepIndex: number; onComplete: () => void }) {
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
              aria-label={WIRE_LABELS[i]}
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
              aria-label={WIRE_LABELS[colorIdx]}
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
        {progress >= 100 ? 'Complete!' : started ? `${Math.round(progress)}%` : 'Ready'}
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
          ⬇ Download
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
        aria-label="Tap when needle is in green zone"
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
        {status === 'hit' ? '✓ Calibrated!' : status === 'miss' ? 'Missed — try again' : 'Tap when needle hits the green arc'}
      </p>
    </div>
  );
}

// ── Empty Garbage ─────────────────────────────────────────────────────────────
// Press and hold for 2 seconds.

const HOLD_MS = 2000;

function GarbageGame({ onComplete }: { stepIndex: number; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!holding) { setProgress(0); startRef.current = null; return; }
    startRef.current = performance.now();
    const id = setInterval(() => {
      if (!startRef.current) return;
      const p = Math.min(100, ((performance.now() - startRef.current) / HOLD_MS) * 100);
      setProgress(p);
      if (p >= 100 && !doneRef.current) { doneRef.current = true; onComplete(); }
    }, 40);
    return () => clearInterval(id);
  }, [holding, onComplete]);

  const r = 44;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 0' }}>
      <div style={{ position: 'relative', width: 112, height: 112 }}>
        <svg width={112} height={112} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={56} cy={56} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
          <circle cx={56} cy={56} r={r} fill="none"
            stroke="rgba(46,204,113,0.9)" strokeWidth={8}
            strokeDasharray={`${(progress / 100) * circ} ${circ}`}
            strokeLinecap="round" transform="rotate(-90 56 56)" />
        </svg>
        <button
          onPointerDown={() => setHolding(true)}
          onPointerUp={() => setHolding(false)}
          onPointerLeave={() => setHolding(false)}
          style={{
            position: 'absolute', inset: 14, borderRadius: '50%',
            background: holding ? 'rgba(46,204,113,0.3)' : 'rgba(70,70,70,0.6)',
            border: `2px solid ${holding ? 'rgba(46,204,113,0.5)' : 'rgba(255,255,255,0.12)'}`,
            cursor: 'pointer', fontSize: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.1s, border 0.1s',
            touchAction: 'none',
          }}
          aria-label="Press and hold to empty garbage"
        >
          🗑
        </button>
      </div>
      <p style={helpStyle}>{holding ? 'Hold...' : 'Press and hold'}</p>
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
            aria-label={dirty.has(i) ? 'Dirty filter — tap to clean' : 'Clean filter'}
          >
            {dirty.has(i) ? '🟫' : '✓'}
          </button>
        ))}
      </div>
      <p style={helpStyle}>{dirty.size} filter{dirty.size !== 1 ? 's' : ''} remaining</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TaskMinigame({ taskId, stepIndex, onComplete, onClose }: Props) {
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
            <div style={labelStyle}>Step {stepIndex + 1} of {def.steps}</div>
            <div style={{ fontSize: 16, color: '#e8f0ff', fontFamily: 'sans-serif', fontWeight: 700 }}>
              {def.name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
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
        {taskId === 0 && <WiringGame      stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 1 && <DownloadGame    stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 2 && <CalibrateGame   stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 3 && <GarbageGame     stepIndex={stepIndex} onComplete={onComplete} />}
        {taskId === 4 && <FiltersGame     stepIndex={stepIndex} onComplete={onComplete} />}
      </div>
    </div>
  );
}
