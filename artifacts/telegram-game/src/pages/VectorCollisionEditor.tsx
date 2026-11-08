import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
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
import {
  FEET_OFFSET_Y,
  MAP_H,
  MAP_W,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from "@workspace/shared/coords";
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from "@workspace/shared/tasks";
import { VENT_DEFS, VENT_INTERACTION_RANGE_PX } from "@workspace/shared/vents";

type Tool = "pan" | "wall" | "solid" | "edit" | "erase" | "walk" | "vision" | "loupe";
type EditableShape = Omit<CollisionShape, "points"> & { points: Point[] };
type EditableDocument = Omit<CollisionDocument, "shapes"> & { shapes: EditableShape[] };
type Gesture =
  | { kind: "pan"; x: number; y: number }
  | { kind: "wall"; points: Point[] }
  | { kind: "solid"; point: Point; close: boolean }
  | { kind: "erase"; point: Point }
  | { kind: "walk"; point: Point }
  | { kind: "vision"; point: Point; clientX: number; clientY: number }
  | { kind: "vertex"; shapeId: string; index: number };

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
  vision: "Vision preview (hold)",
  loupe: "Loupe (4×)",
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


interface AnalysisTarget {
  id: string;
  name: string;
  reachable: boolean;
  approach: Point | null;
}

interface CandidateAnalysis {
  validationErrors: string[];
  walkableCells: number;
  spawnReachableCells: number;
  componentCount: number;
  disconnectedComponents: Array<{ cells: number; center: Point }>;
  narrowCells: number;
  tasks: AnalysisTarget[];
  vents: AnalysisTarget[];
  unassignedShapes: number;
}

function analyzeCandidate(document: EditableDocument): CandidateAnalysis {
  const validationErrors = validateCollisionDocument(document);
  const world = new CollisionWorld(document.shapes);
  const cols = 208;
  const rows = 116;
  const nav = world.rasterizePlayerNav(cols, rows);
  const cellCount = nav.walk.length;
  const queue = new Int32Array(cellCount);
  const colOf = (index: number) => index % cols;
  const rowOf = (index: number) => Math.floor(index / cols);
  const centerOf = (index: number): Point => [
    (colOf(index) + 0.5) * nav.cellX,
    (rowOf(index) + 0.5) * nav.cellY,
  ];
  const spawnFeet: Point = [PLAYER_SPAWN_X, PLAYER_SPAWN_Y + FEET_OFFSET_Y];
  const spawnCol = Math.max(0, Math.min(cols - 1, Math.floor(spawnFeet[0] / nav.cellX)));
  const spawnRow = Math.max(0, Math.min(rows - 1, Math.floor(spawnFeet[1] / nav.cellY)));
  let start = spawnRow * cols + spawnCol;

  if (nav.walk[start] !== 1) {
    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius <= 8; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const col = spawnCol + dx, row = spawnRow + dy;
          if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
          const index = row * cols + col;
          if (nav.walk[index] !== 1) continue;
          const [x, y] = centerOf(index);
          const distance = Math.hypot(x - spawnFeet[0], y - spawnFeet[1]);
          if (distance < nearestDistance) { nearest = index; nearestDistance = distance; }
        }
      }
      if (nearest >= 0) break;
    }
    if (nearest < 0) throw new Error("No walkable player-footprint cell exists near the production spawn.");
    start = nearest;
  }

  const flood = (seed: number, marks: Uint8Array): { count: number; sumX: number; sumY: number } => {
    let head = 0, tail = 0, sumX = 0, sumY = 0;
    queue[tail++] = seed;
    marks[seed] = 1;
    while (head < tail) {
      const index = queue[head++];
      const col = colOf(index), row = rowOf(index);
      const [x, y] = centerOf(index);
      sumX += x; sumY += y;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nextCol = col + dx, nextRow = row + dy;
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) continue;
        const next = nextRow * cols + nextCol;
        if (nav.walk[next] === 1 && marks[next] === 0) {
          marks[next] = 1;
          queue[tail++] = next;
        }
      }
      // Do not allow diagonal corner cutting through two blocked orthogonal cells.
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const nextCol = col + dx, nextRow = row + dy;
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) continue;
        const sideA = row * cols + nextCol;
        const sideB = nextRow * cols + col;
        const next = nextRow * cols + nextCol;
        if (nav.walk[next] === 1 && nav.walk[sideA] === 1 && nav.walk[sideB] === 1 && marks[next] === 0) {
          marks[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    return { count: tail, sumX, sumY };
  };

  const reachable = new Uint8Array(cellCount);
  const spawnFlood = flood(start, reachable);
  let walkableCells = 0;
  let narrowCells = 0;
  for (let index = 0; index < cellCount; index++) {
    const [x, y] = centerOf(index);
    const footprintWalkable = nav.walk[index] === 1;
    if (footprintWalkable) walkableCells++;
    // Count cells that a point could enter but the full production three-circle
    // footprint cannot. This loop deliberately includes blocked nav cells.
    if (!footprintWalkable && world.isWalkable(x, y, 0)) narrowCells++;
  }

  const components = new Uint8Array(cellCount);
  const summaries: Array<{ cells: number; center: Point }> = [];
  let componentCount = 0;
  for (let index = 0; index < cellCount; index++) {
    if (nav.walk[index] !== 1 || components[index] !== 0) continue;
    const containsSpawn = reachable[index] === 1;
    const component = flood(index, components);
    componentCount++;
    if (!containsSpawn) {
      summaries.push({
        cells: component.count,
        center: [component.sumX / component.count, component.sumY / component.count],
      });
    }
  }
  summaries.sort((a, b) => b.cells - a.cells);

  const findApproach = (
    targetX: number,
    targetY: number,
    range: number,
    targetRadius: number,
  ): Point | null => {
    const maxDistance = Math.max(0, range - 8 + targetRadius);
    const colMin = Math.max(0, Math.floor((targetX - maxDistance) / nav.cellX));
    const colMax = Math.min(cols - 1, Math.ceil((targetX + maxDistance) / nav.cellX));
    const rowMin = Math.max(0, Math.floor((targetY - maxDistance) / nav.cellY));
    const rowMax = Math.min(rows - 1, Math.ceil((targetY + maxDistance) / nav.cellY));
    const candidates: Array<{ point: Point; distance: number }> = [];
    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const index = row * cols + col;
        if (reachable[index] !== 1) continue;
        const point = centerOf(index);
        const distance = Math.hypot(point[0] - targetX, point[1] - targetY);
        if (distance <= maxDistance) candidates.push({ point, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates.slice(0, 16)) {
      if (world.isLineOfSightToInteractionTarget(
        candidate.point[0], candidate.point[1], targetX, targetY, targetRadius,
      )) return candidate.point;
    }
    return null;
  };

  const tasks: AnalysisTarget[] = TASK_DEFS.map(task => {
    const approach = findApproach(
      task.x, task.y + FEET_OFFSET_Y, TASK_INTERACTION_RANGE_PX,
      task.interactionTargetRadiusPx ?? 24,
    );
    return { id: String(task.id), name: task.name, reachable: approach !== null, approach };
  });
  const vents: AnalysisTarget[] = VENT_DEFS.map(vent => {
    const approach = findApproach(
      vent.x, vent.y + FEET_OFFSET_Y, VENT_INTERACTION_RANGE_PX, 20,
    );
    return { id: String(vent.id), name: vent.name, reachable: approach !== null, approach };
  });

  return {
    validationErrors,
    walkableCells,
    spawnReachableCells: spawnFlood.count,
    componentCount,
    disconnectedComponents: summaries.slice(0, 8),
    narrowCells,
    tasks,
    vents,
    unassignedShapes: document.shapes.filter(shape => !("zone" in shape) || !shape.zone || shape.zone === "unassigned").length,
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
  const visionPressTimerRef = useRef<number | null>(null);

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
  const [zoneBusy, setZoneBusy] = useState(false);
  const [status, setStatus] = useState("Loading vector workspace…");
  const [blocksMove, setBlocksMove] = useState(true);
  const [blocksSight, setBlocksSight] = useState(true);
  const [shapeLabel, setShapeLabel] = useState("");
  const [zone, setZone] = useState("unassigned");
  const [walkPoints, setWalkPoints] = useState<Point[]>([]);
  const walkPointsRef = useRef<Point[]>([]);
  const [walkStatus, setWalkStatus] = useState("");
  const [visionOrigin, setVisionOrigin] = useState<Point | null>(null);
  const [loupe, setLoupe] = useState<{ world: Point; screenX: number; screenY: number } | null>(null);
  const [analysis, setAnalysis] = useState<CandidateAnalysis | null>(null);
  const candidateWorld = useMemo(() => {
    try {
      return new CollisionWorld(document.shapes);
    } catch {
      // Keep editing possible while a candidate polygon is temporarily invalid.
      return null;
    }
  }, [document.shapes]);

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

    // Candidate-only raycast preview. This overlay is diagnostic and is never
    // read by the live client/server collision or vision paths.
    if (visionOrigin && candidateWorld) {
      const visibility = candidateWorld.visibility(visionOrigin[0], visionOrigin[1], 320);
      if (visibility.length >= 3) {
        context.beginPath();
        visibility.forEach((point, index) => {
          if (index === 0) context.moveTo(point[0], point[1]);
          else context.lineTo(point[0], point[1]);
        });
        context.closePath();
        context.fillStyle = "rgba(255, 225, 120, 0.20)";
        context.fill();
        context.strokeStyle = "rgba(255, 225, 120, 0.95)";
        context.lineWidth = 2 / camera.zoom;
        context.setLineDash([8 / camera.zoom, 5 / camera.zoom]);
        context.stroke();
        context.setLineDash([]);
      }
      context.beginPath();
      context.arc(visionOrigin[0], visionOrigin[1], 7 / camera.zoom, 0, Math.PI * 2);
      context.fillStyle = "#ffe178";
      context.fill();
      context.strokeStyle = "#13202a";
      context.lineWidth = 2 / camera.zoom;
      context.stroke();
    }

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

    if (loupe) {
      const lensRadius = 78;
      const magnification = camera.zoom * 4;
      context.save();
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.beginPath();
      context.arc(loupe.screenX, loupe.screenY, lensRadius, 0, Math.PI * 2);
      context.clip();
      context.setTransform(
        magnification * dpr, 0, 0, magnification * dpr,
        (loupe.screenX - loupe.world[0] * magnification) * dpr,
        (loupe.screenY - loupe.world[1] * magnification) * dpr,
      );
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, MAP_W, MAP_H);
      for (const shape of document.shapes) {
        context.beginPath();
        shape.points.forEach((point, index) => {
          if (index === 0) context.moveTo(point[0], point[1]);
          else context.lineTo(point[0], point[1]);
        });
        if (shape.closed) context.closePath();
        if (shape.closed) {
          context.fillStyle = shape.blocksMove ? "rgba(255,75,85,0.20)" : "rgba(60,220,190,0.13)";
          context.fill();
        }
        context.strokeStyle = shape.blocksMove && shape.blocksSight ? "#ff5c68" : shape.blocksMove ? "#e79a45" : "#55d9cd";
        context.lineWidth = 2 / magnification;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.stroke();
      }
      context.restore();
      context.save();
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.beginPath();
      context.arc(loupe.screenX, loupe.screenY, lensRadius, 0, Math.PI * 2);
      context.strokeStyle = "#ffe079";
      context.lineWidth = 3;
      context.shadowColor = "rgba(0,0,0,0.75)";
      context.shadowBlur = 8;
      context.stroke();
      context.shadowBlur = 0;
      context.beginPath();
      context.moveTo(loupe.screenX - 13, loupe.screenY);
      context.lineTo(loupe.screenX + 13, loupe.screenY);
      context.moveTo(loupe.screenX, loupe.screenY - 13);
      context.lineTo(loupe.screenX, loupe.screenY + 13);
      context.strokeStyle = "rgba(255,255,255,0.85)";
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = "rgba(5,12,18,0.88)";
      context.fillRect(loupe.screenX - 39, loupe.screenY + lensRadius + 5, 78, 21);
      context.fillStyle = "#ffe079";
      context.font = "11px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("4× LOUPE", loupe.screenX, loupe.screenY + lensRadius + 20);
      context.restore();
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
  }, [document, candidateWorld, visionOrigin, loupe, selectedId, draftPoints, previewPoint, walkPoints, activeChain, draftWallPoints]);

  useEffect(() => { drawRef.current = draw; }, [draw]);

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
      if (visionPressTimerRef.current !== null) window.clearTimeout(visionPressTimerRef.current);
      visionPressTimerRef.current = null;
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

  useEffect(() => { scheduleDraw(); }, [scheduleDraw, document, selectedId, draftPoints, previewPoint, walkPoints, activeChain, draftWallPoints, visionOrigin, loupe]);
  useEffect(() => { setAnalysis(null); }, [document]);

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
      setLoupe(null);
      if (visionPressTimerRef.current !== null) window.clearTimeout(visionPressTimerRef.current);
      visionPressTimerRef.current = null;
      // A second finger always takes over as a viewport gesture, regardless
      // of the selected drawing/editing tool. Cancel a wall/vertex drag rather
      // than allowing the second pointer-up to commit an accidental shape.
      if (gestureRef.current?.kind === "vertex") {
        historyRef.current.commit(docRef.current);
        setSaved(false);
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
    if (tool === "loupe") {
      const rect = event.currentTarget.getBoundingClientRect();
      setLoupe({ world: point, screenX: event.clientX - rect.left, screenY: event.clientY - rect.top });
      return;
    }
    if (tool === "vision") {
      gestureRef.current = { kind: "vision", point, clientX: event.clientX, clientY: event.clientY };
      visionPressTimerRef.current = window.setTimeout(() => {
        const activeGesture = gestureRef.current;
        if (activeGesture?.kind !== "vision") return;
        if (!candidateWorld) {
          setStatus("Vision preview unavailable: correct invalid candidate geometry before raycasting.");
          return;
        }
        setVisionOrigin(activeGesture.point);
        setStatus("Candidate vision preview active · 320px raycast · diagnostic only, not live gameplay.");
      }, 550);
      return;
    }
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
        const snapped = snapPoint(docRef.current.shapes, point, 12 / camera.zoom);
        if (snapped.kind !== "none") start = snapped.point;
      }
      gestureRef.current = { kind: "wall", points: [start] };
      setDraftWallPoints([start]);
      setPreviewPoint(start);
      return;
    }
    if (tool === "solid") {
      const camera = cameraRef.current;
      const snapped = snapPoint(docRef.current.shapes, point, 12 / camera.zoom);
      const nextPoint = snapped.kind === "none" ? point : snapped.point;
      const close = draftPoints.length >= 3 &&
        Math.hypot(nextPoint[0] - draftPoints[0][0], nextPoint[1] - draftPoints[0][1]) <= 18 / camera.zoom;
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
          if (d <= 16 / camera.zoom && (!best || d < best.distance)) {
            best = { shapeId: shape.id, index, distance: d };
          }
        }
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
      gestureRef.current = { kind: "erase", point };
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
      const zoom = Math.max(0.1, Math.min(8, pinchRef.current.zoom * currentDistance / pinchRef.current.distance));
      cameraRef.current.zoom = zoom;
      cameraRef.current.x = pinchRef.current.world[0] - centerX / zoom;
      cameraRef.current.y = pinchRef.current.world[1] - centerY / zoom;
      setZoomDisplay(zoom);
      scheduleDraw();
      return;
    }

    if (tool === "loupe" && pointersRef.current.size <= 1) {
      const rect = event.currentTarget.getBoundingClientRect();
      setLoupe({ world: worldPoint(event), screenX: event.clientX - rect.left, screenY: event.clientY - rect.top });
      scheduleDraw();
      return;
    }
    const gesture = gestureRef.current;
    if (gesture?.kind === "vision") {
      if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) > 12) {
        if (visionPressTimerRef.current !== null) window.clearTimeout(visionPressTimerRef.current);
        visionPressTimerRef.current = null;
        gestureRef.current = null;
        setStatus("Vision preview cancelled because the press moved. Hold still to inspect sight lines.");
      }
      return;
    }
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
      const snapped = snapPoint(current.shapes.filter(item => item.id !== shape.id), point, 10 / cameraRef.current.zoom);
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
    if (visionPressTimerRef.current !== null) window.clearTimeout(visionPressTimerRef.current);
    visionPressTimerRef.current = null;
    const gesture = gestureRef.current;
    if (gesture?.kind === "wall") {
      const points = [...gesture.points];
      const end = worldPoint(event);
      const camera = cameraRef.current;
      const endSnap = snapPoint(docRef.current.shapes, end, 12 / camera.zoom);
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
      const target = nearestShape(gesture.point, 22 / cameraRef.current.zoom);
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
      historyRef.current.commit(docRef.current);
      setSaved(false);
      setDirty(true);
      setLocalDraft(null);
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
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        contentHash?: string;
        backupCount?: number;
      };
      if (!response.ok) throw new Error(result.error || "Save rejected (" + response.status + ")");
      if (!result.contentHash || !/^[a-f0-9]{64}$/.test(result.contentHash)) {
        throw new Error("Save response did not include a valid SHA-256 content hash");
      }
      historyRef.current = new History<EditableDocument>(docRef.current, cloneDocument, 200);
      setSaved(true);
      setDirty(false);
      setLocalDraft(null);
      try { window.localStorage.removeItem(LOCAL_DRAFT_KEY); } catch { /* best-effort cleanup */ }
      setStatus(
        "Candidate saved · SHA-256 " + result.contentHash.slice(0, 12) +
        " · " + (result.backupCount ?? 0) + " retained backups. Live gameplay still uses the reviewed raster mask.",
      );
    } catch (error) {
      setStatus("Save failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  const saveZone = async () => {
    if (!["A", "B", "C", "D", "E"].includes(zone)) {
      setStatus("Select a reviewed map zone A–E before saving a zone candidate.");
      return;
    }
    const zoneShapes = docRef.current.shapes.filter(shape => shape.zone === zone);
    if (!zoneShapes.length) {
      setStatus("Zone " + zone + " has no shapes to save. Assign each authored shape to the selected zone.");
      return;
    }
    const zoneDocument: EditableDocument = { ...docRef.current, shapes: zoneShapes };
    const errors = validateCollisionDocument(zoneDocument);
    if (errors.length) {
      setStatus("Zone " + zone + " cannot be saved: " + errors.slice(0, 4).join("; "));
      return;
    }
    setZoneBusy(true);
    setStatus("Saving zone " + zone + " candidate…");
    try {
      const response = await fetch(import.meta.env.BASE_URL + "__vector-collision-api/zones/" + zone, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Vector-Collision-Editor": "1" },
        body: JSON.stringify(zoneDocument),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        contentHash?: string;
        backupCount?: number;
      };
      if (!response.ok) throw new Error(result.error || "Zone save rejected (" + response.status + ")");
      if (!result.contentHash || !/^[a-f0-9]{64}$/.test(result.contentHash)) {
        throw new Error("Zone save response did not include a valid SHA-256 content hash");
      }
      setStatus(
        "Zone " + zone + " saved · " + zoneShapes.length + " shapes · SHA-256 " +
        result.contentHash.slice(0, 12) + " · " + (result.backupCount ?? 0) +
        " retained zone backups. Full candidate and live gameplay are unchanged.",
      );
    } catch (error) {
      setStatus("Zone " + zone + " save failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setZoneBusy(false);
    }
  };

  const loadZone = async () => {
    if (!["A", "B", "C", "D", "E"].includes(zone)) {
      setStatus("Select a saved zone A–E to load.");
      return;
    }
    setZoneBusy(true);
    setStatus("Loading zone " + zone + " candidate…");
    try {
      const response = await fetch(import.meta.env.BASE_URL + "__vector-collision-api/zones/" + zone, {
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        saved?: boolean;
        document?: EditableDocument;
      };
      if (!response.ok) throw new Error(result.error || "Zone load rejected (" + response.status + ")");
      if (!result.saved || !result.document?.shapes?.length) {
        setStatus("No saved candidate exists for zone " + zone + ".");
        return;
      }
      if (result.document.shapes.some(shape => shape.zone !== zone)) {
        throw new Error("Saved zone file contains a shape assigned to another zone");
      }
      const current = cloneDocument(docRef.current);
      const merged: EditableDocument = {
        ...current,
        shapes: [
          ...current.shapes.filter(shape => shape.zone !== zone),
          ...result.document.shapes,
        ],
      };
      const errors = validateCollisionDocument(merged);
      if (errors.length) {
        throw new Error("Zone merge rejected: " + errors.slice(0, 4).join("; "));
      }
      replaceDocument(merged);
      setStatus("Loaded " + result.document.shapes.length + " saved shapes for zone " + zone + " into the unsaved working document.");
    } catch (error) {
      setStatus("Zone " + zone + " load failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setZoneBusy(false);
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

  const runAnalysis = () => {
    try {
      const result = analyzeCandidate(document);
      setAnalysis(result);
      const unreachable = result.tasks.filter(target => !target.reachable).length +
        result.vents.filter(target => !target.reachable).length;
      setStatus(
        "Candidate analysis complete · " + result.spawnReachableCells + "/" + result.walkableCells +
        " player-walkable cells spawn-reachable · " + unreachable + " unreachable task/vent targets.",
      );
    } catch (error) {
      setAnalysis(null);
      setStatus("Candidate analysis failed: " + (error instanceof Error ? error.message : String(error)));
    }
  };

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
        {(["pan", "wall", "solid", "edit", "erase", "walk", "vision", "loupe"] as Tool[]).map(item => (
          <button key={item} type="button" style={buttonStyle(tool === item)} onClick={() => { setTool(item); setLoupe(null); }}>{TOOL_LABELS[item]}</button>
        ))}
        <span style={{ width: 1, background: "#435b6d", margin: "0 3px" }} />
        <button type="button" style={buttonStyle()} onClick={undo} disabled={!historyRef.current.canUndo}>Undo</button>
        <button type="button" style={buttonStyle()} onClick={redo} disabled={!historyRef.current.canRedo}>Redo</button>
        <button type="button" style={buttonStyle()} onClick={() => { setDraftPoints([]); setDirty(true); setSaved(false); }} disabled={!draftPoints.length}>Cancel polygon</button>
        <button type="button" style={buttonStyle()} onClick={finishPolygon} disabled={draftPoints.length < 3}>Close polygon</button>
        <button type="button" style={buttonStyle()} onClick={() => zoomBy(0.8)}>−</button>
        <button type="button" style={buttonStyle()} onClick={() => zoomBy(1.25)}>+</button>
        <button type="button" style={buttonStyle()} onClick={fitMap}>Fit map</button>
        <button type="button" style={buttonStyle(activeChain.length > 0)} onClick={jumpToChainEnd} disabled={!activeChain.length}>Jump to end</button>
        <button type="button" style={buttonStyle(activeChain.length > 1)} onClick={finishActiveChain} disabled={activeChain.length < 2}>Finish chain</button>
        {localDraft && <button type="button" style={buttonStyle(true)} onClick={restoreLocalDraft}>Restore local draft</button>}
        <button type="button" style={buttonStyle(walkPoints.length > 0)} onClick={() => { walkPointsRef.current = []; setWalkPoints([]); setWalkStatus(""); }}>Clear route test</button>
        <button type="button" style={buttonStyle(visionOrigin !== null)} onClick={() => setVisionOrigin(null)} disabled={!visionOrigin}>Clear vision preview</button>
        <button type="button" style={buttonStyle(loupe !== null)} onClick={() => setLoupe(null)} disabled={!loupe}>Clear loupe</button>
        <button type="button" style={buttonStyle(analysis !== null)} onClick={runAnalysis}>Analyze candidate</button>
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
        <input value={shapeLabel} onChange={event => setShapeLabel(event.target.value)} maxLength={80} placeholder="Shape label" aria-label="Shape label" style={{ minWidth: 110, flex: 1, background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 6, padding: "7px 9px", minHeight: 48, fontSize: 12 }} />
        <select value={zone} onChange={event => setZone(event.target.value)} aria-label="Map zone" style={{ background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 6, padding: 7, minHeight: 48, fontSize: 12 }}>
          <option value="unassigned">Zone: unassigned</option>
          <option value="A">A · north-west</option>
          <option value="B">B · north-east</option>
          <option value="C">C · central</option>
          <option value="D">D · south-west</option>
          <option value="E">E · south-east</option>
        </select>
        <button type="button" style={buttonStyle()} onClick={() => void loadZone()} disabled={zoneBusy || saving || zone === "unassigned"}>Load zone</button>
        <button type="button" style={buttonStyle()} onClick={() => void saveZone()} disabled={zoneBusy || saving || zone === "unassigned" || !document.shapes.some(shape => shape.zone === zone)}>Save zone</button>
        <button type="button" style={buttonStyle()} onClick={exportDocument}>Export JSON</button>
        <label style={{ ...buttonStyle(), display: "inline-flex", alignItems: "center" }}>
          Import JSON<input type="file" accept="application/json,.json" onChange={importDocument} style={{ display: "none" }} />
        </label>
        <button type="button" style={{ ...buttonStyle(), background: "#4b432a", borderColor: "#e2bd6a" }} onClick={() => void save()} disabled={saving || !document.shapes.length || activeChain.length > 1}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save candidate"}
        </button>
      </section>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          data-editor-loaded={loaded ? "true" : "false"}
          data-shape-count={document.shapes.length}
          data-zoom={zoomDisplay}
          data-draft-point-count={draftPoints.length}
          data-walk-point-count={walkPoints.length}
          data-walk-status={walkStatus}
          data-vision-preview={visionOrigin ? "true" : "false"}
          data-vision-origin={visionOrigin ? visionOrigin.join(",") : ""}
          data-loupe-active={loupe ? "true" : "false"}
          data-loupe-origin={loupe ? loupe.world.join(",") : ""}
          data-analysis-task-count={analysis?.tasks.length ?? ""}
          data-analysis-vent-count={analysis?.vents.length ?? ""}
          data-analysis-unreachable-count={analysis ? analysis.tasks.filter(t => !t.reachable).length + analysis.vents.filter(v => !v.reachable).length : ""}
          data-zone={zone}
          data-zone-busy={zoneBusy ? "true" : "false"}
          data-active-chain-point-count={activeChain.length}
          data-draft-wall-point-count={draftWallPoints.length}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => { if (pointersRef.current.size === 0) setLoupe(null); }}
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: tool === "pan" ? "grab" : tool === "edit" ? "move" : "crosshair" }}
        />
        {!loaded && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(10,18,26,.84)", fontSize: 14 }}>Loading geometry workspace…</div>}
      </div>

      {analysis && (
        <section
          data-candidate-analysis="complete"
          style={{ padding: "8px 12px", background: "#1b2a36", borderTop: "1px solid #445b6b", fontSize: 11, lineHeight: 1.5, maxHeight: 150, overflow: "auto" }}
        >
          <strong>Candidate-only geometry analysis</strong>
          <span> · {analysis.validationErrors.length} validation errors · {analysis.componentCount} walkable components · {analysis.narrowCells} narrow-footprint cells · {analysis.unassignedShapes} unassigned shapes</span>
          <div>Tasks reachable from spawn with interaction LOS: {analysis.tasks.filter(target => target.reachable).length}/{analysis.tasks.length}. Vents: {analysis.vents.filter(target => target.reachable).length}/{analysis.vents.length}.</div>
          {analysis.validationErrors.slice(0, 3).map((error, index) => <div key={"validation-" + index} style={{ color: "#ff999f" }}>Geometry: {error}</div>)}
          {[...analysis.tasks, ...analysis.vents].filter(target => !target.reachable).map(target => (
            <div key={target.id + target.name} style={{ color: "#ffd17c" }}>Unreachable: {target.name} ({analysis.tasks.includes(target) ? "task" : "vent"})</div>
          ))}
          {analysis.disconnectedComponents.slice(0, 3).map((component, index) => (
            <div key={"island-" + index}>Disconnected island {index + 1}: {component.cells} player cells near {Math.round(component.center[0])},{Math.round(component.center[1])}</div>
          ))}
          <div style={{ color: "#91aebe" }}>Diagnostic only. Narrow cells and disconnected areas require author review; no geometry is changed or automatically accepted.</div>
        </section>
      )}

      <footer style={{ padding: "8px 10px", background: "#182633", borderTop: "1px solid #334c5e", fontSize: 11, color: "#b8cbd6", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{status}{walkStatus ? " · " + walkStatus : ""}</span>
        {selected && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <strong>{selected.label || selected.id}</strong>
            <label><input type="checkbox" checked={selected.blocksMove} onChange={event => updateSelected({ blocksMove: event.target.checked })} /> Move</label>
            <label><input type="checkbox" checked={selected.blocksSight} onChange={event => updateSelected({ blocksSight: event.target.checked })} /> Sight</label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Zone
              <select
                aria-label="Selected shape zone"
                value={selected.zone ?? "unassigned"}
                onChange={event => updateSelected({ zone: event.target.value === "unassigned" ? undefined : event.target.value })}
                style={{ minHeight: 40, maxWidth: 100, background: "#0d1720", color: "white", border: "1px solid #536879", borderRadius: 6, padding: "5px 7px", fontSize: 11 }}
              >
                <option value="unassigned">Unassigned</option>
                {["A", "B", "C", "D", "E"].map(value => <option key={value} value={value}>Zone {value}</option>)}
              </select>
            </label>
          </span>
        )}
      </footer>
    </main>
  );
}
