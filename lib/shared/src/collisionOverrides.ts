/**
 * Hand-traced static obstacles that the legacy RLE grid omitted.
 *
 * The octagonal planter/garden around the central statue is deliberately NOT
 * blocked: players can walk through the garden. Only the statue's own visible
 * footprint is solid. Keep this contour separate from the planter perimeter;
 * the latter is decorative edging, not a wall.
 *
 * Coordinates are in canonical 3224×1858 map-world pixels, measured against
 * attached_assets/IMG_2907_1783632830477.jpeg (1359×784 reference).
 */
export const MANUAL_BLOCKED_POLYGONS = [
  {
    id: 'central-statue-footprint',
    points: [
      [1708, 350],
      [1758, 350],
      [1780, 380],
      [1790, 420],
      [1770, 455],
      [1755, 470],
      [1715, 470],
      [1695, 450],
      [1680, 420],
      [1690, 380],
    ],
  },
] as const;
