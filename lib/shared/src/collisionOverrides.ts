/**
 * Hand-traced static obstacles that the legacy RLE grid omitted.
 *
 * The central fountain is enclosed by a red outline in
 * attached_assets/IMG_2907_1783632830477.jpeg, but its large interior was
 * incorrectly classified as walkable by the old component-size heuristic.
 * Vertices below are the red outline contour scaled into 3224×1858 map pixels.
 */
export const MANUAL_BLOCKED_POLYGONS = [
  {
    id: 'central-fountain-base',
    points: [
      [1725, 348],
      [1585, 457],
      [1582, 555],
      [1670, 633],
      [1798, 633],
      [1881, 564],
      [1884, 455],
      [1810, 379],
    ],
  },
] as const;
