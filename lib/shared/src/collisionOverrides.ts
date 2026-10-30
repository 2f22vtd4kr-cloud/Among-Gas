/**
 * Additional hand-traced movement obstacles.
 *
 * The central octagonal garden/planter is decorative and fully walkable.
 * Its small statue footprint is already represented by the four central
 * blocked cells in collisionData.ts; buildNarrowShadowOccluders() turns that
 * isolated 2×2 component into a tight vision-only circle. Do not add a polygon
 * around the planter: doing so blocks the whole garden and makes it cast a
 * room-sized shadow.
 */
export const MANUAL_BLOCKED_POLYGONS: readonly {
  readonly id: string;
  readonly points: readonly (readonly [number, number])[];
}[] = [];
