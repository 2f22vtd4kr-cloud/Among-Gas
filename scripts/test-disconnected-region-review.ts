import assert from "node:assert/strict";
import {
  DISCONNECTED_REGION_IDS,
  createDefaultDisconnectedRegionReviewRecord,
  validateDisconnectedRegionReviewRecord,
  validateCollisionCutoverEvidence,
} from "@workspace/shared/collision";

assert.deepEqual(DISCONNECTED_REGION_IDS, ["C0", "C20", "C27", "C38", "C56"]);
for (const id of DISCONNECTED_REGION_IDS) {
  const draft = createDefaultDisconnectedRegionReviewRecord(id);
  assert.equal(draft.id, id);
  assert.equal(draft.status, "not-started");
  assert.equal(draft.decision, "deferred");
  assert.equal(draft.routeEvidenceComplete, false);
  assert.ok(validateDisconnectedRegionReviewRecord(draft, id).length === 0,
    "an honest not-started scaffold is structurally valid and cannot be mistaken for approval");

  const wrongId = { ...draft, id: "C99" };
  assert.ok(validateDisconnectedRegionReviewRecord(wrongId, id).some(error => error.includes("does not match")),
    "a record cannot be saved under a different diagnostic component ID");

  const selfApproved = {
    ...draft,
    status: "approved" as const,
    ownerName: "Same Person",
    reviewerName: "same person",
    decision: "intentionally-sealed" as const,
    evidenceSha256: "a".repeat(64),
    routeEvidenceComplete: true,
    notes: "Looks fine.",
  };
  assert.ok(validateDisconnectedRegionReviewRecord(selfApproved, id)
    .some(error => error.includes("distinct non-empty")),
  "self-approval must be rejected");

  const incompleteApproval = {
    ...draft,
    status: "approved" as const,
    ownerName: "Design Owner",
    reviewerName: "Independent Reviewer",
    decision: "accessible" as const,
    evidenceSha256: "a".repeat(64),
    routeEvidenceComplete: false,
    notes: "Source-backed decision.",
  };
  assert.ok(validateDisconnectedRegionReviewRecord(incompleteApproval, id)
    .some(error => error.includes("connectivity evidence")),
  "approval cannot be recorded before full-footprint route evidence is complete");

  const validApproval = {
    ...incompleteApproval,
    routeEvidenceComplete: true,
  };
  assert.deepEqual(validateDisconnectedRegionReviewRecord(validApproval, id), [],
    "a complete independent decision record should validate");

  const releaseShape = {
    id,
    status: "in-review",
    reviewerName: "Independent Reviewer",
    ownerName: "Design Owner",
    decision: "intentionally-sealed",
    evidenceSha256: "a".repeat(64),
    routeEvidenceComplete: true,
    notes: "Source and route evidence reviewed.",
  };
  assert.ok(validateCollisionCutoverEvidence({
    candidateSha256: "a".repeat(64),
    zoneReviews: [],
    gameplayAnchors: [],
    disconnectedRegions: [releaseShape],
    fullFootprintRasterVectorParity: {},
    parity: {},
    visualReview: {},
  }).some(error => error.includes(id + ": explicit design-owner review is not approved")),
  "a saved in-review record must not satisfy the release gate");
}

console.log("PASS: five detached-region review scaffolds, distinct owner/reviewer, route evidence and fail-closed release status.");
