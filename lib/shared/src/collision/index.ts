export { CollisionWorld, segmentsIntersect, validateCollisionDocument } from "./vectorCollision.js";
export type { Point, CollisionShape, CollisionDocument } from "./vectorCollision.js";
export { History, simplifyRDP, snapPoint, shouldCloseLoop } from "./editorGeometry.js";
export type { SnapResult } from "./editorGeometry.js";
export {
  MAP_AUTHORING_ZONES,
  getPrimaryMapAuthoringZone,
  getCollisionShapeGroundCentroid,
  isMapAuthoringZoneId,
  validateMapAuthoringZoneDocument,
  assignMapAuthoringZonesByCentroid,
} from "./mapZones.js";
export type { MapAuthoringZoneId } from "./mapZones.js";
