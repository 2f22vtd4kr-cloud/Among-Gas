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
export { createDefaultZoneReviewRecord, validateZoneReviewRecord } from "./zoneReview.js";
export type { ZoneReviewStatus, ZoneSourceEvidence, ZoneReviewRecord } from "./zoneReview.js";

export { validateCollisionCutoverEvidence, COLLISION_CUTOVER_REQUIRED_ANCHORS, COLLISION_CUTOVER_REQUIRED_REGIONS } from "./releaseReadiness.js";
export type { CollisionCutoverEvidence, GameplayAnchorDisposition, DisconnectedRegionDisposition } from "./releaseReadiness.js";
