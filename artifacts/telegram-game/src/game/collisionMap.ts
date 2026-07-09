// ─────────────────────────────────────────────────────────────────────────────
// Collision map for the 1040 × 580 top-down game map.
//
// Grid: 52 columns × 29 rows, each cell = 20 × 20 px.
//   col = Math.floor(px / CELL)   row = Math.floor(py / CELL)
//
// Values:  0 = walkable    1 = blocked / wall
//
// Build strategy:
//   1. Fill entire grid with 1 (everything blocked).
//   2. Carve out walkable floor rectangles for each room / corridor.
//   3. Re-block obstacle rectangles that sit inside those floors
//      (furniture, vehicles, pillars, raised planters, etc.).
//
// Boundaries traced from the red-line reference image.
// ─────────────────────────────────────────────────────────────────────────────

export const MAP_W  = 1040;
export const MAP_H  = 580;
export const CELL   = 20;           // pixels per grid cell
export const COLS   = MAP_W / CELL; // 52
export const ROWS   = MAP_H / CELL; // 29

export type Grid = Uint8Array;

/** Fill a rectangle of cells with value v (0 or 1). */
function fill(
  g: Grid,
  col: number, row: number,
  w: number,   h: number,
  v: 0 | 1,
) {
  const c0 = Math.max(0, col),        r0 = Math.max(0, row);
  const c1 = Math.min(COLS, col + w), r1 = Math.min(ROWS, row + h);
  for (let r = r0; r < r1; r++)
    for (let c = c0; c < c1; c++)
      g[r * COLS + c] = v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Room / zone descriptors
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

export const ZONES: Zone[] = [
  { name: 'garage_nw',      label: 'Parking Garage',      px:  80, py:   0, pw: 180, ph: 160 },
  { name: 'industrial',     label: 'Boiler Room',          px:  60, py: 160, pw: 220, ph: 220 },
  { name: 'pipe_corridor',  label: 'Pipe Corridor',        px:   0, py: 220, pw:  60, ph: 140 },
  { name: 'lobby',          label: 'Main Lobby / Atrium',  px: 280, py:   0, pw: 420, ph: 380 },
  { name: 'tech_room_ne',   label: 'Tech Room',            px: 700, py:   0, pw: 260, ph: 180 },
  { name: 'ne_connector',   label: 'NE Connector',         px: 680, py: 100, pw:  60, ph: 100 },
  { name: 'far_right_top',  label: 'Far-Right Upper',      px: 960, py:   0, pw:  80, ph:  80 },
  { name: 'office_e',       label: 'East Office',          px: 860, py: 180, pw: 140, ph: 200 },
  { name: 'far_right_strip',label: 'Far-Right Strip',      px: 980, py:  80, pw:  60, ph: 300 },
  { name: 'gas_station',    label: 'Gas Station',          px:   0, py: 380, pw: 280, ph: 200 },
  { name: 'park',           label: 'Outdoor Park',         px: 280, py: 380, pw: 400, ph: 200 },
  { name: 'junction_s',     label: 'South Junction',       px: 560, py: 360, pw: 140, ph: 160 },
  { name: 'garage_se',      label: 'Vehicle Garage',       px: 660, py: 360, pw: 220, ph: 140 },
  { name: 'corridor_se',    label: 'SE Corridor',          px: 860, py: 260, pw:  60, ph: 260 },
  { name: 'electrical',     label: 'Electrical Room',      px: 740, py: 480, pw: 260, ph: 100 },
  { name: 'strip_far_se',   label: 'Far-SE Strip',         px: 980, py: 380, pw:  60, ph: 200 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Build the static collision grid
// ─────────────────────────────────────────────────────────────────────────────
let _cached: Grid | null = null;

export function buildCollisionGrid(): Grid {
  if (_cached) return _cached;

  const g = new Uint8Array(COLS * ROWS).fill(1); // start: everything blocked

  // ── STEP 1 : Carve walkable floors ─────────────────────────────────────────

  // NW Parking Garage  (top-left, contains 2 cars)
  // Red line: left≈x80 right≈x260 top≈y0 bottom≈y160
  fill(g,  4,  0,  9,  8, 0); // cols 4-13, rows 0-8

  // Industrial / Boiler Room  (left-center, below garage)
  // Red line: left≈x60 right≈x280 top≈y160 bottom≈y380
  fill(g,  3,  8, 11, 11, 0); // cols 3-14, rows 8-19

  // Far-left pipe / freezer corridor  (narrow strip, far left edge)
  // Red line: left≈x0 right≈x60 top≈y220 bottom≈y360
  fill(g,  0, 11,  3,  7, 0); // cols 0-3, rows 11-18

  // Main Lobby / Atrium  (large central space)
  // Red line: left≈x280 right≈x700 top≈y0 bottom≈y380
  fill(g, 14,  0, 21, 19, 0); // cols 14-35, rows 0-19

  // NE Tech Room  (upper right, server room)
  // Red line: left≈x700 right≈x960 top≈y0 bottom≈y180
  fill(g, 35,  0, 13,  9, 0); // cols 35-48, rows 0-9

  // NE Connector  (tech room ↔ lobby)
  // Red line: left≈x680 right≈x740 top≈y100 bottom≈y200
  fill(g, 34,  5,  3,  5, 0); // cols 34-37, rows 5-10

  // Far-right upper rooms  (top-right corner, 2 stacked chambers)
  // Red line: left≈x960 right≈x1040 top≈y0 bottom≈y80
  fill(g, 48,  0,  4,  4, 0); // cols 48-52, rows 0-4

  // East Office / Equipment Room  (right-center)
  // Red line: left≈x860 right≈x1000 top≈y180 bottom≈y380
  fill(g, 43,  9,  7, 10, 0); // cols 43-50, rows 9-19

  // Far-right vertical strip  (connects upper rooms to east office)
  // Red line: left≈x980 right≈x1040 top≈y80 bottom≈y380
  fill(g, 49,  4,  3, 15, 0); // cols 49-52, rows 4-19

  // Gas Station zone  (bottom-left)
  // Red line: left≈x0 right≈x280 top≈y380 bottom≈y580
  fill(g,  0, 19, 14, 10, 0); // cols 0-14, rows 19-29

  // Outdoor Park  (bottom-center)
  // Red line: left≈x280 right≈x680 top≈y380 bottom≈y580
  fill(g, 14, 19, 20, 10, 0); // cols 14-34, rows 19-29

  // South Junction / service road  (center-south, connecting park to SE)
  // Red line: left≈x560 right≈x700 top≈y360 bottom≈y520
  fill(g, 28, 18,  7,  8, 0); // cols 28-35, rows 18-26

  // SE Vehicle Garage  (military van, bottom-right)
  // Red line: left≈x660 right≈x880 top≈y360 bottom≈y500
  fill(g, 33, 18, 11,  7, 0); // cols 33-44, rows 18-25

  // SE Corridor  (narrow vertical connector, right side)
  // Red line: left≈x860 right≈x920 top≈y260 bottom≈y520
  fill(g, 43, 13,  3, 13, 0); // cols 43-46, rows 13-26

  // Electrical Room  (bottom-right, server equipment)
  // Red line: left≈x740 right≈x1000 top≈y480 bottom≈y580
  fill(g, 37, 24, 13,  5, 0); // cols 37-50, rows 24-29

  // Far-SE strip  (bottom-right corner)
  // Red line: left≈x980 right≈x1040 top≈y380 bottom≈y560
  fill(g, 49, 19,  3, 10, 0); // cols 49-52, rows 19-29

  // ── STEP 2 : Re-block obstacles within floors ───────────────────────────────

  // ── NW Garage: 2 cars (stacked on left side, driving lane on right) ──
  fill(g,  4,  0,  5,  4, 1); // car 1  (upper, blue sedan)
  fill(g,  4,  4,  5,  4, 1); // car 2  (lower, dark sedan)

  // ── Industrial / Boiler Room ──
  fill(g,  7, 11,  5,  5, 1); // boiler / furnace cylinder (center-left)
  fill(g,  3,  8,  2,  3, 1); // NW corner machinery
  fill(g,  3, 16,  3,  3, 1); // SW corner pipes
  fill(g, 13,  8,  1, 11, 1); // east wall computer terminals

  // ── Main Lobby: central octagonal planter / statue ──
  fill(g, 20,  5,  9,  8, 1); // block octagonal footprint
  // Trim corners to approximate octagonal shape
  fill(g, 20,  5,  1,  1, 0); // NW corner walkable
  fill(g, 28,  5,  1,  1, 0); // NE corner walkable
  fill(g, 20, 12,  1,  1, 0); // SW corner walkable
  fill(g, 28, 12,  1,  1, 0); // SE corner walkable

  // Lobby: north-wall benches
  fill(g, 15,  0,  4,  1, 1);
  fill(g, 30,  0,  4,  1, 1);
  // Lobby: south-wall benches
  fill(g, 17, 18,  4,  1, 1);
  fill(g, 27, 18,  4,  1, 1);

  // ── NE Tech Room: server banks and equipment ──
  fill(g, 36,  0, 12,  3, 1); // north wall server banks
  fill(g, 35,  3,  3,  5, 1); // west wall equipment (near NE connector)

  // ── East Office: workstation cluster ──
  fill(g, 44,  9,  5,  4, 1); // desk / monitor bank
  fill(g, 49,  9,  2,  5, 1); // server rack cabinet (east wall)

  // ── Gas Station ──
  fill(g,  6, 20,  6,  5, 1); // store building (solid interior)
  fill(g,  3, 22,  3,  4, 1); // gas pumps
  fill(g,  0, 19,  1, 10, 1); // far-left wall (edge)
  fill(g,  1, 27,  3,  2, 1); // south-corner cones / barriers

  // ── Outdoor Park ──
  fill(g, 14, 19,  2,  3, 1); // NW tree cluster
  fill(g, 29, 19,  5,  2, 1); // NE tree / crate cluster
  fill(g, 15, 21,  5,  5, 1); // playground climbing frame (west)
  fill(g, 20, 22,  5,  5, 1); // playground swings (east)
  fill(g, 19, 24,  9,  4, 1); // raised circular grass mound (center)
  fill(g, 22, 27,  4,  2, 1); // south grass extension

  // ── SE Vehicle Garage ──
  fill(g, 33, 18,  2,  2, 1); // entrance gate posts / barriers
  fill(g, 34, 19,  7,  5, 1); // military van (center)

  // ── Electrical Room ──
  fill(g, 37, 24,  7,  5, 1); // server rack bank (left side)
  fill(g, 45, 25,  5,  4, 1); // equipment / breaker bank (right side)

  _cached = g;
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Is the cell at pixel (px, py) blocked? Returns true if outside map bounds. */
export function isBlocked(grid: Grid, px: number, py: number): boolean {
  const col = Math.floor(px / CELL);
  const row = Math.floor(py / CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
  return grid[row * COLS + col] === 1;
}

/**
 * Can an entity with the given radius move to pixel position (cx, cy)?
 * Checks the four cardinal edge points.
 */
export function canMoveTo(
  grid: Grid,
  cx: number, cy: number,
  radius = 8,
): boolean {
  return (
    !isBlocked(grid, cx - radius, cy) &&
    !isBlocked(grid, cx + radius, cy) &&
    !isBlocked(grid, cx, cy - radius) &&
    !isBlocked(grid, cx, cy + radius)
  );
}

/**
 * Resolve movement: return the furthest reachable position when trying to
 * move from (x, y) to (nx, ny) with the given radius.  Slides along walls
 * by trying each axis independently.
 */
export function resolveMovement(
  grid: Grid,
  x: number,  y: number,
  nx: number, ny: number,
  radius = 8,
): [number, number] {
  // Try full move
  if (canMoveTo(grid, nx, ny, radius)) return [nx, ny];
  // Slide on X only
  if (canMoveTo(grid, nx, y, radius))  return [nx, y];
  // Slide on Y only
  if (canMoveTo(grid, x, ny, radius))  return [x, ny];
  // Stuck
  return [x, y];
}
