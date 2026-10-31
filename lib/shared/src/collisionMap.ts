// ─────────────────────────────────────────────────────────────────────────────
// Collision map — shared between telegram-game client and api-server.
//
// The base grid is the manually edited RLE in collisionData.ts, seeded from
// the red-line reference image. It is supplemented by explicit, high-resolution
// obstacle polygons in collisionOverrides.ts where the legacy component-size
// heuristic misclassified large props (notably the central statue garden).
// The analyzer writes preview files only; production collision changes must
// be reviewed against both the map art and the red-line reference before promotion.
//
// The compact COLS×ROWS grid is for navigation; precise movement uses FINE_COLS×FINE_ROWS.
//   col = Math.floor(px / CELL)   row = Math.floor(py / CELL)
//
// Values:  0 = walkable    1 = blocked / wall
// ─────────────────────────────────────────────────────────────────────────────

import { CELL as _CELL, COLS, ROWS, RUNS } from './collisionData.js';
import { FINE_COLS, FINE_ROWS, FINE_RLE_BASE64 } from './collisionDataFine.js';
import {
  FEET_OFFSET_Y,
  PLAYER_HALF_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPRITE_HALF_WIDTH_PX,
  PLAYER_SPRITE_HALF_HEIGHT_PX,
  PLAYER_SPAWN_CLEARANCE_PX,
  PLAYER_SPAWN_MIN_X,
  PLAYER_SPAWN_MAX_X,
  PLAYER_SPAWN_MAX_FEET_Y,
} from './coords.js';
import { MANUAL_BLOCKED_POLYGONS, MANUAL_WALKABLE_REPLACEMENT_ZONES } from './collisionOverrides.js';
export { MANUAL_BLOCKED_POLYGONS, MANUAL_WALKABLE_REPLACEMENT_ZONES };

// Map now renders from a pre-upscaled static asset (public/map-hires.png).
// MAP_W/MAP_H must match that asset's native pixel size exactly.
export const MAP_W = 3224;
export const MAP_H = 1858;
export { COLS, ROWS, FINE_COLS, FINE_ROWS };

/**
 * Pixel size of one collision cell in each axis.
 * The underlying grid was built at COLS×ROWS cells from a 1040×580 reference
 * (CELL=10 px/cell), but the visual map is now 3224×1858, so X and Y cell
 * sizes differ slightly. These are the compact navigation-grid cell sizes.
 */
export const CELL_X = MAP_W / COLS;   // ≈ 31.0 px
export const CELL_Y = MAP_H / ROWS;   // ≈ 32.03 px

/** Fine authoritative collision resolution: about 4.74×4.74 world pixels per cell. */
export const FINE_CELL_X = MAP_W / FINE_COLS;
export const FINE_CELL_Y = MAP_H / FINE_ROWS;

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

/** Decode the manually reviewed RLE base grid; explicit overrides are applied by buildCollisionGrid(). */
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
      `Review scripts/src/analyzeCollisionMap.ts preview output before promoting any new grid.`,
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
let _fineCached: Grid | null = null;

interface GridGeometry {
  cols: number;
  rows: number;
  cellX: number;
  cellY: number;
}

function getGridGeometry(grid: Grid): GridGeometry {
  if (grid.length === FINE_COLS * FINE_ROWS) {
    return { cols: FINE_COLS, rows: FINE_ROWS, cellX: FINE_CELL_X, cellY: FINE_CELL_Y };
  }
  if (grid.length === COLS * ROWS) {
    return { cols: COLS, rows: ROWS, cellX: CELL_X, cellY: CELL_Y };
  }
  throw new RangeError(
    `Collision grid has ${grid.length} cells; expected ${COLS * ROWS} navigation cells or ${FINE_COLS * FINE_ROWS} precise cells.`,
  );
}

function decodeFineRuns(encoded: string): Grid {
  if (!/^[A-Za-z0-9+/]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('Fine collision payload must be valid unpadded Base64');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;
  const bytes = new Uint8Array(Math.floor(encoded.length * 3 / 4));
  let byteLength = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < encoded.length; i++) {
    const code = encoded.charCodeAt(i);
    const digit = code < 128 ? lookup[code] : -1;
    if (digit < 0) throw new Error(`Invalid base64 character in fine collision data at offset ${i}`);
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteLength++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  if (![0, 2, 4].includes(bits) || buffer !== 0) {
    throw new Error('Fine collision Base64 has invalid trailing bits');
  }

  const grid = new Uint8Array(FINE_COLS * FINE_ROWS);
  let input = 0;
  let output = 0;
  let value = 0;
  let runIndex = 0;
  while (input < byteLength) {
    let runLength = 0;
    let multiplier = 1;
    let byte = 0;
    let byteCount = 0;
    do {
      if (input >= byteLength || byteCount >= 4) {
        throw new Error('Malformed or oversized varint in fine collision data');
      }
      byte = bytes[input++];
      runLength += (byte & 0x7f) * multiplier;
      multiplier *= 128;
      byteCount++;
    } while ((byte & 0x80) !== 0);
    if (byteCount > 1 && (byte & 0x7f) === 0) {
      throw new Error('Non-canonical varint in fine collision data');
    }
    if (runLength === 0 && runIndex !== 0) {
      throw new Error('Only the initial fine collision RLE run may be zero-length');
    }
    if (output + runLength > grid.length) {
      throw new Error('Fine collision data run exceeds the declared grid dimensions');
    }
    grid.fill(value, output, output + runLength);
    output += runLength;
    value = value === 0 ? 1 : 0;
    runIndex++;
  }
  if (output !== grid.length) {
    throw new Error(`Fine collision data decoded ${output} cells; expected ${grid.length}`);
  }
  return grid;
}

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



/** Exact circle/outline test for manually traced vector obstacles. */
function circleIntersectsPolygon(cx: number, cy: number, radius: number, points: readonly PolygonPoint[]): boolean {
  if (pointInPolygon(cx, cy, points)) return true;
  const r2 = radius * radius;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / len2));
    const x = cx - (a[0] + dx * t), y = cy - (a[1] + dy * t);
    if (x * x + y * y <= r2) return true;
  }
  return false;
}

export function buildCollisionGrid(): Grid {
  if (_cached) return _cached;
  // Retain the compact legacy grid for A* navigation and the collision editor.
  _cached = decodeRuns();
  return _cached;
}

/**
 * High-resolution authoritative movement mask traced from the map reference.
 * The compact 104×58 grid remains available for navigation, while player
 * collision now resolves against ~4.74px cells instead of ~31×32px blocks.
 */
export function buildFineCollisionGridFromRle(encoded: string): Grid {
  return decodeFineRuns(encoded);
}

function applyManualWalkableReplacementZones(grid: Grid): void {
  for (const zone of MANUAL_WALKABLE_REPLACEMENT_ZONES) {
    const [minX, minY, maxX, maxY] = zone.bounds;
    const minCol = Math.max(0, Math.floor(minX / FINE_CELL_X));
    const maxCol = Math.min(FINE_COLS - 1, Math.ceil(maxX / FINE_CELL_X));
    const minRow = Math.max(0, Math.floor(minY / FINE_CELL_Y));
    const maxRow = Math.min(FINE_ROWS - 1, Math.ceil(maxY / FINE_CELL_Y));
    // First remove the inaccurate source-art footprint inside the bay.
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = (col + 0.5) * FINE_CELL_X;
        const y = (row + 0.5) * FINE_CELL_Y;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          grid[row * FINE_COLS + col] = 0;
        }
      }
    }
    // Then restore only the actual object silhouette as solid geometry.
    for (const polygon of zone.blockedPolygons) {
      const xs = polygon.map(point => point[0]);
      const ys = polygon.map(point => point[1]);
      const polygonMinCol = Math.max(0, Math.floor(Math.min(...xs) / FINE_CELL_X));
      const polygonMaxCol = Math.min(FINE_COLS - 1, Math.ceil(Math.max(...xs) / FINE_CELL_X));
      const polygonMinRow = Math.max(0, Math.floor(Math.min(...ys) / FINE_CELL_Y));
      const polygonMaxRow = Math.min(FINE_ROWS - 1, Math.ceil(Math.max(...ys) / FINE_CELL_Y));
      for (let row = polygonMinRow; row <= polygonMaxRow; row++) {
        for (let col = polygonMinCol; col <= polygonMaxCol; col++) {
          const x = (col + 0.5) * FINE_CELL_X;
          const y = (row + 0.5) * FINE_CELL_Y;
          if (pointInPolygon(x, y, polygon as readonly PolygonPoint[])) {
            grid[row * FINE_COLS + col] = 1;
          }
        }
      }
    }
  }
}

export function buildPreciseCollisionGrid(): Grid {
  if (_fineCached) return _fineCached;
  _fineCached = decodeFineRuns(FINE_RLE_BASE64);\n  applyManualWalkableReplacementZones(_fineCached);
  return _fineCached;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Is the cell at pixel (px, py) blocked? Returns true if outside map bounds. */
export function isBlocked(grid: Grid, px: number, py: number): boolean {
  const geometry = getGridGeometry(grid);
  const col = Math.floor(px / geometry.cellX);
  const row = Math.floor(py / geometry.cellY);
  if (col < 0 || col >= geometry.cols || row < 0 || row >= geometry.rows) return true;
  if (grid[row * geometry.cols + col] === 1) return true;
  return (grid === _cached || grid === _fineCached) && MANUAL_BLOCKED_POLYGONS.some(polygon =>
    pointInPolygon(px, py, polygon.points as readonly PolygonPoint[])
  );
}

/** Server-safe ray test against the same canonical collision geometry used by movement. */
export function isLineOfSightClear(
  grid: Grid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  sampleSpacingPx = 2,
): boolean {
  if (![fromX, fromY, toX, toY, sampleSpacingPx].every(Number.isFinite) || sampleSpacingPx <= 0) {
    return false;
  }
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(1, Math.ceil(distance / sampleSpacingPx));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    if (isBlocked(grid, fromX + (toX - fromX) * t, fromY + (toY - fromY) * t)) return false;
  }
  return true;
}

/**
 * Check visibility to the reachable perimeter of a solid interaction prop.
 * Testing several perimeter points avoids treating the console/vent itself as
 * an occluder while still rejecting every approach whose rays cross a wall.
 */
export function isLineOfSightToInteractionTarget(
  grid: Grid,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  targetRadiusPx = 24,
): boolean {
  if (![fromX, fromY, targetX, targetY, targetRadiusPx].every(Number.isFinite) || targetRadiusPx < 0) {
    return false;
  }
  // Exact co-location is already an interaction point; do not reject test or
  // gameplay states that are standing on the console/vent's own anchor.
  if (Math.hypot(targetX - fromX, targetY - fromY) <= 1) return true;
  if (targetRadiusPx === 0) return isLineOfSightClear(grid, fromX, fromY, targetX, targetY);
  const samples = 16;
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const x = targetX + Math.cos(angle) * targetRadiusPx;
    const y = targetY + Math.sin(angle) * targetRadiusPx;
    if (isLineOfSightClear(grid, fromX, fromY, x, y)) return true;
  }
  return false;
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

  const geometry = getGridGeometry(grid);
  const minCell = Math.min(geometry.cellX, geometry.cellY);
  const samples = Math.max(8, Math.ceil((2 * Math.PI * radius) / (minCell * 0.5)));
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (isBlocked(grid, px, py)) return false;
  }
  if ((grid === _cached || grid === _fineCached) && MANUAL_BLOCKED_POLYGONS.some(polygon =>
    circleIntersectsPolygon(cx, cy, radius, polygon.points as readonly PolygonPoint[])
  )) return false;
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
 * traced statue base or map boundary.
 */
export function isPlayerSpawnPositionClear(grid: Grid, x: number, y: number): boolean {
  if (
    x < PLAYER_SPAWN_MIN_X ||
    x > PLAYER_SPAWN_MAX_X ||
    y + FEET_OFFSET_Y > PLAYER_SPAWN_MAX_FEET_Y ||
    !isPlayerPositionWalkable(grid, x, y)
  ) return false;

  const minX = x - PLAYER_SPRITE_HALF_WIDTH_PX - PLAYER_SPAWN_CLEARANCE_PX;
  const maxX = x + PLAYER_SPRITE_HALF_WIDTH_PX + PLAYER_SPAWN_CLEARANCE_PX;
  const minY = y - PLAYER_SPRITE_HALF_HEIGHT_PX - PLAYER_SPAWN_CLEARANCE_PX;
  const maxY = y + PLAYER_SPRITE_HALF_HEIGHT_PX + PLAYER_SPAWN_CLEARANCE_PX;
  if (minX < 0 || maxX > MAP_W || minY < 0 || maxY > MAP_H) return false;

  const geometry = getGridGeometry(grid);
  const minCol = Math.max(0, Math.floor(minX / geometry.cellX));
  const maxCol = Math.min(geometry.cols - 1, Math.floor(maxX / geometry.cellX));
  const minRow = Math.max(0, Math.floor(minY / geometry.cellY));
  const maxRow = Math.min(geometry.rows - 1, Math.floor(maxY / geometry.cellY));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (grid[row * geometry.cols + col] === 1) return false;
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
  const horizontalMargin = Math.max(
    PLAYER_SPRITE_HALF_WIDTH_PX,
    PLAYER_HALF_WIDTH + PLAYER_RADIUS,
  );
  // Keep the visible sprite in-frame as well as its feet hitbox. In particular,
  // y must never become negative: wire coordinates are unsigned on the socket.
  const minY = Math.max(0, PLAYER_SPRITE_HALF_HEIGHT_PX, PLAYER_RADIUS - FEET_OFFSET_Y);
  const bottomMargin = Math.max(
    PLAYER_SPRITE_HALF_HEIGHT_PX,
    FEET_OFFSET_Y + PLAYER_RADIUS,
  );
  return [
    Math.max(horizontalMargin, Math.min(MAP_W - horizontalMargin, x)),
    Math.max(minY, Math.min(MAP_H - bottomMargin, y)),
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
