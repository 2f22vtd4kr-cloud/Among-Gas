/**
 * Source-art-derived map geometry overrides in the 3224×1858 world-pixel
 * coordinate system. Region contours are spatial polygons, never component-ID
 * allowlists or rectangular collision holes.
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
    id: 'south-central-service-fixture-enclosure',
    points: [[1648,856],[1491,865],[1306,671],[1287,671],[1287,728],[1410,856],[1410,946],[1396,960],[1188,960],[1117,974],[979,955],[932,903],[913,903],[908,1074],[894,1088],[680,1083],[671,993],[590,993],[590,1330],[638,1334],[657,1377],[699,1382],[718,1401],[709,1453],[879,1495],[903,1538],[941,1538],[941,1500],[998,1491],[993,1040],[1169,1026],[1401,1031],[1420,1045],[1420,1135],[1325,1239],[1325,1377],[1240,1467],[1150,1472],[1150,1505],[1373,1500],[1387,1254],[1501,1135],[1643,1130],[1652,1116]],
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
