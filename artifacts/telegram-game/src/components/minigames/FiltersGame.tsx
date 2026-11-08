import { useState } from "react";
import { useLanguage } from "../../lib/language";
import { helpStyle, type MinigameProps } from "./shared";

const FILTER_DIRTY_SETS: number[][] = [
  [1, 5, 7, 10, 13], // step 0
  [0, 3, 8, 11, 14], // step 1
];


export function FiltersGame({ stepIndex, onComplete }: MinigameProps) {
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

