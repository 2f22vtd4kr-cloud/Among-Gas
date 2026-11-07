import { useEffect, useMemo, useState } from "react";
import { CollisionWorld, type CollisionShape } from "@workspace/shared/collision";

interface VectorVisionPreviewProps {
  shapes: readonly CollisionShape[];
  mapW: number;
  mapH: number;
  camera: { x: number; y: number; zoom: number };
}

export default function VectorVisionPreview({ shapes, mapW, mapH, camera }: VectorVisionPreviewProps) {
  const [observerX, setObserverX] = useState(Math.round(mapW / 2));
  const [observerY, setObserverY] = useState(Math.round(mapH / 2));
  const [radius, setRadius] = useState(420);
  const [mode, setMode] = useState<"sight" | "shadow">("sight");
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const world = useMemo(() => new CollisionWorld(shapes, mapW, mapH), [shapes, mapW, mapH]);

  useEffect(() => {
    const element = document.getElementById("vector-vision-preview-layer");
    if (!element) return;
    const measure = () => setViewport({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const polygon = useMemo(() => {
    if (![observerX, observerY, radius].every(Number.isFinite) || radius < 1) return "";
    const points: string[] = [];
    const samples = 180;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let low = 0, high = radius;
      const isClear = (distance: number) => mode === "shadow"
        ? world.isShadowLineOfSightClear(observerX, observerY, observerX + dx * distance, observerY + dy * distance)
        : world.isLineOfSightClear(observerX, observerY, observerX + dx * distance, observerY + dy * distance);
      if (isClear(high)) {
        low = high;
      } else {
        for (let step = 0; step < 11; step++) {
          const middle = (low + high) / 2;
          if (isClear(middle)) low = middle;
          else high = middle;
        }
      }
      const sx = ((observerX + dx * low - camera.x) * camera.zoom / viewport.width) * 1000;
      const sy = ((observerY + dy * low - camera.y) * camera.zoom / viewport.height) * 1000;
      points.push(sx.toFixed(2) + "," + sy.toFixed(2));
    }
    return points.join(" ");
  }, [world, observerX, observerY, radius, mode, camera.x, camera.y, camera.zoom, viewport.width, viewport.height]);

  const observerScreenX = ((observerX - camera.x) * camera.zoom / viewport.width) * 1000;
  const observerScreenY = ((observerY - camera.y) * camera.zoom / viewport.height) * 1000;
  const fieldStyle = { width: 76, minHeight: 34, padding: "4px 6px", borderRadius: 5, border: "1px solid #526c7e", background: "#0d1720", color: "#fff", fontSize: 11 } as const;

  return (
    <div id="vector-vision-preview-layer" data-testid="vector-vision-preview" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3 }}>
      <div style={{ position: "absolute", top: 8, left: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, maxWidth: "calc(100% - 16px)", padding: 9, borderRadius: 8, border: "1px solid #526c7e", background: "rgba(13,24,34,.96)", color: "#e8f1f5", pointerEvents: "auto", font: "11px system-ui, sans-serif" }}>
        <strong>Vector {mode === "sight" ? "vision" : "shadow"} preview</strong>
        <button type="button" aria-pressed={mode === "sight"} onClick={() => setMode("sight")} style={{ minHeight: 34, padding: "4px 8px", borderRadius: 5, border: "1px solid #526c7e", background: mode === "sight" ? "#42556a" : "#0d1720", color: "#fff", fontSize: 11 }}>Sight</button>
        <button type="button" aria-pressed={mode === "shadow"} onClick={() => setMode("shadow")} style={{ minHeight: 34, padding: "4px 8px", borderRadius: 5, border: "1px solid #526c7e", background: mode === "shadow" ? "#42556a" : "#0d1720", color: "#fff", fontSize: 11 }}>Shadow</button>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>X <input aria-label="Vision observer X" type="number" min="0" max={mapW} value={observerX} onChange={event => setObserverX(Number(event.target.value))} style={fieldStyle} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>Y <input aria-label="Vision observer Y" type="number" min="0" max={mapH} value={observerY} onChange={event => setObserverY(Number(event.target.value))} style={fieldStyle} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>Radius <input aria-label="Vision radius" type="number" min="50" max="1200" step="10" value={radius} onChange={event => setRadius(Math.max(50, Math.min(1200, Number(event.target.value) || 50)))} style={fieldStyle} /></label>
        <span style={{ color: "#9db3c1" }}>{mode === "sight" ? "Blocks sight" : "Casts shadow"} geometry only</span>
      </div>
      <svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ overflow: "hidden" }} aria-label="Vector line-of-sight polygon">
        <polygon points={polygon} fill="rgba(255,224,121,.18)" stroke="rgba(255,224,121,.9)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <circle cx={observerScreenX} cy={observerScreenY} r="5" fill="#fff1ae" stroke="#17232c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
