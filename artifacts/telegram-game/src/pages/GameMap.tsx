import { useRef, useEffect, useState } from 'react';
import {
  buildCollisionGrid,
  COLS, ROWS, CELL,
  MAP_W, MAP_H,
  ZONES,
} from '../game/collisionMap';

export default function GameMap() {
  const mapCanvasRef     = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded]               = useState(false);
  const [error, setError]                 = useState(false);
  const [showCollision, setShowCollision] = useState(true);
  const [hoverZone, setHoverZone]         = useState<string | null>(null);

  // ── Load map image ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
      setLoaded(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      setError(true);
    };
    img.src = new URL('@assets/IMG_2898_1783586696260.jpeg', import.meta.url).href;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, MAP_W, MAP_H);
      setLoaded(true);
    }
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, []);

  // ── Draw / clear collision overlay ────────────────────────────────────────
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MAP_W, MAP_H);
    if (!showCollision) return;

    const grid = buildCollisionGrid();

    // Draw blocked cells
    ctx.fillStyle = 'rgba(255, 50, 50, 0.42)';
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (grid[row * COLS + col] === 1) {
          ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
        }
      }
    }

    // Draw walkable cells (subtle green tint)
    ctx.fillStyle = 'rgba(60, 220, 120, 0.12)';
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (grid[row * COLS + col] === 0) {
          ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    for (let row = 0; row <= ROWS; row++) {
      ctx.beginPath();
      ctx.moveTo(0,      row * CELL);
      ctx.lineTo(MAP_W,  row * CELL);
      ctx.stroke();
    }
    for (let col = 0; col <= COLS; col++) {
      ctx.beginPath();
      ctx.moveTo(col * CELL, 0);
      ctx.lineTo(col * CELL, MAP_H);
      ctx.stroke();
    }

    // Draw zone outlines with labels
    ctx.font        = 'bold 9px monospace';
    ctx.textBaseline = 'top';
    for (const zone of ZONES) {
      ctx.strokeStyle = 'rgba(120, 220, 255, 0.6)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(zone.px, zone.py, zone.pw, zone.ph);

      ctx.fillStyle = 'rgba(120, 220, 255, 0.85)';
      ctx.fillText(zone.label, zone.px + 3, zone.py + 3);
    }
  }, [showCollision]);

  // ── Keyboard shortcut 'C' to toggle collision overlay ─────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        setShowCollision(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Track mouse to show zone name on hover ────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showCollision) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const found = ZONES.find(
      z => mx >= z.px && mx < z.px + z.pw && my >= z.py && my < z.py + z.ph,
    );
    setHoverZone(found?.label ?? null);
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#3d4e5e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {/* ── Canvas container ─────────────────────────────────────────────── */}
      <div
        style={{ position: 'relative', width: MAP_W, height: MAP_H }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverZone(null)}
      >
        {/* Loading state */}
        {!loaded && !error && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8faabb', fontFamily: 'monospace', fontSize: 14,
          }}>
            Loading map…
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#cc4444', fontFamily: 'monospace', fontSize: 14,
          }}>
            Failed to load map.
          </div>
        )}

        {/* Map image layer */}
        <canvas
          ref={mapCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
        />

        {/* Overlay: collision debug + future game entities */}
        <canvas
          ref={overlayCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{
            display: 'block', position: 'absolute', top: 0, left: 0,
            opacity: loaded ? 1 : 0,
          }}
        />
      </div>

      {/* ── Debug controls (fixed to viewport) ───────────────────────────── */}
      {loaded && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 6,
        }}>
          {/* Hover zone label */}
          {showCollision && hoverZone && (
            <div style={{
              padding: '3px 8px',
              background: 'rgba(20, 32, 44, 0.9)',
              color: '#78d4ff',
              fontFamily: 'monospace',
              fontSize: 11,
              borderRadius: 4,
              border: '1px solid rgba(120,200,255,0.3)',
            }}>
              {hoverZone}
            </div>
          )}

          {/* Toggle button */}
          <button
            onClick={() => setShowCollision(prev => !prev)}
            style={{
              padding: '6px 14px',
              background: showCollision ? 'rgba(200, 50, 50, 0.85)' : 'rgba(20, 32, 44, 0.85)',
              color: showCollision ? '#ffcccc' : '#8ab8cc',
              border: `1px solid ${showCollision ? 'rgba(255,100,100,0.4)' : 'rgba(100,160,200,0.3)'}`,
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 12,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              letterSpacing: '0.03em',
            }}
          >
            {showCollision ? '■ Hide Collision [C]' : '□ Show Collision [C]'}
          </button>
        </div>
      )}
    </div>
  );
}
