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
 * Provisional source-art contours recovered and independently cross-checked
 * against the original map and red-line reference. They are movement-only
 * candidates for the vector migration; no design-owner approval is implied.
 * Keep these separate from MANUAL_BLOCKED_POLYGONS so the current fine-grid
 * production oracle remains unchanged while the candidate is evaluated.
 */
export const CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS: readonly {
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
    id: 'southwest-shop-shelving-interior',
    points: [[434,1197],[145,1348],[145,1562],[197,1548],[372,1443],[372,1401],[434,1358]],
  },
];

export const SOURCE_ART_ISOLATED_REGION_CANDIDATES = [
  {
    id: 'east-office-vehicle-service-bay',
    worldBounds: [1821,801,2589,1327] as const,
    entryExitMechanics: 'No entry/exit is currently authored; design-owner confirmation remains pending.',
    rationale: 'The source reference shows a continuous perimeter with no doorway, while the internal floor and van clearance remain preserved.',
  },
] as const;
