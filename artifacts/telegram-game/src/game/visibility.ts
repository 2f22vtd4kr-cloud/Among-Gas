import type { Grid } from '@workspace/shared/collisionMap';
import { CELL_X, CELL_Y, COLS, ROWS } from '@workspace/shared/collisionMap';

export interface VisionSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface VisionPoint {
  x: number;
  y: number;
}

const ANGLE_EPSILON = 0.0001;
const BOUNDARY_RAYS = 64;

/** Convert blocked collision cells into merged wall-boundary segments. */
export function buildVisionSegments(grid: Grid): VisionSegment[] {
  const horizontal: VisionSegment[] = [];
  const vertical: VisionSegment[] = [];

  const blocked = (col: number, row: number): boolean =>
    col < 0 || col >= COLS || row < 0 || row >= ROWS || grid[row * COLS + col] === 1;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (!blocked(col, row)) continue;

      const x1 = col * CELL_X;
      const x2 = (col + 1) * CELL_X;
      const y1 = row * CELL_Y;
      const y2 = (row + 1) * CELL_Y;

      // Only the blocked/walkable interface occludes vision. Edges adjacent to
      // another blocked cell are internal and would waste ray-casting work.
      if (!blocked(col, row - 1)) horizontal.push({ ax: x1, ay: y1, bx: x2, by: y1 });
      if (!blocked(col, row + 1)) horizontal.push({ ax: x1, ay: y2, bx: x2, by: y2 });
      if (!blocked(col - 1, row)) vertical.push({ ax: x1, ay: y1, bx: x1, by: y2 });
      if (!blocked(col + 1, row)) vertical.push({ ax: x2, ay: y1, bx: x2, by: y2 });
    }
  }

  const merge = (segments: VisionSegment[], isHorizontal: boolean): VisionSegment[] => {
    segments.sort((a, b) => isHorizontal
      ? a.ay - b.ay || a.ax - b.ax
      : a.ax - b.ax || a.ay - b.ay);
    const merged: VisionSegment[] = [];
    for (const segment of segments) {
      const previous = merged[merged.length - 1];
      const sameLine = previous && (isHorizontal
        ? Math.abs(previous.ay - segment.ay) < 0.001
        : Math.abs(previous.ax - segment.ax) < 0.001);
      const previousEnd = previous && (isHorizontal ? previous.bx : previous.by);
      const nextStart = isHorizontal ? segment.ax : segment.ay;
      if (previous && sameLine && previousEnd !== undefined && nextStart <= previousEnd + 0.001) {
        if (isHorizontal) previous.bx = Math.max(previous.bx, segment.bx);
        else previous.by = Math.max(previous.by, segment.by);
      } else {
        merged.push({ ...segment });
      }
    }
    return merged;
  };

  return [...merge(horizontal, true), ...merge(vertical, false)];
}

function raySegmentDistance(
  ox: number, oy: number, dx: number, dy: number, segment: VisionSegment,
): number | null {
  const sx = segment.bx - segment.ax;
  const sy = segment.by - segment.ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;

  const qx = segment.ax - ox;
  const qy = segment.ay - oy;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * dy - qy * dx) / denom;
  if (t <= 0.1 || u < -1e-8 || u > 1 + 1e-8) return null;
  return t;
}

function distanceToSegmentSq(px: number, py: number, segment: VisionSegment): number {
  const x = Math.max(Math.min(segment.ax, segment.bx), Math.min(Math.max(segment.ax, segment.bx), px));
  const y = Math.max(Math.min(segment.ay, segment.by), Math.min(Math.max(segment.ay, segment.by), py));
  return (x - px) ** 2 + (y - py) ** 2;
}

function addAngleTriplet(angles: number[], angle: number): void {
  angles.push(angle - ANGLE_EPSILON, angle, angle + ANGLE_EPSILON);
}

function circleSegmentAngles(
  px: number, py: number, radius: number, segment: VisionSegment,
): number[] {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const ex = segment.ax - px;
  const ey = segment.ay - py;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return [];

  const b = 2 * (ex * dx + ey * dy);
  const c = ex * ex + ey * ey - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];

  const root = Math.sqrt(discriminant);
  const angles: number[] = [];
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t > 1e-6 && t <= 1 + 1e-6) {
      const clamped = Math.min(t, 1);
      const x = segment.ax + clamped * dx;
      const y = segment.ay + clamped * dy;
      angles.push(Math.atan2(y - py, x - px));
    }
  }
  return angles;
}

/**
 * Build the local player's visibility polygon. The result is world/map space;
 * callers can transform it to canvas space and clip a radial light gradient to
 * it. Open areas remain circular; collision walls cast hard-edged shadows.
 */
export function computeVisibilityPolygon(
  px: number,
  py: number,
  radius: number,
  wallSegments: readonly VisionSegment[],
): VisionPoint[] {
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(radius) || radius <= 0) {
    return [];
  }

  const radiusSq = radius * radius;
  const nearby = wallSegments.filter(segment => distanceToSegmentSq(px, py, segment) <= radiusSq);
  const angles: number[] = [];

  for (const segment of nearby) {
    addAngleTriplet(angles, Math.atan2(segment.ay - py, segment.ax - px));
    addAngleTriplet(angles, Math.atan2(segment.by - py, segment.bx - px));
    for (const angle of circleSegmentAngles(px, py, radius, segment)) {
      addAngleTriplet(angles, angle);
    }
  }

  // Prevent polygon facets in open rooms and keep the circle edge stable.
  for (let i = 0; i < BOUNDARY_RAYS; i++) {
    angles.push(-Math.PI + (i / BOUNDARY_RAYS) * Math.PI * 2);
  }

  const points = angles.map(angle => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let distance = radius;
    for (const segment of nearby) {
      const hit = raySegmentDistance(px, py, dx, dy, segment);
      if (hit !== null && hit < distance) distance = hit;
    }
    return { angle, x: px + dx * distance, y: py + dy * distance };
  });

  points.sort((a, b) => a.angle - b.angle);
  return points.map(({ x, y }) => ({ x, y }));
}
