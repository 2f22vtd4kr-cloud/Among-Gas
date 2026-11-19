import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createGroqResponseEvidence } from "./groqEvidence";

const input = {
  candidateCommit: "a".repeat(40),
  model: "openai/gpt-oss-120b",
  testedAt: "2026-11-19T20:00:00.000Z",
  httpStatus: 200,
  requestId: "req-redacted-example",
  passed: true,
};
const passed = createGroqResponseEvidence(input);
assert.equal(passed.sha256, createHash("sha256").update(passed.content, "utf8").digest("hex"));
const passedRecord = JSON.parse(passed.content);
assert.equal(passedRecord.responseToken, "GROQ_LIVE_OK");
assert.equal(passedRecord.responseTokenMatched, true);
assert.equal(passedRecord.candidateCommit, input.candidateCommit);
assert.doesNotMatch(passed.content, /GROQ_API_KEY|Bearer |rawResponse|responseBody/);

const failed = createGroqResponseEvidence({ ...input, passed: false });
const failedRecord = JSON.parse(failed.content);
assert.equal(failedRecord.responseToken, null);
assert.equal(failedRecord.responseTokenMatched, false);
assert.equal(failed.sha256, createHash("sha256").update(failed.content, "utf8").digest("hex"));

console.log("PASS: Groq response evidence is redacted, candidate-bound and byte-hash reproducible");
