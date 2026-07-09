import { useRef, useEffect, useState } from 'react';

export default function GameMap() {
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const MAP_W = 1040;
  const MAP_H = 580;

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

    // Handle already-cached image (complete before onload fires)
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
      }}
    >
      <div style={{ position: 'relative', width: MAP_W, height: MAP_H }}>
        {!loaded && !error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8faabb',
              fontFamily: 'monospace',
              fontSize: 14,
            }}
          >
            Loading map...
          </div>
        )}
        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cc4444',
              fontFamily: 'monospace',
              fontSize: 14,
            }}
          >
            Failed to load map.
          </div>
        )}
        <canvas
          ref={mapCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
        />
        {/* Overlay canvas: reserved for game entities (characters, items, etc.) */}
        <canvas
          ref={overlayCanvasRef}
          width={MAP_W}
          height={MAP_H}
          style={{
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: loaded ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}
