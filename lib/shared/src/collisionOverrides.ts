/**
 * Source-art-derived map geometry overrides in the 3224×1858 world-pixel
 * coordinate system. Region contours are spatial polygons, never component-ID
 * allowlists or rectangular collision holes.
 */

/**
 * The green service bay has a walkable floor around the van, while the van
 * body/wheels remain solid. The east-generator aisle is a separate measured
 * open route through the generator room.
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
    id: 'southwest-shop-shelving-interior',
    points: [[434,1197],[145,1348],[145,1562],[197,1548],[372,1443],[372,1401],[434,1358]],
  },
];

/**
 * Source-art regions whose boundaries currently appear sealed from the
 * spawn-connected play space. These are provisional geometry candidates,
 * not proof of intended game design. Require explicit design-owner approval
 * before treating any enclosed floor as intentionally non-playable.
 */
export const SOURCE_ART_SEALED_REGION_CANDIDATES: readonly {
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
    rationale: 'The detached lower-central service/fixture footprint is bounded by continuous source-art walls and equipment silhouettes. The reviewed threshold has no doorway and no exclusive gameplay interaction anchor.',
  },
  {
    id: 'southwest-shop-shelving-interior',
    worldBounds: [147, 1209, 427, 1555],
    spawnSideReferenceImage: [153, 631],
    islandSideReferenceImage: [137, 615],
    rationale: 'The island lies behind the continuous diagonal shop/service boundary inside the shelving/display footprint. No doorway gap or exclusive gameplay interaction anchor is present.',
  },
];

/**
 * Source-art regions whose interiors remain walkable while their perimeter
 * currently appears sealed. The no-entry interpretation is provisional:
 * source art alone does not establish design intent. Require explicit
 * design-owner approval before treating these as intentionally inaccessible.
 */
export const SOURCE_ART_ISOLATED_REGION_CANDIDATES: readonly {
  readonly id: string;
  readonly worldBounds: readonly [number, number, number, number];
  readonly spawnSideReferenceImage: readonly [number, number];
  readonly islandSideReferenceImage: readonly [number, number];
  readonly entryExitMechanics: string;
  readonly rationale: string;
}[] = [
  {
    id: 'east-office-vehicle-service-bay',
    worldBounds: [1821, 801, 2589, 1327],
    spawnSideReferenceImage: [1002, 343],
    islandSideReferenceImage: [1016, 357],
    entryExitMechanics: 'No entry/exit is currently authored in the source art; design-owner confirmation is pending before treating this as an intended no-entry area.',
    rationale: 'The vehicle-service bay retains its internally walkable floor and exact green-van silhouette clearance, as required by the existing movement/vision regression. The current reference shows a continuous red-line perimeter with no drawn doorway and no gameplay anchor inside. Preserve the current geometry pending explicit design-owner confirmation; do not infer that isolation is intended.',
  },
];
