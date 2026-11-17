import assert from "node:assert/strict";
import {
  DISCONNECTED_REGION_IDS,
  createDefaultDisconnectedRegionReviewRecord,
  validateDisconnectedRegionReviewRecord,
  validateCollisionCutoverEvidence,
} from "@workspace/shared/collision";

assert.deepEqual(DISCONNECTED_REGION_IDS, ["C0", "C20", "C27", "C38", "C56"]);
const digest = "a".repeat(64);
for (const id of DISCONNECTED_REGION_IDS) {
  const draft = createDefaultDisconnectedRegionReviewRecord(id);
  assert.equal(draft.id, id);
  assert.equal(draft.status, "not-started");
  assert.equal(draft.decision, "deferred");
  assert.equal(draft.routeEvidenceComplete, false);
  assert.deepEqual(validateDisconnectedRegionReviewRecord(draft, id), [],
    "an honest not-started scaffold is structurally valid and cannot be mistaken for approval");

  const prematureDraft = { ...draft, decision: "accessible" };
  assert.ok(validateDisconnectedRegionReviewRecord(prematureDraft, id)
    .some(error => error.includes("not-started record must remain deferred")),
  "a not-started scaffold cannot contain a tentative access decision");

  const wrongId = { ...draft, id: "C99" };
  assert.ok(validateDisconnectedRegionReviewRecord(wrongId, id).some(error => error.includes("does not match")),
    "a record cannot be saved under a different diagnostic component ID");

  const completeRecord = {
    ...draft,
    status: "approved" as const,
    authorName: "Source Author",
    authorCompletedAt: "2026-11-14T08:00:00.000Z",
    reviewerName: "Independent Reviewer",
    reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
    reviewerDisposition: "accepted" as const,
    ownerName: "Design Owner",
    ownerDecidedAt: "2026-11-14T08:20:00.000Z",
    decision: "intentionally-sealed" as const,
    evidenceSha256: digest,
    evidencePath: "evidence/" + id + ".json",
    routeEvidenceComplete: true,
    notes: "Source-art and full-footprint route evidence reviewed.",
  };

  const selfReviewed = { ...completeRecord, reviewerName: completeRecord.authorName };
  assert.ok(validateDisconnectedRegionReviewRecord(selfReviewed, id)
    .some(error => error.includes("three distinct")),
  "the source author cannot act as independent reviewer");

  const ownerIsAuthor = { ...completeRecord, ownerName: completeRecord.authorName };
  assert.ok(validateDisconnectedRegionReviewRecord(ownerIsAuthor, id)
    .some(error => error.includes("three distinct")),
  "the source author cannot self-approve as design owner");

  const ownerIsReviewer = { ...completeRecord, ownerName: completeRecord.reviewerName };
  assert.ok(validateDisconnectedRegionReviewRecord(ownerIsReviewer, id)
    .some(error => error.includes("three distinct")),
  "the independent reviewer cannot also be the design owner");

  const reviewBeforeAuthor = { ...completeRecord, reviewerReviewedAt: "2026-11-14T07:59:59.000Z" };
  assert.ok(validateDisconnectedRegionReviewRecord(reviewBeforeAuthor, id)
    .some(error => error.includes("review cannot predate")),
  "independent review cannot predate the source trace");

  const ownerBeforeReview = { ...completeRecord, ownerDecidedAt: "2026-11-14T08:09:59.000Z" };
  assert.ok(validateDisconnectedRegionReviewRecord(ownerBeforeReview, id)
    .some(error => error.includes("decision cannot predate")),
  "owner decision cannot predate the accepted independent review");

  const incompleteApproval = { ...completeRecord, routeEvidenceComplete: false };
  assert.ok(validateDisconnectedRegionReviewRecord(incompleteApproval, id)
    .some(error => error.includes("connectivity evidence")),
  "approval cannot be recorded before full-footprint route evidence is complete");

  assert.deepEqual(validateDisconnectedRegionReviewRecord(completeRecord, id), [],
    "a complete three-party chronological decision record should validate");

  const inReview = {
    ...draft,
    status: "in-review" as const,
    authorName: "Source Author",
    authorCompletedAt: "2026-11-14T08:00:00.000Z",
    notes: "Awaiting independent review and owner disposition.",
  };
  assert.deepEqual(validateDisconnectedRegionReviewRecord(inReview, id), [],
    "an in-review record must identify its source author but leave reviewer and owner decisions open");

  const releaseShape = {
    ...inReview,
    status: "in-review" as const,
  };
  assert.ok(validateCollisionCutoverEvidence({
    candidateSha256: digest,
    zoneReviews: [],
    gameplayAnchors: [],
    disconnectedRegions: [releaseShape],
    fullFootprintRasterVectorParity: {},
    parity: {},
    visualReview: {},
  }).some(error => error.includes(id + ": explicit design-owner review is not approved")),
  "a saved in-review record must not satisfy the release gate");
}

console.log("PASS: five detached-region review scaffolds, three distinct dated roles, chronological approvals, evidence and fail-closed release status.");
