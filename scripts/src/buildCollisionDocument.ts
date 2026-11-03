import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FINE_CELL_X,
  FINE_CELL_Y,
  FINE_COLS,
  FINE_ROWS,
} from "../../lib/shared/src/collisionDataFine.js";
import { MAP_H, MAP_W } from "../../lib/shared/src/coords.js";
import { buildPreciseCollisionGrid } from "../../lib/shared/src/collisionMap.js";
import { MANUAL_BLOCKED_POLYGONS } from "../../lib/shared/src/collisionOverrides.js";
import { validateCollisionDocument } from "../../lib/shared/src/collision/vectorCollision.js";
import type { CollisionDocument, CollisionShape } from "../../lib/shared/src/collision/vectorCollision.js";
import {
  buildFineShadowGrid,
  buildFineShadowSegments,
  buildNarrowShadowOccluders,
} from "../../artifacts/telegram-game/src/game/visibility.js";

const root = path.resolve(import.meta.dirname, "../..");
const outputDir = path.join(root, "lib/shared/src/collision");
const outputJson = path.join(outputDir, "collision.v1.json");
const outputTs = path.join(outputDir, "generatedDocument.ts");
const GENERATOR_VERSION = 2;

async function sha256(relativePath: string): Promise<string> {
  const bytes = await readFile(path.join(root, relativePath));
  return createHash("sha256").update(bytes).digest("hex");
}

interface ActiveRect {
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
}

function gridToRectangles(
  grid: Uint8Array,
  idPrefix: string,
  blocksMove: boolean,
  blocksSight: boolean,
): CollisionShape[] {
  if (grid.length !== FINE_COLS * FINE_ROWS) {
    throw new Error(`${idPrefix}: expected ${FINE_COLS * FINE_ROWS} fine-grid cells, received ${grid.length}`);
  }

  const active = new Map<string, ActiveRect>();
  const shapes: CollisionShape[] = [];
  let nextId = 0;

  const finish = (rect: ActiveRect) => {
    const x0 = rect.colStart * FINE_CELL_X;
    const x1 = rect.colEnd * FINE_CELL_X;
    const y0 = rect.rowStart * FINE_CELL_Y;
    const y1 = rect.rowEnd * FINE_CELL_Y;
    shapes.push({
      id: `${idPrefix}-${String(nextId++).padStart(5, "0")}`,
      points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
      closed: true,
      blocksMove,
      blocksSight,
      label: idPrefix,
    });
  };

  for (let row = 0; row < FINE_ROWS; row++) {
    const runs: Array<[number, number]> = [];
    let col = 0;
    while (col < FINE_COLS) {
      if (grid[row * FINE_COLS + col] !== 1) {
        col++;
        continue;
      }
      const start = col;
      while (col < FINE_COLS && grid[row * FINE_COLS + col] === 1) col++;
      runs.push([start, col]);
    }

    const currentKeys = new Set(runs.map(([start, end]) => `${start}:${end}`));
    for (const [key, rect] of active) {
      if (currentKeys.has(key)) continue;
      finish(rect);
      active.delete(key);
    }
    for (const [start, end] of runs) {
      const key = `${start}:${end}`;
      const existing = active.get(key);
      if (existing) existing.rowEnd = row + 1;
      else active.set(key, { colStart: start, colEnd: end, rowStart: row, rowEnd: row + 1 });
    }
  }

  for (const rect of active.values()) finish(rect);
  return shapes;
}

function narrowCircleShape(
  id: string,
  x: number,
  y: number,
  radius: number,
): CollisionShape {
  const points: Array<[number, number]> = [];
  const sides = 24;
  for (let index = 0; index < sides; index++) {
    const angle = (index / sides) * Math.PI * 2;
    points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
  }
  return {
    id,
    points,
    closed: true,
    blocksMove: false,
    blocksSight: true,
    label: "narrow vision occluder",
  };
}

async function main(): Promise<void> {
  const movementGrid = buildPreciseCollisionGrid();
  const shadowGrid = buildFineShadowGrid(movementGrid);
  const shadowSegments = buildFineShadowSegments(movementGrid);
  const narrowOccluders = buildNarrowShadowOccluders(movementGrid, true);

  // Movement is derived from the exact fine grid used by the live raster
  // collision code, including the currently approved walkable replacement zones.
  const movementShapes = gridToRectangles(movementGrid, "movement-cell", true, false);

  // Vision uses the same fine source, with the existing large-component /
  // medium-object decomposition. Manual collision polygons are retained as
  // explicit object outlines; the obsolete statue circle is not reintroduced.
  const manualShapes: CollisionShape[] = MANUAL_BLOCKED_POLYGONS.map((polygon, index) => ({
    id: `manual-blocked-${String(index).padStart(3, "0")}-${polygon.id}`,
    points: polygon.points.map(([x, y]) => [x, y] as [number, number]),
    closed: true,
    blocksMove: true,
    blocksSight: true,
    label: polygon.id,
  }));
  const sightAreaShapes = gridToRectangles(shadowGrid, "sight-area", false, true);
  const sightSegmentShapes: CollisionShape[] = shadowSegments.map((segment, index) => ({
    id: `sight-segment-${String(index).padStart(5, "0")}`,
    points: [[segment.ax, segment.ay], [segment.bx, segment.by]],
    closed: false,
    blocksMove: false,
    blocksSight: true,
    label: "fine-grid object outline",
  }));
  const narrowShapes = narrowOccluders.map((circle, index) =>
    narrowCircleShape(`narrow-occluder-${String(index).padStart(3, "0")}`, circle.x, circle.y, circle.radius),
  );

  const sourceFiles = {
    fineCollisionData: {
      path: "lib/shared/src/collisionDataFine.ts",
      sha256: await sha256("lib/shared/src/collisionDataFine.ts"),
    },
    collisionOverrides: {
      path: "lib/shared/src/collisionOverrides.ts",
      sha256: await sha256("lib/shared/src/collisionOverrides.ts"),
    },
    collisionMap: {
      path: "lib/shared/src/collisionMap.ts",
      sha256: await sha256("lib/shared/src/collisionMap.ts"),
    },
    visibility: {
      path: "artifacts/telegram-game/src/game/visibility.ts",
      sha256: await sha256("artifacts/telegram-game/src/game/visibility.ts"),
    },
    coordinates: {
      path: "lib/shared/src/coords.ts",
      sha256: await sha256("lib/shared/src/coords.ts"),
    },
    generator: {
      path: "scripts/src/buildCollisionDocument.ts",
      sha256: await sha256("scripts/src/buildCollisionDocument.ts"),
    },
    redlineReference: {
      path: "attached_assets/IMG_2907_1783632830477.jpeg",
      sha256: await sha256("attached_assets/IMG_2907_1783632830477.jpeg"),
    },
  };

  const shapes = [
    ...movementShapes,
    ...manualShapes,
    ...sightAreaShapes,
    ...sightSegmentShapes,
    ...narrowShapes,
  ];
  const document: CollisionDocument = {
    version: 1,
    mapW: MAP_W,
    mapH: MAP_H,
    shapes,
    source: {
      kind: "fine-grid-derived",
      generatorVersion: GENERATOR_VERSION,
      sourceFiles,
      fineGrid: {
        cols: FINE_COLS,
        rows: FINE_ROWS,
        cellX: FINE_CELL_X,
        cellY: FINE_CELL_Y,
      },
      sightPipeline: {
        largeComponentGrid: "buildFineShadowGrid",
        mediumAndSmallOutlines: "buildFineShadowSegments",
        narrowOccluders: narrowOccluders.length,
        obsoleteStatueCircleExcluded: true,
      },
      shapeCounts: {
        movementRectangles: movementShapes.length,
        manualBlockedPolygons: manualShapes.length,
        sightRectangles: sightAreaShapes.length,
        sightSegments: sightSegmentShapes.length,
        narrowOccluders: narrowShapes.length,
        total: shapes.length,
      },
    },
  };

  const errors = validateCollisionDocument(document);
  if (errors.length) throw new Error("Generated collision document is invalid: " + errors.join("; "));

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputJson, JSON.stringify(document, null, 2) + "\n");
  await writeFile(
    outputTs,
    `import type { CollisionDocument } from "./vectorCollision.js";\nexport const COLLISION_DOCUMENT = ${JSON.stringify(document)} as CollisionDocument;\n`,
  );

  console.log(JSON.stringify({
    ok: true,
    generatorVersion: GENERATOR_VERSION,
    sourceKind: document.source.kind,
    fineGridCells: movementGrid.length,
    shapes: document.source.shapeCounts,
    sourceFiles,
    outputJson: path.relative(root, outputJson),
    outputTs: path.relative(root, outputTs),
  }, null, 2));
}

await main();
