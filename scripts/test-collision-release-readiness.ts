import assert from "node:assert/strict";
import {
  COLLISION_CUTOVER_REQUIRED_ANCHORS,
  COLLISION_CUTOVER_REQUIRED_REGIONS,
  validateCollisionCutoverEvidence,
  type CollisionCutoverEvidence,
} from "../lib/shared/src/collision/releaseReadiness.js";
import { MAP_AUTHORING_ZONES } from "../lib/shared/src/collision/mapZones.js";
import { createDefaultZoneReviewRecord, validateZoneReviewRecord } from "../lib/shared/src/collision/zoneReview.js";

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
    sourceRect: [
      Math.max(0, zone.minX - 24) / (3224 / 1652),
      Math.max(0, zone.minY - 24) / (1858 / 952),
      Math.min(3224, zone.maxX + 24) / (3224 / 1652),
      Math.min(1858, zone.maxY + 24) / (1858 / 952),
    ] as [number, number, number, number],
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

const reviewChronology: CollisionCutoverEvidence = structuredClone(completeEvidence);
(reviewChronology.zoneReviews[0] as Record<string, unknown>).ownerDecision = {
  name: "Design Owner",
  decidedAt: "2026-11-14T08:05:00.000Z",
  decision: "approved",
  notes: "This decision must not predate the independent review.",
};
assert.ok(validateCollisionCutoverEvidence(reviewChronology).some((error) =>
  error.includes("Design-owner decision cannot predate the independent review")),
  "an owner approval timestamp must not predate the independent review");

const authorChronology: CollisionCutoverEvidence = structuredClone(completeEvidence);
(authorChronology.zoneReviews[0] as Record<string, unknown>).author = {
  name: "Map Author",
  completedAt: "2026-11-14T08:15:00.000Z",
};
assert.ok(validateCollisionCutoverEvidence(authorChronology).some((error) =>
  error.includes("Independent review cannot predate the author's completed trace")),
  "an independent review timestamp must not predate the author's completed trace");

const extraAnchor: CollisionCutoverEvidence = structuredClone(completeEvidence);
extraAnchor.gameplayAnchors.push({
  id: "task-extra",
  authorName: "Map Author",
  reviewerName: "Independent Reviewer",
  disposition: "accepted",
  evidenceSha256: digest,
  movementRoutePassed: true,
  sightApproachPassed: true,
});
assert.ok(validateCollisionCutoverEvidence(extraAnchor).some((error) =>
  error.includes("Exactly 24 gameplay-anchor dispositions")),
  "unexpected anchor entries must not silently expand the release evidence set");
assert.ok(validateCollisionCutoverEvidence(extraAnchor).some((error) =>
  error.includes("Unknown gameplay-anchor disposition")),
  "unexpected gameplay-anchor identifiers must be rejected");

const extraRegion: CollisionCutoverEvidence = structuredClone(completeEvidence);
extraRegion.disconnectedRegions.push({
  id: "C0",
  reviewerName: "Independent Reviewer",
  ownerName: "Design Owner",
  decision: "intentionally-sealed",
  evidenceSha256: digest,
  routeEvidenceComplete: true,
  notes: "Duplicate entries are not valid release evidence.",
});
assert.ok(validateCollisionCutoverEvidence(extraRegion).some((error) =>
  error.includes("Exactly 5 disconnected-region dispositions")),
  "duplicate region entries must not silently expand the release evidence set");


const validSourceEvidence = {
  sourcePath: "attached_assets/original-map.png",
  sourceSha256: digest,
  sourceWidth: 1652,
  sourceHeight: 952,
  sourceRect: [0, 0, 425.29776674937966, 329.6304269824184],
  worldTransform: { scaleX: 3224 / 1652, scaleY: 1858 / 952, offsetX: 0, offsetY: 0 },
};
const validScaffold = { ...createDefaultZoneReviewRecord("Z01"), sourceEvidence: [validSourceEvidence] };
assert.deepEqual(validateZoneReviewRecord(validScaffold, "Z01"), [],
  "the canonical Z01 source crop with full seam context should remain valid");
const clippedScaffold = structuredClone(validScaffold);
(clippedScaffold.sourceEvidence[0] as { sourceRect: number[] }).sourceRect = [0, 0, 400, 300];
assert.ok(validateZoneReviewRecord(clippedScaffold, "Z01").some(error => error.includes("24 world-pixel seam context")),
  "a crop that omits the full zone/seam extent must not be accepted as review evidence");
const wrongZoneScaffold = structuredClone(validScaffold);
assert.ok(validateZoneReviewRecord(wrongZoneScaffold, "Z02").some(error => error.includes("24 world-pixel seam context")),
  "a Z01 crop must not be reused as Z02 source evidence");

console.log("COLLISION CUTOVER READINESS TESTS PASSED: 12 zones, 24 anchors, 5 disconnected regions, independent approvals and separate movement/sight/shadow evidence");
