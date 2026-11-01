/**
 * Source-art-derived map geometry overrides in the 3224×1858 world-pixel
 * coordinate system. Region contours are spatial polygons, never component-ID
 * allowlists or rectangular collision holes.
 */

/**
 * The remaining replacement zone is the visually open east-generator aisle.
 * Its equipment perimeter remains blocked by the source-art collision mask.
 */
export const MANUAL_WALKABLE_REPLACEMENT_ZONES: readonly {
  readonly id: string;
  readonly bounds: readonly [number, number, number, number];
  readonly blockedPolygons: readonly (readonly (readonly [number, number])[])[];
}[] = [
  {
    id: 'east-generator-approach-aisle',
    // The room's central floor is visually open; the source red-line mask
    // accidentally filled this aisle. Keep the perimeter equipment and lower
    // generator bank outside this measured walkable strip.
    bounds: [2780, 850, 3100, 950],
    blockedPolygons: [],
  },
];

export const MANUAL_BLOCKED_POLYGONS: readonly {
  readonly id: string;
  readonly points: readonly (readonly [number, number])[];
}[] = [
  {
    id: 'north-cafeteria-upper-furniture-strip',
    points: [[1330,159],[1330,230],[1349,230],[1463,107],[1946,116],[2017,192],[2126,282],[2145,282],[2141,220],[1927,12],[1472,17]],
  },
  {
    id: 'northwest-tank-machinery-enclosure',
    points: [[699,500],[695,642],[590,656],[595,803],[671,808],[742,747],[851,747],[894,794],[913,794],[908,600],[932,505]],
  },
  {
    id: 'east-office-vehicle-service-enclosure',
    points: [[1823,865],[1823,950],[2316,946],[2330,960],[2330,1220],[2250,1301],[1923,1301],[1913,1116],[1814,1116],[1814,1197],[1847,1197],[1851,1173],[1880,1183],[1885,1330],[2226,1334],[2283,1330],[2368,1239],[2416,1235],[2416,908],[2591,893],[2596,837],[2397,837],[2387,903],[2311,927],[2079,917],[2065,789],[2046,789],[1960,865]],
  },
  {
    id: 'southwest-shop-shelving-interior',
    points: [[434,1197],[145,1348],[145,1562],[197,1548],[372,1443],[372,1401],[434,1358]],
  },
];


/**
 * Source-art regions intentionally sealed from the spawn-connected play space.
 * Each disposition is tied to stable world bounds and annotated source-image
 * boundary points. The matching irregular MANUAL_BLOCKED_POLYGONS contour
 * blocks the entire sealed floor pocket; CI verifies the polygon bounds, the
 * blocked island-side footprint, the retained spawn-side route, and all
 * gameplay interaction approaches. These are geometry dispositions, not
 * scan-order component-ID allowlists.
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
    id: 'east-office-vehicle-service-enclosure',
    worldBounds: [1821, 801, 2589, 1327],
    spawnSideReferenceImage: [1002, 343],
    islandSideReferenceImage: [1016, 357],
    rationale: 'The east office/vehicle-service area is separated at the annotated threshold by a continuous red-line wall corner, not an open doorway. The former green-van override cleared floor inside the enclosure but did not establish an entrance.',
  },
  {
    id: 'southwest-shop-shelving-interior',
    worldBounds: [147, 1209, 427, 1555],
    spawnSideReferenceImage: [153, 631],
    islandSideReferenceImage: [137, 615],
    rationale: 'The island lies behind the continuous diagonal shop/service boundary inside the shelving/display footprint. No doorway gap or exclusive gameplay interaction anchor is present.',
  },
];

export const INTENTIONALLY_ISOLATED_DECORATIVE_REGIONS: readonly {
  readonly id: string;
  readonly worldBounds: readonly [number, number, number, number];
  readonly spawnSideReferenceImage: readonly [number, number];
  readonly islandSideReferenceImage: readonly [number, number];
  readonly rationale: string;
}[] = [
  {
    id: 'south-central-decorative-garden-zone',
    worldBounds: [597, 673, 1645, 1531],
    spawnSideReferenceImage: [698, 351],
    islandSideReferenceImage: [684, 365],
    rationale: 'This detached region includes the central decorative garden, which the existing map-mechanics regression explicitly requires to remain walkable and free of manual collision polygons. The reviewed south threshold is a continuous red-line fixture/wall with no drawn doorway; no gameplay anchor is located inside. Preserve the decorative garden footprint and its sealed boundary rather than inventing an entrance.',
  },
];
