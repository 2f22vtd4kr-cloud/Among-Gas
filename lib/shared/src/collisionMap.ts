// ─────────────────────────────────────────────────────────────────────────────
// Collision map — shared between telegram-game client and api-server.
//
// The base grid is the manually edited RLE in collisionData.ts, seeded from
// the red-line reference image. It is supplemented by explicit, high-resolution
// obstacle polygons in collisionOverrides.ts where the legacy component-size
// heuristic misclassified large props (notably the central fountain).
// The analyzer writes preview files only; production collision changes must
// be reviewed against both the map art and the red-line reference before promotion.
//
// Grid: COLS columns × ROWS rows, each cell = CELL × CELL px.
//   col = Math.floor(px / CELL)   row = Math.floor(py / CELL)
//
// Values:  0 = walkable    1 = blocked / wall
// ─────────────────────────────────────────────────────────────────────────────

import { CELL as _CELL, COLS, ROWS, RUNS } from './collisionData.js';
import {
  FEET_OFFSET_Y,
  PLAYER_HALF_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPRITE_HALF_WIDTH_PX,
  PLAYER_SPRITE_HALF_HEIGHT_PX,
  PLAYER_SPAWN_MIN_X,
  PLAYER_SPAWN_MAX_X,
  PLAYER_SPAWN_MAX_FEET_Y,
} from './coords.js';
import { MANUAL_BLOCKED_POLYGONS } from './collisionOverrides.js';

// Map now renders from a pre-upscaled static asset (public/map-hires.png).
// MAP_W/MAP_H must match that asset's native pixel size exactly.
export const MAP_W = 3224;
export const MAP_H = 1858;
export { COLS, ROWS };

/**
 * Pixel size of one collision cell in each axis.
 * The underlying grid was built at COLS×ROWS cells from a 1040×580 reference
 * (CELL=10 px/cell), but the visual map is now 3224×1858, so X and Y cell
 * sizes differ slightly. All pixel-space ↔ grid-space conversions use these.
 */
export const CELL_X = MAP_W / COLS;   // ≈ 31.0 px
export const CELL_Y = MAP_H / ROWS;   // ≈ 32.03 px

// Keep CELL as the average for code that needs a single representative value
export const CELL = (_CELL * MAP_W) / (COLS * _CELL); // same as MAP_W/COLS

/**
 * Phase 5 — kill range, in pixels, shared between client (kill-button
 * proximity check) and server (authoritative kill validation).
 * GAME_SPEC.md §9 calibrates this to ~1.5 map tiles.
 */
export const KILL_RANGE_PX = Math.round(CELL_X * 1.5);

/**
 * Phase 6 — report-body range, in pixels, shared between client (report
 * button proximity check) and server (authoritative report validation).
 * No physical "body prop" exists on the map yet (GAME_SPEC.md §11 known
 * deviation): a dead player's live ghost position stands in for the body,
 * so this is set a bit wider than kill range to make bodies easy to find.
 */
export const REPORT_RANGE_PX = Math.round(CELL_X * 2.5);

export type Grid = Uint8Array;

/** Decode the RLE-encoded pixel-accurate grid produced from the reference image. */
function decodeRuns(): Grid {
  const g = new Uint8Array(COLS * ROWS);
  let i = 0;
  let v: 0 | 1 = 0;
  for (const runLen of RUNS) {
    for (let k = 0; k < runLen; k++) g[i++] = v;
    v = v === 0 ? 1 : 0;
  }
  if (i !== COLS * ROWS) {
    throw new Error(
      `collisionData.ts RUNS decode length mismatch: got ${i} cells, expected ${COLS * ROWS}. ` +
      `Re-run scripts/src/analyzeCollisionMap.ts to regenerate it.`,
    );
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Room / zone descriptors (cosmetic debug overlay only)
// ─────────────────────────────────────────────────────────────────────────────
export type ZoneName =
  | 'garage_nw'
  | 'industrial'
  | 'pipe_corridor'
  | 'lobby'
  | 'tech_room_ne'
  | 'ne_connector'
  | 'far_right_top'
  | 'office_e'
  | 'far_right_strip'
  | 'gas_station'
  | 'park'
  | 'junction_s'
  | 'garage_se'
  | 'corridor_se'
  | 'electrical'
  | 'strip_far_se';

export interface Zone {
  name: ZoneName;
  label: string;
  /** pixel bounds */
  px: number; py: number; pw: number; ph: number;
}

const _SX = MAP_W / 1040;
const _SY = MAP_H / 580;
const z = (px: number, py: number, pw: number, ph: number): Pick<Zone, 'px'|'py'|'pw'|'ph'> => ({
  px: Math.round(px * _SX), py: Math.round(py * _SY),
  pw: Math.round(pw * _SX), ph: Math.round(ph * _SY),
});

export const ZONES: Zone[] = [
  { name: 'garage_nw',       label: 'Parking Garage',      ...z(  0,   0, 270, 180) },
  { name: 'industrial',      label: 'Boiler Room',          ...z(  0, 180, 310, 210) },
  { name: 'pipe_corridor',   label: 'Pipe Corridor',        ...z(  0, 210,  45, 180) },
  { name: 'lobby',           label: 'Main Lobby / Atrium',  ...z(280,   0, 430, 390) },
  { name: 'tech_room_ne',    label: 'Tech Room',            ...z(710,   0, 170, 190) },
  { name: 'ne_connector',    label: 'NE Connector',         ...z(670,  80,  50, 110) },
  { name: 'far_right_top',   label: 'Far-Right Upper',      ...z(880,   0, 160,  80) },
  { name: 'office_e',        label: 'East Office',          ...z(780, 190, 170, 200) },
  { name: 'far_right_strip', label: 'Far-Right Strip',      ...z(950,  80,  90, 310) },
  { name: 'gas_station',     label: 'Gas Station',          ...z(  0, 390, 310, 190) },
  { name: 'park',            label: 'Outdoor Park',         ...z(310, 390, 400, 190) },
  { name: 'junction_s',      label: 'South Junction',       ...z(600, 360, 130, 130) },
  { name: 'garage_se',       label: 'Vehicle Garage',       ...z(730, 330, 140, 160) },
  { name: 'corridor_se',     label: 'SE Corridor',          ...z(870, 210,  50, 280) },
  { name: 'electrical',      label: 'Electrical Room',      ...z(730, 470, 190, 110) },
  { name: 'strip_far_se',    label: 'Far-SE Strip',         ...z(920, 320, 120, 260) },
];

// ─────────────────────────────────────────────────────────────────────────────
// Build the static collision grid
// ─────────────────────────────────────────────────────────────────────────────
let _cached: Grid | null = null;

type PolygonPoint = readonly [number, number];
type BlockedPolygon = { readonly id: string; readonly points: readonly PolygonPoint[] };

function pointInPolygon(x: number, y: number, points: readonly PolygonPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const crosses = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: PolygonPoint, point: PolygonPoint, b: PolygonPoint): boolean {
  return point[0] >= Math.min(a[0], b[0]) &&
    point[0] <= Math.max(a[0], b[0]) &&
    point[1] >= Math.min(a[1], b[1]) &&
    point[1] <= Math.max(a[1], b[1]);
}

function segmentsIntersect(
  a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, d: PolygonPoint,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
      ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

function polygonIntersectsRect(
  points: readonly PolygonPoint[],
  minX: number, minY: number, maxX: number, maxY: number,
): boolean {
  const rectCorners: PolygonPoint[] = [
    [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY],
  ];
  if (rectCorners.some(([x, y]) => pointInPolygon(x, y, points))) return true;
  if (points.some(([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY)) return true;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let edge = 0; edge < 4; edge++) {
      if (segmentsIntersect(a, b, rectCorners[edge], rectCorners[(edge + 1) % 4])) return true;
    }
  }
  return false;
}

function applyManualBlockedPolygons(grid: Grid): void {
  for (const polygon of MANUAL_BLOCKED_POLYGONS as readonly BlockedPolygon[]) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const minX = col * CELL_X;
        const minY = row * CELL_Y;
        if (polygonIntersectsRect(
          polygon.points,
          minX, minY,
          minX + CELL_X,
          minY + CELL_Y,
        )) {
          grid[row * COLS + col] = 1;
        }
      }
    }
  }
}

export function buildCollisionGrid(): Grid {
  if (_cached) return _cached;
  _cached = decodeRuns();
  applyManualBlockedPolygons(_cached);
  return _cached;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Is the cell at pixel (px, py) blocked? Returns true if outside map bounds. */
export function isBlocked(grid: Grid, px: number, py: number): boolean {
  const col = Math.floor(px / CELL_X);
  const row = Math.floor(py / CELL_Y);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
  return grid[row * COLS + col] === 1;
}

/**
 * Can an entity with the given radius move to pixel position (cx, cy)?
 * Samples the center plus points around the circle's circumference.
 */
export function canMoveTo(
  grid: Grid,
  cx: number, cy: number,
  radius = 8,
): boolean {
  if (isBlocked(grid, cx, cy)) return false;

  const minCell = Math.min(CELL_X, CELL_Y);
  const samples = Math.max(8, Math.ceil((2 * Math.PI * radius) / (minCell * 0.5)));
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (isBlocked(grid, px, py)) return false;
  }
  return true;
}

/**
 * Tests the complete horizontal foot base at the rendered sprite's ground
 * anchor. Client prediction, server validation, and spawn placement must use
 * this exact footprint so they cannot disagree about where a player can stand.
 */
export function isPlayerFootprintWalkableAtFeet(grid: Grid, feetX: number, feetY: number): boolean {
  return (
    canMoveTo(grid, feetX, feetY, PLAYER_RADIUS) &&
    canMoveTo(grid, feetX - PLAYER_HALF_WIDTH, feetY, PLAYER_RADIUS) &&
    canMoveTo(grid, feetX + PLAYER_HALF_WIDTH, feetY, PLAYER_RADIUS)
  );
}

/** Tests the shared foot footprint for a sprite-centre world position. */
export function isPlayerPositionWalkable(grid: Grid, x: number, y: number): boolean {
  return isPlayerFootprintWalkableAtFeet(grid, x, y + FEET_OFFSET_Y);
}

/**
 * Spawn-only visual clearance. Unlike normal movement (which correctly uses
 * the feet hitbox), initial spawn placement also ensures the complete visible
 * sprite rectangle does not start inside a wall, map boundary, or manually
 * traced large prop such as the central fountain.
 */
export function isPlayerSpawnPositionClear(grid: Grid, x: number, y: number): boolean {
  if (
    x < PLAYER_SPAWN_MIN_X ||
    x > PLAYER_SPAWN_MAX_X ||
    y + FEET_OFFSET_Y > PLAYER_SPAWN_MAX_FEET_Y ||
    !isPlayerPositionWalkable(grid, x, y)
  ) return false;

  const minX = x - PLAYER_SPRITE_HALF_WIDTH_PX;
  const maxX = x + PLAYER_SPRITE_HALF_WIDTH_PX;
  const minY = y - PLAYER_SPRITE_HALF_HEIGHT_PX;
  const maxY = y + PLAYER_SPRITE_HALF_HEIGHT_PX;
  if (minX < 0 || maxX > MAP_W || minY < 0 || maxY > MAP_H) return false;

  const minCol = Math.floor(minX / CELL_X);
  const maxCol = Math.min(COLS - 1, Math.floor(maxX / CELL_X));
  const minRow = Math.floor(minY / CELL_Y);
  const maxRow = Math.min(ROWS - 1, Math.floor(maxY / CELL_Y));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (grid[row * COLS + col] === 1) return false;
    }
  }

  for (const polygon of MANUAL_BLOCKED_POLYGONS as readonly BlockedPolygon[]) {
    if (polygonIntersectsRect(polygon.points, minX, minY, maxX, maxY)) return false;
  }
  return true;
}

/**
 * Keep even wall-phasing ghosts inside the map's physical player-footprint
 * bounds. The anchor may be offset from the feet, so clamping x/y to 0..MAP
 * dimensions alone lets the foot base leave the map.
 */
export function clampPlayerPositionToMapBounds(x: number, y: number): [number, number] {
  const horizontalMargin = PLAYER_HALF_WIDTH + PLAYER_RADIUS;
  const minY = PLAYER_RADIUS - FEET_OFFSET_Y;
  const maxY = MAP_H - PLAYER_RADIUS - FEET_OFFSET_Y;
  return [
    Math.max(horizontalMargin, Math.min(MAP_W - horizontalMargin, x)),
    Math.max(minY, Math.min(maxY, y)),
  ];
}

/** Checks the starting point and every point along a segment at <=2px spacing. */
export function isPlayerPathWalkable(
  grid: Grid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  sampleSpacingPx = 2,
): boolean {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(1, Math.ceil(distance / sampleSpacingPx));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    if (!isPlayerPositionWalkable(
      grid,
      fromX + (toX - fromX) * t,
      fromY + (toY - fromY) * t,
    )) return false;
  }
  return true;
}

/** Shared x-first wall sliding used identically by client prediction and server authority. */
export function resolvePlayerMovement(
  grid: Grid,
  x: number,
  y: number,
  nextX: number,
  nextY: number,
): [number, number] {
  if (isPlayerPathWalkable(grid, x, y, nextX, nextY)) return [nextX, nextY];
  if (isPlayerPathWalkable(grid, x, y, nextX, y)) return [nextX, y];
  if (isPlayerPathWalkable(grid, x, y, x, nextY)) return [x, nextY];
  return [x, y];
}

/**
 * Resolve movement with wall-sliding: return the furthest reachable position
 * when trying to move from (x, y) to (nx, ny) with the given radius.
 */
export function resolveMovement(
  grid: Grid,
  x: number,  y: number,
  nx: number, ny: number,
  radius = 8,
): [number, number] {
  if (canMoveTo(grid, nx, ny, radius)) return [nx, ny];
  if (canMoveTo(grid, nx, y,  radius)) return [nx, y];
  if (canMoveTo(grid, x,  ny, radius)) return [x, ny];
  return [x, y];
}
