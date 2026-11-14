import assert from "node:assert/strict";
import {
  COLLISION_CUTOVER_REQUIRED_ANCHORS,
  COLLISION_CUTOVER_REQUIRED_REGIONS,
  validateCollisionCutoverEvidence,
  type CollisionCutoverEvidence,
} from "./releaseReadiness.js";
import { MAP_AUTHORING_ZONES } from "./mapZones.js";
import { createDefaultZoneReviewRecord } from "./zoneReview.js";

const digest = "a".repeat(64);
const approvedZones = MAP_AUTHORING_ZONES.map((zone) => ({
  ...createDefaultZoneReviewRecord(zone.id),
  status: "approved" as const,
  author: { name: "Map Author", completedAt: "2026-11-14T08:00:00.000Z" },
  sourceEvidence: [{
    sourcePath: "attached_assets/original-map.png",
    sourceSha256: digest,
    sourceWidth: 1652,
    sourceHeight: 952,
    sourceRect: [0, 0, 413, 317.33333333333337] as [number, number, number, number],
    worldTransform: { scaleX: 3224 / 1652, scaleY: 1858 / 952, offsetX: 0, offsetY: 0 },
  }],
  reviewer: {
    name: "Independent Reviewer",
    reviewedAt: "2026-11-14T08:10:00.000Z",
    disposition: "accepted" as const,
    notes: "Source trace and seam continuity accepted.",
  },
  ownerDecision: {
    name: "Design Owner",
    decidedAt: "2026-11-14T08:20:00.000Z",
    decision: "approved" as const,
    notes: "The authored geometry matches intended gameplay.",
  },
  updatedAt: "2026-11-14T08:20:00.000Z",
}));

const completeEvidence: CollisionCutoverEvidence = {
  candidateSha256: digest,
  zoneReviews: approvedZones,
  gameplayAnchors: COLLISION_CUTOVER_REQUIRED_ANCHORS.map((id) => ({
    id,
    authorName: "Map Author",
    reviewerName: "Independent Reviewer",
    disposition: "accepted",
    evidenceSha256: digest,
    movementRoutePassed: true,
    sightApproachPassed: true,
  })),
  disconnectedRegions: COLLISION_CUTOVER_REQUIRED_REGIONS.map((id) => ({
    id,
    reviewerName: "Independent Reviewer",
    ownerName: "Design Owner",
    decision: "intentionally-sealed",
    evidenceSha256: digest,
    routeEvidenceComplete: true,
    notes: "Source-art review and full-footprint route evidence support this disposition.",
  })),
  parity: {
    clientServerMovement: true,
    botNavigation: true,
    interactionLineOfSight: true,
    presentationShadow: true,
  },
  visualReview: {
    allTwelveZonesInspected: true,
    desktopAndMobileDpr: true,
    sourceAndOverlayCompared: true,
  },
};

assert.deepEqual(validateCollisionCutoverEvidence(completeEvidence), [],
  "complete independent source, route, parity and visual evidence should satisfy the metadata gate");

const emptyErrors = validateCollisionCutoverEvidence({
  candidateSha256: digest,
  zoneReviews: MAP_AUTHORING_ZONES.map((zone) => createDefaultZoneReviewRecord(zone.id)),
  gameplayAnchors: [],
  disconnectedRegions: [],
  parity: {},
  visualReview: {},
});
assert.ok(emptyErrors.some((error) => error.includes("author trace, independent review and owner approval")),
  "not-started zone scaffolds must never be accepted as approved geometry");
assert.ok(emptyErrors.some((error) => error.includes("task-1")),
  "missing gameplay anchors must fail closed");
assert.ok(emptyErrors.some((error) => error.includes("C38")),
  "missing disconnected-region owner dispositions must fail closed");

const selfApproved: CollisionCutoverEvidence = structuredClone(completeEvidence);
selfApproved.zoneReviews[0] = {
  ...(selfApproved.zoneReviews[0] as Record<string, unknown>),
  reviewer: {
    name: "Map Author",
    reviewedAt: "2026-11-14T08:10:00.000Z",
    disposition: "accepted",
    notes: "Self-review is not independent.",
  },
};
assert.ok(validateCollisionCutoverEvidence(selfApproved).some((error) => error.includes("Independent reviewer")),
  "self-review must not satisfy zone approval");

const deferredBay: CollisionCutoverEvidence = structuredClone(completeEvidence);
deferredBay.disconnectedRegions[3].decision = "deferred";
assert.ok(validateCollisionCutoverEvidence(deferredBay).some((error) => error.includes("C38: design disposition remains deferred")),
  "the ambiguous vehicle-service bay must remain blocked from cut-over while deferred");

const noSightParity: CollisionCutoverEvidence = structuredClone(completeEvidence);
noSightParity.parity.interactionLineOfSight = false;
assert.ok(validateCollisionCutoverEvidence(noSightParity).some((error) => error.includes("line-of-sight parity")),
  "movement acceptance cannot stand in for interaction sight acceptance");

console.log("COLLISION CUTOVER READINESS TESTS PASSED: 12 zones, 24 anchors, 5 disconnected regions, independent approvals and separate movement/sight/shadow evidence");
