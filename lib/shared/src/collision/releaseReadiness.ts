import { MAP_AUTHORING_ZONES } from "./mapZones.js";
import { MAP_H, MAP_W } from "../coords.js";
import { validateZoneReviewRecord } from "./zoneReview.js";
import {
  DISCONNECTED_REGION_IDS,
  validateDisconnectedRegionReviewRecord,
  type DisconnectedRegionReviewStatus,
} from "./disconnectedRegionReview.js";

export interface GameplayAnchorDisposition {
  id: string;
  authorName: string;
  authorCompletedAt: string;
  reviewerName: string;
  reviewerReviewedAt: string;
  disposition: "accepted" | "changes-requested" | "unresolved";
  movementEvidencePath: string;
  movementEvidenceSha256: string;
  sightEvidencePath: string;
  sightEvidenceSha256: string;
  movementRoutePassed: boolean;
  sightApproachPassed: boolean;
}

export interface DisconnectedRegionDisposition {
  id: typeof DISCONNECTED_REGION_IDS[number];
  status: DisconnectedRegionReviewStatus;
  authorName: string;
  authorCompletedAt: string;
  reviewerName: string;
  reviewerReviewedAt: string;
  reviewerDisposition: "accepted" | "changes-requested" | "unresolved";
  ownerName: string;
  ownerDecidedAt: string;
  decision: "accessible" | "intentionally-sealed" | "deferred";
  evidenceSha256: string;
  evidencePath: string;
  routeEvidenceComplete: boolean;
  notes: string;
}

export interface FullFootprintRasterVectorParity {
  /** The same production three-circle feet footprint is applied to both worlds. */
  footprintContract: "three-circle-player-footprint";
  /** Both spawn graphs are included; neither direction may define the other side's denominator. */
  sampleDomain: "union-of-raster-and-vector-spawn-reachable";
  /** Maximum lattice spacing of the deterministic position sample. */
  sampleStepPx: number;
  /** Number of unique positions in the union of the two spawn-reachable graphs. */
  unionSpawnReachableSampleCount: number;
  /** Vector says walkable while the raster says blocked. */
  vectorWalkableRasterBlocked: number;
  /** Raster says walkable while the vector says blocked. */
  rasterWalkableVectorBlocked: number;
  /** SHA-256 of the deterministic full-footprint sample set and its ordering. */
  sampleSetSha256: string;
}

export interface AuthoredObjectDisposition {
  objectId: string;
  authorName: string;
  authorCompletedAt: string;
  reviewerName: string;
  reviewerReviewedAt: string;
  disposition: "accepted" | "changes-requested" | "unresolved";
  evidencePath: string;
  evidenceSha256: string;
  blocksMove: boolean;
  blocksSight: boolean;
  castsShadow: boolean;
  shadowTreatment: "painted-art-only" | "separate-occluder" | "none";
}

export interface ParkingLineClassification {
  id: string;
  classification: "paint-only" | "physical-obstacle";
  blocksMove: boolean;
  evidencePath: string;
  evidenceSha256: string;
  authorName: string;
  reviewerName: string;
  reviewedAt: string;
  disposition: "accepted" | "changes-requested" | "unresolved";
}

export interface PhysicalDeviceAcceptance {
  platform: "ios" | "android" | "telegram";
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  buildCommit: string;
  testerName: string;
  testedAt: string;
  result: "passed" | "failed";
  evidenceSha256: string;
}

export interface CollisionCutoverEvidence {
  candidateSha256: string;
  zoneReviews: unknown[];
  fullFootprintRasterVectorParity: FullFootprintRasterVectorParity;
  gameplayAnchors: GameplayAnchorDisposition[];
  disconnectedRegions: DisconnectedRegionDisposition[];
  parity: {
    clientServerMovement: { passed: boolean; evidenceSha256: string };
    botNavigation: { passed: boolean; evidenceSha256: string };
    interactionLineOfSight: { passed: boolean; evidenceSha256: string };
    worldVision: { passed: boolean; evidenceSha256: string };
    presentationShadow: { passed: boolean; evidenceSha256: string };
  };
  sourceMapArt: {
    sourceSha256: string;
    transformSha256: string;
  };
  assetRights: {
    status: "cleared" | "unresolved" | "rejected";
    rightsHolder: string;
    license: string;
    evidenceSha256: string;
  };
  statuePlanterPedestal: {
    planter: AuthoredObjectDisposition;
    pedestal: AuthoredObjectDisposition;
  };
  parkingLines: {
    sourceLineIds: string[];
    classifications: ParkingLineClassification[];
    walkabilityRegressionPassed: boolean;
    regressionEvidenceSha256: string;
  };
  aiMapRefinement: {
    status: "approved" | "not-generated" | "generated" | "reviewed";
    model: string;
    modelVersion: string;
    sourceSha256: string;
    candidateSha256: string;
    promptSha256: string;
    parametersSha256: string;
    qaReportSha256: string;
    authorName: string;
    authorCompletedAt: string;
    reviewerName: string;
    reviewerReviewedAt: string;
    ownerName: string;
    ownerApprovedAt: string;
    ownerDisposition: "accepted" | "rejected" | "deferred";
  };
  physicalDeviceAcceptance: PhysicalDeviceAcceptance[];
  liveGroqProvider: {
    provider: "groq";
    model: string;
    testerName: string;
    testedAt: string;
    scenario: string;
    responseEvidenceSha256: string;
    sessionCredentialOnly: boolean;
    passed: boolean;
  };
  releaseDossier: {
    candidateCommit: string;
    createdAt: string;
    authorName: string;
    independentReviewerName: string;
    approvedAt: string;
    decision: "approved" | "rejected" | "pending";
    evidenceSha256: string;
  };
  visualReview: {
    allTwelveZonesInspected: boolean;
    desktopAndMobileDpr: boolean;
    sourceAndOverlayCompared: boolean;
  };
}

const REQUIRED_ANCHORS = [
  ...Array.from({ length: 11 }, (_, index) => `task-${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `vent-${index + 1}`),
  "admin-table",
  ...Array.from({ length: 6 }, (_, index) => `sabotage-${index + 1}`),
] as const;
const REQUIRED_REGIONS = DISCONNECTED_REGION_IDS;
export const MAX_RASTER_VECTOR_DISAGREEMENT_RATIO = 0.02;
const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const validDate = (value: unknown): value is string =>
  nonEmpty(value) && Number.isFinite(Date.parse(value));
function safeAnchorEvidencePath(value: unknown, anchorId: string, channel: "movement" | "sight"): boolean {
  if (!nonEmpty(value) || value.length > 512) return false;
  const path = value.replace(/\\/g, "/");
  return path.startsWith(`evidence/gameplay-anchors/${anchorId}/${channel}/`) &&
    !path.startsWith("/") &&
    !/^[a-z]:/i.test(path) &&
    !path.split("/").some(part => part === "." || part === "..");
}

/**
 * Fail-closed evidence gate for a future vector-collision cut-over.
 * This validates review metadata and test attestations only; it does not
 * authenticate identities, inspect pixels, run routes, or authorize deployment.
 */
export function validateCollisionCutoverEvidence(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Collision cut-over evidence must be an object"];
  }
  const input = value as Partial<CollisionCutoverEvidence>;
  const errors: string[] = [];
  if (!isSha256(input.candidateSha256)) errors.push("Candidate needs a SHA-256 source digest");

  if (!Array.isArray(input.zoneReviews)) {
    errors.push("All twelve zone review records are required");
  } else {
    if (input.zoneReviews.length !== MAP_AUTHORING_ZONES.length) {
      errors.push(`Exactly ${MAP_AUTHORING_ZONES.length} zone review records are required`);
    }
    for (const zone of MAP_AUTHORING_ZONES) {
      const matches = input.zoneReviews.filter((record) =>
        !!record && typeof record === "object" &&
        (record as Record<string, unknown>).zone === zone.id);
      if (matches.length !== 1) {
        errors.push(`${zone.id}: exactly one review record is required`);
        continue;
      }
      const record = matches[0] as Record<string, unknown>;
      errors.push(...validateZoneReviewRecord(record, zone.id).map((error) => `${zone.id}: ${error}`));
      const hasNativeContextCrop = Array.isArray(record.sourceEvidence) &&
        record.sourceEvidence.some((item) => {
          if (!item || typeof item !== "object") return false;
          const evidence = item as Record<string, unknown>;
          const rect = evidence.sourceRect;
          const transform = evidence.worldTransform;
          if (!Array.isArray(rect) || rect.length !== 4 ||
              !rect.every(Number.isFinite) || !transform || typeof transform !== "object") return false;
          const t = transform as Record<string, unknown>;
          if (![t.scaleX, t.scaleY, t.offsetX, t.offsetY].every(Number.isFinite)) return false;
          const left = rect[0] * (t.scaleX as number) + (t.offsetX as number);
          const top = rect[1] * (t.scaleY as number) + (t.offsetY as number);
          const right = rect[2] * (t.scaleX as number) + (t.offsetX as number);
          const bottom = rect[3] * (t.scaleY as number) + (t.offsetY as number);
          const requiredLeft = Math.max(0, zone.minX - 24);
          const requiredTop = Math.max(0, zone.minY - 24);
          const requiredRight = Math.min(MAP_W, zone.maxX + 24);
          const requiredBottom = Math.min(MAP_H, zone.maxY + 24);
          return left <= requiredLeft + 0.5 && top <= requiredTop + 0.5 &&
            right >= requiredRight - 0.5 && bottom >= requiredBottom - 0.5;
        });
      if (!hasNativeContextCrop) {
        errors.push(`${zone.id}: source evidence must cover the complete zone plus 24 world-pixel seam context`);
      }
      if (record.status !== "approved") errors.push(`${zone.id}: author trace, independent review and owner approval are not complete`);
    }
  }

  if (!Array.isArray(input.gameplayAnchors)) {
    errors.push("All 24 gameplay-anchor dispositions are required");
  } else {
    if (input.gameplayAnchors.length !== REQUIRED_ANCHORS.length) {
      errors.push(`Exactly ${REQUIRED_ANCHORS.length} gameplay-anchor dispositions are required`);
    }
    const requiredAnchorIds = new Set<string>(REQUIRED_ANCHORS);
    for (const anchor of input.gameplayAnchors) {
      if (!anchor || !requiredAnchorIds.has(anchor.id)) {
        errors.push("Unknown gameplay-anchor disposition");
      }
    }
    for (const id of REQUIRED_ANCHORS) {
      const matches = input.gameplayAnchors.filter((anchor) => anchor?.id === id);
      if (matches.length !== 1) {
        errors.push(`${id}: exactly one anchor disposition is required`);
        continue;
      }
      const anchor = matches[0];
      const authorName = nonEmpty(anchor.authorName) ? anchor.authorName.trim() : "";
      const reviewerName = nonEmpty(anchor.reviewerName) ? anchor.reviewerName.trim() : "";
      if (!authorName || !reviewerName || authorName.toLocaleLowerCase("en-US") === reviewerName.toLocaleLowerCase("en-US")) {
        errors.push(`${id}: distinct author and independent reviewer are required`);
      }
      if (!validDate(anchor.authorCompletedAt)) {
        errors.push(`${id}: source author completion date is required`);
      }
      if (!validDate(anchor.reviewerReviewedAt)) {
        errors.push(`${id}: independent reviewer date is required`);
      }
      if (validDate(anchor.authorCompletedAt) && validDate(anchor.reviewerReviewedAt) &&
          Date.parse(anchor.reviewerReviewedAt) < Date.parse(anchor.authorCompletedAt)) {
        errors.push(`${id}: independent review cannot predate the completed route/sight trace`);
      }
      if (anchor.disposition !== "accepted") errors.push(`${id}: disposition is not accepted`);
      if (!safeAnchorEvidencePath(anchor.movementEvidencePath, id, "movement")) {
        errors.push(`${id}: movement evidence path must be inside its anchor-specific movement bundle`);
      }
      if (!safeAnchorEvidencePath(anchor.sightEvidencePath, id, "sight")) {
        errors.push(`${id}: sight evidence path must be inside its anchor-specific sight bundle`);
      }
      if (!isSha256(anchor.movementEvidenceSha256)) {
        errors.push(`${id}: full-footprint movement evidence SHA-256 is required`);
      }
      if (!isSha256(anchor.sightEvidenceSha256)) {
        errors.push(`${id}: interaction sight evidence SHA-256 is required`);
      }
      if (isSha256(anchor.movementEvidenceSha256) && isSha256(anchor.sightEvidenceSha256) &&
          anchor.movementEvidenceSha256.toLowerCase() === anchor.sightEvidenceSha256.toLowerCase()) {
        errors.push(`${id}: movement and interaction-sight evidence must be separately hashed`);
      }
      if (anchor.movementRoutePassed !== true) errors.push(`${id}: full-footprint movement route has not passed`);
      if (anchor.sightApproachPassed !== true) errors.push(`${id}: interaction sight approach has not passed`);
    }
  }

  if (!Array.isArray(input.disconnectedRegions)) {
    errors.push("All five disconnected-region dispositions are required");
  } else {
    if (input.disconnectedRegions.length !== REQUIRED_REGIONS.length) {
      errors.push(`Exactly ${REQUIRED_REGIONS.length} disconnected-region dispositions are required`);
    }
    const requiredRegionIds = new Set<string>(REQUIRED_REGIONS);
    for (const region of input.disconnectedRegions) {
      if (!region || !requiredRegionIds.has(region.id)) {
        errors.push("Unknown disconnected-region disposition");
      }
    }
    for (const id of REQUIRED_REGIONS) {
      const matches = input.disconnectedRegions.filter((region) => region?.id === id);
      if (matches.length !== 1) {
        errors.push(`${id}: exactly one disconnected-region disposition is required`);
        continue;
      }
      const region = matches[0];
      errors.push(...validateDisconnectedRegionReviewRecord(region, id).map(error => `${id}: ${error}`));
      if (region.status !== "approved") errors.push(`${id}: explicit design-owner review is not approved`);
    }
  }

  const footprintParity = input.fullFootprintRasterVectorParity;
  if (!footprintParity || typeof footprintParity !== "object") {
    errors.push("Two-way raster/vector full-player-footprint parity evidence is required");
  } else {
    if (footprintParity.footprintContract !== "three-circle-player-footprint") {
      errors.push("Raster/vector parity must use the production three-circle player footprint");
    }
    if (!isSha256(footprintParity.sampleSetSha256)) {
      errors.push("Raster/vector parity needs a SHA-256 for its deterministic sample set");
    }
    if (footprintParity.sampleDomain !== "union-of-raster-and-vector-spawn-reachable") {
      errors.push("Raster/vector parity must sample the union of raster- and vector-spawn-reachable positions");
    }
    if (!Number.isSafeInteger(footprintParity.sampleStepPx) ||
        footprintParity.sampleStepPx < 1 || footprintParity.sampleStepPx > 8) {
      errors.push("Raster/vector parity sample spacing must be an integer from 1px through 8px");
    }
    const counts = [
      footprintParity.unionSpawnReachableSampleCount,
      footprintParity.vectorWalkableRasterBlocked,
      footprintParity.rasterWalkableVectorBlocked,
    ];
    if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0)) {
      errors.push("Raster/vector parity sample and disagreement counts must be non-negative safe integers");
    } else if (footprintParity.unionSpawnReachableSampleCount < 1_000) {
      errors.push("Raster/vector parity must compare at least 1,000 union-of-reachable full-footprint positions");
    } else {
      const { unionSpawnReachableSampleCount, vectorWalkableRasterBlocked, rasterWalkableVectorBlocked } = footprintParity;
      if (vectorWalkableRasterBlocked > unionSpawnReachableSampleCount ||
          rasterWalkableVectorBlocked > unionSpawnReachableSampleCount ||
          vectorWalkableRasterBlocked + rasterWalkableVectorBlocked > unionSpawnReachableSampleCount) {
        errors.push("Raster/vector directional disagreement counts cannot exceed the shared sample set");
      } else {
        if (vectorWalkableRasterBlocked / unionSpawnReachableSampleCount > MAX_RASTER_VECTOR_DISAGREEMENT_RATIO) {
          errors.push("Vector-walkable/raster-blocked full-footprint disagreement exceeds the unchanged 2% limit");
        }
        if (rasterWalkableVectorBlocked / unionSpawnReachableSampleCount > MAX_RASTER_VECTOR_DISAGREEMENT_RATIO) {
          errors.push("Raster-walkable/vector-blocked full-footprint disagreement exceeds the unchanged 2% limit");
        }
      }
    }
  }

  const parity = input.parity;
  const parityChannels = [
    ["clientServerMovement", "Client/server movement"],
    ["botNavigation", "Bot navigation"],
    ["interactionLineOfSight", "Interaction line-of-sight"],
    ["worldVision", "World vision occlusion"],
    ["presentationShadow", "Presentation shadow"],
  ] as const;
  const parityDigests: string[] = [];
  for (const [key, label] of parityChannels) {
    const evidence = parity?.[key];
    if (!evidence || typeof evidence !== "object") {
      errors.push(label + " evidence is required");
      continue;
    }
    if (evidence.passed !== true) errors.push(label + " parity has not passed");
    if (!isSha256(evidence.evidenceSha256)) {
      errors.push(label + " evidence SHA-256 is required");
    } else {
      parityDigests.push(evidence.evidenceSha256.toLowerCase());
    }
  }
  if (new Set(parityDigests).size !== parityDigests.length) {
    errors.push("Each parity channel must have its own independently hashed evidence");
  }

  const sourceMapArt = input.sourceMapArt;
  if (!sourceMapArt || !isSha256(sourceMapArt.sourceSha256)) {
    errors.push("Canonical source-map art SHA-256 is required");
  }
  if (!sourceMapArt || !isSha256(sourceMapArt.transformSha256)) {
    errors.push("Source-map world/image transform evidence SHA-256 is required");
  }
  if (sourceMapArt && isSha256(sourceMapArt.sourceSha256) &&
      isSha256(sourceMapArt.transformSha256) &&
      sourceMapArt.sourceSha256.toLowerCase() === sourceMapArt.transformSha256.toLowerCase()) {
    errors.push("Source-map art and world/image transform must have separate evidence hashes");
  }

  const assetRights = input.assetRights;
  if (!assetRights || assetRights.status !== "cleared") {
    errors.push("Source-map asset rights are not explicitly cleared");
  }
  if (!assetRights || !nonEmpty(assetRights.rightsHolder)) {
    errors.push("Source-map rights-holder identity is required");
  }
  if (!assetRights || !nonEmpty(assetRights.license)) {
    errors.push("Source-map license or written permission reference is required");
  }
  if (!assetRights || !isSha256(assetRights.evidenceSha256)) {
    errors.push("Source-map rights evidence SHA-256 is required");
  }
  if (assetRights && isSha256(assetRights.evidenceSha256)) {
    const rightsDigest = assetRights.evidenceSha256.toLowerCase();
    const sourceDigest = sourceMapArt && isSha256(sourceMapArt.sourceSha256)
      ? sourceMapArt.sourceSha256.toLowerCase()
      : null;
    const transformDigest = sourceMapArt && isSha256(sourceMapArt.transformSha256)
      ? sourceMapArt.transformSha256.toLowerCase()
      : null;
    if (rightsDigest === sourceDigest || rightsDigest === transformDigest ||
        parityDigests.includes(rightsDigest)) {
      errors.push("Commercial-rights evidence must be independently hashed from art, transform and runtime parity evidence");
    }
  }

  const visual = input.visualReview;
  if (!visual || visual.allTwelveZonesInspected !== true) errors.push("All twelve zone QA crops must be inspected");
  if (!visual || visual.desktopAndMobileDpr !== true) errors.push("Desktop and mobile DPR visual review must pass");
  if (!visual || visual.sourceAndOverlayCompared !== true) errors.push("Source art and all semantic overlays must be compared");

  // Object-specific collision/vision/shadow semantics must be authored and reviewed independently.
  const objectBundle = input.statuePlanterPedestal;
  for (const [key, label] of [["planter", "statue planter"], ["pedestal", "statue pedestal"]] as const) {
    const object = objectBundle?.[key];
    if (!object || typeof object !== "object") {
      errors.push(`Source-authored ${label} disposition is required`);
      continue;
    }
    if (!nonEmpty(object.objectId) || !object.objectId.startsWith(`statue-${key}`)) errors.push(`${label}: stable source object ID is required`);
    const author = nonEmpty(object.authorName) ? object.authorName.trim() : "";
    const reviewer = nonEmpty(object.reviewerName) ? object.reviewerName.trim() : "";
    if (!author || !reviewer || author.toLowerCase() === reviewer.toLowerCase()) errors.push(`${label}: distinct source author and independent reviewer are required`);
    if (!validDate(object.authorCompletedAt) || !validDate(object.reviewerReviewedAt) ||
        (validDate(object.authorCompletedAt) && validDate(object.reviewerReviewedAt) && Date.parse(object.reviewerReviewedAt) < Date.parse(object.authorCompletedAt))) {
      errors.push(`${label}: valid author/reviewer chronology is required`);
    }
    if (object.disposition !== "accepted") errors.push(`${label}: independent review is not accepted`);
    if (!object.evidencePath?.startsWith(`evidence/map-objects/statue-${key}/`) || object.evidencePath.includes("..")) errors.push(`${label}: source evidence must be in its object-specific bundle`);
    if (!isSha256(object.evidenceSha256)) errors.push(`${label}: source-trace evidence SHA-256 is required`);
    if (typeof object.blocksMove !== "boolean" || typeof object.blocksSight !== "boolean" || typeof object.castsShadow !== "boolean") errors.push(`${label}: movement, sight and shadow semantics must each be explicit`);
    if (!["painted-art-only", "separate-occluder", "none"].includes(object.shadowTreatment)) errors.push(`${label}: decorative-shadow treatment must be explicit`);
    if (object.castsShadow !== (object.shadowTreatment === "separate-occluder")) errors.push(`${label}: shadow flag and shadow treatment disagree`);
  }

  const parking = input.parkingLines;
  if (!parking || !Array.isArray(parking.sourceLineIds) || parking.sourceLineIds.length === 0 ||
      !Array.isArray(parking.classifications)) {
    errors.push("Complete source inventory and classification of parking-line markings is required");
  } else {
    const sourceIds = parking.sourceLineIds;
    const classifiedIds = parking.classifications.map(item => item?.id);
    if (sourceIds.some(id => !nonEmpty(id)) || new Set(sourceIds).size !== sourceIds.length) errors.push("Parking source-line IDs must be non-empty and unique");
    if (new Set(classifiedIds).size !== classifiedIds.length ||
        sourceIds.length !== classifiedIds.length ||
        sourceIds.some(id => !classifiedIds.includes(id))) errors.push("Every source-inventoried parking line must have exactly one classification");
    for (const item of parking.classifications) {
      if (!item || !nonEmpty(item.id)) continue;
      if (item.disposition !== "accepted") errors.push(`Parking line ${item.id}: independent classification review is not accepted`);
      if (item.classification === "paint-only" && item.blocksMove !== false) errors.push(`Parking line ${item.id}: paint-only markings must remain walkable`);
      if (item.classification === "physical-obstacle" && item.blocksMove !== true) errors.push(`Parking line ${item.id}: physical obstacle must have an explicit movement blocker`);
      if (!["paint-only", "physical-obstacle"].includes(item.classification)) errors.push(`Parking line ${item.id}: unresolved classification is not allowed`);
      if (!nonEmpty(item.authorName) || !nonEmpty(item.reviewerName) || item.authorName.trim().toLowerCase() === item.reviewerName.trim().toLowerCase()) errors.push(`Parking line ${item.id}: independent author/reviewer identities are required`);
      if (!validDate(item.reviewedAt)) errors.push(`Parking line ${item.id}: review date is required`);
      if (!item.evidencePath?.startsWith(`evidence/parking-lines/`) || item.evidencePath.includes("..")) errors.push(`Parking line ${item.id}: evidence path must be inside the parking-line bundle`);
      if (!isSha256(item.evidenceSha256)) errors.push(`Parking line ${item.id}: source evidence SHA-256 is required`);
    }
    if (parking.walkabilityRegressionPassed !== true || !isSha256(parking.regressionEvidenceSha256)) errors.push("Named bidirectional parking-corridor full-footprint regression evidence is required");
  }

  const refinement = input.aiMapRefinement;
  if (!refinement || refinement.status !== "approved") {
    errors.push("AI-assisted map refinement candidate is not generated, independently reviewed and owner-approved");
  }
  if (refinement) {
    for (const [key, label] of [["sourceSha256", "source"], ["candidateSha256", "candidate"], ["promptSha256", "prompt"], ["parametersSha256", "model parameters"], ["qaReportSha256", "QA report"]] as const) {
      if (!isSha256(refinement[key])) errors.push(`AI map refinement: ${label} SHA-256 is required`);
    }
    if (isSha256(refinement.sourceSha256) && isSha256(refinement.candidateSha256) && refinement.sourceSha256 === refinement.candidateSha256) errors.push("AI map refinement must identify a distinct generated candidate, not relabel the source image");
    if (!nonEmpty(refinement.model) || !nonEmpty(refinement.modelVersion)) errors.push("AI map refinement model and version are required");
    const author = nonEmpty(refinement.authorName) ? refinement.authorName.trim() : "";
    const reviewer = nonEmpty(refinement.reviewerName) ? refinement.reviewerName.trim() : "";
    const owner = nonEmpty(refinement.ownerName) ? refinement.ownerName.trim() : "";
    if (!author || !reviewer || !owner || new Set([author.toLowerCase(), reviewer.toLowerCase(), owner.toLowerCase()]).size !== 3) errors.push("AI map refinement requires distinct author, independent reviewer and design owner");
    if (![refinement.authorCompletedAt, refinement.reviewerReviewedAt, refinement.ownerApprovedAt].every(validDate) ||
        (validDate(refinement.authorCompletedAt) && validDate(refinement.reviewerReviewedAt) && Date.parse(refinement.reviewerReviewedAt) < Date.parse(refinement.authorCompletedAt)) ||
        (validDate(refinement.reviewerReviewedAt) && validDate(refinement.ownerApprovedAt) && Date.parse(refinement.ownerApprovedAt) < Date.parse(refinement.reviewerReviewedAt))) errors.push("AI map refinement author/reviewer/owner chronology is invalid");
    if (refinement.ownerDisposition !== "accepted") errors.push("AI map refinement lacks explicit owner acceptance");
  }

  const devices = input.physicalDeviceAcceptance;
  const requiredPlatforms = ["ios", "android", "telegram"] as const;
  if (!Array.isArray(devices) || devices.length !== requiredPlatforms.length) {
    errors.push("Physical iOS, Android and Telegram acceptance records are required");
  } else {
    for (const platform of requiredPlatforms) {
      const matches = devices.filter(item => item?.platform === platform);
      if (matches.length !== 1) { errors.push(`Physical-device ${platform} acceptance is required exactly once`); continue; }
      const device = matches[0];
      if (!nonEmpty(device.deviceModel) || !nonEmpty(device.osVersion) || !nonEmpty(device.appVersion) || !/^[a-f0-9]{40}$/i.test(device.buildCommit)) errors.push(`Physical-device ${platform}: device, OS, app and tested build identity are required`);
      if (!nonEmpty(device.testerName) || !validDate(device.testedAt) || device.result !== "passed" || !isSha256(device.evidenceSha256)) errors.push(`Physical-device ${platform}: passed test, tester, date and evidence digest are required`);
    }
  }

  const groq = input.liveGroqProvider;
  if (!groq || groq.provider !== "groq" || groq.passed !== true || groq.sessionCredentialOnly !== true) errors.push("Live Groq provider verification must pass using session-only credentials");
  if (!groq || !nonEmpty(groq.model) || !nonEmpty(groq.testerName) || !nonEmpty(groq.scenario) || !validDate(groq.testedAt) || !isSha256(groq.responseEvidenceSha256)) errors.push("Live Groq verification requires model, tester, scenario, timestamp and response evidence digest");

  const dossier = input.releaseDossier;
  if (!dossier || dossier.decision !== "approved") errors.push("Final release dossier and explicit release approval are required");
  if (!dossier || !/^[a-f0-9]{40}$/i.test(dossier.candidateCommit) || !validDate(dossier.createdAt) || !validDate(dossier.approvedAt) ||
      !nonEmpty(dossier.authorName) || !nonEmpty(dossier.independentReviewerName) ||
      dossier.authorName.trim().toLowerCase() === dossier.independentReviewerName.trim().toLowerCase() ||
      !isSha256(dossier.evidenceSha256) ||
      (validDate(dossier.createdAt) && validDate(dossier.approvedAt) && Date.parse(dossier.approvedAt) < Date.parse(dossier.createdAt))) {
    errors.push("Final release dossier requires an immutable candidate commit, distinct author/reviewer, chronology and evidence digest");
  }

  return [...new Set(errors)];
}

export const COLLISION_CUTOVER_REQUIRED_ANCHORS = REQUIRED_ANCHORS;
export const COLLISION_CUTOVER_REQUIRED_REGIONS = REQUIRED_REGIONS;
