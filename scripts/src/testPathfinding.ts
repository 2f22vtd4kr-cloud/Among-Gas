import { buildCollisionGrid, COLS, ROWS, CELL_X, CELL_Y, isPlayerPathWalkable } from '@workspace/shared/collisionMap';
import { findPath, PathCache } from '@workspace/shared';

const grid = buildCollisionGrid();
console.log(`Grid loaded: ${COLS}×${ROWS} cells (CELL_X=${CELL_X.toFixed(2)}, CELL_Y=${CELL_Y.toFixed(2)})`);

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) { console.log(`  ✓ ${label}${detail ? '  ' + detail : ''}`); pass++; }
  else     { console.log(`  ✗ ${label}${detail ? '  ' + detail : ''}`); fail++; }
}

// Find walkable cell centres to use as test points
function walkableCellCentre(colHint: number, rowHint: number): { x: number; y: number } | null {
  for (let dr = -5; dr <= 5; dr++) {
    for (let dc = -5; dc <= 5; dc++) {
      const col = colHint + dc;
      const row = rowHint + dr;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      if (grid[row * COLS + col] === 0) {
        return { x: (col + 0.5) * CELL_X, y: (row + 0.5) * CELL_Y };
      }
    }
  }
  return null;
}

// Collect all walkable cells
const walkable: { x: number; y: number }[] = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    if (grid[row * COLS + col] === 0) {
      walkable.push({ x: (col + 0.5) * CELL_X, y: (row + 0.5) * CELL_Y });
    }
  }
}
console.log(`Walkable cells: ${walkable.length} / ${COLS * ROWS}`);
check('walkable cells exist', walkable.length > 0);

// Pick two well-separated walkable cells for tests
const A = walkable[Math.floor(walkable.length * 0.1)];
const B = walkable[Math.floor(walkable.length * 0.9)];
console.log(`  A: (${Math.round(A.x)}, ${Math.round(A.y)})  B: (${Math.round(B.x)}, ${Math.round(B.y)})`);

// Test 1: A→nearby walkable (short path)
const near = walkable[Math.floor(walkable.length * 0.12)];
const r1 = findPath(grid, A, near);
check('short path', r1 !== null,
  r1 ? `${r1.waypoints.length} wp, length=${Math.round(r1.length)}px` : 'null');

// Test 2: A→B (long path across map)
const r2 = findPath(grid, A, B);
check('long path', r2 !== null,
  r2 ? `${r2.waypoints.length} wp, length=${Math.round(r2.length)}px` : 'null');

// Test 3: same position → non-null
const r3 = findPath(grid, A, A);
check('same position returns non-null', r3 !== null, r3 ? `${r3.waypoints.length} wp` : 'null');

// Test 4: goal in blocked cell → null
// Find a blocked cell
let blockedPx: { x: number; y: number } | null = null;
for (let row = 0; row < ROWS && !blockedPx; row++) {
  for (let col = 0; col < COLS && !blockedPx; col++) {
    if (grid[row * COLS + col] === 1) {
      blockedPx = { x: (col + 0.5) * CELL_X, y: (row + 0.5) * CELL_Y };
    }
  }
}
if (blockedPx) {
  const r4 = findPath(grid, A, blockedPx);
  check('blocked goal returns null', r4 === null);
} else {
  console.log('  ~ skipped (no blocked cell found)'); pass++;
}

// Test 5: path smoothing sanity — waypoints should not jump over blocked cells
if (r2) {
  let smooth_ok = true;
  for (let i = 1; i < r2.waypoints.length; i++) {
    // Each consecutive pair should be within ~2 cells distance (rough check)
    const dx = r2.waypoints[i].x - r2.waypoints[i-1].x;
    const dy = r2.waypoints[i].y - r2.waypoints[i-1].y;
    const dist = Math.hypot(dx, dy);
    if (dist > Math.max(CELL_X, CELL_Y) * 20) { smooth_ok = false; break; }
  }
  check('waypoints are reasonable (no huge jumps)', smooth_ok);
}

// Test 6: PathCache — same query returns same result
const cache = new PathCache();
const c1 = cache.find(grid, A, near);
const c2 = cache.find(grid, A, near);
check('cache returns consistent result', c1 !== null && c2 !== null && c1.length === c2.length,
  `cache.size=${cache.size}`);
check('cache size=1 after identical queries', cache.size === 1);

// Test 7: PathCache different queries grow cache
cache.find(grid, A, B);
check('cache grows on new query', cache.size === 2);

// Test 8: forceRefresh
const c3 = cache.find(grid, A, near, true);
check('forceRefresh returns non-null', c3 !== null);

// Test 9: invalidate
cache.invalidate(near);
check('invalidate clears matching entries', cache.size < 2);

// Test 10: Performance — 100 random walkable→walkable paths
const t0 = performance.now();
let found = 0;
const n = Math.min(100, walkable.length);
for (let i = 0; i < n; i++) {
  const from = walkable[Math.floor(Math.random() * walkable.length)];
  const to   = walkable[Math.floor(Math.random() * walkable.length)];
  const r = findPath(grid, from, to);
  if (r) found++;
}
const ms = performance.now() - t0;
check(`${n} walkable→walkable paths in <3000ms`, ms < 3000,
  `${found}/${n} found in ${ms.toFixed(1)}ms (avg ${(ms/n).toFixed(2)}ms each)`);

// Test 11: Symmetry sanity — A→B and B→A should both find paths if connected
if (r2) {
  const rrev = findPath(grid, B, A);
  check('reverse path also found', rrev !== null,
    rrev ? `${rrev.waypoints.length} wp` : 'null');
}


 // Regression: coordinates outside the map must not be silently clamped
 // onto an edge cell, which can send bots toward a location they do not occupy.
const boundaryGrid = new Uint8Array(3 * 3);
const boundaryGeometry = { cols: 3, rows: 3, cellX: 10, cellY: 10 };
const boundaryStart = { x: 5, y: 5 };
const boundaryGoal = { x: 25, y: 25 };
check('valid in-bounds path works with explicit geometry',
  findPath(boundaryGrid, boundaryStart, boundaryGoal, boundaryGeometry) !== null);
check('negative X start is rejected instead of clamped',
  findPath(boundaryGrid, { x: -0.01, y: 5 }, boundaryGoal, boundaryGeometry) === null);
check('negative Y start is rejected instead of clamped',
  findPath(boundaryGrid, { x: 5, y: -0.01 }, boundaryGoal, boundaryGeometry) === null);
check('right map edge is exclusive',
  findPath(boundaryGrid, boundaryStart, { x: 30, y: 5 }, boundaryGeometry) === null);
check('bottom map edge is exclusive',
  findPath(boundaryGrid, boundaryStart, { x: 5, y: 30 }, boundaryGeometry) === null);
check('non-finite path coordinates are rejected',
  findPath(boundaryGrid, { x: Number.POSITIVE_INFINITY, y: 5 }, boundaryGoal, boundaryGeometry) === null &&
  findPath(boundaryGrid, boundaryStart, { x: Number.NaN, y: 5 }, boundaryGeometry) === null);
const boundaryCache = new PathCache();
check('out-of-bounds cache request returns null without caching',
  boundaryCache.find(boundaryGrid, { x: -1, y: 5 }, boundaryGoal, false, boundaryGeometry) === null &&
  boundaryCache.size === 0);
check('valid edge-cell query succeeds after invalid request',
  boundaryCache.find(boundaryGrid, { x: 1, y: 5 }, boundaryGoal, false, boundaryGeometry) !== null);
check('invalid geometry is rejected without throwing',
  findPath(boundaryGrid, boundaryStart, boundaryGoal, {
    cols: 0, rows: 3, cellX: 10, cellY: 10,
  }) === null);


 // Regression: the heuristic must use the true diagonal cost when cell X/Y
 // scales differ. The prior square-cell octile estimate overestimated some
 // routes and made A* return a longer path than Dijkstra on this fixture.
const anisotropicRows = [
  '........',
  '.#.....#',
  '.#......',
  '......#.',
  '........',
  '#.......',
  '#.......',
  '..#.....',
];
const anisotropicGrid = Uint8Array.from(
  anisotropicRows.join('').split('').map(cell => cell === '#' ? 1 : 0),
);
const anisotropicPath = findPath(
  anisotropicGrid,
  { x: 5, y: 10 },
  { x: 75, y: 150 },
  { cols: 8, rows: 8, cellX: 10, cellY: 20 },
);
check('non-square-cell A* returns the optimal anisotropic route',
  anisotropicPath !== null &&
  Math.abs(anisotropicPath.length - 168.66068747318505) < 1e-5,
  anisotropicPath ? `length=${anisotropicPath.length.toFixed(6)}px` : 'null');


 // The same coordinate key can describe different topology in different
 // maps. Reusing a successful path from the previous grid is unsafe.
const blockedColumnGrid = Uint8Array.from([
  0, 1, 0,
  0, 1, 0,
  0, 1, 0,
]);
const mapScopedCache = new PathCache();
const corridorStart = { x: 5, y: 15 };
const corridorGoal = { x: 25, y: 15 };
check('path cache finds route on the open map',
  mapScopedCache.find(boundaryGrid, corridorStart, corridorGoal, false, boundaryGeometry) !== null);
check('path cache does not reuse a route from a different blocked map',
  mapScopedCache.find(blockedColumnGrid, corridorStart, corridorGoal, false, boundaryGeometry) === null);


 // Swept movement validation must fail closed for malformed coordinates or
 // spacing. NaN previously produced zero loop iterations (and therefore true);
 // zero spacing could also produce an unbounded loop for nonzero distances.
check('swept movement rejects NaN coordinates',
  isPlayerPathWalkable(grid, Number.NaN, 0, 0, 0) === false);
check('swept movement rejects infinite coordinates',
  isPlayerPathWalkable(grid, 0, 0, Number.POSITIVE_INFINITY, 0) === false);
check('swept movement rejects zero sample spacing',
  isPlayerPathWalkable(grid, 0, 0, 0, 0, 0) === false);
check('swept movement rejects negative sample spacing',
  isPlayerPathWalkable(grid, 0, 0, 0, 0, -1) === false);
check('swept movement rejects non-finite sample spacing',
  isPlayerPathWalkable(grid, 0, 0, 0, 0, Number.NaN) === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
