import { useState } from "react";
import { useLanguage } from "../../lib/language";
import type { MinigameProps } from "./shared";

const WIRE_COLORS = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'];
const WIRE_LABELS = ['Red', 'Yellow', 'Green', 'Blue'];
const WIRE_LABELS_RU = ['Красный', 'Жёлтый', 'Зелёный', 'Синий'];
// Right-column permutation per step (index → left-side color index)
const WIRE_RIGHT: [number, number, number, number][] = [
  [2, 0, 3, 1], // step 0: Green, Red, Blue, Yellow
  [3, 1, 0, 2], // step 1: Blue, Yellow, Red, Green
];

export function WiringGame({ stepIndex, onComplete }: MinigameProps) {
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
                width: 56, height: 48, borderRadius: 8,
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
                width: 56, height: 48, borderRadius: 8,
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

