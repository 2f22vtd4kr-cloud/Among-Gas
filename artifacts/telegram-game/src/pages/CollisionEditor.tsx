import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import {
  buildCollisionGrid,
  COLS, ROWS, CELL_X, CELL_Y,
  MAP_W, MAP_H,
} from '../game/collisionMap';

// ─────────────────────────────────────────────────────────────────────────────
// In-browser collision editor.
//
// A standalone dev tool (not part of the game camera/loop) for manually
// painting collision cells on/off and persisting the result. "Commit"
// POSTs the edited grid to a Vite dev-server-only endpoint (see
// vite.config.ts) that rewrites `game/collisionData.ts` on disk — the same
// file the game reads at load time. This only works while the dev server is
// running (`import.meta.env.DEV`); it has no effect on a published static
// build, since there is no server to write to.
// ─────────────────────────────────────────────────────────────────────────────

type Tool = 'pan' | 'add' | 'remove';

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;
const MAX_HISTORY = 30;

export default function CollisionEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapImgRef = useRef<HTMLImageElement | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Mutable working copy of the grid — cloned so the shared game module's
  // cached grid (from buildCollisionGrid) is never mutated in place.
  const gridRef = useRef<Uint8Array>(Uint8Array.from(buildCollisionGrid()));
  // Last known-saved-to-disk state. Dirty is computed by diffing against this
  // (not by history-stack length, which goes stale once the stack is
  // truncated at MAX_HISTORY and would under-report unsaved edits).
  const savedGridRef = useRef<Uint8Array>(Uint8Array.from(gridRef.current));
  const historyRef = useRef<Uint8Array[]>([]);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const arraysEqual = (a: Uint8Array, b: Uint8Array) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const refreshDirty = useCallback(() => {
    setDirty(!arraysEqual(gridRef.current, savedGridRef.current));
  }, []);

  const [tool, setTool] = useState<Tool>('add');
  const toolRef = useRef<Tool>('add');
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Camera: originX/Y = top-left map pixel visible; zoom = CSS px per map px.
  const originRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(0.3);
  const [zoomDisplay, setZoomDisplay] = useState(0.3);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const isDev = import.meta.env.DEV;

  // ── Load map image ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) { mapImgRef.current = img; setMapLoaded(true); } };
    img.onerror = () => { if (!cancelled) setMapError(true); };
    img.src = `${import.meta.env.BASE_URL}map-hires.png`;
    if (img.complete && img.naturalWidth > 0) { mapImgRef.current = img; setMapLoaded(true); }
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, []);

  // ── Resize canvas buffer to its container ─────────────────────────────────
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, [dpr]);

  // ── Draw ────────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const mapImg = mapImgRef.current;
    if (!canvas || !mapImg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const zoom = zoomRef.current;
    const scale = zoom * dpr;
    const srcW = (cw / dpr) / zoom;
    const srcH = (ch / dpr) / zoom;
    const { x: originX, y: originY } = originRef.current;

    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mapImg, originX, originY, srcW, srcH, 0, 0, cw, ch);

    const grid = gridRef.current;
    const colStart = Math.max(0, Math.floor(originX / CELL_X));
    const colEnd = Math.min(COLS - 1, Math.ceil((originX + srcW) / CELL_X));
    const rowStart = Math.max(0, Math.floor(originY / CELL_Y));
    const rowEnd = Math.min(ROWS - 1, Math.ceil((originY + srcH) / CELL_Y));

    const cellW = CELL_X * scale;
    const cellH = CELL_Y * scale;
    // Draw a smaller centered marker per cell (matches the in-game debug
    // overlay) so the underlying map art stays legible while painting.
    const mW = cellW * 0.6;
    const mH = cellH * 0.6;
    const mOX = (cellW - mW) / 2;
    const mOY = (cellH - mH) / 2;

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const cx = (col * CELL_X - originX) * scale;
        const cy = (row * CELL_Y - originY) * scale;
        const blocked = grid[row * COLS + col] === 1;
        ctx.fillStyle = blocked ? 'rgba(255,50,50,0.6)' : 'rgba(60,220,120,0.18)';
        ctx.fillRect(cx + mOX, cy + mOY, mW, mH);
      }
    }

    // Grid lines — only draw once cells are large enough to be legible.
    if (cellW > 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      for (let row = rowStart; row <= rowEnd + 1; row++) {
        const cy = (row * CELL_Y - originY) * scale;
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cw, cy); ctx.stroke();
      }
      for (let col = colStart; col <= colEnd + 1; col++) {
        const cx = (col * CELL_X - originX) * scale;
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, ch); ctx.stroke();
      }
    }
  }, [dpr]);

  useEffect(() => {
    sizeCanvas();
    draw();
    const onResize = () => { sizeCanvas(); draw(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sizeCanvas, draw]);

  // Fit the whole map into view once it's loaded.
  useEffect(() => {
    if (!mapLoaded) return;
    sizeCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const fitZoom = Math.min(cssW / MAP_W, cssH / MAP_H) * 0.95;
    zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
    setZoomDisplay(zoomRef.current);
    originRef.current = {
      x: Math.max(0, (MAP_W - cssW / zoomRef.current) / 2),
      y: Math.max(0, (MAP_H - cssH / zoomRef.current) / 2),
    };
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  // ── Clamp origin so panning can't leave the map ───────────────────────────
  const clampOrigin = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x, y };
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const srcW = cssW / zoomRef.current;
    const srcH = cssH / zoomRef.current;
    const maxX = Math.max(0, MAP_W - srcW);
    const maxY = Math.max(0, MAP_H - srcH);
    return {
      x: Math.min(maxX, Math.max(0, x)),
      y: Math.min(maxY, Math.max(0, y)),
    };
  }, [dpr]);

  // ── Zoom controls (keep viewport center fixed) ────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const oldZoom = zoomRef.current;
    const centerMapX = originRef.current.x + (cssW / 2) / oldZoom;
    const centerMapY = originRef.current.y + (cssH / 2) / oldZoom;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));
    zoomRef.current = newZoom;
    setZoomDisplay(newZoom);
    originRef.current = clampOrigin(
      centerMapX - (cssW / 2) / newZoom,
      centerMapY - (cssH / 2) / newZoom,
    );
    draw();
  }, [dpr, clampOrigin, draw]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  // ── Cell painting helpers ─────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    const hist = historyRef.current;
    hist.push(Uint8Array.from(gridRef.current));
    if (hist.length > MAX_HISTORY) hist.shift();
    setCanUndo(true);
  }, []);

  const setCell = useCallback((col: number, row: number, value: 0 | 1) => {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    gridRef.current[row * COLS + col] = value;
  }, []);

  /** Paint a straight line of cells between two grid coords (avoids gaps on fast drags). */
  const paintLine = useCallback((c0: number, r0: number, c1: number, r1: number, value: 0 | 1) => {
    const dx = Math.abs(c1 - c0);
    const dy = Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1;
    const sy = r0 < r1 ? 1 : -1;
    let err = dx - dy;
    let c = c0, r = r0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      setCell(c, r, value);
      if (c === c1 && r === r1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; c += sx; }
      if (e2 < dx) { err += dx; r += sy; }
    }
  }, [setCell]);

  const mapPointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    return {
      mapX: originRef.current.x + cssX / zoomRef.current,
      mapY: originRef.current.y + cssY / zoomRef.current,
    };
  }, []);

  // ── Pointer interaction: pan or paint depending on tool ───────────────────
  const dragRef = useRef<{
    mode: 'pan' | 'paint';
    lastClientX: number; lastClientY: number;
    lastCol: number; lastRow: number;
    paintValue: 0 | 1;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const currentTool = toolRef.current;
    if (currentTool === 'pan') {
      dragRef.current = {
        mode: 'pan',
        lastClientX: e.clientX, lastClientY: e.clientY,
        lastCol: 0, lastRow: 0, paintValue: 0,
      };
      return;
    }
    const { mapX, mapY } = mapPointFromEvent(e);
    const col = Math.floor(mapX / CELL_X);
    const row = Math.floor(mapY / CELL_Y);
    const value: 0 | 1 = currentTool === 'add' ? 1 : 0;
    pushHistory();
    setCell(col, row, value);
    refreshDirty();
    draw();
    dragRef.current = {
      mode: 'paint',
      lastClientX: e.clientX, lastClientY: e.clientY,
      lastCol: col, lastRow: row, paintValue: value,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'pan') {
      const dx = (e.clientX - drag.lastClientX) / zoomRef.current;
      const dy = (e.clientY - drag.lastClientY) / zoomRef.current;
      originRef.current = clampOrigin(originRef.current.x - dx, originRef.current.y - dy);
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
      draw();
      return;
    }
    const { mapX, mapY } = mapPointFromEvent(e);
    const col = Math.floor(mapX / CELL_X);
    const row = Math.floor(mapY / CELL_Y);
    if (col === drag.lastCol && row === drag.lastRow) return;
    paintLine(drag.lastCol, drag.lastRow, col, row, drag.paintValue);
    drag.lastCol = col;
    drag.lastRow = row;
    refreshDirty();
    draw();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  // ── Undo / reset / commit ──────────────────────────────────────────────────
  const undo = useCallback(() => {
    const hist = historyRef.current;
    const prev = hist.pop();
    if (!prev) return;
    gridRef.current = prev;
    setCanUndo(hist.length > 0);
    refreshDirty();
    draw();
  }, [draw, refreshDirty]);

  const reset = useCallback(() => {
    // "Discard changes" reverts to the last saved (or initially loaded) state,
    // not necessarily the module's cached grid — those can diverge once a
    // commit has happened without a page reload in between.
    gridRef.current = Uint8Array.from(savedGridRef.current);
    historyRef.current = [];
    setCanUndo(false);
    setDirty(false);
    setStatus(null);
    draw();
  }, [draw]);

  const commit = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}__collision-editor-api/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forces a CORS preflight for any cross-origin caller; since the
          // dev server never grants CORS, only same-origin requests succeed.
          'X-Collision-Editor': '1',
        },
        body: JSON.stringify({ cols: COLS, rows: ROWS, grid: Array.from(gridRef.current) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setStatus('Saved — reloading…');
      savedGridRef.current = Uint8Array.from(gridRef.current);
      historyRef.current = [];
      setCanUndo(false);
      setDirty(false);
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '1') setTool('pan');
      if (e.key === '2') setTool('add');
      if (e.key === '3') setTool('remove');
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo]);

  const zoomPct = useMemo(() => `${Math.round(zoomDisplay * 100)}%`, [zoomDisplay]);

  if (!isDev) {
    return (
      <div style={panelWrapStyle}>
        <div style={panelStyle}>
          <h1 style={{ margin: 0, fontSize: 16 }}>Collision editor unavailable</h1>
          <p style={{ color: '#8ab8cc', fontSize: 13, lineHeight: 1.5 }}>
            This tool commits edits by writing to the source file on disk, which only
            works against the Replit dev server — not a published build.
            Open this project in the Replit workspace to use it.
          </p>
          <Link href="/" style={linkStyle}>← Back to game</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#1a232c' }}>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={toolbarStyle}>
        <Link href="/" style={linkStyle}>← Back to game</Link>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.12)' }} />

        <span style={hudLabelStyle}>Tool</span>
        <ToolButton active={tool === 'pan'} onClick={() => setTool('pan')} color="#78a8cc">
          ✋ Pan [1]
        </ToolButton>
        <ToolButton active={tool === 'add'} onClick={() => setTool('add')} color="#ff5a5a">
          ▦ Add wall [2]
        </ToolButton>
        <ToolButton active={tool === 'remove'} onClick={() => setTool('remove')} color="#3cdc78">
          ▢ Clear [3]
        </ToolButton>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.12)' }} />

        <button style={btnStyle} onClick={() => zoomBy(1 / 1.25)}>−</button>
        <span style={{ ...hudLabelStyle, minWidth: 42, textAlign: 'center' }}>{zoomPct}</span>
        <button style={btnStyle} onClick={() => zoomBy(1.25)}>+</button>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.12)' }} />

        <button style={btnStyle} onClick={undo} disabled={!canUndo}>Undo ⌘Z</button>
        <button style={btnStyle} onClick={reset} disabled={!dirty}>Discard changes</button>

        <div style={{ flex: 1 }} />

        {status && <span style={{ ...hudLabelStyle, color: status.startsWith('Save failed') ? '#ff8080' : '#78d4ff' }}>{status}</span>}
        <button
          style={{
            ...btnStyle,
            background: dirty ? 'rgba(60,220,120,0.85)' : 'rgba(60,220,120,0.25)',
            color: dirty ? '#062b12' : '#6f9c82',
            fontWeight: 700,
            cursor: dirty && !saving ? 'pointer' : 'default',
          }}
          onClick={commit}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Commit changes'}
        </button>
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {!mapLoaded && !mapError && (
          <div style={centeredMsgStyle}>Loading map…</div>
        )}
        {mapError && (
          <div style={{ ...centeredMsgStyle, color: '#cc4444' }}>Failed to load map.</div>
        )}
        <canvas
          ref={canvasRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            display: 'block',
            width: '100%', height: '100%',
            cursor: tool === 'pan' ? 'grab' : 'crosshair',
            touchAction: 'none',
            opacity: mapLoaded ? 1 : 0,
          }}
        />
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div style={legendStyle}>
        <LegendSwatch color="rgba(255,50,50,0.85)" label="Blocked" />
        <LegendSwatch color="rgba(60,220,120,0.5)" label="Walkable" />
        <span style={{ color: '#5c7d90' }}>
          Drag with a paint tool selected to paint a swath · scroll/pinch to zoom · Commit writes straight to collisionData.ts
        </span>
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...btnStyle,
        background: active ? color : 'rgba(255,255,255,0.06)',
        color: active ? '#0a1218' : '#9fc4d8',
        borderColor: active ? color : 'rgba(100,160,200,0.3)',
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
    </button>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

// ── Shared inline styles ──────────────────────────────────────────────────────
const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px',
  background: 'rgba(20,32,44,0.95)',
  borderBottom: '1px solid rgba(100,160,200,0.25)',
  fontFamily: 'monospace', fontSize: 12,
  flexWrap: 'wrap',
};

const hudLabelStyle: React.CSSProperties = { color: '#8ab8cc', letterSpacing: '0.03em' };

const btnStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(255,255,255,0.06)',
  color: '#9fc4d8',
  border: '1px solid rgba(100,160,200,0.3)',
  borderRadius: 6, fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
  letterSpacing: '0.02em',
};

const linkStyle: React.CSSProperties = {
  color: '#78d4ff', textDecoration: 'none', fontFamily: 'monospace', fontSize: 12,
};

const legendStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16,
  padding: '6px 12px',
  background: 'rgba(20,32,44,0.95)',
  borderTop: '1px solid rgba(100,160,200,0.25)',
  fontFamily: 'monospace', fontSize: 11, color: '#8ab8cc',
};

const centeredMsgStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#8faabb', fontFamily: 'monospace', fontSize: 14, zIndex: 5,
};

const panelWrapStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#1a232c', fontFamily: 'monospace',
};

const panelStyle: React.CSSProperties = {
  maxWidth: 420, padding: 24, borderRadius: 10,
  background: 'rgba(20,32,44,0.95)', border: '1px solid rgba(100,160,200,0.3)',
  color: '#dfeef7', display: 'flex', flexDirection: 'column', gap: 12,
};
