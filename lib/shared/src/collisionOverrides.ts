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
