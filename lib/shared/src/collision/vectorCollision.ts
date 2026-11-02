/**
 * Framework-free vector collision and vision primitives.
 * This is a foundation only: production use requires a complete reviewed
 * collision.v1.json. An empty or guessed map must never replace the raster.
 */
export type Point = readonly [number, number];

export interface CollisionShape {
  readonly id: string;
  readonly points: readonly Point[];
  readonly closed: boolean;
  readonly blocksMove: boolean;
  readonly blocksSight: boolean;
  readonly label?: string;
  readonly zone?: string;
}

export interface CollisionDocument {
  readonly version: 1;
  readonly mapW: number;
  readonly mapH: number;
  readonly shapes: readonly CollisionShape[];
}

interface Segment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly shapeIndex: number;
}

interface Solid {
  readonly points: readonly Point[];
  readonly bounds: readonly [number, number, number, number];
}

const EPS = 1e-8;
const DEFAULT_W = 3224;
const DEFAULT_H = 1858;
const DEFAULT_CELL = 64;
const MAX_MOVE_STEPS = 4096;
const VISION_SAMPLES = 64;

function finitePoint(p: Point): boolean {
  return Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function magnitude(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return magnitude(ax - bx, ay - by);
}

function pointOnSegment(p: Point, a: Point, b: Point): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const px = p[0] - a[0], py = p[1] - a[1];
  if (Math.abs(cross(dx, dy, px, py)) > EPS * Math.max(1, magnitude(dx, dy))) return false;
  const dot = px * dx + py * dy;
  return dot >= -EPS && dot <= dx * dx + dy * dy + EPS;
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const cdx = d[0] - c[0], cdy = d[1] - c[1];
  const o1 = cross(abx, aby, c[0] - a[0], c[1] - a[1]);
  const o2 = cross(abx, aby, d[0] - a[0], d[1] - a[1]);
  const o3 = cross(cdx, cdy, a[0] - c[0], a[1] - c[1]);
  const o4 = cross(cdx, cdy, b[0] - c[0], b[1] - c[1]);
  const eps = EPS * Math.max(1, magnitude(abx, aby), magnitude(cdx, cdy));
  if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
      ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) return true;
  return (Math.abs(o1) <= eps && pointOnSegment(c, a, b)) ||
    (Math.abs(o2) <= eps && pointOnSegment(d, a, b)) ||
    (Math.abs(o3) <= eps && pointOnSegment(a, c, d)) ||
    (Math.abs(o4) <= eps && pointOnSegment(b, c, d));
}

function area2(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

function selfIntersects(points: readonly Point[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function validateCollisionDocument(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["document must be an object"];
  const doc = value as Partial<CollisionDocument>;
  if (doc.version !== 1) errors.push("version must be 1");
  if (!Number.isFinite(doc.mapW) || (doc.mapW ?? 0) <= 0) errors.push("mapW must be positive");
  if (!Number.isFinite(doc.mapH) || (doc.mapH ?? 0) <= 0) errors.push("mapH must be positive");
  if (!Array.isArray(doc.shapes)) return [...errors, "shapes must be an array"];
  const width = Number.isFinite(doc.mapW) ? doc.mapW! : DEFAULT_W;
  const height = Number.isFinite(doc.mapH) ? doc.mapH! : DEFAULT_H;
  const ids = new Set<string>();

  doc.shapes.forEach((raw, index) => {
    const prefix = "shapes[" + index + "]";
    if (!raw || typeof raw !== "object") {
      errors.push(prefix + " must be an object");
      return;
    }
    const shape = raw as Partial<CollisionShape>;
    if (typeof shape.id !== "string" || !shape.id.trim() || shape.id.length > 96) {
      errors.push(prefix + ".id must be a non-empty string up to 96 characters");
    } else if (ids.has(shape.id)) {
      errors.push(prefix + ".id duplicates " + shape.id);
    } else ids.add(shape.id);
    if (typeof shape.closed !== "boolean") errors.push(prefix + ".closed must be boolean");
    if (typeof shape.blocksMove !== "boolean" || typeof shape.blocksSight !== "boolean") {
      errors.push(prefix + " must set boolean blocksMove and blocksSight flags");
    }
    if (shape.blocksMove !== true && shape.blocksSight !== true) {
      errors.push(prefix + " must block movement, sight, or both");
    }
    if (!Array.isArray(shape.points)) {
      errors.push(prefix + ".points must be an array");
      return;
    }
    const points = shape.points as Point[];
    const minimum = shape.closed ? 3 : 2;
    if (points.length < minimum) errors.push(prefix + " needs at least " + minimum + " points");
    if (points.length > 2000) errors.push(prefix + " exceeds the 2000 point limit");
    points.forEach((point, pointIndex) => {
      if (!finitePoint(point)) {
        errors.push(prefix + ".points[" + pointIndex + "] must be a finite [x,y] pair");
        return;
      }
      if (point[0] < 0 || point[0] > width || point[1] < 0 || point[1] > height) {
        errors.push(prefix + ".points[" + pointIndex + "] is outside map bounds");
      }
      const next = points[(pointIndex + 1) % points.length];
      if ((shape.closed || pointIndex < points.length - 1) && finitePoint(next) &&
          point[0] === next[0] && point[1] === next[1]) {
        errors.push(prefix + " has a zero-length edge at point " + pointIndex);
      }
    });
    if (shape.closed === true && points.length >= 3 && points.every(finitePoint)) {
      if (Math.abs(area2(points)) < 1e-6) errors.push(prefix + " polygon has zero area");
      if (selfIntersects(points)) errors.push(prefix + " polygon self-intersects");
    }
    if (shape.label !== undefined && typeof shape.label !== "string") {
      errors.push(prefix + ".label must be a string");
    }
    if (shape.zone !== undefined && (typeof shape.zone !== "string" || shape.zone.length > 64)) {
      errors.push(prefix + ".zone must be a string up to 64 characters");
    }
  });
  return errors;
}

function pointInPolygon(x: number, y: number, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if (pointOnSegment([x, y], a, b)) return true;
    if ((a[1] > y) !== (b[1] > y) &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function segmentDistance(px: number, py: number, segment: Segment): number {
  const dx = segment.bx - segment.ax, dy = segment.by - segment.ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1,
    ((px - segment.ax) * dx + (py - segment.ay) * dy) / length2));
  return distance(px, py, segment.ax + dx * t, segment.ay + dy * t);
}

function raySegmentDistance(px: number, py: number, dx: number, dy: number, s: Segment): number {
  const sx = s.bx - s.ax, sy = s.by - s.ay;
  const denominator = cross(dx, dy, sx, sy);
  if (Math.abs(denominator) < 1e-12) return Number.POSITIVE_INFINITY;
  const qx = s.ax - px, qy = s.ay - py;
  const rayT = cross(qx, qy, sx, sy) / denominator;
  const segmentT = cross(qx, qy, dx, dy) / denominator;
  return rayT >= 0 && segmentT >= -EPS && segmentT <= 1 + EPS
    ? rayT : Number.POSITIVE_INFINITY;
}

/**
 * Authored vector world. Open polylines are thin barriers; closed polygons
 * have a solid interior. Movement and sight flags are independently indexed.
 */
export class CollisionWorld {
  readonly shapes: readonly CollisionShape[];
  readonly w: number;
  readonly h: number;
  private readonly cell: number;
  private readonly moveSegments: Segment[] = [];
  private readonly sightSegments: Segment[] = [];
  private readonly moveHash = new Map<string, number[]>();
  private readonly sightHash = new Map<string, number[]>();
  private readonly moveSolids: Solid[] = [];
  private readonly sightSolids: Solid[] = [];

  constructor(shapes: readonly CollisionShape[], w = DEFAULT_W, h = DEFAULT_H, cell = DEFAULT_CELL) {
    if (![w, h, cell].every(Number.isFinite) || w <= 0 || h <= 0 || cell < 8) {
      throw new RangeError("world dimensions must be positive and hash cell must be at least 8px");
    }
    const cloned = shapes.map(shape => ({
      ...shape,
      points: shape.points.map(point => [point[0], point[1]] as Point),
    }));
    const errors = validateCollisionDocument({ version: 1, mapW: w, mapH: h, shapes: cloned });
    if (errors.length) throw new TypeError("Invalid collision geometry: " + errors.join("; "));
    this.w = w;
    this.h = h;
    this.cell = cell;
    this.shapes = cloned;

    cloned.forEach((shape, shapeIndex) => {
      const edgeCount = shape.closed ? shape.points.length : shape.points.length - 1;
      for (let i = 0; i < edgeCount; i++) {
        const a = shape.points[i], b = shape.points[(i + 1) % shape.points.length];
        const segment: Segment = { ax: a[0], ay: a[1], bx: b[0], by: b[1], shapeIndex };
        if (shape.blocksMove) {
          const index = this.moveSegments.push(segment) - 1;
          this.insert(this.moveHash, index, segment);
        }
        if (shape.blocksSight) {
          const index = this.sightSegments.push(segment) - 1;
          this.insert(this.sightHash, index, segment);
        }
      }
      if (shape.closed) {
        const xs = shape.points.map(point => point[0]);
        const ys = shape.points.map(point => point[1]);
        const solid: Solid = {
          points: shape.points,
          bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        };
        if (shape.blocksMove) this.moveSolids.push(solid);
        if (shape.blocksSight) this.sightSolids.push(solid);
      }
    });

    // A permanent map edge is not an editable shape and always blocks movement.
    const edge: Point[] = [[0, 0], [w, 0], [w, h], [0, h]];
    for (let i = 0; i < 4; i++) {
      const a = edge[i], b = edge[(i + 1) % 4];
      const segment: Segment = { ax: a[0], ay: a[1], bx: b[0], by: b[1], shapeIndex: -1 };
      const mi = this.moveSegments.push(segment) - 1;
      this.insert(this.moveHash, mi, segment);
      const si = this.sightSegments.push(segment) - 1;
      this.insert(this.sightHash, si, segment);
    }
  }

  private key(x: number, y: number): string {
    return x + ":" + y;
  }

  private insert(index: Map<string, number[]>, segmentIndex: number, segment: Segment): void {
    const minX = Math.floor(Math.min(segment.ax, segment.bx) / this.cell);
    const maxX = Math.floor(Math.max(segment.ax, segment.bx) / this.cell);
    const minY = Math.floor(Math.min(segment.ay, segment.by) / this.cell);
    const maxY = Math.floor(Math.max(segment.ay, segment.by) / this.cell);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = this.key(x, y);
        const bucket = index.get(key);
        if (bucket) bucket.push(segmentIndex);
        else index.set(key, [segmentIndex]);
      }
    }
  }

  private query(index: Map<string, number[]>, x: number, y: number, radius: number): Set<number> {
    const result = new Set<number>();
    const minX = Math.floor((x - radius) / this.cell);
    const maxX = Math.floor((x + radius) / this.cell);
    const minY = Math.floor((y - radius) / this.cell);
    const maxY = Math.floor((y + radius) / this.cell);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = index.get(this.key(cx, cy));
        if (bucket) for (const item of bucket) result.add(item);
      }
    }
    return result;
  }

  private insideSolids(x: number, y: number, solids: readonly Solid[]): boolean {
    for (const solid of solids) {
      const b = solid.bounds;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pointInPolygon(x, y, solid.points)) return true;
    }
    return false;
  }

  insideSolid(x: number, y: number): boolean {
    return Number.isFinite(x) && Number.isFinite(y) && this.insideSolids(x, y, this.moveSolids);
  }

  isWalkable(x: number, y: number, radius: number): boolean {
    if (![x, y, radius].every(Number.isFinite) || radius < 0 ||
        x < radius || y < radius || x > this.w - radius || y > this.h - radius) return false;
    if (this.insideSolids(x, y, this.moveSolids)) return false;
    for (const index of this.query(this.moveHash, x, y, radius)) {
      const nearest = segmentDistance(x, y, this.moveSegments[index]);
      if (radius === 0 ? nearest <= EPS : nearest < radius - EPS) return false;
    }
    return true;
  }

  /**
   * Swept, sub-stepped circular collider. Blocked diagonal attempts try each
   * axis independently to slide along walls. Excessive jumps fail closed.
   */
  move(x: number, y: number, dx: number, dy: number, radius: number): [number, number] {
    if (![x, y, dx, dy, radius].every(Number.isFinite) || radius < 0 ||
        !this.isWalkable(x, y, radius)) return [x, y];
    const length = Math.hypot(dx, dy);
    if (length < EPS) return [x, y];
    const stepLength = Math.max(1, Math.min(4, radius * 0.5 || 1));
    const steps = Math.ceil(length / stepLength);
    if (!Number.isFinite(steps) || steps > MAX_MOVE_STEPS) return [x, y];
    const sx = dx / steps, sy = dy / steps;
    let px = x, py = y;
    for (let i = 0; i < steps; i++) {
      if (this.isWalkable(px + sx, py + sy, radius)) {
        px += sx;
        py += sy;
      } else if (this.isWalkable(px + sx, py, radius)) {
        px += sx;
      } else if (this.isWalkable(px, py + sy, radius)) {
        py += sy;
      }
    }
    return [px, py];
  }

  rasterizeNav(cell = 16, radius = 12): { cols: number; rows: number; cell: number; walk: Uint8Array } {
    if (!Number.isFinite(cell) || cell < 2 || !Number.isFinite(radius) || radius < 0) {
      throw new RangeError("navigation cell must be >=2px and radius must be non-negative");
    }
    const cols = Math.ceil(this.w / cell);
    const rows = Math.ceil(this.h / cell);
    const walk = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        walk[row * cols + col] = this.isWalkable((col + 0.5) * cell, (row + 0.5) * cell, radius) ? 1 : 0;
      }
    }
    return { cols, rows, cell, walk };
  }

  visibility(x: number, y: number, radius: number): Point[] {
    if (![x, y, radius].every(Number.isFinite) || radius <= 0 ||
        x < 0 || y < 0 || x > this.w || y > this.h ||
        this.insideSolids(x, y, this.sightSolids)) return [];
    const candidates = this.query(this.sightHash, x, y, radius + this.cell);
    const angles = new Set<number>();
    const addAngle = (value: number): void => {
      const tau = Math.PI * 2;
      angles.add((value % tau + tau) % tau);
    };
    for (let i = 0; i < VISION_SAMPLES; i++) addAngle(i / VISION_SAMPLES * Math.PI * 2);

    const addEdgeAngles = (dx: number, dy: number): void => {
      const angle = Math.atan2(dy, dx);
      addAngle(angle - 1e-5);
      addAngle(angle);
      addAngle(angle + 1e-5);
    };

    for (const index of candidates) {
      const segment = this.sightSegments[index];
      const ax = segment.ax - x, ay = segment.ay - y;
      const bx = segment.bx - x, by = segment.by - y;
      const vx = bx - ax, vy = by - ay;

      // Segment endpoints inside the vision circle are angular discontinuities.
      for (const [px, py] of [[ax, ay], [bx, by]] as const) {
        if (px * px + py * py <= radius * radius + EPS) addEdgeAngles(px, py);
      }

      // A long wall can cross the vision circle while both authored endpoints
      // lie outside it. Include the exact clipped endpoints, otherwise the
      // uniform fallback rays approximate the wall and can leak around its edge.
      const quadraticA = vx * vx + vy * vy;
      if (quadraticA <= EPS * EPS) continue;
      const quadraticB = 2 * (ax * vx + ay * vy);
      const quadraticC = ax * ax + ay * ay - radius * radius;
      const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;
      const tolerance = EPS * Math.max(
        1,
        Math.abs(quadraticB * quadraticB),
        Math.abs(4 * quadraticA * quadraticC),
      );
      if (discriminant < -tolerance) continue;
      const root = Math.sqrt(Math.max(0, discriminant));
      const denominator = 2 * quadraticA;
      for (const t of [
        (-quadraticB - root) / denominator,
        (-quadraticB + root) / denominator,
      ]) {
        if (t < -EPS || t > 1 + EPS) continue;
        const clippedT = Math.max(0, Math.min(1, t));
        addEdgeAngles(ax + vx * clippedT, ay + vy * clippedT);
      }
    }

    const result: Point[] = [];
    const sortedAngles = Array.from(angles).sort((a, b) => a - b);
    for (const angle of sortedAngles) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let nearest = radius;
      for (const index of candidates) {
        const hit = raySegmentDistance(x, y, dx, dy, this.sightSegments[index]);
        if (hit < nearest) nearest = hit;
      }
      result.push([x + dx * nearest, y + dy * nearest]);
    }
    return result;
  }
}
