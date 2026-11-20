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
  sampleSetPath?: string;
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
  authorCompletedAt: string;
  reviewerName: string;
  reviewerReviewedAt: string;
  disposition: "accepted" | "changes-requested" | "unresolved";
}

export interface PhysicalDeviceAcceptance {
  platform: "ios" | "android" | "telegram";
  deviceType: "physical";
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  buildCommit: string;
  testerName: string;
  testedAt: string;
  result: "passed" | "failed";
  evidenceSha256: string;
  evidencePath?: string;
}

export interface CollisionCutoverEvidence {
  candidateSha256: string;
  candidatePath?: string;
  zoneReviews: unknown[];
  fullFootprintRasterVectorParity: FullFootprintRasterVectorParity;
  gameplayAnchors: GameplayAnchorDisposition[];
  disconnectedRegions: DisconnectedRegionDisposition[];
  parity: {
    clientServerMovement: { passed: boolean; evidenceSha256: string; evidencePath?: string };
    botNavigation: { passed: boolean; evidenceSha256: string; evidencePath?: string };
    interactionLineOfSight: { passed: boolean; evidenceSha256: string; evidencePath?: string };
    worldVision: { passed: boolean; evidenceSha256: string; evidencePath?: string };
    presentationShadow: { passed: boolean; evidenceSha256: string; evidencePath?: string };
  };
  sourceMapArt: {
    sourceSha256: string;
    sourcePath?: string;
    transformSha256: string;
    transformPath?: string;
  };
  assetRights: {
    status: "cleared" | "unresolved" | "rejected";
    rightsHolder: string;
    license: string;
    evidenceSha256: string;
    evidencePath?: string;
    inventoryPath: string;
    inventorySha256: string;
    inventoriedAssetCount: number;
    perAssetClearances: {
      assetPath: string;
      assetSha256: string;
      rightsHolder: string;
      license: string;
      permissionEvidencePath: string;
      permissionEvidenceSha256: string;
      status: "cleared" | "unresolved" | "rejected";
    }[];
  };
  /** Exhaustive source-object inventory, independently reviewed per object. */
  sourceObjectIds: string[];
  sourceObjectInventoryPath?: string;
  sourceObjectInventorySha256?: string;
  authoredObjects: AuthoredObjectDisposition[];
  statuePlanterPedestal: {
    planter: AuthoredObjectDisposition;
    pedestal: AuthoredObjectDisposition;
  };
  parkingLines: {
    sourceLineIds: string[];
    sourceInventoryPath?: string;
    sourceInventorySha256?: string;
    classifications: ParkingLineClassification[];
    walkabilityRegressionPassed: boolean;
    regressionEvidenceSha256: string;
    regressionEvidencePath?: string;
  };
  aiMapRefinement: {
    status: "approved" | "not-generated" | "generated" | "reviewed";
    model: string;
    modelVersion: string;
    sourceSha256: string;
    sourcePath?: string;
    candidateSha256: string;
    candidatePath?: string;
    promptSha256: string;
    promptPath?: string;
    parametersSha256: string;
    parametersPath?: string;
    qaReportSha256: string;
    qaReportPath?: string;
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
    candidateCommit: string;
    model: string;
    testerName: string;
    testedAt: string;
    scenario: string;
    responseEvidenceSha256: string;
    responseEvidencePath?: string;
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
    evidencePath?: string;
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

/** Pinned full-file inventory; update together with the provenance manifest. */
export const COLLISION_CUTOVER_REQUIRED_ASSET_INVENTORY_SHA256 =
  "ab2b97d01e0316ae40289001c63008901cefcfe23517dc1be78bd9e13fb6a332";
export const COLLISION_CUTOVER_REQUIRED_ASSET_PATHS = [
  "attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png",
  "attached_assets/BAF1186A-CC7C-4076-B23F-03C55C906007_1783604564967.png",
  "attached_assets/generated_images/character_sprite_sheet.png",
  "attached_assets/IMG_2887_1783602362663.webp",
  "attached_assets/IMG_2887_1783605337712.webp",
  "attached_assets/IMG_2888_1783605337712.webp",
  "attached_assets/IMG_2898_1783586696260.jpeg",
  "attached_assets/IMG_2907_1783590932507.jpeg",
  "attached_assets/IMG_2907_1783593845208.jpeg",
  "attached_assets/IMG_2907_1783632830477.jpeg",
  "attached_assets/IMG_2915_1783596039233.jpeg",
  "attached_assets/IMG_2936_1783604300237.jpeg",
  "attached_assets/IMG_2937_1783605293999.jpeg",
  "attached_assets/IMG_2940_1783608711056.png",
  "attached_assets/IMG_2941_1783609434358.png",
  "attached_assets/IMG_2942_1783609434358.png",
  "attached_assets/IMG_2945_1783611262735.jpeg",
  "attached_assets/IMG_2946_1783617740543.jpeg",
  "attached_assets/IMG_2947_1783617740543.webp",
  "attached_assets/IMG_2947_1783619677358.webp",
  "attached_assets/IMG_2947_1783620092373.webp",
  "attached_assets/IMG_2947_1783620848793.webp",
  "attached_assets/IMG_2947_1783630457114.webp",
  "attached_assets/IMG_2949_1783619591295.jpeg",
  "attached_assets/IMG_2950_1783620092373.jpeg",
  "attached_assets/IMG_2951_1783620590679.jpeg",
  "attached_assets/IMG_2951_1783620829862.jpeg",
  "attached_assets/IMG_2952_1783621040713.jpeg",
  "attached_assets/IMG_2952_1783621070573.jpeg",
  "attached_assets/IMG_2952_1783623605477.jpeg",
  "attached_assets/IMG_2954_1783630920533.png",
  "attached_assets/IMG_2958_1783624186711.jpeg",
  "attached_assets/IMG_2959_1783625500018.jpeg",
  "attached_assets/IMG_2961_1783625789937.jpeg",
  "attached_assets/IMG_2963_1783627194029.jpeg",
  "attached_assets/IMG_2964_1783628295670.jpeg",
  "attached_assets/IMG_2965_1783628526684.jpeg",
  "attached_assets/IMG_2966_1783628526684.jpeg",
  "attached_assets/IMG_2967_1783628526684.jpeg",
  "attached_assets/IMG_2968_1783629316648.jpeg",
  "attached_assets/IMG_2969_1783629657719.jpeg",
  "attached_assets/IMG_2969_1783630322300.jpeg",
  "attached_assets/IMG_2971_1783631156418.jpeg",
  "attached_assets/IMG_2972_1783631392364.jpeg",
  "attached_assets/IMG_2973_1783631680200.jpeg",
  "attached_assets/IMG_2974_1783656137059.jpeg",
  "attached_assets/IMG_2979_1783658554613.jpeg",
  "attached_assets/IMG_2983_1783671562586.jpeg",
  "attached_assets/IMG_2984_1783672810937.jpeg",
  "attached_assets/IMG_2984_1783682885759.jpeg",
  "attached_assets/IMG_2989_1783676922907.png",
  "attached_assets/IMG_2993_1783681349063.png",
  "attached_assets/IMG_3001_1783704862506.png",
  "attached_assets/IMG_3006_1783716314524.jpeg",
  "attached_assets/IMG_3009_1783748833295.jpeg",
  "attached_assets/IMG_3010_1783748833295.webp",
  "attached_assets/IMG_3010_1783749973232.webp",
  "attached_assets/IMG_3011_1783749973232.jpeg",
  "attached_assets/Pasted-Great-progress-the-server-ts-you-shared-is-a-strong-sel_1783665582933.txt",
  "attached_assets/Pasted-Here-is-the-complete-self-contained-and-ready-to-run-se_1783665407349.txt",
  "attached_assets/Pasted-Processed-Improved-I-reviewed-the-three-modules-you-sha_1783665384475.txt",
  "attached_assets/Pasted-Repo-Analysis-Complete-I-examined-https-github-com-2f22_1783683371738.txt",
  "attached_assets/Pasted-Save-this-file-in-your-Replit-workspace-as-AMONG-US-TEL_1783665354423.txt",
  "attached_assets/Pasted-This-consolidated-specification-is-excellent-You-captur_1783665338453.txt",
  "attached_assets/Pasted-To-make-sure-your-Replit-workspace-has-the-complete-seq_1783665346953.txt",
  "attached_assets/Pasted-Your-consolidation-is-flawless-You-have-successfully-de_1783665396738.txt",
] as const;
const REQUIRED_ASSET_PATHS = new Set<string>(COLLISION_CUTOVER_REQUIRED_ASSET_PATHS);

export const MAX_RASTER_VECTOR_DISAGREEMENT_RATIO = 0.02;
const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const validDate = (value: unknown): value is string =>
  nonEmpty(value) && Number.isFinite(Date.parse(value));
function safeEvidenceBundlePath(value: unknown, prefix: string, maxLength = 1024): boolean {
  if (!nonEmpty(value) || value.length > maxLength ||
      /[\x00-\x1f\x7f]/.test(value) || value.includes("\\")) return false;
  if (!value.startsWith(prefix) || value.startsWith("/") || /^[a-z]:/i.test(value)) return false;
  const parts = value.split("/");
  const prefixParts = prefix.endsWith("/") ? prefix.slice(0, -1).split("/") : prefix.split("/");
  return parts.length > prefixParts.length &&
    prefixParts.every((part, index) => parts[index] === part) &&
    parts.every(part => part.length > 0 && part !== "." && part !== "..");
}

function safeAnchorEvidencePath(value: unknown, anchorId: string, channel: "movement" | "sight"): boolean {
  return safeEvidenceBundlePath(value, "evidence/gameplay-anchors/" + anchorId + "/" + channel + "/", 512);
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
  if (!assetRights || assetRights.inventoryPath !== "docs/asset-provenance-inventory.md" ||
      !isSha256(assetRights.inventorySha256) ||
      assetRights.inventorySha256.toLowerCase() !== COLLISION_CUTOVER_REQUIRED_ASSET_INVENTORY_SHA256 ||
      assetRights.inventoriedAssetCount !== COLLISION_CUTOVER_REQUIRED_ASSET_PATHS.length ||
      !Array.isArray(assetRights.perAssetClearances) ||
      assetRights.perAssetClearances.length !== COLLISION_CUTOVER_REQUIRED_ASSET_PATHS.length) {
    errors.push("Commercial rights must reconcile to the exact pinned 66-path asset-provenance inventory and SHA-256");
  } else {
    const paths = new Set<string>();
    const permissionDigests = new Set<string>();
    for (const item of assetRights.perAssetClearances) {
      if (!item || !nonEmpty(item.assetPath) || !REQUIRED_ASSET_PATHS.has(item.assetPath) ||
          item.assetPath.startsWith("/") ||
          item.assetPath.split(/[\\/]/).some(part => part === "." || part === "..")) {
        errors.push("Every asset clearance must name one exact path in the pinned repository-relative asset inventory");
        continue;
      }
      if (paths.has(item.assetPath)) errors.push("Asset rights inventory contains a duplicate asset path: " + item.assetPath);
      paths.add(item.assetPath);
      if (!isSha256(item.assetSha256)) errors.push("Asset " + item.assetPath + " requires its exact asset SHA-256");
      if (item.status !== "cleared" || !nonEmpty(item.rightsHolder) || !nonEmpty(item.license)) {
        errors.push("Asset " + item.assetPath + " lacks asset-specific commercial rights clearance");
      }
      if (!item.permissionEvidencePath?.startsWith("evidence/asset-rights/") ||
          item.permissionEvidencePath.split(/[\\/]/).some(part => part === "." || part === "..") ||
          !isSha256(item.permissionEvidenceSha256)) {
        errors.push("Asset " + item.assetPath + " requires asset-specific written permission evidence and digest");
      } else if (permissionDigests.has(item.permissionEvidenceSha256.toLowerCase())) {
        errors.push("Every retained asset must have its own distinct written permission evidence digest");
      } else {
        permissionDigests.add(item.permissionEvidenceSha256.toLowerCase());
      }
    }
    if (paths.size !== COLLISION_CUTOVER_REQUIRED_ASSET_PATHS.length ||
        COLLISION_CUTOVER_REQUIRED_ASSET_PATHS.some(assetPath => !paths.has(assetPath))) {
      errors.push("Asset rights clearances must cover every exact path in the pinned 66-file inventory");
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
    if (!safeEvidenceBundlePath(object.evidencePath, "evidence/map-objects/statue-" + key + "/")) errors.push(label + ": source evidence must be in its object-specific bundle");
    if (!isSha256(object.evidenceSha256)) errors.push(`${label}: source-trace evidence SHA-256 is required`);
    if (typeof object.blocksMove !== "boolean" || typeof object.blocksSight !== "boolean" || typeof object.castsShadow !== "boolean") errors.push(`${label}: movement, sight and shadow semantics must each be explicit`);
    if (!["painted-art-only", "separate-occluder", "none"].includes(object.shadowTreatment)) errors.push(`${label}: decorative-shadow treatment must be explicit`);
    if (object.castsShadow !== (object.shadowTreatment === "separate-occluder")) errors.push(`${label}: shadow flag and shadow treatment disagree`);
  }

  // Exhaustive source-object inventory: movement, interaction sight and
  // presentation shadow are authored per object, never inferred from one another.
  const sourceObjectIds = input.sourceObjectIds;
  const authoredObjects = input.authoredObjects;
  if (!Array.isArray(sourceObjectIds) || sourceObjectIds.length === 0 ||
      sourceObjectIds.some(id => !nonEmpty(id) || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id)) ||
      new Set(sourceObjectIds).size !== sourceObjectIds.length) {
    errors.push("A non-empty, unique source-authored object ID inventory is required");
  }
  if (!safeEvidenceBundlePath(input.sourceObjectInventoryPath, "evidence/map-objects/source-object-inventory/") ||
      !isSha256(input.sourceObjectInventorySha256)) {
    errors.push("The exhaustive source-object inventory requires a byte-verifiable path and SHA-256");
  }
  if (!Array.isArray(authoredObjects) || !Array.isArray(sourceObjectIds) ||
      authoredObjects.length !== sourceObjectIds.length) {
    errors.push("Every source-inventoried map object requires exactly one independent movement/sight/shadow disposition");
  } else {
    const seenObjectIds = new Set<string>();
    for (const object of authoredObjects) {
      if (!object || !nonEmpty(object.objectId) || !sourceObjectIds.includes(object.objectId) ||
          seenObjectIds.has(object.objectId)) {
        errors.push("Authored map-object dispositions must uniquely match the exhaustive source-object inventory");
        continue;
      }
      seenObjectIds.add(object.objectId);
      const author = nonEmpty(object.authorName) ? object.authorName.trim() : "";
      const reviewer = nonEmpty(object.reviewerName) ? object.reviewerName.trim() : "";
      if (!author || !reviewer || author.toLowerCase() === reviewer.toLowerCase()) {
        errors.push(`Map object ${object.objectId}: distinct source author and independent reviewer are required`);
      }
      if (!validDate(object.authorCompletedAt) || !validDate(object.reviewerReviewedAt) ||
          (validDate(object.authorCompletedAt) && validDate(object.reviewerReviewedAt) &&
           Date.parse(object.reviewerReviewedAt) < Date.parse(object.authorCompletedAt))) {
        errors.push(`Map object ${object.objectId}: author/reviewer chronology is invalid`);
      }
      if (object.disposition !== "accepted") errors.push(`Map object ${object.objectId}: independent review is not accepted`);
      if (!safeEvidenceBundlePath(object.evidencePath, "evidence/map-objects/" + object.objectId + "/")) {
        errors.push(`Map object ${object.objectId}: evidence must be stored in its object-specific source bundle`);
      }
      if (!isSha256(object.evidenceSha256)) errors.push(`Map object ${object.objectId}: source evidence SHA-256 is required`);
      if (typeof object.blocksMove !== "boolean" || typeof object.blocksSight !== "boolean" ||
          typeof object.castsShadow !== "boolean") {
        errors.push(`Map object ${object.objectId}: movement, interaction-sight and presentation-shadow semantics must all be explicit`);
      }
      if (!["painted-art-only", "separate-occluder", "none"].includes(object.shadowTreatment) ||
          object.castsShadow !== (object.shadowTreatment === "separate-occluder")) {
        errors.push(`Map object ${object.objectId}: shadow flag and treatment must be explicit and consistent`);
      }
    }
    if (seenObjectIds.size !== sourceObjectIds.length ||
        sourceObjectIds.some(id => !seenObjectIds.has(id))) {
      errors.push("Every source-inventoried map object must have one reviewed disposition");
    }
  }

  const statueObjects = [objectBundle?.planter, objectBundle?.pedestal].filter(Boolean) as AuthoredObjectDisposition[];
  for (const statueObject of statueObjects) {
    const matching = Array.isArray(authoredObjects)
      ? authoredObjects.filter(object => object?.objectId === statueObject.objectId)
      : [];
    if (!Array.isArray(sourceObjectIds) || !sourceObjectIds.includes(statueObject.objectId) ||
        matching.length !== 1 || matching[0].authorName !== statueObject.authorName ||
        matching[0].authorCompletedAt !== statueObject.authorCompletedAt ||
        matching[0].reviewerName !== statueObject.reviewerName ||
        matching[0].reviewerReviewedAt !== statueObject.reviewerReviewedAt ||
        matching[0].disposition !== statueObject.disposition ||
        matching[0].evidencePath !== statueObject.evidencePath ||
        matching[0].evidenceSha256 !== statueObject.evidenceSha256 ||
        matching[0].blocksMove !== statueObject.blocksMove ||
        matching[0].blocksSight !== statueObject.blocksSight ||
        matching[0].castsShadow !== statueObject.castsShadow ||
        matching[0].shadowTreatment !== statueObject.shadowTreatment) {
      errors.push(`Statue object ${statueObject.objectId}: dedicated planter/pedestal review must match the exhaustive per-object inventory`);
    }
  }

  const parking = input.parkingLines;
  if (!parking || !Array.isArray(parking.sourceLineIds) || parking.sourceLineIds.length === 0 ||
      !Array.isArray(parking.classifications)) {
    errors.push("Complete source inventory and classification of parking-line markings is required");
  } else {
    if (!safeEvidenceBundlePath(parking.sourceInventoryPath, "evidence/parking-lines/source-inventory/") ||
        !isSha256(parking.sourceInventorySha256)) {
      errors.push("Exhaustive parking-line source inventory requires a byte-verifiable path and SHA-256");
    }
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
      if (!validDate(item.authorCompletedAt) || !validDate(item.reviewerReviewedAt) ||
          (validDate(item.authorCompletedAt) && validDate(item.reviewerReviewedAt) &&
           Date.parse(item.reviewerReviewedAt) < Date.parse(item.authorCompletedAt))) {
        errors.push(`Parking line ${item.id}: author/reviewer chronology is invalid`);
      }
      if (!safeEvidenceBundlePath(item.evidencePath, "evidence/parking-lines/" + item.id + "/")) errors.push("Parking line " + item.id + ": evidence path must be inside its line-specific source bundle");
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
      if (device.deviceType !== "physical") errors.push(`Physical-device ${platform}: deviceType must explicitly be physical, not an emulator or simulator`);
      if (!nonEmpty(device.deviceModel) || !nonEmpty(device.osVersion) || !nonEmpty(device.appVersion) || !/^[a-f0-9]{40}$/i.test(device.buildCommit)) errors.push(`Physical-device ${platform}: device, OS, app and tested build identity are required`);
      if (!nonEmpty(device.testerName) || !validDate(device.testedAt) || device.result !== "passed" || !isSha256(device.evidenceSha256)) errors.push(`Physical-device ${platform}: passed test, tester, date and evidence digest are required`);
    }
  }

  const groq = input.liveGroqProvider;
  if (!groq || groq.provider !== "groq" || groq.passed !== true || groq.sessionCredentialOnly !== true) errors.push("Live Groq provider verification must pass using session-only credentials");
  if (!groq || !/^[a-f0-9]{40}$/i.test(groq.candidateCommit ?? "") ||
      !nonEmpty(groq.model) || !nonEmpty(groq.testerName) || !nonEmpty(groq.scenario) ||
      !validDate(groq.testedAt) || !isSha256(groq.responseEvidenceSha256)) {
    errors.push("Live Groq verification requires the exact tested candidate commit, model, tester, scenario, timestamp and response evidence digest");
  }

  const dossier = input.releaseDossier;
  if (!dossier || dossier.decision !== "approved") errors.push("Final release dossier and explicit release approval are required");
  if (!dossier || !/^[a-f0-9]{40}$/i.test(dossier.candidateCommit) || !validDate(dossier.createdAt) || !validDate(dossier.approvedAt) ||
      !nonEmpty(dossier.authorName) || !nonEmpty(dossier.independentReviewerName) ||
      dossier.authorName.trim().toLowerCase() === dossier.independentReviewerName.trim().toLowerCase() ||
      !isSha256(dossier.evidenceSha256) ||
      (validDate(dossier.createdAt) && validDate(dossier.approvedAt) && Date.parse(dossier.approvedAt) < Date.parse(dossier.createdAt))) {
    errors.push("Final release dossier requires an immutable candidate commit, distinct author/reviewer, chronology and evidence digest");
  }

  // Device and provider checks must describe the same immutable candidate
  // that the final dossier approves; a passing test from an older build cannot
  // be carried forward to a different release candidate.
  const releaseCandidateCommit = dossier && typeof dossier.candidateCommit === "string" &&
    /^[a-f0-9]{40}$/i.test(dossier.candidateCommit)
    ? dossier.candidateCommit.toLowerCase()
    : null;
  if (releaseCandidateCommit) {
    for (const device of Array.isArray(devices) ? devices : []) {
      if (typeof device?.buildCommit !== "string" ||
          device.buildCommit.toLowerCase() !== releaseCandidateCommit) {
        errors.push(`Physical-device ${device?.platform ?? "unknown"}: tested build commit must match the final release candidate commit`);
      }
    }
    if (typeof groq?.candidateCommit !== "string" ||
        groq.candidateCommit.toLowerCase() !== releaseCandidateCommit) {
      errors.push("Live Groq provider verification must match the final release candidate commit");
    }
  }

  return [...new Set(errors)];
}

export const COLLISION_CUTOVER_REQUIRED_ANCHORS = REQUIRED_ANCHORS;
export const COLLISION_CUTOVER_REQUIRED_REGIONS = REQUIRED_REGIONS;
