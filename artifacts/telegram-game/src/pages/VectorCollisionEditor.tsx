import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import CollisionAnalysisPanel from "../components/CollisionAnalysisPanel";
import VectorVisionPreview from "../components/VectorVisionPreview";
import VectorLoupe from "../components/VectorLoupe";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent, ChangeEvent } from "react";
import {
  History,
  CollisionWorld,
  snapPoint,
  simplifyRDP,
  validateCollisionDocument,
  type CollisionDocument,
  type CollisionShape,
  type Point,
} from "@workspace/shared/collision";

type Tool = "pan" | "wall" | "solid" | "edit" | "erase" | "walk";
type EditableShape = Omit<CollisionShape, "points"> & { points: Point[] };
type EditableDocument = Omit<CollisionDocument, "shapes"> & { shapes: EditableShape[] };
type Gesture =
  | { kind: "pan"; x: number; y: number }
  | { kind: "wall"; points: Point[] }
  | { kind: "solid"; point: Point; close: boolean }
  | { kind: "erase"; point: Point }
  | { kind: "walk"; point: Point }
  | { kind: "vertex"; shapeId: string; index: number; originalPoint: Point };

const MAP_W = 3224;
const MAP_H = 1858;
const LOCAL_DRAFT_KEY = "among-gas:vector-collision-editor:v1";
const EMPTY_DOCUMENT: EditableDocument = {
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

function cloneDocument(document: CollisionDocument): EditableDocument {
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
  const docRef = useRef<EditableDocument>(EMPTY_DOCUMENT);
  const historyRef = useRef(new History<EditableDocument>(EMPTY_DOCUMENT, cloneDocument, 200));
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number; world: Point } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [document, setDocument] = useState<EditableDocument>(EMPTY_DOCUMENT);
  const [tool, setTool] = useState<Tool>("pan");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [activeChain, setActiveChain] = useState<Point[]>([]);
  const [draftWallPoints, setDraftWallPoints] = useState<Point[]>([]);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [zoomDisplay, setZoomDisplay] = useState(0.2);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [localDraft, setLocalDraft] = useState<{ document: EditableDocument; draftPoints: Point[]; activeChain: Point[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading vector workspace…");
  const [blocksMove, setBlocksMove] = useState(true);
  const [blocksSight, setBlocksSight] = useState(true);
  const [castsShadow, setCastsShadow] = useState(true);
  const [shapeLabel, setShapeLabel] = useState("");
  const [zone, setZone] = useState("unassigned");
  const [walkPoints, setWalkPoints] = useState<Point[]>([]);
  const walkPointsRef = useRef<Point[]>([]);
  const [walkStatus, setWalkStatus] = useState("");
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const [showLoupe, setShowLoupe] = useState(false);
  const [loupePoint, setLoupePoint] = useState<Point | null>(null);
  const [visionCamera, setVisionCamera] = useState({ x: 0, y: 0, zoom: 0.2 });

  const replaceDocument = useCallback((next: CollisionDocument, record = true) => {
    const editable = cloneDocument(next);
    docRef.current = editable;
    if (record) historyRef.current.commit(editable);
    setDocument(editable);
    setSaved(false);
    setDirty(true);
    setLocalDraft(null);
  }, []);

  const drawRef = useRef<() => void>(() => {});
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
          context.arc(point[0], point[1], 24 / camera.zoom, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    if (activeChain.length) {
      context.beginPath();
      activeChain.forEach((point, index) => {
        if (index === 0) context.moveTo(point[0], point[1]);
        else context.lineTo(point[0], point[1]);
      });
      context.strokeStyle = "#55d9ff";
      context.lineWidth = 3 / camera.zoom;
      context.setLineDash([7 / camera.zoom, 5 / camera.zoom]);
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#8be5ff";
      activeChain.forEach(point => {
        context.beginPath();
        context.arc(point[0], point[1], 5 / camera.zoom, 0, Math.PI * 2);
        context.fill();
      });
    }
    if (draftWallPoints.length) {
      context.beginPath();
      draftWallPoints.forEach((point, index) => {
        if (index === 0) context.moveTo(point[0], point[1]);
        else context.lineTo(point[0], point[1]);
      });
      context.strokeStyle = "#ffe079";
      context.lineWidth = 3 / camera.zoom;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
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
  }, [document, selectedId, draftPoints, previewPoint, walkPoints, activeChain, draftWallPoints]);

  useEffect(() => { drawRef.current = draw; }, [draw]);

  useEffect(() => {
    const camera = cameraRef.current;
    setVisionCamera({ x: camera.x, y: camera.y, zoom: camera.zoom });
  }, [zoomDisplay]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
  }, []);

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

    const scratch = new URLSearchParams(window.location.search).get("scratch") === "1";
    const workspaceUrl = import.meta.env.BASE_URL + "__vector-collision-api/document" + (scratch ? "?scratch=1" : "");
    fetch(workspaceUrl, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Workspace load failed (" + response.status + ")");
        return response.json() as Promise<{ document: CollisionDocument; saved: boolean; seeded?: boolean }>;
      })
      .then(result => {
        if (!active) return;
        const errors = validateCollisionDocument(result.document);
        if (errors.length) throw new Error(errors.join("; "));
        const next = cloneDocument(result.document);
        docRef.current = next;
        historyRef.current = new History<EditableDocument>(next, cloneDocument, 200);
        setDocument(next);
        setSaved(result.saved);
        setDirty(false);
        try {
          const rawDraft = window.localStorage.getItem(LOCAL_DRAFT_KEY);
          if (rawDraft) {
            const parsed = JSON.parse(rawDraft) as { document?: unknown; draftPoints?: unknown; activeChain?: unknown };
            if (parsed.document) {
              const draftErrors = validateCollisionDocument(parsed.document);
              if (!draftErrors.length) {
                const draft = cloneDocument(parsed.document as CollisionDocument);
                const isValidPoint = (point: unknown): point is Point =>
                  Array.isArray(point) && point.length === 2 &&
                  Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
                  point[0] >= 0 && point[0] <= MAP_W && point[1] >= 0 && point[1] <= MAP_H;
                const candidatePoints = Array.isArray(parsed.draftPoints) ? parsed.draftPoints : [];
                const candidateChain = Array.isArray(parsed.activeChain) ? parsed.activeChain : [];
                const validDraftPoints = candidatePoints.filter(isValidPoint);
                const validActiveChain = candidateChain.filter(isValidPoint);
                if (draft.mapW === MAP_W && draft.mapH === MAP_H &&
                    (JSON.stringify(draft) !== JSON.stringify(next) ||
                     validDraftPoints.length > 0 || validActiveChain.length > 0)) {
                  setLocalDraft({ document: draft, draftPoints: validDraftPoints, activeChain: validActiveChain });
                }
              }
            }
          }
        } catch {
          // Storage may be unavailable in private browsing; the editor remains usable.
        }
        setLoaded(true);
        setStatus(result.saved
          ? "Saved vector candidate loaded. It is separate from live production geometry."
          : result.seeded
            ? "Production red-line seed loaded as an unsaved candidate. Saving writes to a separate review file."
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

  useEffect(() => {
    if (!dirty || !loaded) return;
    try {
      window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), document, draftPoints, activeChain }));
    } catch {
      setStatus("Local autosave unavailable; use Export JSON before leaving this workspace.");
    }
  }, [document, draftPoints, activeChain, dirty, loaded]);

  useEffect(() => { scheduleDraw(); }, [scheduleDraw, document, selectedId, draftPoints, previewPoint, walkPoints, activeChain, draftWallPoints]);

  const worldPointAt = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    return [
      Math.max(0, Math.min(MAP_W, camera.x + (clientX - rect.left) / camera.zoom)),
      Math.max(0, Math.min(MAP_H, camera.y + (clientY - rect.top) / camera.zoom)),
    ];
  };

  const worldPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point =>
    worldPointAt(event.clientX, event.clientY);

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
    const current = cloneDocument(docRef.current);
    const next: CollisionDocument = { ...current, shapes: [...current.shapes, shape] };
    replaceDocument(next);
    setSelectedId(shape.id);
    setDraftPoints([]);
    setPreviewPoint(null);
  };

  const finishPolygon = () => {
    if (draftPoints.length < 3) return;
    const points = draftPoints;
    addShape({
      id: newShapeId("solid"),
      points,
      closed: true,
      blocksMove,
      blocksSight,
      castsShadow,
      label: shapeLabel.trim() || "Solid obstacle",
      zone,
    });
  };

  const finishActiveChain = () => {
    if (activeChain.length < 2) return;
    const points = simplifyRDP(activeChain, 1.25 / cameraRef.current.zoom);
    if (points.length < 2) return;
    addShape({
      id: newShapeId("wall"),
      points,
      closed: false,
      blocksMove,
      blocksSight,
      castsShadow,
      label: shapeLabel.trim() || "Wall chain",
      zone,
    });
    setActiveChain([]);
    setDraftWallPoints([]);
    setStatus("Wall chain committed to the candidate document. Live gameplay is unchanged.");
  };

  const jumpToChainEnd = () => {
    const end = activeChain[activeChain.length - 1];
    const canvas = canvasRef.current;
    if (!end || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    camera.x = end[0] - rect.width / (2 * camera.zoom);
    camera.y = end[1] - rect.height / (2 * camera.zoom);
    scheduleDraw();
    setStatus("Camera moved to the active wall-chain endpoint.");
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, position);
    if (pointersRef.current.size === 2) {
      // A second finger always takes over as a viewport gesture, regardless
      // of the selected drawing/editing tool. Cancel a wall/vertex drag rather
      // than allowing the second pointer-up to commit an accidental shape.
      if (gestureRef.current?.kind === "vertex") {
        const vertexGesture = gestureRef.current;
        const currentPoint = docRef.current.shapes.find(shape => shape.id === vertexGesture.shapeId)?.points[vertexGesture.index];
        if (currentPoint && (Math.abs(currentPoint[0] - vertexGesture.originalPoint[0]) > 0.001 ||
            Math.abs(currentPoint[1] - vertexGesture.originalPoint[1]) > 0.001)) {
          historyRef.current.commit(docRef.current);
          setSaved(false);
          setDirty(true);
          setLocalDraft(null);
        }
      }
      gestureRef.current = null;
      setPreviewPoint(null);
      setDraftWallPoints([]);
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
      return;
    }
    if (pointersRef.current.size > 2) return;

    const point = worldPoint(event);
    if (tool === "walk") {
      gestureRef.current = { kind: "walk", point };
      return;
    }
    if (tool === "pan") {
      gestureRef.current = { kind: "pan", x: event.clientX, y: event.clientY };
      return;
    }
    if (tool === "wall") {
      let start = point;
      const camera = cameraRef.current;
      if (activeChain.length) {
        const end = activeChain[activeChain.length - 1];
        if (Math.hypot(point[0] - end[0], point[1] - end[1]) > 24 / camera.zoom) {
          setStatus("Active chain is open. Use Jump to end to continue, or Finish chain to commit it.");
          return;
        }
        start = end;
      } else {
        const snapped = snapPoint(docRef.current.shapes, point, (event.pointerType === 'touch' ? 24 : 12) / camera.zoom);
        if (snapped.kind !== "none") start = snapped.point;
      }
      gestureRef.current = { kind: "wall", points: [start] };
      setDraftWallPoints([start]);
      setPreviewPoint(start);
      return;
    }
    if (tool === "solid") {
      const camera = cameraRef.current;
      const snapped = snapPoint(docRef.current.shapes, point, (event.pointerType === 'touch' ? 24 : 12) / camera.zoom);
      const nextPoint = snapped.kind === "none" ? point : snapped.point;
      const close = draftPoints.length >= 3 &&
        Math.hypot(nextPoint[0] - draftPoints[0][0], nextPoint[1] - draftPoints[0][1]) <= (event.pointerType === 'touch' ? 24 : 18) / camera.zoom;
      gestureRef.current = { kind: "solid", point: nextPoint, close };
      setPreviewPoint(nextPoint);
      return;
    }
    if (tool === "edit") {
      const camera = cameraRef.current;
      let best: { shapeId: string; index: number; distance: number } | null = null;
      for (const shape of docRef.current.shapes) {
        for (let index = 0; index < shape.points.length; index++) {
          const vertex = shape.points[index];
          const d = Math.hypot(point[0] - vertex[0], point[1] - vertex[1]);
          if (d <= (event.pointerType === 'touch' ? 24 : 16) / camera.zoom && (!best || d < best.distance)) {
            best = { shapeId: shape.id, index, distance: d };
          }
        }
      }
      if (best) {
        setSelectedId(best.shapeId);
        gestureRef.current = { kind: "vertex", shapeId: best.shapeId, index: best.index, originalPoint: [...docRef.current.shapes.find(shape => shape.id === best!.shapeId)!.points[best.index]] };
      } else {
        const target = nearestShape(point, (event.pointerType === 'touch' ? 24 : 18) / camera.zoom);
        setSelectedId(target?.id ?? null);
      }
      return;
    }
    if (tool === "erase") {
      gestureRef.current = { kind: "erase", point };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (showLoupe) setLoupePoint(worldPoint(event));
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const values = Array.from(pointersRef.current.values());
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = (values[0].x + values[1].x) / 2 - rect.left;
      const centerY = (values[0].y + values[1].y) / 2 - rect.top;
      const currentDistance = Math.max(1, Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y));
      const zoom = Math.max(0.1, Math.min(8, pinchRef.current.zoom * currentDistance / pinchRef.current.distance));
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
      const nativeEvent = event.nativeEvent as PointerEvent;
      let samples: PointerEvent[] = [nativeEvent];
      try {
        const coalesced = nativeEvent.getCoalescedEvents?.();
        if (coalesced && coalesced.length) samples = coalesced;
      } catch {
        // Older mobile browsers may not expose coalesced pointer samples.
      }
      const nextPoints = [...gesture.points];
      const minDistance = 1.25 / cameraRef.current.zoom;
      for (const sample of samples) {
        if (nextPoints.length >= 4096) break;
        const candidate = worldPointAt(sample.clientX, sample.clientY);
        const last = nextPoints[nextPoints.length - 1];
        if (Math.hypot(candidate[0] - last[0], candidate[1] - last[1]) >= minDistance) {
          nextPoints.push(candidate);
        }
      }
      gestureRef.current = { kind: "wall", points: nextPoints };
      setDraftWallPoints(nextPoints);
      setPreviewPoint(nextPoints[nextPoints.length - 1] ?? null);
      return;
    }
    if (gesture.kind === "vertex") {
      const point = worldPoint(event);
      const current = cloneDocument(docRef.current);
      const shape = current.shapes.find(item => item.id === gesture.shapeId);
      if (!shape) return;
      const snapped = snapPoint(current.shapes.filter(item => item.id !== shape.id), point, (event.pointerType === 'touch' ? 24 : 10) / cameraRef.current.zoom);
      const replacementPoint = snapped.kind === "none" ? point : snapped.point;
      const next: CollisionDocument = {
        ...current,
        shapes: current.shapes.map(item => item.id !== shape.id ? item : {
          ...item,
          points: item.points.map((vertex, index) => index === gesture.index ? replacementPoint : vertex),
        }),
      };
      const editableNext = cloneDocument(next);
      docRef.current = editableNext;
      setDocument(editableNext);
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
    const zoom = Math.max(0.1, Math.min(8, camera.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    camera.zoom = zoom;
    camera.x = worldX - pointerX / zoom;
    camera.y = worldY - pointerY / zoom;
    setZoomDisplay(zoom);
    scheduleDraw();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (gesture?.kind === "wall") {
      const points = [...gesture.points];
      const end = worldPoint(event);
      const camera = cameraRef.current;
      const endSnap = snapPoint(docRef.current.shapes, end, (event.pointerType === 'touch' ? 24 : 12) / camera.zoom);
      const snappedEnd = endSnap.kind === "none" ? end : endSnap.point;
      const last = points[points.length - 1];
      if (last && Math.hypot(snappedEnd[0] - last[0], snappedEnd[1] - last[1]) >= 0.5 / camera.zoom) {
        points.push(snappedEnd);
      }
      const simplified = simplifyRDP(points, 1.25 / camera.zoom);
      if (simplified.length >= 2) {
        const nextChain = activeChain.length
          ? [...activeChain, ...simplified.slice(1)]
          : simplified;
        setActiveChain(nextChain);
        setSaved(false);
        setDirty(true);
        setLocalDraft(null);
        setStatus("Active wall chain: " + nextChain.length + " points. Continue from its endpoint or Finish chain.");
      }
      setDraftWallPoints([]);
    } else if (gesture?.kind === "solid") {
      if (gesture.close) {
        finishPolygon();
      } else {
        setDraftPoints(previous => [...previous, gesture.point]);
        setSaved(false);
        setDirty(true);
        setLocalDraft(null);
      }
    } else if (gesture?.kind === "erase") {
      const target = nearestShape(gesture.point, (event.pointerType === 'touch' ? 24 : 22) / cameraRef.current.zoom);
      if (target) {
        const current = cloneDocument(docRef.current);
        const next: CollisionDocument = { ...current, shapes: current.shapes.filter(shape => shape.id !== target.id) };
        replaceDocument(next);
        setSelectedId(null);
      }
    } else if (gesture?.kind === "walk") {
      const previousWalkPoints = walkPointsRef.current;
      if (previousWalkPoints.length !== 1) {
        walkPointsRef.current = [gesture.point];
        setWalkPoints(walkPointsRef.current);
        setWalkStatus("Start selected. Tap a destination to trace the production three-circle feet footprint.");
      } else {
        const start = previousWalkPoints[0];
        // Keep point selection responsive even when a malformed candidate makes
        // the collision preview fail; report that failure in the status text.
        walkPointsRef.current = [start, gesture.point];
        setWalkPoints(walkPointsRef.current);
        try {
          const world = new CollisionWorld(docRef.current.shapes);
          const end = world.movePlayerAtFeet(start[0], start[1], gesture.point[0] - start[0], gesture.point[1] - start[1]);
          const remaining = Math.hypot(end[0] - gesture.point[0], end[1] - gesture.point[1]);
          setWalkStatus(remaining <= 4
            ? "PASS: the shared three-circle player footprint reached the destination."
            : "BLOCKED / SLID: player footprint stopped " + Math.round(remaining) + "px from the destination.");
        } catch (error) {
          setWalkStatus("Walk test failed: " + (error instanceof Error ? error.message : String(error)));
        }
      }
    } else if (gesture?.kind === "vertex") {
      const currentPoint = docRef.current.shapes.find(shape => shape.id === gesture.shapeId)?.points[gesture.index];
      if (currentPoint && (Math.abs(currentPoint[0] - gesture.originalPoint[0]) > 0.001 ||
          Math.abs(currentPoint[1] - gesture.originalPoint[1]) > 0.001)) {
        historyRef.current.commit(docRef.current);
        setSaved(false);
        setDirty(true);
        setLocalDraft(null);
      }
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
    setDirty(true);
    setLocalDraft(null);
  };
  const redo = () => {
    if (!historyRef.current.redo()) return;
    const next = cloneDocument(historyRef.current.current);
    docRef.current = next;
    setDocument(next);
    setSaved(false);
    setDirty(true);
    setLocalDraft(null);
  };
  const zoomBy = (factor: number) => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2, centerY = rect.height / 2;
    const world: Point = [camera.x + centerX / camera.zoom, camera.y + centerY / camera.zoom];
    const zoom = Math.max(0.1, Math.min(8, camera.zoom * factor));
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
    const current = cloneDocument(docRef.current);
    const next: CollisionDocument = {
      ...current,
      shapes: current.shapes.map(shape => shape.id === selectedId ? { ...shape, ...patch } : shape),
    };
    replaceDocument(next);
  };

  const save = async (zoneOnly?: string) => {
    const candidate: CollisionDocument = zoneOnly
      ? { ...docRef.current, shapes: docRef.current.shapes.filter(shape => shape.zone === zoneOnly) }
      : docRef.current;
    if (!candidate.shapes.length) {
      setStatus("Nothing saved: author and review at least one real map contour first.");
      return;
    }
    const errors = validateCollisionDocument(candidate);
    if (errors.length) {
      setStatus("Cannot save: " + errors.slice(0, 4).join("; "));
      return;
    }
    setSaving(true);
    setStatus(zoneOnly ? "Saving zone " + zoneOnly + " candidate geometry…" : "Saving candidate geometry…");
    try {
      const endpoint = import.meta.env.BASE_URL + "__vector-collision-api/document" +
        (zoneOnly ? "?zone=" + encodeURIComponent(zoneOnly) : "");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Vector-Collision-Editor": "1" },
        body: JSON.stringify(candidate),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        contentHash?: string;
        backupCount?: number;
        savedZone?: string | null;
      };
      if (!response.ok) throw new Error(result.error || "Save rejected (" + response.status + ")");
      if (!result.contentHash || !/^[a-f0-9]{64}$/.test(result.contentHash)) {
        throw new Error("Save response did not include a valid SHA-256 content hash");
      }
      if (zoneOnly) {
        setStatus(
          "Zone " + zoneOnly + " saved into the candidate document · SHA-256 " +
          result.contentHash.slice(0, 12) + " · " + (result.backupCount ?? 0) +
          " retained backups. Other unsaved zones remain in this editor.",
        );
      } else {
        historyRef.current = new History<EditableDocument>(docRef.current, cloneDocument, 200);
        setSaved(true);
        setDirty(false);
        setLocalDraft(null);
        try { window.localStorage.removeItem(LOCAL_DRAFT_KEY); } catch { /* best-effort cleanup */ }
        setStatus(
          "Candidate saved · SHA-256 " + result.contentHash.slice(0, 12) +
          " · " + (result.backupCount ?? 0) +
          " retained backups. Production geometry is unchanged until separately reviewed and regenerated.",
        );
      }
    } catch (error) {
      setStatus("Save failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  const restoreLocalDraft = () => {
    if (!localDraft) return;
    replaceDocument(localDraft.document);
    setDraftPoints(localDraft.draftPoints);
    setActiveChain(localDraft.activeChain);
    setLocalDraft(null);
    setStatus("Local draft restored. Review it before saving; it is not live gameplay geometry.");
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
      setActiveChain([]);
      setDraftWallPoints([]);
      setStatus("Imported as an unsaved candidate. Review the contours before saving.");
    } catch (error) {
      setStatus("Import rejected: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const selected = document.shapes.find(shape => shape.id === selectedId);

  if (!import.meta.env.DEV) return null;

  const buttonStyle = (active = false): React.CSSProperties => ({
    flex: "0 0 auto",
    minHeight: 48,
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
        <button type="button" style={buttonStyle()} onClick={() => { setDraftPoints([]); setDirty(true); setSaved(false); }} disabled={!draftPoints.length}>Cancel polygon</button>
        <button type="button" style={buttonStyle()} onClick={finishPolygon} disabled={draftPoints.length < 3}>Close polygon</button>
        <button type="button" style={buttonStyle()} onClick={() => zoomBy(0.8)}>−</button>
        <button type="button" style={buttonStyle()} onClick={() => zoomBy(1.25)}>+</button>
        <button type="button" data-testid="toggle-geometry-analysis" aria-pressed={showAnalysis} style={buttonStyle(showAnalysis)} onClick={() => setShowAnalysis(value => !value)}>Geometry analyzer</button>
        <button type="button" data-testid="toggle-vector-vision" aria-pressed={showVision} style={buttonStyle(showVision)} onClick={() => setShowVision(value => !value)}>Vision preview</button>
        <button type="button" data-testid="toggle-vector-loupe" aria-pressed={showLoupe} style={buttonStyle(showLoupe)} onClick={() => setShowLoupe(value => !value)}>Loupe</button>
        <button type="button" style={buttonStyle()} onClick={fitMap}>Fit map</button>
        <button type="button" style={buttonStyle(activeChain.length > 0)} onClick={jumpToChainEnd} disabled={!activeChain.length}>Jump to end</button>
        <button type="button" style={buttonStyle(activeChain.length > 1)} onClick={finishActiveChain} disabled={activeChain.length < 2}>Finish chain</button>
        {localDraft && <button type="button" style={buttonStyle(true)} onClick={restoreLocalDraft}>Restore local draft</button>}
        <button type="button" style={buttonStyle(walkPoints.length > 0)} onClick={() => { walkPointsRef.current = []; setWalkPoints([]); setWalkStatus(""); }}>Clear route test</button>
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
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
          <input type="checkbox" checked={castsShadow} onChange={event => setCastsShadow(event.target.checked)} />
          Casts shadow
        </label>
        <input value={shapeLabel} onChange={event => setShapeLabel(event.target.value)} maxLength={80} placeholder="Shape label" aria-label="Shape label" style={{ minWidth: 110, flex: 1, background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 6, padding: "7px 9px", minHeight: 48, fontSize: 12 }} />
        <select value={zone} onChange={event => setZone(event.target.value)} aria-label="Map zone" style={{ background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 6, padding: 7, minHeight: 48, fontSize: 12 }}>
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
        <button type="button" style={{ ...buttonStyle(), background: "#4b432a", borderColor: "#e2bd6a" }} onClick={() => void save()} disabled={saving || !document.shapes.length || activeChain.length > 1}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save candidate"}
        </button>
        <button type="button" data-testid="save-zone-candidate" style={buttonStyle()} onClick={() => void save(zone)} disabled={saving || zone === "unassigned" || !document.shapes.some(shape => shape.zone === zone) || activeChain.length > 1}>
          Save zone {zone === "unassigned" ? "…" : zone}
        </button>
      </section>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          data-editor-loaded={loaded ? "true" : "false"}
          data-shape-count={document.shapes.length}
          data-selected-shape-id={selectedId ?? ""}
          data-zoom={zoomDisplay}
          data-draft-point-count={draftPoints.length}
          data-walk-point-count={walkPoints.length}
          data-walk-status={walkStatus}
          data-active-chain-point-count={activeChain.length}
          data-draft-wall-point-count={draftWallPoints.length}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setLoupePoint(null)}
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: tool === "pan" ? "grab" : tool === "edit" ? "move" : "crosshair" }}
        />
        {showAnalysis && <CollisionAnalysisPanel shapes={document.shapes} mapW={MAP_W} mapH={MAP_H} />}
        {showVision && <VectorVisionPreview shapes={document.shapes} mapW={MAP_W} mapH={MAP_H} camera={visionCamera} />}
        {showLoupe && <VectorLoupe sourceCanvas={canvasRef.current} point={loupePoint} camera={visionCamera} />}
        {!loaded && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(10,18,26,.84)", fontSize: 14 }}>Loading geometry workspace…</div>}
      </div>

      <footer style={{ padding: "8px 10px", background: "#182633", borderTop: "1px solid #334c5e", fontSize: 11, color: "#b8cbd6", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{status}{walkStatus ? " · " + walkStatus : ""}</span>
        {selected && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <strong>{selected.label || selected.id}</strong>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Zone
              <select aria-label="Selected shape zone" value={selected.zone ?? "unassigned"} onChange={event => updateSelected({ zone: event.target.value })} style={{ background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 5, padding: 4, minHeight: 36 }}>
                {selected.zone && !["unassigned", "A", "B", "C", "D", "E"].includes(selected.zone) && <option value={selected.zone}>{selected.zone} · legacy</option>}
                <option value="unassigned">Unassigned</option>
                <option value="A">A · north-west</option>
                <option value="B">B · north-east</option>
                <option value="C">C · central</option>
                <option value="D">D · south-west</option>
                <option value="E">E · south-east</option>
              </select>
            </label>
            <label><input type="checkbox" checked={selected.blocksMove} onChange={event => updateSelected({ blocksMove: event.target.checked })} /> Move</label>
            <label><input type="checkbox" checked={selected.blocksSight} onChange={event => updateSelected({ blocksSight: event.target.checked })} /> Sight</label>
            <label><input type="checkbox" checked={selected.castsShadow ?? selected.blocksSight} onChange={event => updateSelected({ castsShadow: event.target.checked })} /> Shadow</label>
          </span>
        )}
      </footer>
    </main>
  );
}
