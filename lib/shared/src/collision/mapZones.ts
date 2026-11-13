import type { CollisionDocument, CollisionShape } from "./vectorCollision.js";

export const MAP_AUTHORING_ZONES = [
  { id: "Z01", label: "North-west rooms and entry", minX: 0, maxX: 806, minY: 0, maxY: 1858 / 3 },
  { id: "Z02", label: "North-central cafeteria and upper furniture", minX: 806, maxX: 1612, minY: 0, maxY: 1858 / 3 },
  { id: "Z03", label: "North-east generator approach", minX: 1612, maxX: 2418, minY: 0, maxY: 1858 / 3 },
  { id: "Z04", label: "North-east technical and vehicle rooms", minX: 2418, maxX: 3224, minY: 0, maxY: 1858 / 3 },
  { id: "Z05", label: "West-central machinery and pipe rooms", minX: 0, maxX: 806, minY: 1858 / 3, maxY: 2 * 1858 / 3 },
  { id: "Z06", label: "Central lobby and statue garden", minX: 806, maxX: 1612, minY: 1858 / 3, maxY: 2 * 1858 / 3 },
  { id: "Z07", label: "East-central offices and generator bay", minX: 1612, maxX: 2418, minY: 1858 / 3, maxY: 2 * 1858 / 3 },
  { id: "Z08", label: "East service and vehicle perimeter", minX: 2418, maxX: 3224, minY: 1858 / 3, maxY: 2 * 1858 / 3 },
  { id: "Z09", label: "South-west shop and shelving", minX: 0, maxX: 806, minY: 2 * 1858 / 3, maxY: 1858 },
  { id: "Z10", label: "South-central playground and service fixtures", minX: 806, maxX: 1612, minY: 2 * 1858 / 3, maxY: 1858 },
  { id: "Z11", label: "South-east service corridors", minX: 1612, maxX: 2418, minY: 2 * 1858 / 3, maxY: 1858 },
  { id: "Z12", label: "South-east admin and lower rooms", minX: 2418, maxX: 3224, minY: 2 * 1858 / 3, maxY: 1858 },
] as const;

export type MapAuthoringZoneId = (typeof MAP_AUTHORING_ZONES)[number]["id"];

export function isMapAuthoringZoneId(value: unknown): value is MapAuthoringZoneId {
  return typeof value === "string" &&
    MAP_AUTHORING_ZONES.some(zone => zone.id === value);
}

function containsHalfOpen(value: number, min: number, max: number, includeMax: boolean): boolean {
  return Number.isFinite(value) && value >= min && (includeMax ? value <= max : value < max);
}

/** Return the single primary owner for a world point using the register's half-open partition. */
export function getPrimaryMapAuthoringZone(x: number, y: number): MapAuthoringZoneId | null {
  for (const zone of MAP_AUTHORING_ZONES) {
    const finalColumn = zone.maxX === 3224;
    const finalRow = zone.maxY === 1858;
    if (
      containsHalfOpen(x, zone.minX, zone.maxX, finalColumn) &&
      containsHalfOpen(y, zone.minY, zone.maxY, finalRow)
    ) {
      return zone.id;
    }
  }
  return null;
}

/**
 * Find a shape's ground-footprint centroid. Closed polygons use their signed-area
 * centroid; open walls use a length-weighted segment midpoint. This is only for
 * assigning one primary authoring zone, never for changing or approving geometry.
 */
export function getCollisionShapeGroundCentroid(shape: Pick<CollisionShape, "points" | "closed">): [number, number] {
  const points = shape.points;
  if (!points.length) return [Number.NaN, Number.NaN];
  if (points.length === 1) return [points[0][0], points[0][1]];

  if (shape.closed && points.length >= 3) {
    let twiceArea = 0;
    let centroidXNumerator = 0;
    let centroidYNumerator = 0;
    for (let index = 0; index < points.length; index++) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const cross = current[0] * next[1] - next[0] * current[1];
      twiceArea += cross;
      centroidXNumerator += (current[0] + next[0]) * cross;
      centroidYNumerator += (current[1] + next[1]) * cross;
    }
    if (Math.abs(twiceArea) > 1e-6) {
      return [
        centroidXNumerator / (3 * twiceArea),
        centroidYNumerator / (3 * twiceArea),
      ];
    }
  }

  let weightedX = 0;
  let weightedY = 0;
  let totalLength = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const length = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    if (length === 0) continue;
    weightedX += ((previous[0] + current[0]) / 2) * length;
    weightedY += ((previous[1] + current[1]) / 2) * length;
    totalLength += length;
  }
  if (totalLength > 0) return [weightedX / totalLength, weightedY / totalLength];

  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
}

/**
 * Assign each existing shape to the unique zone containing its ground
 * centroid. This migrates legacy A–E / unassigned metadata without changing
 * geometry, flags, labels, or shape order. Out-of-bounds shapes stay explicitly
 * unassigned so they cannot silently enter a zone candidate.
 */
export function assignMapAuthoringZonesByCentroid<T extends Pick<CollisionDocument, "shapes">>(document: T): T {
  return {
    ...document,
    shapes: document.shapes.map(shape => {
      const [x, y] = getCollisionShapeGroundCentroid(shape);
      return { ...shape, zone: getPrimaryMapAuthoringZone(x, y) ?? "unassigned" };
    }),
  } as T;
}

/**
 * Validate a zone candidate against the canonical 4×3 partition. Shapes may
 * cross a seam (the adjacent zone receives 24px context), but their ground
 * centroid must belong to exactly one primary zone.
 */
export function validateMapAuthoringZoneDocument(
  document: Pick<CollisionDocument, "shapes">,
  zoneId: unknown,
): string[] {
  if (!isMapAuthoringZoneId(zoneId)) {
    return ["Unknown authoring zone; expected Z01–Z12"];
  }
  const errors: string[] = [];
  for (const shape of document.shapes) {
    if (shape.zone !== zoneId) {
      errors.push("Shape " + shape.id + " is assigned to " + (shape.zone || "unassigned") + ", not " + zoneId);
      continue;
    }
    const [x, y] = getCollisionShapeGroundCentroid(shape);
    const primaryZone = getPrimaryMapAuthoringZone(x, y);
    if (primaryZone !== zoneId) {
      errors.push(
        "Shape " + shape.id + " ground centroid (" + x.toFixed(2) + ", " + y.toFixed(2) +
        ") belongs to " + (primaryZone ?? "no in-bounds zone") + ", not " + zoneId,
      );
    }
  }
  return errors;
}
