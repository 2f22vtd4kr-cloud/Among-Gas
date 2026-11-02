import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent, ChangeEvent } from "react";
import {
  History,
  CollisionWorld,
  snapPoint,
  validateCollisionDocument,
  type CollisionDocument,
  type CollisionShape,
  type Point,
} from "@workspace/shared/collision";

type Tool = "pan" | "wall" | "solid" | "edit" | "erase" | "walk";
type Gesture =
  | { kind: "pan"; x: number; y: number }
  | { kind: "wall"; start: Point }
  | { kind: "vertex"; shapeId: string; index: number };

const MAP_W = 3224;
const MAP_H = 1858;
const EMPTY_DOCUMENT: CollisionDocument = {
  version: 1,
  mapW: MAP_W,
  mapH: MAP_H,
  shapes: [],
};
const TOOL_LABELS: Record<Tool, string> = {
  pan: "Pan / zoom",
  wall: "Draw wall",
  solid: "Draw solid",
  edit: "Edit vertices",
  erase: "Delete shape",
  walk: "Walk test",
};

function cloneDocument(document: CollisionDocument): CollisionDocument {
  return {
    ...document,
    shapes: document.shapes.map(shape => ({
      ...shape,
      points: shape.points.map(point => [point[0], point[1]] as Point),
    })),
  };
}

function pointSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

function newShapeId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : String(Date.now()) + "-" + Math.floor(Math.random() * 1_000_000);
  return prefix + "-" + random;
}

export default function VectorCollisionEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.2, ready: false });
  const gestureRef = useRef<Gesture | null>(null);
  const docRef = useRef<CollisionDocument>(EMPTY_DOCUMENT);
  const historyRef = useRef(new History<CollisionDocument>(EMPTY_DOCUMENT, cloneDocument, 200));
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number; world: Point } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [document, setDocument] = useState<CollisionDocument>(EMPTY_DOCUMENT);
  const [tool, setTool] = useState<Tool>("pan");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [zoomDisplay, setZoomDisplay] = useState(0.2);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading vector workspace…");
  const [blocksMove, setBlocksMove] = useState(true);
  const [blocksSight, setBlocksSight] = useState(true);
  const [shapeLabel, setShapeLabel] = useState("");
  const [zone, setZone] = useState("unassigned");
  const [walkPoints, setWalkPoints] = useState<Point[]>([]);
  const [walkStatus, setWalkStatus] = useState("");

  const replaceDocument = useCallback((next: CollisionDocument, record = true) => {
    docRef.current = next;
    if (record) historyRef.current.commit(next);
    setDocument(next);
    setSaved(false);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.complete || image.naturalWidth === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#101b25";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = camera.zoom * dpr;
    context.setTransform(scale, 0, 0, scale, -camera.x * scale, -camera.y * scale);
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0, MAP_W, MAP_H);

    for (const shape of document.shapes) {
      const isSelected = shape.id === selectedId;
      context.beginPath();
      shape.points.forEach((point, index) => {
        if (index === 0) context.moveTo(point[0], point[1]);
        else context.lineTo(point[0], point[1]);
      });
      if (shape.closed) context.closePath();
      if (shape.closed) {
        context.fillStyle = shape.blocksMove
          ? "rgba(255,75,85,0.22)"
          : "rgba(60,220,190,0.16)";
        context.fill();
      }
      context.strokeStyle = isSelected
        ? "#ffe079"
        : shape.blocksMove && shape.blocksSight
          ? "#ff5c68"
          : shape.blocksMove
            ? "#e79a45"
            : "#55d9cd";
      context.lineWidth = (isSelected ? 4 : 2.5) / camera.zoom;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
      if (isSelected) {
        context.fillStyle = "#fff1ae";
        for (const point of shape.points) {
          context.beginPath();
          context.arc(point[0], point[1], 7 / camera.zoom, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    if (draftPoints.length) {
      context.beginPath();
      draftPoints.forEach((point, index) => {
        if (index === 0) context.moveTo(point[0], point[1]);
        else context.lineTo(point[0], point[1]);
      });
      if (previewPoint) context.lineTo(previewPoint[0], previewPoint[1]);
      context.strokeStyle = "#fff1ae";
      context.lineWidth = 3 / camera.zoom;
      context.setLineDash([9 / camera.zoom, 6 / camera.zoom]);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#fff1ae";
      draftPoints.forEach(point => {
        context.beginPath();
        context.arc(point[0], point[1], 6 / camera.zoom, 0, Math.PI * 2);
        context.fill();
      });
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (walkPoints.length) {
      context.strokeStyle = "#ffe079";
      context.lineWidth = 3;
      context.setLineDash([7, 5]);
      if (walkPoints.length === 2) {
        const first = walkPoints[0], last = walkPoints[1];
        context.beginPath();
        context.moveTo((first[0] - camera.x) * camera.zoom, (first[1] - camera.y) * camera.zoom);
        context.lineTo((last[0] - camera.x) * camera.zoom, (last[1] - camera.y) * camera.zoom);
        context.stroke();
      }
      context.setLineDash([]);
      walkPoints.forEach((point, index) => {
        context.beginPath();
        context.fillStyle = index === 0 ? "#7ce0a3" : "#ff777e";
        context.arc((point[0] - camera.x) * camera.zoom, (point[1] - camera.y) * camera.zoom, 7, 0, Math.PI * 2);
        context.fill();
      });
    }

    context.fillStyle = "rgba(5,12,18,0.82)";
    context.fillRect(8, rect.height - 34, Math.min(560, rect.width - 16), 26);
    context.fillStyle = "#e4eef4";
    context.font = "12px system-ui, sans-serif";
    context.fillText(
      "3224 × 1858 world · " + Math.round(camera.zoom * 100) + "% · " + document.shapes.length + " authored shapes",
      16,
      rect.height - 17,
    );
  }, [document, selectedId, draftPoints, previewPoint, walkPoints]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      scheduleDraw();
    };
    image.onerror = () => { if (active) setStatus("Map artwork failed to load."); };
    image.src = import.meta.env.BASE_URL + "map-hires.webp";

    fetch(import.meta.env.BASE_URL + "__vector-collision-api/document", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Workspace load failed (" + response.status + ")");
        return response.json() as Promise<{ document: CollisionDocument; saved: boolean }>;
      })
      .then(result => {
        if (!active) return;
        const errors = validateCollisionDocument(result.document);
        if (errors.length) throw new Error(errors.join("; "));
        const next = cloneDocument(result.document);
        docRef.current = next;
        historyRef.current = new History(next, cloneDocument, 200);
        setDocument(next);
        setSaved(result.saved);
        setLoaded(true);
        setStatus(result.saved
          ? "Saved vector candidate loaded. It is not used by live gameplay."
          : "Scratch workspace only. No production geometry is loaded.");
      })
      .catch(error => {
        if (active && error.name !== "AbortError") {
          setLoaded(true);
          setStatus("Workspace unavailable: " + (error instanceof Error ? error.message : String(error)));
        }
      });
    return () => {
      active = false;
      controller.abort();
      image.onload = null;
      image.onerror = null;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      if (!cameraRef.current.ready) {
        const zoom = Math.min(rect.width / MAP_W, rect.height / MAP_H) * 0.92;
        cameraRef.current = {
          x: (MAP_W - rect.width / zoom) / 2,
          y: (MAP_H - rect.height / zoom) / 2,
          zoom,
          ready: true,
        };
        setZoomDisplay(zoom);
      }
      scheduleDraw();
    };
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    resize();
    return () => observer.disconnect();
  }, [scheduleDraw]);

  useEffect(() => { scheduleDraw(); }, [scheduleDraw, document, selectedId, draftPoints, previewPoint, walkPoints]);

  const worldPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const camera = cameraRef.current;
    return [
      camera.x + (event.clientX - rect.left) / camera.zoom,
      camera.y + (event.clientY - rect.top) / camera.zoom,
    ];
  };

  const nearestShape = (point: Point, maxDistance: number): CollisionShape | undefined => {
    let best: CollisionShape | undefined;
    let distance = maxDistance;
    for (const shape of docRef.current.shapes) {
      if (shape.closed) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shape.points.forEach(p => {
          minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
          maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
        });
        if (point[0] >= minX && point[0] <= maxX && point[1] >= minY && point[1] <= maxY) {
          let inside = false;
          for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
            const a = shape.points[i], b = shape.points[j];
            if ((a[1] > point[1]) !== (b[1] > point[1]) &&
              point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
          }
          if (inside) return shape;
        }
      }
      const edgeCount = shape.closed ? shape.points.length : shape.points.length - 1;
      for (let i = 0; i < edgeCount; i++) {
        const d = pointSegmentDistance(point, shape.points[i], shape.points[(i + 1) % shape.points.length]);
        if (d < distance) { distance = d; best = shape; }
      }
    }
    return best;
  };

  const addShape = (shape: CollisionShape) => {
    const next = cloneDocument(docRef.current);
    next.shapes = [...next.shapes, shape];
    replaceDocument(next);
    setSelectedId(shape.id);
    setDraftPoints([]);
    setPreviewPoint(null);
  };

  const finishPolygon = () => {
    if (draftPoints.length < 3) return;
    const points = draftPoints.length > 3 ? draftPoints : draftPoints;
    addShape({
      id: newShapeId("solid"),
      points,
      closed: true,
      blocksMove,
      blocksSight,
      label: shapeLabel.trim() || "Solid obstacle",
      zone,
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, position);
    if (pointersRef.current.size >= 2 && tool === "pan") {
      const values = Array.from(pointersRef.current.values());
      const rect = event.currentTarget.getBoundingClientRect();
      const center: Point = [
        ((values[0].x + values[1].x) / 2) - rect.left,
        ((values[0].y + values[1].y) / 2) - rect.top,
      ];
      const distance = Math.max(1, Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y));
      const camera = cameraRef.current;
      pinchRef.current = {
        distance,
        zoom: camera.zoom,
        world: [camera.x + center[0] / camera.zoom, camera.y + center[1] / camera.zoom],
      };
      gestureRef.current = null;
      return;
    }
    if (pointersRef.current.size > 1) return;

    const point = worldPoint(event);
    if (tool === "walk") {
      if (walkPoints.length !== 1) {
        setWalkPoints([point]);
        setWalkStatus("Start selected. Tap a destination to trace a 12px circular candidate route.");
      } else {
        const start = walkPoints[0];
        try {
          const world = new CollisionWorld(docRef.current.shapes);
          const end = world.move(start[0], start[1], point[0] - start[0], point[1] - start[1], 12);
          const remaining = Math.hypot(end[0] - point[0], end[1] - point[1]);
          setWalkPoints([start, point]);
          setWalkStatus(remaining <= 4
            ? "PASS: the candidate 12px circle reached the destination."
            : "BLOCKED / SLID: candidate stopped " + Math.round(remaining) + "px from the destination.");
        } catch (error) {
          setWalkStatus("Walk test failed: " + (error instanceof Error ? error.message : String(error)));
        }
      }
      return;
    }
    if (tool === "pan") {
      gestureRef.current = { kind: "pan", x: event.clientX, y: event.clientY };
      return;
    }
    if (tool === "wall") {
      gestureRef.current = { kind: "wall", start: point };
      setPreviewPoint(point);
      return;
    }
    if (tool === "solid") {
      const camera = cameraRef.current;
      if (draftPoints.length >= 3 &&
          Math.hypot(point[0] - draftPoints[0][0], point[1] - draftPoints[0][1]) <= 18 / camera.zoom) {
        finishPolygon();
        return;
      }
      const snapped = snapPoint(docRef.current.shapes, point, 12 / camera.zoom);
      const nextPoint = snapped.kind === "none" ? point : snapped.point;
      setDraftPoints(previous => [...previous, nextPoint]);
      setPreviewPoint(nextPoint);
      return;
    }
    if (tool === "edit") {
      const camera = cameraRef.current;
      let best: { shapeId: string; index: number; distance: number } | null = null;
      for (const shape of docRef.current.shapes) {
        shape.points.forEach((vertex, index) => {
          const d = Math.hypot(point[0] - vertex[0], point[1] - vertex[1]);
          if (d <= 16 / camera.zoom && (!best || d < best.distance)) best = { shapeId: shape.id, index, distance: d };
        });
      }
      if (best) {
        setSelectedId(best.shapeId);
        gestureRef.current = { kind: "vertex", shapeId: best.shapeId, index: best.index };
      } else {
        const target = nearestShape(point, 18 / camera.zoom);
        setSelectedId(target?.id ?? null);
      }
      return;
    }
    if (tool === "erase") {
      const target = nearestShape(point, 22 / cameraRef.current.zoom);
      if (!target) return;
      const next = cloneDocument(docRef.current);
      next.shapes = next.shapes.filter(shape => shape.id !== target.id);
      replaceDocument(next);
      setSelectedId(null);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const values = Array.from(pointersRef.current.values());
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = (values[0].x + values[1].x) / 2 - rect.left;
      const centerY = (values[0].y + values[1].y) / 2 - rect.top;
      const currentDistance = Math.max(1, Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y));
      const zoom = Math.max(0.04, Math.min(1.5, pinchRef.current.zoom * currentDistance / pinchRef.current.distance));
      cameraRef.current.zoom = zoom;
      cameraRef.current.x = pinchRef.current.world[0] - centerX / zoom;
      cameraRef.current.y = pinchRef.current.world[1] - centerY / zoom;
      setZoomDisplay(zoom);
      scheduleDraw();
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture) {
      if (tool === "wall" || tool === "solid") setPreviewPoint(worldPoint(event));
      return;
    }
    if (gesture.kind === "pan") {
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      cameraRef.current.x -= dx / cameraRef.current.zoom;
      cameraRef.current.y -= dy / cameraRef.current.zoom;
      gestureRef.current = { kind: "pan", x: event.clientX, y: event.clientY };
      scheduleDraw();
      return;
    }
    if (gesture.kind === "wall") {
      setPreviewPoint(worldPoint(event));
      return;
    }
    if (gesture.kind === "vertex") {
      const point = worldPoint(event);
      const next = cloneDocument(docRef.current);
      const shape = next.shapes.find(item => item.id === gesture.shapeId);
      if (!shape) return;
      const snapped = snapPoint(next.shapes.filter(item => item.id !== shape.id), point, 10 / cameraRef.current.zoom);
      shape.points = shape.points.map((vertex, index) =>
        index === gesture.index
          ? (snapped.kind === "none" ? point : snapped.point)
          : vertex
      );
      docRef.current = next;
      setDocument(next);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const camera = cameraRef.current;
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const worldX = camera.x + pointerX / camera.zoom;
    const worldY = camera.y + pointerY / camera.zoom;
    const zoom = Math.max(0.04, Math.min(1.5, camera.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    camera.zoom = zoom;
    camera.x = worldX - pointerX / zoom;
    camera.y = worldY - pointerY / zoom;
    setZoomDisplay(zoom);
    scheduleDraw();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (gesture?.kind === "wall") {
      const end = worldPoint(event);
      if (Math.hypot(end[0] - gesture.start[0], end[1] - gesture.start[1]) >= 8) {
        const points = [gesture.start, end];
        addShape({
          id: newShapeId("wall"),
          points,
          closed: false,
          blocksMove,
          blocksSight,
          label: shapeLabel.trim() || "Wall",
          zone,
        });
      }
    } else if (gesture?.kind === "vertex") {
      historyRef.current.commit(docRef.current);
      setSaved(false);
    }
    gestureRef.current = null;
    pinchRef.current = null;
    pointersRef.current.delete(event.pointerId);
    setPreviewPoint(null);
    scheduleDraw();
  };

  const undo = () => {
    if (!historyRef.current.undo()) return;
    const next = cloneDocument(historyRef.current.current);
    docRef.current = next;
    setDocument(next);
    setSaved(false);
  };
  const redo = () => {
    if (!historyRef.current.redo()) return;
    const next = cloneDocument(historyRef.current.current);
    docRef.current = next;
    setDocument(next);
    setSaved(false);
  };
  const zoomBy = (factor: number) => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2, centerY = rect.height / 2;
    const world: Point = [camera.x + centerX / camera.zoom, camera.y + centerY / camera.zoom];
    const zoom = Math.max(0.04, Math.min(1.5, camera.zoom * factor));
    camera.zoom = zoom;
    camera.x = world[0] - centerX / zoom;
    camera.y = world[1] - centerY / zoom;
    setZoomDisplay(zoom);
    scheduleDraw();
  };
  const fitMap = () => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const zoom = Math.min(rect.width / MAP_W, rect.height / MAP_H) * 0.92;
    cameraRef.current = {
      x: (MAP_W - rect.width / zoom) / 2,
      y: (MAP_H - rect.height / zoom) / 2,
      zoom,
      ready: true,
    };
    setZoomDisplay(zoom);
    scheduleDraw();
  };

  const updateSelected = (patch: Partial<CollisionShape>) => {
    if (!selectedId) return;
    const next = cloneDocument(docRef.current);
    next.shapes = next.shapes.map(shape => shape.id === selectedId ? { ...shape, ...patch } : shape);
    replaceDocument(next);
  };

  const save = async () => {
    if (!docRef.current.shapes.length) {
      setStatus("Nothing saved: author and review at least one real map contour first.");
      return;
    }
    const errors = validateCollisionDocument(docRef.current);
    if (errors.length) {
      setStatus("Cannot save: " + errors.slice(0, 4).join("; "));
      return;
    }
    setSaving(true);
    setStatus("Saving candidate geometry…");
    try {
      const response = await fetch(import.meta.env.BASE_URL + "__vector-collision-api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Vector-Collision-Editor": "1" },
        body: JSON.stringify(docRef.current),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Save rejected (" + response.status + ")");
      historyRef.current = new History(docRef.current, cloneDocument, 200);
      setSaved(true);
      setStatus("Candidate saved with a rotating backup. Live gameplay still uses the reviewed raster mask.");
    } catch (error) {
      setStatus("Save failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  const exportDocument = () => {
    const blob = new Blob([JSON.stringify(docRef.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "collision.v1.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 512_000) { setStatus("Import rejected: maximum file size is 512 KB."); return; }
    try {
      const candidate = JSON.parse(await file.text()) as unknown;
      const errors = validateCollisionDocument(candidate);
      if (errors.length) throw new Error(errors.slice(0, 5).join("; "));
      const next = cloneDocument(candidate as CollisionDocument);
      if (next.mapW !== MAP_W || next.mapH !== MAP_H) throw new Error("Document dimensions must match the Among Gas world.");
      replaceDocument(next);
      setSelectedId(null);
      setDraftPoints([]);
      setStatus("Imported as an unsaved candidate. Review the contours before saving.");
    } catch (error) {
      setStatus("Import rejected: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const selected = document.shapes.find(shape => shape.id === selectedId);

  if (!import.meta.env.DEV) return null;

  const buttonStyle = (active = false): React.CSSProperties => ({
    flex: "0 0 auto",
    minHeight: 38,
    padding: "7px 11px",
    borderRadius: 8,
    border: "1px solid " + (active ? "#e5bd66" : "#536879"),
    background: active ? "#3b3829" : "#1c2935",
    color: active ? "#ffe7a1" : "#d9e7ee",
    font: "600 12px system-ui, sans-serif",
    cursor: "pointer",
  });

  return (
    <main style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#101923", color: "#e8f1f5", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "9px 12px", background: "#182633", borderBottom: "1px solid #334c5e", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link href="/" style={{ color: "#9ed6e7", fontSize: 13, textDecoration: "none" }}>← Game</Link>
        <strong style={{ fontSize: 13, letterSpacing: ".04em" }}>VECTOR GEOMETRY WORKSPACE</strong>
        <span style={{ fontSize: 11, color: "#f2c875" }}>NOT CONNECTED TO LIVE COLLISION</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9db3c1" }}>{document.shapes.length} shapes · {Math.round(zoomDisplay * 100)}%</span>
      </header>

      <nav style={{ display: "flex", gap: 6, padding: 8, overflowX: "auto", background: "#14212c", borderBottom: "1px solid #334c5e" }}>
        {(["pan", "wall", "solid", "edit", "erase", "walk"] as Tool[]).map(item => (
          <button key={item} type="button" style={buttonStyle(tool === item)} onClick={() => setTool(item)}>{TOOL_LABELS[item]}</button>
        ))}
        <span style={{ width: 1, background: "#435b6d", margin: "0 3px" }} />
        <button type="button" style={buttonStyle()} onClick={undo} disabled={!historyRef.current.canUndo}>Undo</button>
        <button type="button" style={buttonStyle()} onClick={redo} disabled={!historyRef.current.canRedo}>Redo</button>
        <button type="button" style={buttonStyle()} onClick={() => setDraftPoints([])} disabled={!draftPoints.length}>Cancel polygon</button>
        <button type="button" style={buttonStyle()} onClick={finishPolygon} disabled={draftPoints.length < 3}>Close polygon</button>
        <button type="button" style={buttonStyle()} onClick={() => zoomBy(0.8)}>−</button>
        <button type="button" style={buttonStyle()} onClick={() => zoomBy(1.25)}>+</button>
        <button type="button" style={buttonStyle()} onClick={fitMap}>Fit map</button>
        <button type="button" style={buttonStyle(walkPoints.length > 0)} onClick={() => { setWalkPoints([]); setWalkStatus(""); }}>Clear route test</button>
      </nav>

      <section style={{ display: "flex", gap: 8, padding: 8, alignItems: "center", flexWrap: "wrap", background: "#182633", borderBottom: "1px solid #334c5e" }}>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
          <input type="checkbox" checked={blocksMove} onChange={event => setBlocksMove(event.target.checked)} />
          Blocks movement
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
          <input type="checkbox" checked={blocksSight} onChange={event => setBlocksSight(event.target.checked)} />
          Blocks sight
        </label>
        <input value={shapeLabel} onChange={event => setShapeLabel(event.target.value)} maxLength={80} placeholder="Shape label" aria-label="Shape label" style={{ minWidth: 110, flex: 1, background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 6, padding: "7px 9px", fontSize: 12 }} />
        <select value={zone} onChange={event => setZone(event.target.value)} aria-label="Map zone" style={{ background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 6, padding: 7, fontSize: 12 }}>
          <option value="unassigned">Zone: unassigned</option>
          <option value="A">A · north-west</option>
          <option value="B">B · north-east</option>
          <option value="C">C · central</option>
          <option value="D">D · south-west</option>
          <option value="E">E · south-east</option>
        </select>
        <button type="button" style={buttonStyle()} onClick={exportDocument}>Export JSON</button>
        <label style={{ ...buttonStyle(), display: "inline-flex", alignItems: "center" }}>
          Import JSON<input type="file" accept="application/json,.json" onChange={importDocument} style={{ display: "none" }} />
        </label>
        <button type="button" style={{ ...buttonStyle(), background: "#4b432a", borderColor: "#e2bd6a" }} onClick={() => void save()} disabled={saving || !document.shapes.length}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save candidate"}
        </button>
      </section>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: tool === "pan" ? "grab" : tool === "edit" ? "move" : "crosshair" }}
        />
        {!loaded && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(10,18,26,.84)", fontSize: 14 }}>Loading geometry workspace…</div>}
      </div>

      <footer style={{ padding: "8px 10px", background: "#182633", borderTop: "1px solid #334c5e", fontSize: 11, color: "#b8cbd6", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{status}{walkStatus ? " · " + walkStatus : ""}</span>
        {selected && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <strong>{selected.label || selected.id}</strong>
            <label><input type="checkbox" checked={selected.blocksMove} onChange={event => updateSelected({ blocksMove: event.target.checked })} /> Move</label>
            <label><input type="checkbox" checked={selected.blocksSight} onChange={event => updateSelected({ blocksSight: event.target.checked })} /> Sight</label>
          </span>
        )}
      </footer>
    </main>
  );
}
