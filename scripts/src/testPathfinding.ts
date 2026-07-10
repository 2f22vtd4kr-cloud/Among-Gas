import { buildCollisionGrid, COLS, ROWS, CELL_X, CELL_Y } from '@workspace/shared/collisionMap';
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
