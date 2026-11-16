export const DISCONNECTED_REGION_IDS = ["C0", "C20", "C27", "C38", "C56"] as const;
export type DisconnectedRegionId = typeof DISCONNECTED_REGION_IDS[number];
export type DisconnectedRegionDecision = "accessible" | "intentionally-sealed" | "deferred";
export type DisconnectedRegionReviewStatus = "not-started" | "in-review" | "approved";

export interface DisconnectedRegionReviewRecord {
  id: DisconnectedRegionId;
  status: DisconnectedRegionReviewStatus;
  reviewerName: string;
  ownerName: string;
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

/** Empty review scaffold. It explicitly records no access decision or approval. */
export function createDefaultDisconnectedRegionReviewRecord(
  id: DisconnectedRegionId,
): DisconnectedRegionReviewRecord {
  return {
    id,
    status: "not-started",
    reviewerName: "",
    ownerName: "",
    decision: "deferred",
    evidenceSha256: "",
    evidencePath: "",
    routeEvidenceComplete: false,
    notes: "Pending source-art review, full-footprint connectivity evidence and explicit design-owner decision. Do not infer accessibility from the raster component alone.",
  };
}

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
  if (typeof record.reviewerName !== "string" || record.reviewerName.length > 120) {
    errors.push("Reviewer name must be a string up to 120 characters");
  }
  if (typeof record.ownerName !== "string" || record.ownerName.length > 120) {
    errors.push("Design-owner name must be a string up to 120 characters");
  }
  if (record.decision !== "accessible" && record.decision !== "intentionally-sealed" && record.decision !== "deferred") {
    errors.push("Decision must be accessible, intentionally-sealed or deferred");
  }
  if (typeof record.evidenceSha256 !== "string" ||
      (record.evidenceSha256 !== "" && !/^[a-f0-9]{64}$/i.test(record.evidenceSha256))) {
    errors.push("Evidence SHA-256 must be empty or a 64-character hexadecimal digest");
  }
  if (typeof record.evidencePath !== "string" || record.evidencePath.length > 512 ||
      (record.evidencePath !== "" && (record.evidencePath.startsWith("/") ||
        record.evidencePath.split(/[\\\\/]/).some(part => part === ".." || part === ".")))) {
    errors.push("Evidence path must be empty or a safe relative path within this region's evidence directory");
  }
  if (typeof record.routeEvidenceComplete !== "boolean") {
    errors.push("routeEvidenceComplete must be boolean");
  }
  if (typeof record.notes !== "string" || record.notes.length > 2_000) {
    errors.push("Review notes must be a string up to 2,000 characters");
  }
  if (record.status === "not-started") {
    if (record.decision !== "deferred") errors.push("A not-started record must remain deferred");
    if (typeof record.reviewerName === "string" && record.reviewerName.trim()) {
      errors.push("A not-started record cannot claim an independent reviewer");
    }
    if (typeof record.ownerName === "string" && record.ownerName.trim()) {
      errors.push("A not-started record cannot claim a design-owner decision");
    }
    if (typeof record.evidenceSha256 === "string" && record.evidenceSha256.trim()) {
      errors.push("A not-started record cannot claim source or route evidence");
    }
    if (record.routeEvidenceComplete === true) {
      errors.push("A not-started record cannot claim completed route evidence");
    }
  }
  if (record.status === "approved") {
    const reviewer = typeof record.reviewerName === "string" ? record.reviewerName.trim() : "";
    const owner = typeof record.ownerName === "string" ? record.ownerName.trim() : "";
    if (!reviewer || !owner || reviewer.toLowerCase() === owner.toLowerCase()) {
      errors.push("Approval requires distinct non-empty independent reviewer and design-owner names");
    }
    if (record.decision === "deferred") errors.push("design disposition remains deferred");
    if (record.decision !== "accessible" && record.decision !== "intentionally-sealed" && record.decision !== "deferred") {
      errors.push("Approval requires an explicit accessible or intentionally-sealed decision");
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
