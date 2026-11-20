import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  COLLISION_CUTOVER_REQUIRED_ANCHORS,
  COLLISION_CUTOVER_REQUIRED_REGIONS,
  COLLISION_CUTOVER_REQUIRED_ASSET_PATHS,
  COLLISION_CUTOVER_REQUIRED_ASSET_INVENTORY_SHA256,
  validateCollisionCutoverEvidence,
  type CollisionCutoverEvidence,
} from "../lib/shared/src/collision/releaseReadiness.js";
import { MAP_AUTHORING_ZONES } from "../lib/shared/src/collision/mapZones.js";
import { createDefaultZoneReviewRecord, validateZoneReviewRecord } from "../lib/shared/src/collision/zoneReview.js";
import { readDossierSafely, validateReleaseReadinessMetadata } from "./verify-release-readiness.js";

const digest = "a".repeat(64);
const sightDigest = "b".repeat(64);
const botDigest = "c".repeat(64);
const losDigest = "d".repeat(64);
const visionDigest = "e".repeat(64);
const shadowDigest = "f".repeat(64);
const sourceArtDigest = "1".repeat(64);

const pinnedInventoryBytes = await readFile(new URL("../docs/asset-provenance-inventory.md", import.meta.url));
const pinnedInventoryText = pinnedInventoryBytes.toString("utf8");
assert.equal(
  createHash("sha256").update(pinnedInventoryBytes).digest("hex"),
  COLLISION_CUTOVER_REQUIRED_ASSET_INVENTORY_SHA256,
  "the pinned inventory digest must match the actual tracked inventory file bytes",
);
const pinnedInventorySection = pinnedInventoryText.split("## Full file inventory")[1];
assert.ok(pinnedInventorySection, "the asset inventory must include its complete file list");
const inventoryPaths = pinnedInventorySection.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\| `([^`]+)` \| \d+ \| `[a-f0-9]{40}` \|/i);
  return match ? [match[1]] : [];
});
assert.deepEqual(
  inventoryPaths,
  [...COLLISION_CUTOVER_REQUIRED_ASSET_PATHS],
  "the pinned release-gate path set must match the full checked-in 66-file inventory exactly",
);
const transformDigest = "2".repeat(64);
const rightsDigest = "3".repeat(64);
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

const objectDispositions = [
  {
    objectId: "statue-planter",
    authorName: "Map Author",
    authorCompletedAt: "2026-11-14T08:00:00.000Z",
    reviewerName: "Independent Reviewer",
    reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
    disposition: "accepted",
    evidencePath: "evidence/map-objects/statue-planter/trace.json",
    evidenceSha256: "4".repeat(64),
    blocksMove: true,
    blocksSight: false,
    castsShadow: false,
    shadowTreatment: "painted-art-only",
  },
  {
    objectId: "statue-pedestal",
    authorName: "Map Author",
    authorCompletedAt: "2026-11-14T08:00:00.000Z",
    reviewerName: "Independent Reviewer",
    reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
    disposition: "accepted",
    evidencePath: "evidence/map-objects/statue-pedestal/trace.json",
    evidenceSha256: "5".repeat(64),
    blocksMove: true,
    blocksSight: true,
    castsShadow: false,
    shadowTreatment: "painted-art-only",
  },
] satisfies CollisionCutoverEvidence["authoredObjects"];

const completeEvidence: CollisionCutoverEvidence = {
  candidateSha256: digest,
  zoneReviews: approvedZones,
  fullFootprintRasterVectorParity: {
    footprintContract: "three-circle-player-footprint",
    sampleDomain: "union-of-raster-and-vector-spawn-reachable",
    sampleStepPx: 8,
    unionSpawnReachableSampleCount: 1_000,
    vectorWalkableRasterBlocked: 20,
    rasterWalkableVectorBlocked: 19,
    sampleSetSha256: digest,
  },
  gameplayAnchors: COLLISION_CUTOVER_REQUIRED_ANCHORS.map((id) => ({
    id,
    authorName: "Map Author",
    authorCompletedAt: "2026-11-14T08:00:00.000Z",
    reviewerName: "Independent Reviewer",
    reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
    disposition: "accepted",
    movementEvidencePath: `evidence/gameplay-anchors/${id}/movement/route.json`,
    movementEvidenceSha256: digest,
    sightEvidencePath: `evidence/gameplay-anchors/${id}/sight/interaction-los.json`,
    sightEvidenceSha256: sightDigest,
    movementRoutePassed: true,
    sightApproachPassed: true,
  })),
  disconnectedRegions: COLLISION_CUTOVER_REQUIRED_REGIONS.map((id) => ({
    id,
    status: "approved" as const,
    authorName: "Source Author",
    authorCompletedAt: "2026-11-14T08:00:00.000Z",
    reviewerName: "Independent Reviewer",
    reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
    reviewerDisposition: "accepted" as const,
    ownerName: "Design Owner",
    ownerDecidedAt: "2026-11-14T08:20:00.000Z",
    decision: "intentionally-sealed",
    evidenceSha256: digest,
    evidencePath: "evidence/" + id + ".json",
    routeEvidenceComplete: true,
    notes: "Source-art review and full-footprint route evidence support this disposition.",
  })),
  parity: {
    clientServerMovement: { passed: true, evidenceSha256: digest },
    botNavigation: { passed: true, evidenceSha256: botDigest },
    interactionLineOfSight: { passed: true, evidenceSha256: losDigest },
    worldVision: { passed: true, evidenceSha256: visionDigest },
    presentationShadow: { passed: true, evidenceSha256: shadowDigest },
  },
  sourceMapArt: { sourceSha256: sourceArtDigest, transformSha256: transformDigest },
  assetRights: {
    status: "cleared",
    rightsHolder: "Map asset rights holder",
    license: "Written commercial-use permission",
    evidenceSha256: rightsDigest,
    inventoryPath: "docs/asset-provenance-inventory.md",
    inventorySha256: COLLISION_CUTOVER_REQUIRED_ASSET_INVENTORY_SHA256,
    inventoriedAssetCount: COLLISION_CUTOVER_REQUIRED_ASSET_PATHS.length,
    perAssetClearances: COLLISION_CUTOVER_REQUIRED_ASSET_PATHS.map((assetPath, index) => ({
      assetPath,
      assetSha256: "2".repeat(64),
      rightsHolder: "Map creator",
      license: "Commercial written permission",
      permissionEvidencePath: `evidence/asset-rights/${index + 1}.pdf`,
      permissionEvidenceSha256: (index + 1).toString(16).padStart(64, "0"),
      status: "cleared" as const,
    })),
  },
  sourceObjectIds: objectDispositions.map(object => object.objectId),
  sourceObjectInventoryPath: "evidence/map-objects/source-object-inventory/objects.json",
  sourceObjectInventorySha256: digest,
  authoredObjects: objectDispositions,
  statuePlanterPedestal: {
    planter: objectDispositions[0],
    pedestal: objectDispositions[1],
  },
  parkingLines: {
    sourceLineIds: ["parking-marking-a", "parking-marking-b"],
    sourceInventoryPath: "evidence/parking-lines/source-inventory/lines.json",
    sourceInventorySha256: digest,
    classifications: [
      {
        id: "parking-marking-a",
        classification: "paint-only",
        blocksMove: false,
        evidencePath: "evidence/parking-lines/parking-marking-a/source.json",
        evidenceSha256: "6".repeat(64),
        authorName: "Map Author",
        authorCompletedAt: "2026-11-14T08:00:00.000Z",
        reviewerName: "Independent Reviewer",
        reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
        disposition: "accepted",
      },
      {
        id: "parking-marking-b",
        classification: "physical-obstacle",
        blocksMove: true,
        evidencePath: "evidence/parking-lines/parking-marking-b/source.json",
        evidenceSha256: "7".repeat(64),
        authorName: "Map Author",
        authorCompletedAt: "2026-11-14T08:00:00.000Z",
        reviewerName: "Independent Reviewer",
        reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
        disposition: "accepted",
      },
    ],
    walkabilityRegressionPassed: true,
    regressionEvidenceSha256: "8".repeat(64),
  },
  aiMapRefinement: {
    status: "approved",
    model: "example-model",
    modelVersion: "1.0",
    sourceSha256: "9".repeat(64),
    candidateSha256: "a".repeat(64),
    promptSha256: "b".repeat(64),
    parametersSha256: "c".repeat(64),
    qaReportSha256: "d".repeat(64),
    authorName: "Map Author",
    authorCompletedAt: "2026-11-14T08:00:00.000Z",
    reviewerName: "Independent Reviewer",
    reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
    ownerName: "Design Owner",
    ownerApprovedAt: "2026-11-14T08:20:00.000Z",
    ownerDisposition: "accepted",
  },
  physicalDeviceAcceptance: (["ios", "android", "telegram"] as const).map(platform => ({
    platform,
    deviceType: "physical" as const,
    deviceModel: "Physical test device",
    osVersion: "current",
    appVersion: "release-candidate",
    buildCommit: "a".repeat(40),
    testerName: "Device Tester",
    testedAt: "2026-11-14T08:30:00.000Z",
    result: "passed" as const,
    evidenceSha256: "e".repeat(64),
  })),
  liveGroqProvider: {
    provider: "groq",
    candidateCommit: "a".repeat(40),
    model: "verified-live-model",
    testerName: "Provider Tester",
    testedAt: "2026-11-14T08:30:00.000Z",
    scenario: "authenticated-session reconnect and provider response",
    responseEvidenceSha256: "f".repeat(64),
    sessionCredentialOnly: true,
    passed: true,
  },
  releaseDossier: {
    candidateCommit: "a".repeat(40),
    createdAt: "2026-11-14T08:40:00.000Z",
    authorName: "Release Author",
    independentReviewerName: "Release Reviewer",
    approvedAt: "2026-11-14T08:50:00.000Z",
    decision: "approved",
    evidenceSha256: "0".repeat(64),
  },
  visualReview: {
    allTwelveZonesInspected: true,
    desktopAndMobileDpr: true,
    sourceAndOverlayCompared: true,
  },
};

assert.deepEqual(validateCollisionCutoverEvidence(completeEvidence), [],
  "complete independent source, route, parity and visual evidence should satisfy the metadata gate");

assert.deepEqual(
  validateReleaseReadinessMetadata(completeEvidence, "a".repeat(40), "a".repeat(40)),
  [],
  "the combined release command should accept complete metadata bound to the current checkout",
);
assert.ok(
  validateReleaseReadinessMetadata(completeEvidence, "a".repeat(40), "b".repeat(40))
    .some(error => error.includes("Candidate commit must equal the current clean checkout HEAD")),
  "the combined release command must reject a dossier tested against a different checkout commit",
);

const missingObjectDisposition: CollisionCutoverEvidence = structuredClone(completeEvidence);
missingObjectDisposition.authoredObjects.pop();
assert.ok(validateCollisionCutoverEvidence(missingObjectDisposition).some(error =>
  error.includes("Every source-inventoried map object requires exactly one")),
  "every source-inventoried object needs its own disposition");

const selfReviewedObject: CollisionCutoverEvidence = structuredClone(completeEvidence);
selfReviewedObject.authoredObjects[0].reviewerName = selfReviewedObject.authoredObjects[0].authorName;
assert.ok(validateCollisionCutoverEvidence(selfReviewedObject).some(error =>
  error.includes("distinct source author and independent reviewer")),
  "object-level vision/shadow review cannot be self-approved");

const inferredShadow: CollisionCutoverEvidence = structuredClone(completeEvidence);
inferredShadow.authoredObjects[0].castsShadow = true;
assert.ok(validateCollisionCutoverEvidence(inferredShadow).some(error =>
  error.includes("shadow flag and treatment")),
  "shadow casting must be independently explicit and consistent with its treatment");

const missingObjectInventory: CollisionCutoverEvidence = structuredClone(completeEvidence);
missingObjectInventory.sourceObjectInventoryPath = "";
assert.ok(validateCollisionCutoverEvidence(missingObjectInventory).some(error =>
  error.includes("exhaustive source-object inventory requires a byte-verifiable path")),
  "object dispositions cannot pass without a hashed exhaustive source inventory");

const statueOutsideInventory: CollisionCutoverEvidence = structuredClone(completeEvidence);
statueOutsideInventory.sourceObjectIds = ["another-object"];
statueOutsideInventory.authoredObjects = [];
assert.ok(validateCollisionCutoverEvidence(statueOutsideInventory).some(error =>
  error.includes("dedicated planter/pedestal review must match")),
  "the statue planter and pedestal must be included in the exhaustive object inventory");

const missingParkingInventory: CollisionCutoverEvidence = structuredClone(completeEvidence);
missingParkingInventory.parkingLines.sourceInventoryPath = "";
assert.ok(validateCollisionCutoverEvidence(missingParkingInventory).some(error =>
  error.includes("Exhaustive parking-line source inventory requires a byte-verifiable path")),
  "parking classifications must reconcile to a hashed source-line inventory");

const incompleteAssetRights = structuredClone(completeEvidence);
incompleteAssetRights.assetRights.perAssetClearances.pop();
assert.ok(validateCollisionCutoverEvidence(incompleteAssetRights).some(error =>
  error.includes("exact pinned 66-path asset-provenance inventory")),
  "one project-wide licence must not clear a missing asset-specific permission record");

const duplicateAssetRights = structuredClone(completeEvidence);
duplicateAssetRights.assetRights.perAssetClearances[1].assetPath =
  duplicateAssetRights.assetRights.perAssetClearances[0].assetPath;
assert.ok(validateCollisionCutoverEvidence(duplicateAssetRights).some(error =>
  error.includes("duplicate asset path")),
  "the rights inventory must contain one unique clearance per retained asset");

const unresolvedAssetRights = structuredClone(completeEvidence);
unresolvedAssetRights.assetRights.perAssetClearances[0].status = "unresolved";
assert.ok(validateCollisionCutoverEvidence(unresolvedAssetRights).some(error =>
  error.includes("asset-specific commercial rights clearance")),
  "provenance inventory presence cannot substitute for commercial permission");

const unsafeAssetRights = structuredClone(completeEvidence);
unsafeAssetRights.assetRights.perAssetClearances[0].permissionEvidencePath =
  "evidence/asset-rights/../../private/permission.pdf";
assert.ok(validateCollisionCutoverEvidence(unsafeAssetRights).some(error =>
  error.includes("written permission evidence")),
  "asset-specific rights evidence must remain in the controlled evidence bundle");

const unknownAssetPath = structuredClone(completeEvidence);
unknownAssetPath.assetRights.perAssetClearances[0].assetPath = "attached_assets/not-in-pinned-inventory.png";
assert.ok(validateCollisionCutoverEvidence(unknownAssetPath).some(error =>
  error.includes("exact path in the pinned")),
  "an arbitrary replacement path must not satisfy the pinned retained-asset inventory");

const staleInventoryDigest = structuredClone(completeEvidence);
staleInventoryDigest.assetRights.inventorySha256 = "9".repeat(64);
assert.ok(validateCollisionCutoverEvidence(staleInventoryDigest).some(error =>
  error.includes("exact pinned 66-path asset-provenance inventory")),
  "the rights dossier must bind the exact current inventory bytes, not an arbitrary digest");

const malformedInventoryDigest = structuredClone(completeEvidence);
(malformedInventoryDigest.assetRights as any).inventorySha256 = 123;
assert.ok(validateCollisionCutoverEvidence(malformedInventoryDigest).some(error =>
  error.includes("exact pinned 66-path asset-provenance inventory")),
  "malformed inventory digest types must fail closed without throwing");

const reusedPermissionDigest = structuredClone(completeEvidence);
reusedPermissionDigest.assetRights.perAssetClearances[1].permissionEvidenceSha256 =
  reusedPermissionDigest.assetRights.perAssetClearances[0].permissionEvidenceSha256;
assert.ok(validateCollisionCutoverEvidence(reusedPermissionDigest).some(error =>
  error.includes("distinct written permission evidence digest")),
  "each retained asset must have its own permission evidence digest");

const missingPhysicalDevices = structuredClone(completeEvidence);
missingPhysicalDevices.physicalDeviceAcceptance = [];
assert.ok(validateCollisionCutoverEvidence(missingPhysicalDevices).some(error => error.includes("Physical iOS, Android and Telegram")),
  "CI browser tests must not stand in for physical-device acceptance");

const emulatorDevice = structuredClone(completeEvidence);
(emulatorDevice.physicalDeviceAcceptance[0] as any).deviceType = "emulator";
assert.ok(validateCollisionCutoverEvidence(emulatorDevice).some(error => error.includes("deviceType must explicitly be physical")),
  "an emulator or simulator cannot satisfy physical-device acceptance");

const staleDeviceBuild = structuredClone(completeEvidence);
staleDeviceBuild.physicalDeviceAcceptance[0].buildCommit = "b".repeat(40);
assert.ok(validateCollisionCutoverEvidence(staleDeviceBuild).some(error => error.includes("tested build commit must match the final release candidate commit")),
  "physical-device evidence must be bound to the exact release candidate commit");

const staleGroqBuild = structuredClone(completeEvidence);
staleGroqBuild.liveGroqProvider.candidateCommit = "b".repeat(40);
assert.ok(validateCollisionCutoverEvidence(staleGroqBuild).some(error => error.includes("Live Groq provider verification must match the final release candidate commit")),
  "live provider evidence must be bound to the same release candidate commit");

const unresolvedPlanter = structuredClone(completeEvidence);
unresolvedPlanter.statuePlanterPedestal.planter.disposition = "unresolved";
assert.ok(validateCollisionCutoverEvidence(unresolvedPlanter).some(error => error.includes("statue planter: independent review is not accepted")),
  "the planter contour must have its own independent source-trace review");

const unclassifiedParking = structuredClone(completeEvidence);
unclassifiedParking.parkingLines.classifications.pop();
assert.ok(validateCollisionCutoverEvidence(unclassifiedParking).some(error => error.includes("Every source-inventoried parking line")),
  "every inventoried parking marking must have exactly one explicit classification");

const blockingPaint = structuredClone(completeEvidence);
blockingPaint.parkingLines.classifications[0].blocksMove = true;
assert.ok(validateCollisionCutoverEvidence(blockingPaint).some(error => error.includes("paint-only markings must remain walkable")),
  "paint-only parking markings must not silently become collision blockers");

const noAiCandidate = structuredClone(completeEvidence);
noAiCandidate.aiMapRefinement.status = "not-generated";
assert.ok(validateCollisionCutoverEvidence(noAiCandidate).some(error => error.includes("AI-assisted map refinement candidate")),
  "an ungenerated AI refinement cannot satisfy the map-art gate");

const selfApprovedAi = structuredClone(completeEvidence);
selfApprovedAi.aiMapRefinement.ownerName = "Map Author";
assert.ok(validateCollisionCutoverEvidence(selfApprovedAi).some(error => error.includes("distinct author, independent reviewer and design owner")),
  "AI map refinement requires a separate owner decision");

const noLiveGroq = structuredClone(completeEvidence);
noLiveGroq.liveGroqProvider.passed = false;
assert.ok(validateCollisionCutoverEvidence(noLiveGroq).some(error => error.includes("Live Groq provider verification must pass")),
  "mocked provider tests cannot satisfy live Groq acceptance");

const persistedGroqCredential = structuredClone(completeEvidence);
persistedGroqCredential.liveGroqProvider.sessionCredentialOnly = false;
assert.ok(validateCollisionCutoverEvidence(persistedGroqCredential).some(error => error.includes("session-only credentials")),
  "provider acceptance must not require committing or persisting secrets");

const unapprovedDossier = structuredClone(completeEvidence);
unapprovedDossier.releaseDossier.decision = "pending";
assert.ok(validateCollisionCutoverEvidence(unapprovedDossier).some(error => error.includes("Final release dossier and explicit release approval")),
  "a completed CI run is not itself final release approval");

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
assert.ok(validateCollisionCutoverEvidence(deferredBay).some((error) =>
  error.includes("C38: Approval requires an explicit design-owner decision and date")),
  "the ambiguous vehicle-service bay must remain blocked from cut-over while deferred");

const vectorOverParityLimit: CollisionCutoverEvidence = structuredClone(completeEvidence);
vectorOverParityLimit.fullFootprintRasterVectorParity.vectorWalkableRasterBlocked = 21;
assert.ok(validateCollisionCutoverEvidence(vectorOverParityLimit).some((error) =>
  error.includes("Vector-walkable/raster-blocked") && error.includes("2%")),
  "the vector-only walkable disagreement must fail above 2%");

const rasterOverParityLimit: CollisionCutoverEvidence = structuredClone(completeEvidence);
rasterOverParityLimit.fullFootprintRasterVectorParity.rasterWalkableVectorBlocked = 21;
assert.ok(validateCollisionCutoverEvidence(rasterOverParityLimit).some((error) =>
  error.includes("Raster-walkable/vector-blocked") && error.includes("2%")),
  "the raster-only walkable disagreement must fail above 2%");

const missingFootprintParity = structuredClone(completeEvidence) as Partial<CollisionCutoverEvidence>;
delete missingFootprintParity.fullFootprintRasterVectorParity;
assert.ok(validateCollisionCutoverEvidence(missingFootprintParity).some((error) =>
  error.includes("Two-way raster/vector full-player-footprint parity evidence")),
  "boolean parity flags cannot substitute for numeric two-way footprint evidence");

const emptyFootprintSampleSet: CollisionCutoverEvidence = structuredClone(completeEvidence);
emptyFootprintSampleSet.fullFootprintRasterVectorParity.unionSpawnReachableSampleCount = 999;
assert.ok(validateCollisionCutoverEvidence(emptyFootprintSampleSet).some((error) =>
  error.includes("at least 1,000 union-of-reachable")),
  "a sparse or one-sided sample set cannot satisfy raster/vector parity");

const oneSidedReachability: CollisionCutoverEvidence = structuredClone(completeEvidence);
oneSidedReachability.fullFootprintRasterVectorParity.sampleDomain = "vector-only-spawn-reachable" as "union-of-raster-and-vector-spawn-reachable";
assert.ok(validateCollisionCutoverEvidence(oneSidedReachability).some((error) =>
  error.includes("union of raster- and vector-spawn-reachable")),
  "the candidate graph alone must not define the parity denominator");

const coarseParitySampling: CollisionCutoverEvidence = structuredClone(completeEvidence);
coarseParitySampling.fullFootprintRasterVectorParity.sampleStepPx = 16;
assert.ok(validateCollisionCutoverEvidence(coarseParitySampling).some((error) =>
  error.includes("from 1px through 8px")),
  "sampling coarser than the existing 8px lattice must not satisfy parity");

const wrongFootprintContract: CollisionCutoverEvidence = structuredClone(completeEvidence);
wrongFootprintContract.fullFootprintRasterVectorParity.footprintContract = "point-samples" as "three-circle-player-footprint";
assert.ok(validateCollisionCutoverEvidence(wrongFootprintContract).some((error) =>
  error.includes("production three-circle player footprint")),
  "point samples cannot be substituted for full-player-footprint parity");

const overlappingDisagreements: CollisionCutoverEvidence = structuredClone(completeEvidence);
overlappingDisagreements.fullFootprintRasterVectorParity.vectorWalkableRasterBlocked = 600;
overlappingDisagreements.fullFootprintRasterVectorParity.rasterWalkableVectorBlocked = 500;
assert.ok(validateCollisionCutoverEvidence(overlappingDisagreements).some((error) =>
  error.includes("cannot exceed the shared sample set")),
  "the two directional mismatch sets cannot overlap beyond the common sample count");

const noSightParity: CollisionCutoverEvidence = structuredClone(completeEvidence);
noSightParity.parity.interactionLineOfSight.passed = false;
assert.ok(validateCollisionCutoverEvidence(noSightParity).some((error) => error.includes("Interaction line-of-sight parity")),
  "movement acceptance cannot stand in for interaction sight acceptance");

const noWorldVision: CollisionCutoverEvidence = structuredClone(completeEvidence);
noWorldVision.parity.worldVision.passed = false;
assert.ok(validateCollisionCutoverEvidence(noWorldVision).some((error) => error.includes("World vision occlusion parity")),
  "interaction LOS acceptance cannot stand in for the separate world-vision occlusion review");

const unresolvedSourceRights: CollisionCutoverEvidence = structuredClone(completeEvidence);
unresolvedSourceRights.assetRights.status = "unresolved";
assert.ok(validateCollisionCutoverEvidence(unresolvedSourceRights).some((error) => error.includes("asset rights are not explicitly cleared")),
  "source-map rights cannot be inferred from technical image provenance");

const missingSourceRightsEvidence: CollisionCutoverEvidence = structuredClone(completeEvidence);
missingSourceRightsEvidence.assetRights.evidenceSha256 = "";
assert.ok(validateCollisionCutoverEvidence(missingSourceRightsEvidence).some((error) => error.includes("rights evidence SHA-256")),
  "source-map commercial-use clearance must carry a traceable evidence digest");

const missingTransformEvidence: CollisionCutoverEvidence = structuredClone(completeEvidence);
missingTransformEvidence.sourceMapArt.transformSha256 = "";
assert.ok(validateCollisionCutoverEvidence(missingTransformEvidence).some((error) => error.includes("world/image transform evidence SHA-256")),
  "source-art provenance cannot substitute for a separately verified world/image transform");

const aliasedParityEvidence: CollisionCutoverEvidence = structuredClone(completeEvidence);
aliasedParityEvidence.parity.worldVision.evidenceSha256 =
  aliasedParityEvidence.parity.interactionLineOfSight.evidenceSha256;
assert.ok(validateCollisionCutoverEvidence(aliasedParityEvidence).some((error) =>
  error.includes("Each parity channel must have its own independently hashed evidence")),
  "world vision must not reuse interaction LOS evidence");

const aliasedTransformEvidence: CollisionCutoverEvidence = structuredClone(completeEvidence);
aliasedTransformEvidence.sourceMapArt.transformSha256 = aliasedTransformEvidence.sourceMapArt.sourceSha256;
assert.ok(validateCollisionCutoverEvidence(aliasedTransformEvidence).some((error) =>
  error.includes("art and world/image transform must have separate evidence hashes")),
  "source image provenance must not substitute for transform verification");

const aliasedRightsEvidence: CollisionCutoverEvidence = structuredClone(completeEvidence);
aliasedRightsEvidence.assetRights.evidenceSha256 = aliasedRightsEvidence.sourceMapArt.sourceSha256;
assert.ok(validateCollisionCutoverEvidence(aliasedRightsEvidence).some((error) =>
  error.includes("Commercial-rights evidence must be independently hashed")),
  "commercial-use rights evidence must be independent from source-art provenance");

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
  authorCompletedAt: "2026-11-14T08:00:00.000Z",
  reviewerName: "Independent Reviewer",
  reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
  disposition: "accepted",
  movementEvidencePath: "evidence/gameplay-anchors/task-extra/movement/route.json",
  movementEvidenceSha256: digest,
  sightEvidencePath: "evidence/gameplay-anchors/task-extra/sight/interaction-los.json",
  sightEvidenceSha256: sightDigest,
  movementRoutePassed: true,
  sightApproachPassed: true,
});
assert.ok(validateCollisionCutoverEvidence(extraAnchor).some((error) =>
  error.includes("Exactly 24 gameplay-anchor dispositions")),
  "unexpected anchor entries must not silently expand the release evidence set");
assert.ok(validateCollisionCutoverEvidence(extraAnchor).some((error) =>
  error.includes("Unknown gameplay-anchor disposition")),
  "unexpected gameplay-anchor identifiers must be rejected");

const anchorReviewChronology: CollisionCutoverEvidence = structuredClone(completeEvidence);
anchorReviewChronology.gameplayAnchors[0].reviewerReviewedAt = "2026-11-14T07:59:00.000Z";
assert.ok(validateCollisionCutoverEvidence(anchorReviewChronology).some((error) =>
  error.includes("independent review cannot predate the completed route/sight trace")),
  "anchor review cannot predate the author's completed trace");

const anchorSelfReview: CollisionCutoverEvidence = structuredClone(completeEvidence);
anchorSelfReview.gameplayAnchors[0].reviewerName = "Map Author";
assert.ok(validateCollisionCutoverEvidence(anchorSelfReview).some((error) =>
  error.includes("distinct author and independent reviewer")),
  "anchor source author cannot independently review the same evidence");

const anchorEvidenceTraversal: CollisionCutoverEvidence = structuredClone(completeEvidence);
anchorEvidenceTraversal.gameplayAnchors[0].movementEvidencePath =
  "evidence/gameplay-anchors/task-1/movement/../../C20/owner.json";
assert.ok(validateCollisionCutoverEvidence(anchorEvidenceTraversal).some((error) =>
  error.includes("movement evidence path must be inside its anchor-specific movement bundle")),
  "anchor evidence paths cannot escape their anchor/channel bundle");

const anchorEvidenceAliased: CollisionCutoverEvidence = structuredClone(completeEvidence);
anchorEvidenceAliased.gameplayAnchors[0].sightEvidenceSha256 =
  anchorEvidenceAliased.gameplayAnchors[0].movementEvidenceSha256;
assert.ok(validateCollisionCutoverEvidence(anchorEvidenceAliased).some((error) =>
  error.includes("movement and interaction-sight evidence must be separately hashed")),
  "movement and interaction-sight evidence must be independently identified");

const anchorMovementFailed: CollisionCutoverEvidence = structuredClone(completeEvidence);
anchorMovementFailed.gameplayAnchors[0].movementRoutePassed = false;
assert.ok(validateCollisionCutoverEvidence(anchorMovementFailed).some((error) =>
  error.includes("task-1: full-footprint movement route has not passed")),
  "failed movement route evidence cannot be accepted");

const anchorSightFailed: CollisionCutoverEvidence = structuredClone(completeEvidence);
anchorSightFailed.gameplayAnchors[0].sightApproachPassed = false;
assert.ok(validateCollisionCutoverEvidence(anchorSightFailed).some((error) =>
  error.includes("task-1: interaction sight approach has not passed")),
  "failed interaction sight evidence cannot be accepted");

const extraRegion: CollisionCutoverEvidence = structuredClone(completeEvidence);
extraRegion.disconnectedRegions.push({
  id: "C0",
  status: "approved",
  authorName: "Source Author",
  authorCompletedAt: "2026-11-14T08:00:00.000Z",
  reviewerName: "Independent Reviewer",
  reviewerReviewedAt: "2026-11-14T08:10:00.000Z",
  reviewerDisposition: "accepted",
  ownerName: "Design Owner",
  ownerDecidedAt: "2026-11-14T08:20:00.000Z",
  decision: "intentionally-sealed",
  evidenceSha256: digest,
  routeEvidenceComplete: true,
  notes: "Duplicate entries are not valid release evidence.",
});
assert.ok(validateCollisionCutoverEvidence(extraRegion).some((error) =>
  error.includes("Exactly 5 disconnected-region dispositions")),
  "duplicate region entries must not silently expand the release evidence set");


assert.deepEqual(validateZoneReviewRecord(createDefaultZoneReviewRecord("Z01"), "Z01"), [],
  "a new untouched review record must be loadable before source evidence is attached");

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


const statueReviewIdentityMismatch: CollisionCutoverEvidence = structuredClone(completeEvidence);
statueReviewIdentityMismatch.statuePlanterPedestal.planter = {
  ...statueReviewIdentityMismatch.statuePlanterPedestal.planter,
  reviewerName: "Different Reviewer",
};
assert.ok(validateCollisionCutoverEvidence(statueReviewIdentityMismatch).some(error =>
  error.includes("dedicated planter/pedestal review must match the exhaustive per-object inventory")),
  "statue-specific review must match the same author, reviewer, chronology and disposition as the exhaustive object inventory");

const objectPathAlias: CollisionCutoverEvidence = structuredClone(completeEvidence);
objectPathAlias.authoredObjects[0].evidencePath = "evidence/map-objects/statue-planter//trace.json";
assert.ok(validateCollisionCutoverEvidence(objectPathAlias).some(error =>
  error.includes("evidence must be stored in its object-specific source bundle")),
  "object evidence paths must reject repeated separators and non-canonical aliases");

const parkingPathBackslash: CollisionCutoverEvidence = structuredClone(completeEvidence);
parkingPathBackslash.parkingLines.classifications[0].evidencePath =
  "evidence/parking-lines\\\\paint-only.json";
assert.ok(validateCollisionCutoverEvidence(parkingPathBackslash).some(error =>
  error.includes("evidence path must be inside its line-specific source bundle")),
  "parking evidence paths must reject backslash-based path aliases");

const parkingReviewChronology: CollisionCutoverEvidence = structuredClone(completeEvidence);
parkingReviewChronology.parkingLines.classifications[0].reviewerReviewedAt = "2026-11-14T07:59:00.000Z";
assert.ok(validateCollisionCutoverEvidence(parkingReviewChronology).some(error =>
  error.includes("Parking line parking-marking-a: author/reviewer chronology is invalid")),
  "parking-line review cannot predate the author's completed classification");

const unsafeParkingLineId: CollisionCutoverEvidence = structuredClone(completeEvidence);
unsafeParkingLineId.parkingLines.sourceLineIds[0] = "../escape";
assert.ok(validateCollisionCutoverEvidence(unsafeParkingLineId).some(error =>
  error.includes("Parking source-line IDs must be canonical, non-empty and unique")),
  "parking source IDs must not be usable as path fragments");

const parkingEvidenceCrossLink: CollisionCutoverEvidence = structuredClone(completeEvidence);
parkingEvidenceCrossLink.parkingLines.classifications[0].evidencePath =
  "evidence/parking-lines/parking-marking-b/source.json";
assert.ok(validateCollisionCutoverEvidence(parkingEvidenceCrossLink).some(error =>
  error.includes("Parking line parking-marking-a: evidence path must be inside its line-specific source bundle")),
  "parking-line evidence must remain bound to its own source-line identity");

const parkingInventoryAlias: CollisionCutoverEvidence = structuredClone(completeEvidence);
parkingInventoryAlias.parkingLines.sourceInventoryPath =
  "evidence/parking-lines/source-inventory//lines.json";
assert.ok(validateCollisionCutoverEvidence(parkingInventoryAlias).some(error =>
  error.includes("Exhaustive parking-line source inventory requires a byte-verifiable path")),
  "parking source inventory paths must be canonical and namespace-bound");


const secureDossierRoot = await mkdtemp(path.join(os.tmpdir(), "among-gas-release-dossier-"));
try {
  await mkdir(path.join(secureDossierRoot, "real"), { recursive: true });
  await writeFile(path.join(secureDossierRoot, "real", "release.json"), JSON.stringify({ version: 1 }));
  assert.deepEqual(
    await readDossierSafely(secureDossierRoot, "real/release.json"),
    { version: 1 },
    "the combined release command must read a canonical dossier beneath its root",
  );
  await symlink(path.join(secureDossierRoot, "real"), path.join(secureDossierRoot, "linked"), "dir");
  await assert.rejects(
    readDossierSafely(secureDossierRoot, "linked/release.json"),
    /symlink component/,
    "the combined release command must reject symlinked dossier parents",
  );
  await assert.rejects(
    readDossierSafely(secureDossierRoot, "../outside.json"),
    /canonical repository-relative path/,
    "the combined release command must reject dossier path traversal",
  );
} finally {
  await rm(secureDossierRoot, { recursive: true, force: true });
}

console.log("COLLISION CUTOVER READINESS TESTS PASSED: 12 zones, 24 anchors, 5 disconnected regions, independent approvals and separate movement/sight/shadow evidence");
