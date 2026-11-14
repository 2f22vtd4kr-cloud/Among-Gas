import { MAP_AUTHORING_ZONES } from "./mapZones.js";
import { validateZoneReviewRecord } from "./zoneReview.js";

export interface GameplayAnchorDisposition {
  id: string;
  authorName: string;
  reviewerName: string;
  disposition: "accepted" | "changes-requested" | "unresolved";
  evidenceSha256: string;
  movementRoutePassed: boolean;
  sightApproachPassed: boolean;
}

export interface DisconnectedRegionDisposition {
  id: "C0" | "C20" | "C27" | "C38" | "C56";
  reviewerName: string;
  ownerName: string;
  decision: "accessible" | "intentionally-sealed" | "deferred";
  evidenceSha256: string;
  routeEvidenceComplete: boolean;
  notes: string;
}

export interface CollisionCutoverEvidence {
  candidateSha256: string;
  zoneReviews: unknown[];
  gameplayAnchors: GameplayAnchorDisposition[];
  disconnectedRegions: DisconnectedRegionDisposition[];
  parity: {
    clientServerMovement: boolean;
    botNavigation: boolean;
    interactionLineOfSight: boolean;
    presentationShadow: boolean;
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
const REQUIRED_REGIONS = ["C0", "C20", "C27", "C38", "C56"] as const;
const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

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
      if (record.status !== "approved") errors.push(`${zone.id}: author trace, independent review and owner approval are not complete`);
    }
  }

  if (!Array.isArray(input.gameplayAnchors)) {
    errors.push("All 24 gameplay-anchor dispositions are required");
  } else {
    for (const id of REQUIRED_ANCHORS) {
      const matches = input.gameplayAnchors.filter((anchor) => anchor?.id === id);
      if (matches.length !== 1) {
        errors.push(`${id}: exactly one anchor disposition is required`);
        continue;
      }
      const anchor = matches[0];
      if (!nonEmpty(anchor.authorName) || !nonEmpty(anchor.reviewerName) ||
          anchor.authorName.trim().toLowerCase() === anchor.reviewerName.trim().toLowerCase()) {
        errors.push(`${id}: distinct author and independent reviewer are required`);
      }
      if (anchor.disposition !== "accepted") errors.push(`${id}: disposition is not accepted`);
      if (!isSha256(anchor.evidenceSha256)) errors.push(`${id}: source/route evidence SHA-256 is required`);
      if (anchor.movementRoutePassed !== true) errors.push(`${id}: full-footprint movement route has not passed`);
      if (anchor.sightApproachPassed !== true) errors.push(`${id}: interaction sight approach has not passed`);
    }
  }

  if (!Array.isArray(input.disconnectedRegions)) {
    errors.push("All five disconnected-region dispositions are required");
  } else {
    for (const id of REQUIRED_REGIONS) {
      const matches = input.disconnectedRegions.filter((region) => region?.id === id);
      if (matches.length !== 1) {
        errors.push(`${id}: exactly one disconnected-region disposition is required`);
        continue;
      }
      const region = matches[0];
      if (!nonEmpty(region.reviewerName) || !nonEmpty(region.ownerName) ||
          region.reviewerName.trim().toLowerCase() === region.ownerName.trim().toLowerCase()) {
        errors.push(`${id}: distinct independent reviewer and design owner are required`);
      }
      if (region.decision === "deferred") errors.push(`${id}: design disposition remains deferred`);
      if (region.decision !== "accessible" && region.decision !== "intentionally-sealed" && region.decision !== "deferred") {
        errors.push(`${id}: unknown design disposition`);
      }
      if (!isSha256(region.evidenceSha256)) errors.push(`${id}: source evidence SHA-256 is required`);
      if (region.routeEvidenceComplete !== true) errors.push(`${id}: full-footprint connectivity evidence is incomplete`);
      if (!nonEmpty(region.notes)) errors.push(`${id}: design decision rationale is required`);
    }
  }

  const parity = input.parity;
  if (!parity || parity.clientServerMovement !== true) errors.push("Client/server movement parity has not passed");
  if (!parity || parity.botNavigation !== true) errors.push("Bot navigation parity has not passed");
  if (!parity || parity.interactionLineOfSight !== true) errors.push("Interaction line-of-sight parity has not passed");
  if (!parity || parity.presentationShadow !== true) errors.push("Independent presentation-shadow review has not passed");

  const visual = input.visualReview;
  if (!visual || visual.allTwelveZonesInspected !== true) errors.push("All twelve zone QA crops must be inspected");
  if (!visual || visual.desktopAndMobileDpr !== true) errors.push("Desktop and mobile DPR visual review must pass");
  if (!visual || visual.sourceAndOverlayCompared !== true) errors.push("Source art and all semantic overlays must be compared");

  return [...new Set(errors)];
}

export const COLLISION_CUTOVER_REQUIRED_ANCHORS = REQUIRED_ANCHORS;
export const COLLISION_CUTOVER_REQUIRED_REGIONS = REQUIRED_REGIONS;
