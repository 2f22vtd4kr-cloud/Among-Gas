import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

import {
  buildPreciseCollisionGrid,
  INTENTIONALLY_ISOLATED_DECORATIVE_REGIONS,
  INTENTIONALLY_SEALED_REGIONS,
  MANUAL_BLOCKED_POLYGONS,
  FINE_CELL_X,
  FINE_CELL_Y,
  FINE_COLS,
  FINE_ROWS,
  MAP_W,
  MAP_H,
  isPlayerFootprintWalkableAtFeet,
  isPlayerPathWalkable,
  isPlayerPositionWalkable,
  isPlayerSpawnPositionClear,
  isLineOfSightToInteractionTarget,
} from '@workspace/shared/collisionMap';
import {
  FEET_OFFSET_Y,
  PLAYER_HALF_WIDTH,
  PLAYER_RADIUS,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
} from '@workspace/shared/coords';

// Use the exact production grid, including the same authored walkable and
// blocked overrides consumed by client prediction and server validation.
const grid = buildPreciseCollisionGrid();
assert.equal(grid.length, FINE_COLS * FINE_ROWS, 'canonical fine grid dimensions match');
assert.ok(FINE_COLS > 0 && FINE_ROWS > 0, 'canonical fine grid dimensions are non-zero');

// Every node represents a feet-anchor position, not a sprite-centre position.
// Static clearance and edge connectivity both call the shared production
// functions so the graph cannot silently drift from the actual player hitbox.
const valid = new Uint8Array(grid.length);
for (let row = 0; row < FINE_ROWS; row++) {
  for (let col = 0; col < FINE_COLS; col++) {
    const feetX = (col + 0.5) * FINE_CELL_X;
    const feetY = (row + 0.5) * FINE_CELL_Y;
    if (isPlayerFootprintWalkableAtFeet(grid, feetX, feetY)) {
      valid[row * FINE_COLS + col] = 1;
    }
  }
}

const componentOf = new Int32Array(grid.length);
componentOf.fill(-1);
const componentSizes: number[] = [];
const componentBounds: Array<[number, number, number, number]> = [];
const directions = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
] as const;

function feetPathWalkable(
  fromFeetX: number,
  fromFeetY: number,
  toFeetX: number,
  toFeetY: number,
): boolean {
  // Production isPlayerPathWalkable accepts sprite-centre positions and
  // applies FEET_OFFSET_Y internally. Convert these graph nodes accordingly.
  return isPlayerPathWalkable(
    grid,
    fromFeetX,
    fromFeetY - FEET_OFFSET_Y,
    toFeetX,
    toFeetY - FEET_OFFSET_Y,
  );
}

for (let start = 0; start < valid.length; start++) {
  if (!valid[start] || componentOf[start] !== -1) continue;

  const id = componentSizes.length;
  const queue = [start];
  componentOf[start] = id;
  let minCol = FINE_COLS, minRow = FINE_ROWS;
  let maxCol = -1, maxRow = -1;

  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const col = index % FINE_COLS;
    const row = Math.floor(index / FINE_COLS);
    const fromFeetX = (col + 0.5) * FINE_CELL_X;
    const fromFeetY = (row + 0.5) * FINE_CELL_Y;

    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);

    for (const [dc, dr] of directions) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (
        nextCol < 0 || nextCol >= FINE_COLS ||
        nextRow < 0 || nextRow >= FINE_ROWS
      ) continue;

      const next = nextRow * FINE_COLS + nextCol;
      if (!valid[next] || componentOf[next] !== -1) continue;

      const toFeetX = (nextCol + 0.5) * FINE_CELL_X;
      const toFeetY = (nextRow + 0.5) * FINE_CELL_Y;

      // A pair of clear endpoints is not sufficient. Match the real movement
      // sweep (<=2px samples, full player footprint) before joining graph nodes.
      if (!feetPathWalkable(fromFeetX, fromFeetY, toFeetX, toFeetY)) continue;

      componentOf[next] = id;
      queue.push(next);
    }
  }

  componentSizes.push(queue.length);
  componentBounds.push([
    Math.round(minCol * FINE_CELL_X),
    Math.round(minRow * FINE_CELL_Y),
    Math.round((maxCol + 1) * FINE_CELL_X),
    Math.round((maxRow + 1) * FINE_CELL_Y),
  ]);
}

// PLAYER_SPAWN_X/Y are sprite-centre coordinates. The connectivity grid is in
// feet-anchor space, so its seed must include the shared feet offset.
assert.ok(
  isPlayerPositionWalkable(grid, PLAYER_SPAWN_X, PLAYER_SPAWN_Y),
  'configured production spawn has full-footprint clearance',
);
assert.ok(
  isPlayerSpawnPositionClear(grid, PLAYER_SPAWN_X, PLAYER_SPAWN_Y),
  'configured production spawn has full visible-sprite clearance',
);
const spawnFeetX = PLAYER_SPAWN_X;
const spawnFeetY = PLAYER_SPAWN_Y + FEET_OFFSET_Y;
const spawnCol = Math.floor(spawnFeetX / FINE_CELL_X);
const spawnRow = Math.floor(spawnFeetY / FINE_CELL_Y);
assert.ok(
  spawnCol >= 0 && spawnCol < FINE_COLS && spawnRow >= 0 && spawnRow < FINE_ROWS,
  'configured spawn feet anchor falls inside the fine grid',
);
const spawnIndex = spawnRow * FINE_COLS + spawnCol;
assert.ok(
  componentOf[spawnIndex] >= 0,
  'configured spawn feet anchor belongs to a valid clearance component',
);
const spawnComponent = componentOf[spawnIndex];

const significant = componentSizes
  .map((size, id) => ({ id, size, bounds: componentBounds[id] }))
  .filter(({ size }) => size >= 1000)
  .sort((a, b) => b.size - a.size);


// Find the closest cells of every significant detached region to the spawn
// network, ignoring obstacles during this distance transform. These are
// inspection candidates for a missing doorway or an intentional wall, not
// automatic instructions to carve a connection.
const nearestSpawnSteps = new Int32Array(grid.length);
nearestSpawnSteps.fill(-1);
const nearestSpawnOrigin = new Int32Array(grid.length);
nearestSpawnOrigin.fill(-1);
const distanceQueue = new Int32Array(grid.length);
let distanceHead = 0;
let distanceTail = 0;
for (let index = 0; index < componentOf.length; index++) {
  if (componentOf[index] !== spawnComponent) continue;
  nearestSpawnSteps[index] = 0;
  nearestSpawnOrigin[index] = index;
  distanceQueue[distanceTail++] = index;
}
const distanceDirections = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
] as const;
while (distanceHead < distanceTail) {
  const index = distanceQueue[distanceHead++];
  const col = index % FINE_COLS;
  const row = Math.floor(index / FINE_COLS);
  for (const [dc, dr] of distanceDirections) {
    const nextCol = col + dc;
    const nextRow = row + dr;
    if (
      nextCol < 0 || nextCol >= FINE_COLS ||
      nextRow < 0 || nextRow >= FINE_ROWS
    ) continue;
    const next = nextRow * FINE_COLS + nextCol;
    if (nearestSpawnSteps[next] !== -1) continue;
    nearestSpawnSteps[next] = nearestSpawnSteps[index] + 1;
    nearestSpawnOrigin[next] = nearestSpawnOrigin[index];
    distanceQueue[distanceTail++] = next;
  }
}
const significantBoundaryContacts = significant
  .filter(region => region.id !== spawnComponent)
  .map(region => {
    let nearestIndex = -1;
    let nearestSteps = Number.POSITIVE_INFINITY;
    for (let index = 0; index < componentOf.length; index++) {
      if (componentOf[index] !== region.id) continue;
      const steps = nearestSpawnSteps[index];
      if (steps >= 0 && steps < nearestSteps) {
        nearestSteps = steps;
        nearestIndex = index;
      }
    }
    if (nearestIndex < 0) return { component: region.id, bounds: region.bounds, contact: null };
    const originIndex = nearestSpawnOrigin[nearestIndex];
    const toPoint = (index: number) => {
      const col = index % FINE_COLS;
      const row = Math.floor(index / FINE_COLS);
      const worldX = (col + 0.5) * FINE_CELL_X;
      const worldY = (row + 0.5) * FINE_CELL_Y;
      return {
        world: [Math.round(worldX), Math.round(worldY)],
        referenceImage: [
          Math.round(worldX * 1359 / MAP_W),
          Math.round(worldY * 784 / MAP_H),
        ],
      };
    };
    const from = toPoint(originIndex);
    const to = toPoint(nearestIndex);
    return {
      component: region.id,
      bounds: region.bounds,
      chebyshevGridSteps: nearestSteps,
      approximateWorldGapPx: Math.round(Math.hypot(
        from.world[0] - to.world[0],
        from.world[1] - to.world[1],
      )),
      spawnSide: from,
      islandSide: to,
    };
  });

// Render a component-coloured map for visual diagnosis. Give the spawn
// network and all five significant detached regions a deliberately distinct,
// stable review palette; an ID-derived hue alone caused components 1 and 56
// to render almost the same green. Small components keep deterministic hues.
const significantPalette: [number, number, number][] = [
  [0.96, 0.20, 0.24], // red
  [0.98, 0.58, 0.12], // orange
  [0.12, 0.62, 0.92], // blue
  [0.65, 0.35, 0.92], // purple
  [0.93, 0.32, 0.68], // magenta
];
const significantColourById = new Map<number, [number, number, number]>(
  significant
    .filter(region => region.id !== spawnComponent)
    .map((region, index) => [region.id, significantPalette[index % significantPalette.length]]),
);
const spawnColour: [number, number, number] = [0.08, 0.76, 0.36];
const componentPixels = Buffer.alloc(FINE_COLS * FINE_ROWS * 4);
for (let index = 0; index < componentOf.length; index++) {
  const id = componentOf[index];
  if (id < 0) continue;

  let rgb = id === spawnComponent ? spawnColour : significantColourById.get(id);
  if (!rgb) {
    const hue = (id * 137.508) % 360;
    const chroma = 0.72;
    const sector = hue / 60;
    const x = chroma * (1 - Math.abs((sector % 2) - 1));
    if (sector < 1) rgb = [chroma, x, 0];
    else if (sector < 2) rgb = [x, chroma, 0];
    else if (sector < 3) rgb = [0, chroma, x];
    else if (sector < 4) rgb = [0, x, chroma];
    else if (sector < 5) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
  }

  const offset = index * 4;
  componentPixels[offset] = Math.round((rgb[0] + 0.18) * 255);
  componentPixels[offset + 1] = Math.round((rgb[1] + 0.18) * 255);
  componentPixels[offset + 2] = Math.round((rgb[2] + 0.18) * 255);
  componentPixels[offset + 3] = id === spawnComponent ? 180 : significantColourById.has(id) ? 175 : 95;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapPath = path.join(root, 'artifacts/telegram-game/public/map-hires.png');
const outputPath = path.join(root, 'artifacts/telegram-game/fine-connectivity-components.png');
const referenceMapPath = path.join(root, 'attached_assets/IMG_2907_1783632830477.jpeg');
const boundaryOutputPath = path.join(root, 'artifacts/telegram-game/fine-connectivity-boundaries.png');
const componentOverlay = await sharp(componentPixels, {
  raw: { width: FINE_COLS, height: FINE_ROWS, channels: 4 },
})
  .resize(MAP_W, MAP_H, { kernel: 'nearest' })
  .png()
  .toBuffer();
const componentLegendRows = [
  { id: spawnComponent, label: 'Spawn network', size: componentSizes[spawnComponent], colour: spawnColour },
  ...significant
    .filter(region => region.id !== spawnComponent)
    .map(region => ({
      id: region.id,
      label: 'Detached component ' + region.id,
      size: region.size,
      colour: significantColourById.get(region.id) ?? [0.5, 0.5, 0.5] as [number, number, number],
    })),
];
const componentLegendSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="540" height="${56 + componentLegendRows.length * 38}">
    <rect x="10" y="10" width="520" height="${36 + componentLegendRows.length * 38}" rx="12" fill="#111827" fill-opacity="0.94"/>
    ${componentLegendRows.map((item, index) => {
      const color = item.colour.map(channel =>
        Math.round(Math.min(1, channel + 0.18) * 255).toString(16).padStart(2, '0'),
      ).join('');
      const y = 48 + index * 38;
      return `
        <rect x="28" y="${y - 17}" width="21" height="21" rx="4" fill="#${color}"/>
        <text x="63" y="${y}" font-family="Arial,sans-serif" font-size="22" fill="#ffffff">
          ${item.label} — ${item.size.toLocaleString()} cells
        </text>
      `;
    }).join('')}
  </svg>
`);
await sharp(mapPath)
  .composite([
    { input: componentOverlay, blend: 'over' },
    { input: componentLegendSvg, left: 18, top: 18, blend: 'over' },
  ])
  .png()
  .toFile(outputPath);

// Annotate the nearest source-image boundary pairs. Cyan marks the spawn side;
// orange marks the detached side. The line is an inspection locator, not a
// proposed route or a claim that the intervening region should be walkable.
const boundaryMarks = significantBoundaryContacts
  .filter(contact => contact.spawnSide && contact.islandSide)
  .map(contact => {
    const [sx, sy] = contact.spawnSide.referenceImage;
    const [ix, iy] = contact.islandSide.referenceImage;
    const labelX = Math.round((sx + ix) / 2);
    const labelY = Math.round((sy + iy) / 2);
    const label = 'C' + contact.component + ' ' + contact.approximateWorldGapPx + 'px';
    return `
      <line x1="${sx}" y1="${sy}" x2="${ix}" y2="${iy}" stroke="#ffffff" stroke-width="5" opacity="0.95"/>
      <line x1="${sx}" y1="${sy}" x2="${ix}" y2="${iy}" stroke="#ff9a3c" stroke-width="2.5" stroke-dasharray="5 4"/>
      <circle cx="${sx}" cy="${sy}" r="8" fill="#00d8ff" stroke="#062632" stroke-width="2"/>
      <circle cx="${ix}" cy="${iy}" r="8" fill="#ff9a3c" stroke="#421b00" stroke-width="2"/>
      <rect x="${labelX - 38}" y="${labelY - 23}" width="76" height="19" rx="5" fill="#111827" fill-opacity="0.94"/>
      <text x="${labelX}" y="${labelY - 9}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#ffffff">${label}</text>
    `;
  })
  .join('');
const boundaryLegend = `
  <rect x="18" y="18" width="250" height="48" rx="8" fill="#111827" fill-opacity="0.92"/>
  <circle cx="36" cy="36" r="6" fill="#00d8ff"/>
  <text x="49" y="40" font-family="Arial,sans-serif" font-size="12" fill="#ffffff">spawn-connected side</text>
  <circle cx="36" cy="53" r="6" fill="#ff9a3c"/>
  <text x="49" y="57" font-family="Arial,sans-serif" font-size="12" fill="#ffffff">detached component side</text>
`;
const boundarySvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1359" height="784" viewBox="0 0 1359 784">
    ${boundaryLegend}
    ${boundaryMarks}
  </svg>
`);
await sharp(referenceMapPath)
  .composite([{ input: boundarySvg, blend: 'over' }])
  .png()
  .toFile(boundaryOutputPath);
console.log('Fine-grid boundary review overlay: ' + boundaryOutputPath);

// Map gameplay anchors to the actual fine-grid components that have a valid
// player footprint and line-of-sight approach. This is classification evidence,
// not an assumption that every region must be physically connected to spawn.
const { TASK_DEFS, TASK_INTERACTION_RANGE_PX } = await import('@workspace/shared/tasks');
const { VENT_DEFS, VENT_INTERACTION_RANGE_PX } = await import('@workspace/shared/vents');
const { ADMIN_TABLE_DEFS, ADMIN_TABLE_INTERACTION_RANGE_PX } = await import('@workspace/shared/adminTable');
const { SABOTAGE_DEFS, SABOTAGE_INTERACTION_RANGE_PX } = await import('@workspace/shared/sabotage');

function classifyAnchorApproaches(
  target: { id: number | string; name: string; x: number; y: number; radiusPx?: number },
  interactionRangePx: number,
  defaultRadiusPx = 24,
) {
  const approachRadius = interactionRangePx - 8;
  const radiusPx = target.radiusPx ?? defaultRadiusPx;
  const byComponent = new Map<number, { count: number; nearest: number; x: number; y: number }>();

  for (let dy = -approachRadius; dy <= approachRadius; dy += 8) {
    for (let dx = -approachRadius; dx <= approachRadius; dx += 8) {
      const distance = Math.hypot(dx, dy);
      if (distance > approachRadius) continue;

      const spriteX = target.x + dx;
      const spriteY = target.y + dy;
      if (!isPlayerPositionWalkable(grid, spriteX, spriteY)) continue;

      const feetY = spriteY + FEET_OFFSET_Y;
      if (!isLineOfSightToInteractionTarget(
        grid,
        spriteX,
        feetY,
        target.x,
        target.y + FEET_OFFSET_Y,
        radiusPx,
      )) continue;

      const col = Math.floor(spriteX / FINE_CELL_X);
      const row = Math.floor(feetY / FINE_CELL_Y);
      if (col < 0 || col >= FINE_COLS || row < 0 || row >= FINE_ROWS) continue;
      const component = componentOf[row * FINE_COLS + col];
      if (component < 0) continue;

      const previous = byComponent.get(component);
      if (previous) {
        previous.count++;
        if (distance < previous.nearest) {
          previous.nearest = distance;
          previous.x = spriteX;
          previous.y = spriteY;
        }
      } else {
        byComponent.set(component, {
          count: 1,
          nearest: distance,
          x: spriteX,
          y: spriteY,
        });
      }
    }
  }

  return {
    id: target.id,
    name: target.name,
    anchor: [target.x, target.y],
    rangePx: interactionRangePx,
    approachRadiusPx: approachRadius,
    radiusPx,
    approachComponents: [...byComponent.entries()]
      .map(([component, value]) => ({
        component,
        approachSamples: value.count,
        nearestApproachPx: Math.round(value.nearest),
        nearestSpritePosition: [Math.round(value.x), Math.round(value.y)],
        connectedToSpawn: component === spawnComponent,
      }))
      .sort((a, b) => a.nearestApproachPx - b.nearestApproachPx),
  };
}

const gameplayAnchors = [
  ...TASK_DEFS.map(task => classifyAnchorApproaches(
    { id: task.id, name: task.name, x: task.x, y: task.y, radiusPx: task.interactionTargetRadiusPx },
    TASK_INTERACTION_RANGE_PX,
  )),
  ...VENT_DEFS.map(vent => classifyAnchorApproaches(
    { id: vent.id, name: 'Vent ' + vent.name, x: vent.x, y: vent.y },
    VENT_INTERACTION_RANGE_PX,
    20,
  )),
  ...ADMIN_TABLE_DEFS.map(consoleDef => classifyAnchorApproaches(
    { id: consoleDef.id, name: consoleDef.name, x: consoleDef.x, y: consoleDef.y },
    ADMIN_TABLE_INTERACTION_RANGE_PX,
  )),
  ...Object.values(SABOTAGE_DEFS).flatMap(system => system.pads.map((pad, index) =>
    classifyAnchorApproaches(
      { id: system.id + ':' + index, name: system.name + ' pad ' + index, x: pad.x, y: pad.y },
      SABOTAGE_INTERACTION_RANGE_PX,
    ),
  )),
];

// Five named route probes used by the earlier sector-level audit. Re-check
// them against the fine-grid production player footprint, not only the compact
// navigation mask. A small local search avoids a false negative from a target
// landing between fine-grid cell centres.
const sectorTargets = [
  { id: 'A', name: 'upper-left', x: 429, y: 600 },
  { id: 'B', name: 'upper-right/generator', x: 2942, y: 898 },
  { id: 'C', name: 'central garden', x: 1733, y: 472 },
  { id: 'D', name: 'lower-left storage/electrical', x: 472, y: 1372 },
  { id: 'E', name: 'lower-right', x: 2634, y: 1443 },
];
const sectorTargetApproaches = sectorTargets.map(target => {
  const byComponent = new Map<number, { count: number; nearest: number; x: number; y: number }>();
  for (let dy = -48; dy <= 48; dy += 8) {
    for (let dx = -48; dx <= 48; dx += 8) {
      const distance = Math.hypot(dx, dy);
      if (distance > 48) continue;
      const spriteX = target.x + dx;
      const spriteY = target.y + dy;
      if (!isPlayerPositionWalkable(grid, spriteX, spriteY)) continue;
      const feetY = spriteY + FEET_OFFSET_Y;
      const col = Math.floor(spriteX / FINE_CELL_X);
      const row = Math.floor(feetY / FINE_CELL_Y);
      if (col < 0 || col >= FINE_COLS || row < 0 || row >= FINE_ROWS) continue;
      const component = componentOf[row * FINE_COLS + col];
      if (component < 0) continue;
      const previous = byComponent.get(component);
      if (previous) {
        previous.count++;
        if (distance < previous.nearest) {
          previous.nearest = distance;
          previous.x = spriteX;
          previous.y = spriteY;
        }
      } else {
        byComponent.set(component, { count: 1, nearest: distance, x: spriteX, y: spriteY });
      }
    }
  }
  return {
    ...target,
    approachComponents: [...byComponent.entries()].map(([component, value]) => ({
      component,
      samples: value.count,
      nearestPx: Math.round(value.nearest),
      nearestPosition: [Math.round(value.x), Math.round(value.y)],
      connectedToSpawn: component === spawnComponent,
    })).sort((a, b) => a.nearestPx - b.nearestPx),
  };
});

console.log('Fine-grid component visual: ' + outputPath);
console.log('GAMEPLAY_ANCHOR_COMPONENTS ' + JSON.stringify(
  gameplayAnchors.map(anchor => ({
    name: anchor.name,
    components: anchor.approachComponents.map(approach => approach.component),
    spawnConnected: anchor.approachComponents.some(approach => approach.connectedToSpawn),
  })),
));
console.log('SECTOR_TARGET_COMPONENTS ' + JSON.stringify(
  sectorTargetApproaches.map(target => ({
    sector: target.id,
    name: target.name,
    components: target.approachComponents.map(approach => approach.component),
    spawnConnected: target.approachComponents.some(approach => approach.connectedToSpawn),
  })),
));
console.log('SIGNIFICANT_BOUNDARY_CONTACTS ' + JSON.stringify(significantBoundaryContacts));
assert.ok(
  sectorTargetApproaches.every(target => target.approachComponents.some(approach => approach.connectedToSpawn)),
  'all five named map-sector targets must have a full-footprint approach in the spawn-connected fine-grid network',
);

console.log(JSON.stringify({
  fineGrid: {
    cols: FINE_COLS,
    rows: FINE_ROWS,
    cellX: FINE_CELL_X,
    cellY: FINE_CELL_Y,
  },
  playerFootprint: {
    radius: PLAYER_RADIUS,
    halfWidth: PLAYER_HALF_WIDTH,
    feetOffsetY: FEET_OFFSET_Y,
    pathSampleSpacingPx: 2,
  },
  spawn: {
    spriteX: PLAYER_SPAWN_X,
    spriteY: PLAYER_SPAWN_Y,
    feetX: spawnFeetX,
    feetY: spawnFeetY,
    component: spawnComponent,
    componentCells: componentSizes[spawnComponent],
  },
  components: componentSizes.length,
  significantComponents: significant,
  gameplayAnchorApproaches: gameplayAnchors,
  significantBoundaryContacts,
}, null, 2));

// Four sealed prop/furniture regions are blocked by named irregular polygons.
// The central decorative garden is a deliberate exception: the existing
// mechanics contract preserves its walkable footprint, while its source-art
// perimeter remains sealed. No component-ID allowlist is used.
const detachedContacts = significantBoundaryContacts;
assert.equal(
  significant.filter(({ id }) => id !== spawnComponent).length,
  INTENTIONALLY_ISOLATED_DECORATIVE_REGIONS.length,
  'only the explicitly documented decorative garden remains as a detached walkable region',
);
assert.equal(
  detachedContacts.length,
  INTENTIONALLY_ISOLATED_DECORATIVE_REGIONS.length,
  'every remaining detached component has one named decorative-region disposition',
);

const toWorld = (point: readonly [number, number]): readonly [number, number] => [
  point[0] * MAP_W / 1359,
  point[1] * MAP_H / 784,
];
const findNearbyFeet = (
  referencePoint: readonly [number, number],
  componentId: number,
  maxDistanceWorldPx = 60,
): readonly [number, number] => {
  const [targetX, targetY] = toWorld(referencePoint);
  const centerCol = Math.floor(targetX / FINE_CELL_X);
  const centerRow = Math.floor(targetY / FINE_CELL_Y);
  let best: { point: readonly [number, number]; distance: number } | null = null;
  const radiusCols = Math.ceil(maxDistanceWorldPx / FINE_CELL_X);
  const radiusRows = Math.ceil(maxDistanceWorldPx / FINE_CELL_Y);
  for (let row = Math.max(0, centerRow - radiusRows); row <= Math.min(FINE_ROWS - 1, centerRow + radiusRows); row++) {
    for (let col = Math.max(0, centerCol - radiusCols); col <= Math.min(FINE_COLS - 1, centerCol + radiusCols); col++) {
      const index = row * FINE_COLS + col;
      if (componentOf[index] !== componentId) continue;
      const feetX = (col + 0.5) * FINE_CELL_X;
      const feetY = (row + 0.5) * FINE_CELL_Y;
      const distance = Math.hypot(feetX - targetX, feetY - targetY);
      if (distance <= maxDistanceWorldPx && (!best || distance < best.distance)) {
        best = { point: [feetX, feetY], distance };
      }
    }
  }
  assert.ok(best, `source-image boundary point ${referencePoint.join(',')} has a nearby valid component-${componentId} footprint`);
  return best!.point;
};
const closeEnough = (a: number, b: number, tolerance: number) =>
  Math.abs(a - b) <= tolerance;

for (const region of INTENTIONALLY_SEALED_REGIONS) {
  assert.ok(region.rationale.length >= 40, `${region.id} has an evidence-based source-art rationale`);
  const polygon = MANUAL_BLOCKED_POLYGONS.find(candidate => candidate.id === region.id);
  assert.ok(polygon, `${region.id} has a named production collision polygon`);
  assert.ok(polygon!.points.length >= 7, `${region.id} uses an irregular source-derived contour, not a rectangle`);
  const polygonBounds = [
    Math.min(...polygon!.points.map(point => point[0])),
    Math.min(...polygon!.points.map(point => point[1])),
    Math.max(...polygon!.points.map(point => point[0])),
    Math.max(...polygon!.points.map(point => point[1])),
  ];
  assert.ok(
    polygonBounds.every((value, index) => closeEnough(value, region.worldBounds[index], 12)),
    `${region.id}: blocked polygon tracks the reviewed component bounds`,
  );

  const [spawnFeetX, spawnFeetY] = findNearbyFeet(
    region.spawnSideReferenceImage,
    spawnComponent,
  );
  const [islandFeetX, islandFeetY] = toWorld(region.islandSideReferenceImage);
  const spawnSpriteY = spawnFeetY - FEET_OFFSET_Y;
  const islandSpriteY = islandFeetY - FEET_OFFSET_Y;
  assert.ok(
    isPlayerPositionWalkable(grid, spawnFeetX, spawnSpriteY),
    `${region.id}: surrounding spawn-side route retains full-footprint clearance`,
  );
  assert.equal(
    isPlayerPositionWalkable(grid, islandFeetX, islandSpriteY),
    false,
    `${region.id}: sealed non-playable footprint is blocked`,
  );
  assert.equal(
    isPlayerPathWalkable(grid, spawnFeetX, spawnSpriteY, islandFeetX, islandSpriteY),
    false,
    `${region.id}: player cannot sweep through the sealed source-art boundary`,
  );
}

for (const region of INTENTIONALLY_ISOLATED_DECORATIVE_REGIONS) {
  assert.ok(region.rationale.length >= 40, `${region.id} has an explicit decorative-area rationale`);
  assert.ok(
    !MANUAL_BLOCKED_POLYGONS.some(polygon => polygon.id === region.id),
    `${region.id}: central decorative garden is not filled by a manual collision polygon`,
  );
  const contact = detachedContacts.find(candidate =>
    candidate.bounds.every((value, index) => closeEnough(value, region.worldBounds[index], 12)) &&
    candidate.spawnSide?.referenceImage.every((value, index) =>
      closeEnough(value, region.spawnSideReferenceImage[index], 6),
    ) &&
    candidate.islandSide?.referenceImage.every((value, index) =>
      closeEnough(value, region.islandSideReferenceImage[index], 6),
    ),
  );
  assert.ok(contact?.spawnSide && contact?.islandSide, `${region.id} matches the reviewed source-art boundary`);

  const [spawnFeetX, spawnFeetY] = findNearbyFeet(
    region.spawnSideReferenceImage,
    spawnComponent,
  );
  const [islandFeetX, islandFeetY] = findNearbyFeet(
    region.islandSideReferenceImage,
    contact!.component,
  );
  const spawnSpriteY = spawnFeetY - FEET_OFFSET_Y;
  const islandSpriteY = islandFeetY - FEET_OFFSET_Y;
  assert.ok(
    isPlayerPositionWalkable(grid, spawnFeetX, spawnSpriteY),
    `${region.id}: surrounding spawn-side route remains walkable`,
  );
  assert.ok(
    isPlayerPositionWalkable(grid, islandFeetX, islandSpriteY),
    `${region.id}: decorative garden footprint remains walkable per map-mechanics contract`,
  );
  assert.equal(
    isPlayerPathWalkable(grid, spawnFeetX, spawnSpriteY, islandFeetX, islandSpriteY),
    false,
    `${region.id}: the continuous source-art perimeter remains a blocked boundary`,
  );
}

const unreachableGameplayAnchors = gameplayAnchors
  .filter(anchor => !anchor.approachComponents.some(approach => approach.connectedToSpawn))
  .map(anchor => anchor.name);
assert.deepEqual(
  unreachableGameplayAnchors,
  [],
  'all 24 gameplay anchors retain at least one spawn-connected full-footprint/LOS approach',
);

console.log('SEALED_REGION_DISPOSITIONS ' + JSON.stringify(INTENTIONALLY_SEALED_REGIONS));
console.log('ISOLATED_DECORATIVE_REGION_DISPOSITIONS ' + JSON.stringify(INTENTIONALLY_ISOLATED_DECORATIVE_REGIONS));
