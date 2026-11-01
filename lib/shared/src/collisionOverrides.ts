/**
 * Hand-traced map geometry overrides. These are expressed in the same
 * 3224×1858 world-pixel coordinate system as the rendered map.
 */

/**
 * A source-art red outline around the green service van was a loose rounded
 * rectangle, leaving too little room to walk around the vehicle. Replace that
 * one raster component with a tight walkable bay plus the actual vehicle
 * silhouette. The bay is deliberately bounded inside the surrounding room
 * walls; only the van body/wheels remain solid.
 */
export const MANUAL_WALKABLE_REPLACEMENT_ZONES: readonly {
  readonly id: string;
  readonly bounds: readonly [number, number, number, number];
  readonly blockedPolygons: readonly (readonly (readonly [number, number])[])[];
}[] = [
  {
    id: 'green-service-van-bay',
    bounds: [1985, 1055, 2260, 1260],
    blockedPolygons: [[
      [2026, 1190], [2029, 1165], [2045, 1139], [2070, 1108],
      [2100, 1100], [2205, 1100], [2225, 1110], [2233, 1130],
      [2232, 1199], [2215, 1227], [2190, 1240], [2065, 1233],
      [2035, 1215],
    ]],
  },
  {
    id: 'east-generator-approach-aisle',
    // The room's central floor is visually open; the source red-line mask
    // accidentally filled this entire aisle. Keep the perimeter equipment
    // and lower generator bank outside this measured walkable strip.
    bounds: [2780, 850, 3100, 950],
    blockedPolygons: [],
  },
];

export const MANUAL_BLOCKED_POLYGONS: readonly {
  readonly id: string;
  readonly points: readonly (readonly [number, number])[];
}[] = [
  {
    id: 'green-service-van-silhouette',
    points: MANUAL_WALKABLE_REPLACEMENT_ZONES[0].blockedPolygons[0],
  },
];


/**
 * Source-art regions intentionally sealed from the spawn-connected play space.
 * These are not component-ID allowlists: each disposition is tied to stable
 * world bounds and the annotated source-image boundary pair. The red-line
 * collision mask already supplies the separating wall; the connectivity
 * regression verifies that the wall remains closed and that no gameplay
 * interaction anchor is stranded behind it.
 */
export const INTENTIONALLY_SEALED_REGIONS: readonly {
  readonly id: string;
  readonly worldBounds: readonly [number, number, number, number];
  readonly spawnSideReferenceImage: readonly [number, number];
  readonly islandSideReferenceImage: readonly [number, number];
  readonly rationale: string;
}[] = [
  {
    id: 'north-cafeteria-upper-furniture-strip',
    worldBounds: [1337, 19, 2138, 270],
    spawnSideReferenceImage: [629, 59],
    islandSideReferenceImage: [613, 43],
    rationale: 'The island lies behind the continuous upper cafeteria partition in the source reference, within the upper furniture/bench strip. No doorway gap or gameplay interaction anchor is present at this boundary.',
  },
  {
    id: 'northwest-tank-machinery-enclosure',
    worldBounds: [597, 507, 929, 801],
    spawnSideReferenceImage: [311, 201],
    islandSideReferenceImage: [299, 215],
    rationale: 'The nearest boundary is a continuous red-line wall around the upper-left tank/pipe machinery enclosure. The isolated interior has no task, vent, Admin Table or sabotage approach.',
  },
  {
    id: 'south-central-service-fixture-enclosure',
    worldBounds: [597, 673, 1645, 1531],
    spawnSideReferenceImage: [698, 351],
    islandSideReferenceImage: [684, 365],
    rationale: 'The nearest boundary crosses a continuous red-line service-fixture wall. The region contains sealed lower-central equipment/cabinet space and has no exclusive gameplay interaction anchor.',
  },
  {
    id: 'east-office-vehicle-service-enclosure',
    worldBounds: [1821, 801, 2589, 1327],
    spawnSideReferenceImage: [1002, 343],
    islandSideReferenceImage: [1016, 357],
    rationale: 'The east office/vehicle-service area is separated at the annotated threshold by a continuous red-line wall corner, not an open doorway. The green-van override defines clearance around the vehicle inside the enclosure; it does not establish an entrance through the perimeter wall.',
  },
  {
    id: 'southwest-shop-shelving-interior',
    worldBounds: [147, 1209, 427, 1555],
    spawnSideReferenceImage: [153, 631],
    islandSideReferenceImage: [137, 615],
    rationale: 'The island lies behind the continuous diagonal shop/service boundary inside the shelving/display footprint. No doorway gap or exclusive gameplay interaction anchor is present.',
  },
];
