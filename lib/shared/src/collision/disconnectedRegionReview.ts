export const DISCONNECTED_REGION_IDS = ["C0", "C20", "C27", "C38", "C56"] as const;
export type DisconnectedRegionId = typeof DISCONNECTED_REGION_IDS[number];
export type DisconnectedRegionDecision = "accessible" | "intentionally-sealed" | "deferred";
export type DisconnectedRegionReviewStatus = "not-started" | "in-review" | "approved";
export type DisconnectedRegionReviewerDisposition = "accepted" | "changes-requested" | "unresolved";

export interface DisconnectedRegionReviewRecord {
  id: DisconnectedRegionId;
  status: DisconnectedRegionReviewStatus;
  authorName: string;
  authorCompletedAt: string;
  reviewerName: string;
  reviewerReviewedAt: string;
  reviewerDisposition: DisconnectedRegionReviewerDisposition;
  ownerName: string;
  ownerDecidedAt: string;
  decision: DisconnectedRegionDecision;
  evidenceSha256: string;
  evidencePath: string;
  routeEvidenceComplete: boolean;
  notes: string;
  updatedAt?: string;
}

export function isDisconnectedRegionId(value: unknown): value is DisconnectedRegionId {
  return typeof value === "string" &&
    (DISCONNECTED_REGION_IDS as readonly string[]).includes(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    Number.isFinite(Date.parse(value));
}

function distinctName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("en-US") !== right.trim().toLocaleLowerCase("en-US");
}

/** Empty review scaffold. It explicitly records no access decision or approval. */
export function createDefaultDisconnectedRegionReviewRecord(
  id: DisconnectedRegionId,
): DisconnectedRegionReviewRecord {
  return {
    id,
    status: "not-started",
    authorName: "",
    authorCompletedAt: "",
    reviewerName: "",
    reviewerReviewedAt: "",
    reviewerDisposition: "unresolved",
    ownerName: "",
    ownerDecidedAt: "",
    decision: "deferred",
    evidenceSha256: "",
    evidencePath: "",
    routeEvidenceComplete: false,
    notes: "Pending source-art review, full-footprint connectivity evidence and explicit design-owner decision. Do not infer accessibility from the raster component alone.",
  };
}

/**
 * Fail-closed review metadata validation. Names and dates are self-attested;
 * this validates separation and chronology but does not authenticate identities.
 */
export function validateDisconnectedRegionReviewRecord(
  value: unknown,
  expectedId?: DisconnectedRegionId,
): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Disconnected-region review record must be an object"];
  }
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!isDisconnectedRegionId(record.id)) errors.push("Unknown disconnected-region ID");
  if (expectedId && record.id !== expectedId) errors.push("Record ID does not match the requested disconnected region");
  if (record.status !== "not-started" && record.status !== "in-review" && record.status !== "approved") {
    errors.push("Review status must be not-started, in-review or approved");
  }
  for (const [field, value, maxLength] of [
    ["authorName", record.authorName, 120],
    ["reviewerName", record.reviewerName, 120],
    ["ownerName", record.ownerName, 120],
    ["authorCompletedAt", record.authorCompletedAt, 64],
    ["reviewerReviewedAt", record.reviewerReviewedAt, 64],
    ["ownerDecidedAt", record.ownerDecidedAt, 64],
  ] as const) {
    if (typeof value !== "string" || value.length > maxLength) {
      errors.push(field + " must be a string up to " + maxLength + " characters");
    }
  }
  if (record.reviewerDisposition !== "accepted" &&
      record.reviewerDisposition !== "changes-requested" &&
      record.reviewerDisposition !== "unresolved") {
    errors.push("Reviewer disposition must be accepted, changes-requested or unresolved");
  }
  if (record.decision !== "accessible" && record.decision !== "intentionally-sealed" && record.decision !== "deferred") {
    errors.push("Decision must be accessible, intentionally-sealed or deferred");
  }
  if (typeof record.evidenceSha256 !== "string" ||
      (record.evidenceSha256 !== "" && !/^[a-f0-9]{64}$/i.test(record.evidenceSha256))) {
    errors.push("Evidence SHA-256 must be empty or a 64-character hexadecimal digest");
  }
  if (typeof record.evidencePath !== "string" || record.evidencePath.length > 512 ||
      (record.evidencePath !== "" && (
        record.evidencePath.startsWith("/") ||
        record.evidencePath.startsWith("\\\\") ||
        /^[a-z]:/i.test(record.evidencePath) ||
        record.evidencePath.split(/[\\/]/).some(part => part === ".." || part === ".")
      ))) {
    errors.push("Evidence path must be empty or a safe relative path within this region's evidence directory");
  }
  if (typeof record.routeEvidenceComplete !== "boolean") {
    errors.push("routeEvidenceComplete must be boolean");
  }
  if (typeof record.notes !== "string" || record.notes.length > 2_000) {
    errors.push("Review notes must be a string up to 2,000 characters");
  }
  if (record.updatedAt !== undefined && !validDate(record.updatedAt)) {
    errors.push("updatedAt must be a valid date when supplied");
  }

  const authorName = nonEmpty(record.authorName) ? record.authorName.trim() : "";
  const reviewerName = nonEmpty(record.reviewerName) ? record.reviewerName.trim() : "";
  const ownerName = nonEmpty(record.ownerName) ? record.ownerName.trim() : "";
  const authorAt = validDate(record.authorCompletedAt) ? Date.parse(record.authorCompletedAt) : null;
  const reviewerAt = validDate(record.reviewerReviewedAt) ? Date.parse(record.reviewerReviewedAt) : null;
  const ownerAt = validDate(record.ownerDecidedAt) ? Date.parse(record.ownerDecidedAt) : null;

  if (record.status === "not-started") {
    if (record.decision !== "deferred") errors.push("A not-started record must remain deferred");
    if (authorName || reviewerName || ownerName) errors.push("A not-started record cannot claim author, reviewer or owner identities");
    if (authorAt !== null || reviewerAt !== null || ownerAt !== null) errors.push("A not-started record cannot claim author, review or owner-decision dates");
    if (record.reviewerDisposition !== "unresolved") errors.push("A not-started record cannot claim a reviewer disposition");
    if (typeof record.evidenceSha256 === "string" && record.evidenceSha256.trim()) {
      errors.push("A not-started record cannot claim source or route evidence");
    }
    if (record.routeEvidenceComplete === true) errors.push("A not-started record cannot claim completed route evidence");
  }

  if (record.status === "in-review") {
    if (!authorName || authorAt === null) errors.push("An in-review record requires a named source author and completion date");
    if (record.decision !== "deferred" || ownerName || ownerAt !== null) {
      errors.push("An in-review record must leave the design-owner decision deferred and unrecorded");
    }
    if (reviewerName) {
      if (!distinctName(authorName, reviewerName)) {
        errors.push("Independent reviewer must be different from the source author");
      }
      if (reviewerAt === null) errors.push("A named reviewer requires a review date");
      if (authorAt !== null && reviewerAt !== null && reviewerAt < authorAt) {
        errors.push("Independent review cannot predate the source author's completed trace");
      }
      if (record.reviewerDisposition !== "accepted" && record.reviewerDisposition !== "changes-requested") {
        errors.push("A named reviewer requires an explicit accepted or changes-requested disposition");
      }
    } else if (reviewerAt !== null || record.reviewerDisposition !== "unresolved") {
      errors.push("A reviewer date or disposition cannot be recorded without a reviewer identity");
    }
  }

  if (record.status === "approved") {
    if (!authorName || authorAt === null) errors.push("Approval requires a named source author and completion date");
    if (!reviewerName || reviewerAt === null || record.reviewerDisposition !== "accepted") {
      errors.push("Approval requires an independent reviewer, review date and accepted disposition");
    }
    if (!ownerName || ownerAt === null || (record.decision !== "accessible" && record.decision !== "intentionally-sealed")) {
      errors.push("Approval requires an explicit design-owner decision and date");
    }
    if (!authorName || !reviewerName || !ownerName ||
        !distinctName(authorName, reviewerName) ||
        !distinctName(authorName, ownerName) ||
        !distinctName(reviewerName, ownerName)) {
      errors.push("Approval requires three distinct non-empty source-author, independent-reviewer and design-owner identities");
    }
    if (authorAt !== null && reviewerAt !== null && reviewerAt < authorAt) {
      errors.push("Independent review cannot predate the source author's completed trace");
    }
    if (reviewerAt !== null && ownerAt !== null && ownerAt < reviewerAt) {
      errors.push("Design-owner decision cannot predate the accepted independent review");
    }
    if (typeof record.evidenceSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(record.evidenceSha256)) {
      errors.push("Approval requires a source and route evidence SHA-256");
    }
    if (typeof record.evidencePath !== "string" || !record.evidencePath.trim()) {
      errors.push("Approval requires a relative path to the source and route evidence bundle");
    }
    if (record.routeEvidenceComplete !== true) {
      errors.push("Approval requires completed full-footprint connectivity evidence");
    }
    if (typeof record.notes !== "string" || !record.notes.trim()) {
      errors.push("Approval requires a written source-backed design rationale");
    }
  }
  return errors;
}
