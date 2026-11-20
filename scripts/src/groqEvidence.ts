import { createHash } from "node:crypto";

export interface GroqResponseEvidenceInput {
  candidateCommit: string;
  model: string;
  testedAt: string;
  httpStatus: number;
  requestId: string | null;
  passed: boolean;
}

/** A minimal, redacted byte artifact; never retain the raw provider response. */
export function createGroqResponseEvidence(input: GroqResponseEvidenceInput): {
  content: string;
  sha256: string;
} {
  const content = JSON.stringify({
    version: 1,
    provider: "groq",
    candidateCommit: input.candidateCommit,
    model: input.model,
    testedAt: input.testedAt,
    httpStatus: input.httpStatus,
    requestId: input.requestId,
    responseToken: input.passed ? "GROQ_LIVE_OK" : null,
    responseTokenMatched: input.passed,
  }, null, 2) + "\n";
  return {
    content,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}
