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
// Room / zone descriptors (for documentation and future tooling)
// ─────────────────────────────────────────────────────────────────────────────
export type ZoneName =
  | 'garage_nw'
  | 'corridor_n'
  | 'lobby'
  | 'industrial'
  | 'pipe_corridor'
  | 'tech_room'
  | 'corridor_ne'
  | 'office_e'
  | 'strip_far_e'
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
  /** pixel bounds (inclusive) */
  px: number; py: number; pw: number; ph: number;
}

/** Named walkable zones (in grid cells, before obstacles are applied). */
export const ZONES: Zone[] = [
  { name: 'garage_nw',    label: 'Parking Garage',     px:  80, py:  20, pw: 200, ph: 140 },
  { name: 'corridor_n',   label: 'North Corridor',      px: 140, py: 140, pw: 160,  ph:  60 },
  { name: 'lobby',        label: 'Main Lobby / Atrium', px: 280, py:  20, pw: 420, ph: 360 },
  { name: 'industrial',   label: 'Boiler Room',         px:  80, py: 200, pw: 220, ph: 180 },
  { name: 'pipe_corridor',label: 'Pipe Corridor',       px:  20, py: 240, pw:  70,  ph: 120 },
  { name: 'tech_room',    label: 'Tech Room',           px: 740, py:  20, pw: 220, ph: 160 },
  { name: 'corridor_ne',  label: 'NE Corridor',         px: 700, py: 100, pw:  60, ph: 120 },
  { name: 'office_e',     label: 'East Office',         px: 880, py: 180, pw: 120, ph: 200 },
  { name: 'strip_far_e',  label: 'Far East Strip',      px: 980, py: 180, pw:  60, ph: 280 },
  { name: 'gas_station',  label: 'Gas Station',         px:  20, py: 360, pw: 280, ph: 200 },
  { name: 'park',         label: 'Outdoor Park',        px: 280, py: 360, pw: 380, ph: 200 },
  { name: 'junction_s',   label: 'South Junction',      px: 560, py: 360, pw: 120, ph: 140 },
  { name: 'garage_se',    label: 'Vehicle Garage',      px: 660, py: 360, pw: 220, ph: 140 },
  { name: 'corridor_se',  label: 'SE Corridor',         px: 860, py: 280, pw:  40, ph: 220 },
  { name: 'electrical',   label: 'Electrical Room',     px: 740, py: 480, pw: 240,  ph:  80 },
  { name: 'strip_far_se', label: 'Far SE Strip',        px: 980, py: 380, pw:  60, ph: 180 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Build the static collision grid
// ─────────────────────────────────────────────────────────────────────────────
let _cached: Grid | null = null;

export function buildCollisionGrid(): Grid {
  if (_cached) return _cached;

  const g = new Uint8Array(COLS * ROWS).fill(1); // start: everything blocked

  // ── STEP 1 : Carve walkable floors ─────────────────────────────────────────

  fill(g,  4,  1, 10,  7, 0); // Parking garage NW
  fill(g,  7,  7,  8,  3, 0); // North corridor  (garage → lobby)
  fill(g, 14,  1, 21, 18, 0); // Main lobby / atrium
  fill(g,  4, 10, 10,  9, 0); // Boiler / industrial room
  fill(g,  1, 12,  3,  6, 0); // Far-left pipe corridor
  fill(g, 37,  1, 11,  8, 0); // Tech room NE
  fill(g, 35,  5,  3,  6, 0); // NE corridor (tech room → lobby)
  fill(g, 44,  9,  5, 10, 0); // East office / utility room
  fill(g, 49,  9,  3, 14, 0); // Far-east strip
  fill(g,  1, 18, 14, 10, 0); // Gas station zone (SW)
  fill(g, 14, 18, 19, 10, 0); // Outdoor park
  fill(g, 28, 18,  6,  7, 0); // South junction / service road
  fill(g, 33, 18, 11,  7, 0); // Vehicle garage SE
  fill(g, 43, 14,  2, 11, 0); // SE corridor
  fill(g, 37, 24, 12,  4, 0); // Electrical room
  fill(g, 49, 19,  3,  9, 0); // Far-east bottom strip

  // ── STEP 2 : Re-block obstacles within floors ───────────────────────────────

  // ── Lobby ──
  // Central octagonal planter / statue  (the glowing garden in the middle)
  fill(g, 20,  5,  9,  8, 1);
  // Trim planter corners to approximate octagonal shape
  fill(g, 20,  5,  2,  1, 0); // NW corner walkable
  fill(g, 27,  5,  2,  1, 0); // NE corner walkable
  fill(g, 20, 12,  2,  1, 0); // SW corner walkable
  fill(g, 27, 12,  2,  1, 0); // SE corner walkable

  // Benches north wall (two rows)
  fill(g, 15,  1,  5,  1, 1);
  fill(g, 29,  1,  5,  1, 1);
  // Benches south wall
  fill(g, 17, 17,  4,  1, 1);
  fill(g, 28, 17,  4,  1, 1);

  // ── Parking garage NW ──
  fill(g,  5,  1,  4,  4, 1); // car 1
  fill(g,  5,  5,  4,  2, 1); // car 2
  fill(g,  4,  1,  1,  7, 1); // west wall of garage

  // ── Industrial / boiler room ──
  fill(g,  8, 12,  5,  5, 1); // boiler / furnace (large cylinder)
  fill(g, 13, 10,  1,  9, 1); // computer terminal wall (east edge)
  fill(g,  4, 10,  2,  2, 1); // NW corner machinery
  fill(g,  4, 16,  3,  3, 1); // SW corner pipes

  // ── Gas station ──
  fill(g,  4, 22,  3,  4, 1); // gas pumps
  fill(g,  1, 18,  1, 10, 1); // west wall
  fill(g,  7, 19,  7,  5, 1); // shop building (solid walls + interior)
  fill(g,  2, 18,  5,  2, 1); // refrigerators / shelves (north interior wall)
  fill(g,  1, 26,  4,  2, 1); // south corner obstacle

  // ── Tech room NE ──
  fill(g, 37,  1, 11,  4, 1); // server banks / computer desks (north wall)
  fill(g, 37,  5,  3,  3, 1); // additional equipment (west wall)

  // ── East office ──
  fill(g, 44, 10,  4,  3, 1); // desk / workstation
  fill(g, 49,  9,  2,  5, 1); // server rack cabinet

  // ── Outdoor park ──
  fill(g, 14, 18,  2,  2, 1); // tree cluster NW
  fill(g, 30, 18,  3,  2, 1); // tree cluster NE
  fill(g, 15, 20,  4,  6, 1); // playground climbing frame
  fill(g, 20, 21,  5,  5, 1); // playground swings
  fill(g, 25, 18,  4,  3, 1); // military crates
  fill(g, 19, 23,  9,  4, 1); // circular green (raised, non-walkable)
  fill(g, 22, 26,  4,  2, 1); // south grass extension

  // ── Vehicle garage SE ──
  fill(g, 34, 19,  6,  4, 1); // military van
  fill(g, 33, 18,  2,  2, 1); // gate posts / barriers at entrance

  // ── Electrical room ──
  fill(g, 37, 24,  6,  4, 1); // server rack bank left
  fill(g, 44, 25,  4,  3, 1); // equipment bank right

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
