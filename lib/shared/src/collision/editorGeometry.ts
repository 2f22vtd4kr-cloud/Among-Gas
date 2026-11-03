import type { CollisionShape, Point } from "./vectorCollision.js";

export interface SnapResult {
  readonly point: Point;
  readonly kind: "endpoint" | "segment" | "none";
  readonly distance: number;
}

function distancePointToSegment(point: Point, a: Point, b: Point): { point: Point; distance: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));
  const projected: Point = [a[0] + t * dx, a[1] + t * dy];
  return { point: projected, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]) };
}

/** Ramer–Douglas–Peucker simplification for finger/mouse strokes. */
export function simplifyRDP(points: readonly Point[], tolerance: number): Point[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("tolerance must be non-negative");
  if (points.length <= 2) return points.map(point => [point[0], point[1]]);
  const first = points[0], last = points[points.length - 1];
  let maxDistance = -1, maxIndex = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const current = distancePointToSegment(points[i], first, last).distance;
    if (current > maxDistance) { maxDistance = current; maxIndex = i; }
  }
  if (maxDistance <= tolerance) return [[first[0], first[1]], [last[0], last[1]]];
  const left = simplifyRDP(points.slice(0, maxIndex + 1), tolerance);
  const right = simplifyRDP(points.slice(maxIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

export function snapPoint(
  shapes: readonly CollisionShape[],
  point: Point,
  threshold: number,
): SnapResult {
  if (!Number.isFinite(threshold) || threshold < 0) throw new RangeError("snap threshold must be non-negative");
  let best: SnapResult = { point, kind: "none", distance: threshold };
  // Endpoints have priority over a segment projection when distances tie.
  for (const shape of shapes) {
    for (const vertex of shape.points) {
      const d = Math.hypot(point[0] - vertex[0], point[1] - vertex[1]);
      if (d <= best.distance && (d < best.distance || best.kind !== "endpoint")) {
        best = { point: [vertex[0], vertex[1]], kind: "endpoint", distance: d };
      }
    }
  }
  if (best.kind === "endpoint" && best.distance <= threshold) return best;
  for (const shape of shapes) {
    const edges = shape.closed ? shape.points.length : shape.points.length - 1;
    for (let i = 0; i < edges; i++) {
      const match = distancePointToSegment(point, shape.points[i], shape.points[(i + 1) % shape.points.length]);
      if (match.distance < best.distance) {
        best = { point: match.point, kind: "segment", distance: match.distance };
      }
    }
  }
  return best.distance <= threshold ? best : { point, kind: "none", distance: best.distance };
}

export function shouldCloseLoop(points: readonly Point[], threshold: number): boolean {
  if (points.length < 3 || !Number.isFinite(threshold) || threshold < 0) return false;
  return Math.hypot(points[0][0] - points[points.length - 1][0],
    points[0][1] - points[points.length - 1][1]) <= threshold;
}

/** Bounded snapshot history; a new edit after undo clears the redo branch. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private state: T;
  constructor(initial: T, private readonly clone: (value: T) => T, private readonly limit = 200) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError("history limit must be positive");
    this.state = initial;
  }
  get current(): T { return this.state; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  commit(next: T): void {
    this.past.push(this.clone(this.state));
    if (this.past.length > this.limit) this.past.shift();
    this.state = next;
    this.future = [];
  }
  undo(): boolean {
    const previous = this.past.pop();
    if (previous === undefined) return false;
    this.future.push(this.clone(this.state));
    this.state = previous;
    return true;
  }
  redo(): boolean {
    const next = this.future.pop();
    if (next === undefined) return false;
    this.past.push(this.clone(this.state));
    if (this.past.length > this.limit) this.past.shift();
    this.state = next;
    return true;
  }
}
