import { useMemo } from "react";
import { segmentsIntersect, type CollisionShape, type Point } from "@workspace/shared/collision";

interface CollisionAnalysisPanelProps {
  shapes: readonly CollisionShape[];
  mapW: number;
  mapH: number;
}

interface Segment {
  a: Point;
  b: Point;
  shapeIndex: number;
  segmentIndex: number;
  segmentCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function analyze(shapes: readonly CollisionShape[], mapW: number, mapH: number) {
  const ids = new Set<string>();
  const segments: Segment[] = [];
  let duplicateIds = 0;
  let outOfBoundsPoints = 0;
  let degenerateSegments = 0;
  let unassignedZones = 0;
  let openBoundaries = 0;
  let closedSolids = 0;
  let movementShapes = 0;
  let sightShapes = 0;

  shapes.forEach((shape, shapeIndex) => {
    if (ids.has(shape.id)) duplicateIds++;
    ids.add(shape.id);
    if (!shape.zone || shape.zone === "unassigned") unassignedZones++;
    if (shape.closed) closedSolids++;
    else openBoundaries++;
    if (shape.blocksMove) movementShapes++;
    if (shape.blocksSight) sightShapes++;
    shape.points.forEach(([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > mapW || y > mapH) {
        outOfBoundsPoints++;
      }
    });
    const count = shape.closed ? shape.points.length : Math.max(0, shape.points.length - 1);
    for (let i = 0; i < count; i++) {
      const a = shape.points[i];
      const b = shape.points[(i + 1) % shape.points.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.75) degenerateSegments++;
      segments.push({
        a, b, shapeIndex, segmentIndex: i, segmentCount: count,
        minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
        minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
      });
    }
  });

  // Sweep by the left edge; bounding-box rejection keeps the exact segment
  // checks local even for large authored maps.
  segments.sort((a, b) => a.minX - b.minX);
  const active: Segment[] = [];
  let intersections = 0;
  let selfIntersections = 0;
  let truncated = false;
  for (const current of segments) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].maxX < current.minX) active.splice(i, 1);
    }
    for (const other of active) {
      if (other.maxY < current.minY || current.maxY < other.minY) continue;
      if (other.shapeIndex === current.shapeIndex) {
        const sameShape = shapes[current.shapeIndex];
        const adjacent = Math.abs(other.segmentIndex - current.segmentIndex) <= 1 ||
          (sameShape.closed && Math.abs(other.segmentIndex - current.segmentIndex) === current.segmentCount - 1);
        if (adjacent) continue;
      }
      if (!segmentsIntersect(other.a, other.b, current.a, current.b)) continue;
      intersections++;
      if (other.shapeIndex === current.shapeIndex) selfIntersections++;
      if (intersections >= 5000) { truncated = true; break; }
    }
    if (truncated) break;
    active.push(current);
  }
  return {
    shapeCount: shapes.length, segmentCount: segments.length, duplicateIds,
    outOfBoundsPoints, degenerateSegments, unassignedZones, openBoundaries,
    closedSolids, movementShapes, sightShapes, intersections, selfIntersections, truncated,
  };
}

const metricStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "5px 0",
  borderBottom: "1px solid rgba(130,160,180,.18)",
  fontSize: 12,
} as const;

export default function CollisionAnalysisPanel({ shapes, mapW, mapH }: CollisionAnalysisPanelProps) {
  const result = useMemo(() => analyze(shapes, mapW, mapH), [shapes, mapW, mapH]);
  const issues = result.duplicateIds + result.outOfBoundsPoints + result.degenerateSegments + result.selfIntersections;
  return (
    <aside aria-label="Collision geometry analysis" data-testid="collision-analysis" style={{
      position: "absolute", zIndex: 4, top: 8, right: 8, width: "min(300px, calc(100% - 16px))",
      maxHeight: "calc(100% - 16px)", overflow: "auto", padding: 12, borderRadius: 10,
      border: "1px solid #526c7e", background: "rgba(13,24,34,.96)", color: "#e8f1f5",
      boxShadow: "0 8px 28px rgba(0,0,0,.42)", fontFamily: "system-ui, sans-serif",
    }}>
      <strong style={{ fontSize: 13 }}>Geometry analyzer</strong>
      <div style={{ marginTop: 8, ...metricStyle }}><span>Shapes / segments</span><b>{result.shapeCount} / {result.segmentCount}</b></div>
      <div style={metricStyle}><span>Movement / sight</span><b>{result.movementShapes} / {result.sightShapes}</b></div>
      <div style={metricStyle}><span>Open boundaries / solids</span><b>{result.openBoundaries} / {result.closedSolids}</b></div>
      <div style={metricStyle}><span>Unassigned zones</span><b>{result.unassignedZones}</b></div>
      <div style={metricStyle}><span>Out-of-bounds points</span><b>{result.outOfBoundsPoints}</b></div>
      <div style={metricStyle}><span>Degenerate segments</span><b>{result.degenerateSegments}</b></div>
      <div style={metricStyle}><span>Self-intersections</span><b>{result.selfIntersections}</b></div>
      <div style={metricStyle}><span>All intersections</span><b>{result.intersections}{result.truncated ? "+" : ""}</b></div>
      <p role="status" style={{ margin: "10px 0 0", color: issues ? "#ffd28a" : "#8ce0ad", fontSize: 11, lineHeight: 1.45 }}>
        {issues ? "Review the reported geometry defects before exporting." : "No basic geometry defects detected."}
      </p>
      <p style={{ margin: "7px 0 0", color: "#9db3c1", fontSize: 10, lineHeight: 1.4 }}>
        This is a geometric integrity check, not proof of task reachability, corridor width, or playable-region connectivity. Run the production route and spawn tests for those guarantees.
      </p>
    </aside>
  );
}
