import type { MapAuthoringZoneId } from "./mapZones.js";
import { MAP_H, MAP_W } from "../coords.js";

export type ZoneReviewStatus =
  | "not-started"
  | "tracing"
  | "submitted"
  | "reviewed"
  | "approved"
  | "rejected";

export interface ZoneSourceEvidence {
  sourcePath: string;
  sourceSha256: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceRect: [number, number, number, number];
  worldTransform: {
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
  };
}

export interface ZoneReviewRecord {
  version: 1;
  zone: MapAuthoringZoneId;
  status: ZoneReviewStatus;
  author: { name: string; completedAt: string } | null;
  sourceEvidence: ZoneSourceEvidence[];
  reviewer: {
    name: string;
    reviewedAt: string;
    disposition: "accepted" | "changes-requested" | "unresolved";
    notes: string;
  } | null;
  ownerDecision: {
    name: string;
    decidedAt: string;
    decision: "approved" | "rejected" | "deferred";
    notes: string;
  } | null;
  notes: string;
  updatedAt: string | null;
}

export function createDefaultZoneReviewRecord(zone: MapAuthoringZoneId): ZoneReviewRecord {
  return {
    version: 1,
    zone,
    status: "not-started",
    author: null,
    sourceEvidence: [],
    reviewer: null,
    ownerDecision: null,
    notes: "",
    updatedAt: null,
  };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function distinctName(name: string, other: string | null): boolean {
  return other === null || name.trim().toLocaleLowerCase() !== other.trim().toLocaleLowerCase();
}

/** A zone review must retain enough original-map context to judge both seams. */
function evidenceCoversZoneWithSeamContext(evidence: Record<string, unknown>, zoneId: string): boolean {
  const index = Number(zoneId.slice(1)) - 1;
  if (!/^Z(?:0[1-9]|1[0-2])$/.test(zoneId) || index < 0 || index >= 12) return false;
  const rect = evidence.sourceRect;
  const transform = evidence.worldTransform;
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite) ||
      !transform || typeof transform !== "object" || Array.isArray(transform)) return false;
  const t = transform as Record<string, unknown>;
  if (![t.scaleX, t.scaleY, t.offsetX, t.offsetY].every(Number.isFinite) ||
      (t.scaleX as number) <= 0 || (t.scaleY as number) <= 0) return false;
  const [left, top, right, bottom] = rect as number[];
  if (left < 0 || top < 0 || right > Number(evidence.sourceWidth) ||
      bottom > Number(evidence.sourceHeight) || right <= left || bottom <= top) return false;
  const worldLeft = left * (t.scaleX as number) + (t.offsetX as number);
  const worldTop = top * (t.scaleY as number) + (t.offsetY as number);
  const worldRight = right * (t.scaleX as number) + (t.offsetX as number);
  const worldBottom = bottom * (t.scaleY as number) + (t.offsetY as number);
  const column = index % 4;
  const row = Math.floor(index / 4);
  const zoneLeft = column * MAP_W / 4;
  const zoneRight = (column + 1) * MAP_W / 4;
  const zoneTop = row * MAP_H / 3;
  const zoneBottom = (row + 1) * MAP_H / 3;
  const context = 24;
  return worldLeft <= Math.max(0, zoneLeft - context) + 0.5 &&
    worldTop <= Math.max(0, zoneTop - context) + 0.5 &&
    worldRight >= Math.min(MAP_W, zoneRight + context) - 0.5 &&
    worldBottom >= Math.min(MAP_H, zoneBottom + context) - 0.5;
}

function validateEvidence(value: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Source evidence " + index + " must be an object"];
  }
  const evidence = value as Record<string, unknown>;
  if (!nonEmpty(evidence.sourcePath)) errors.push("Source evidence " + index + " needs a source path");
  if (typeof evidence.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(evidence.sourceSha256)) {
    errors.push("Source evidence " + index + " needs a 64-character SHA-256 digest");
  }
  if (!Number.isInteger(evidence.sourceWidth) || (evidence.sourceWidth as number) <= 0 ||
      !Number.isInteger(evidence.sourceHeight) || (evidence.sourceHeight as number) <= 0) {
    errors.push("Source evidence " + index + " needs positive integer source dimensions");
  }
  const rect = evidence.sourceRect;
  if (!Array.isArray(rect) || rect.length !== 4 ||
      !rect.every(Number.isFinite) || rect[2] <= rect[0] || rect[3] <= rect[1]) {
    errors.push("Source evidence " + index + " needs a finite non-empty [left,top,right,bottom] crop");
  } else if (Number.isFinite(evidence.sourceWidth) && Number.isFinite(evidence.sourceHeight) &&
      (rect[0] < 0 || rect[1] < 0 || rect[2] > (evidence.sourceWidth as number) ||
       rect[3] > (evidence.sourceHeight as number))) {
    errors.push("Source evidence " + index + " crop must stay inside the native source image");
  }
  const transform = evidence.worldTransform;
  if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
    errors.push("Source evidence " + index + " needs a recorded world transform");
  } else {
    const t = transform as Record<string, unknown>;
    if (![t.scaleX, t.scaleY, t.offsetX, t.offsetY].every(Number.isFinite) ||
        (t.scaleX as number) <= 0 || (t.scaleY as number) <= 0) {
      errors.push("Source evidence " + index + " transform must have finite positive scales and finite offsets");
    } else if (Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite)) {
      const worldLeft = rect[0] * (t.scaleX as number) + (t.offsetX as number);
      const worldTop = rect[1] * (t.scaleY as number) + (t.offsetY as number);
      const worldRight = rect[2] * (t.scaleX as number) + (t.offsetX as number);
      const worldBottom = rect[3] * (t.scaleY as number) + (t.offsetY as number);
      if (worldLeft < -0.5 || worldTop < -0.5 || worldRight > MAP_W + 0.5 ||
          worldBottom > MAP_H + 0.5 || worldRight <= worldLeft || worldBottom <= worldTop) {
        errors.push("Source evidence " + index + " transform must map its crop inside the canonical world bounds");
      }
    }
  }
  return errors;
}

/**
 * Validate self-attested local review metadata. This deliberately does not
 * authenticate a person's identity; it prevents incomplete or self-approved
 * records from being represented as owner-approved evidence.
 */
export function validateZoneReviewRecord(value: unknown, expectedZone: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Zone review record must be an object"];
  }
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  const statuses: ZoneReviewStatus[] = ["not-started", "tracing", "submitted", "reviewed", "approved", "rejected"];
  if (record.version !== 1) errors.push("Zone review version must be 1");
  if (record.zone !== expectedZone) errors.push("Zone review record must match the requested zone");
  if (!statuses.includes(record.status as ZoneReviewStatus)) errors.push("Unknown zone review status");
  if (!Array.isArray(record.sourceEvidence)) errors.push("Source evidence must be an array");
  else {
    record.sourceEvidence.forEach((item, index) => errors.push(...validateEvidence(item, index + 1)));
    const hasSeamContext = record.sourceEvidence.some(item =>
      !!item && typeof item === "object" && !Array.isArray(item) &&
      evidenceCoversZoneWithSeamContext(item as Record<string, unknown>, String(expectedZone)));
    // Empty evidence is valid only for a not-yet-started draft. Submission and
    // approval already require at least one source item in the status checks below.
    if (record.sourceEvidence.length > 0 && !hasSeamContext) {
      errors.push("At least one source crop must cover the complete canonical zone plus 24 world-pixel seam context under its recorded transform");
    }
  }
  if (typeof record.notes !== "string") errors.push("Zone review notes must be text");

  const author = record.author as Record<string, unknown> | null;
  const reviewer = record.reviewer as Record<string, unknown> | null;
  const owner = record.ownerDecision as Record<string, unknown> | null;
  const status = record.status as ZoneReviewStatus;

  if (author !== null && (typeof author !== "object" || Array.isArray(author) ||
      !nonEmpty(author.name) || !validDate(author.completedAt))) {
    errors.push("Author record needs a name and valid completion date");
  }
  if (reviewer !== null && (typeof reviewer !== "object" || Array.isArray(reviewer) ||
      !nonEmpty(reviewer.name) || !validDate(reviewer.reviewedAt) ||
      !["accepted", "changes-requested", "unresolved"].includes(String(reviewer.disposition)) ||
      typeof reviewer.notes !== "string")) {
    errors.push("Reviewer record needs a name, date, disposition and notes");
  }
  if (owner !== null && (typeof owner !== "object" || Array.isArray(owner) ||
      !nonEmpty(owner.name) || !validDate(owner.decidedAt) ||
      !["approved", "rejected", "deferred"].includes(String(owner.decision)) ||
      typeof owner.notes !== "string")) {
    errors.push("Owner decision needs a name, date, decision and notes");
  }

  const authorName = author && typeof author === "object" && nonEmpty(author.name) ? author.name : null;
  const reviewerName = reviewer && typeof reviewer === "object" && nonEmpty(reviewer.name) ? reviewer.name : null;
  const ownerName = owner && typeof owner === "object" && nonEmpty(owner.name) ? owner.name : null;
  const authorCompletedAt = author && typeof author === "object" && validDate(author.completedAt)
    ? Date.parse(author.completedAt) : null;
  const reviewerReviewedAt = reviewer && typeof reviewer === "object" && validDate(reviewer.reviewedAt)
    ? Date.parse(reviewer.reviewedAt) : null;
  const ownerDecidedAt = owner && typeof owner === "object" && validDate(owner.decidedAt)
    ? Date.parse(owner.decidedAt) : null;
  if (authorCompletedAt !== null && reviewerReviewedAt !== null &&
      reviewerReviewedAt < authorCompletedAt) {
    errors.push("Independent review cannot predate the author's completed trace");
  }
  if (reviewerReviewedAt !== null && ownerDecidedAt !== null &&
      ownerDecidedAt < reviewerReviewedAt) {
    errors.push("Design-owner decision cannot predate the independent review");
  }
  if (reviewerName && !distinctName(reviewerName, authorName)) {
    errors.push("Independent reviewer must be different from the author");
  }
  if (ownerName && (!distinctName(ownerName, authorName) || !distinctName(ownerName, reviewerName))) {
    errors.push("Design owner must be different from both author and independent reviewer");
  }

  if (status === "submitted" || status === "reviewed" || status === "approved" || status === "rejected") {
    if (!authorName || !validDate(author?.completedAt)) errors.push("Submitted geometry needs an author and completion date");
    if (!Array.isArray(record.sourceEvidence) || record.sourceEvidence.length === 0) {
      errors.push("Submitted geometry needs at least one source image/crop and recorded transform");
    }
  }
  if (status === "reviewed" || status === "approved") {
    if (!reviewerName || !validDate(reviewer?.reviewedAt)) errors.push("Reviewed geometry needs an independent reviewer and date");
  }
  if (status === "approved") {
    if (reviewer?.disposition !== "accepted") errors.push("Owner approval requires an accepted independent review");
    if (!ownerName || !validDate(owner?.decidedAt) || owner?.decision !== "approved") {
      errors.push("Approved geometry needs an explicit design-owner approval and date");
    }
  }
  if (status === "rejected" &&
      reviewer?.disposition !== "changes-requested" && owner?.decision !== "rejected") {
    errors.push("Rejected status needs a reviewer change request or owner rejection");
  }
  if (record.updatedAt !== null && !validDate(record.updatedAt)) errors.push("Updated-at must be null or a valid date");
  return errors;
}
