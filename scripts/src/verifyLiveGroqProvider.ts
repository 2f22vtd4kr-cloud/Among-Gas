import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeEvidenceOutput } from "./safeEvidenceOutput.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const SUCCESS_TOKEN = "GROQ_LIVE_OK";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Performs one minimal provider-backed request and writes evidence metadata.
 * The API key is read only from the process environment and is never logged,
 * returned, or written to the evidence file.
 */
async function main(): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY ?? "";
  const testerName = (process.env.GROQ_VERIFIER_NAME ?? "").trim();
  const candidateCommit = (process.env.GROQ_VERIFICATION_COMMIT ?? "").trim();
  const model = (process.env.GROQ_MODEL ?? DEFAULT_MODEL).trim();
  const outputPath = process.env.GROQ_EVIDENCE_OUTPUT ??
    "artifacts/release-evidence/live-groq-verification.json";
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

  if (!/^gsk_[A-Za-z0-9_-]{20,240}$/.test(apiKey)) {
    throw new Error("GROQ_API_KEY is missing or has an invalid format; provide it through a secure environment variable.");
  }
  if (!testerName || testerName.length > 120) {
    throw new Error("GROQ_VERIFIER_NAME must identify the person performing the live provider check.");
  }
  if (!/^[a-f0-9]{40}$/i.test(candidateCommit)) {
    throw new Error("GROQ_VERIFICATION_COMMIT must be the exact 40-character candidate commit under test.");
  }
  const checkoutHead = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const destination = path.resolve(repoRoot, outputPath);
  const relativeOutput = path.relative(repoRoot, destination);
  if (path.isAbsolute(outputPath) || !relativeOutput || relativeOutput === ".." ||
      relativeOutput.startsWith(".." + path.sep) || path.isAbsolute(relativeOutput)) {
    throw new Error("GROQ_EVIDENCE_OUTPUT must stay inside the repository and use a relative path.");
  }
  const outputSegments = outputPath.split(/[\\/]/);
  if (outputSegments.length < 3 || outputSegments[0] !== "artifacts" ||
      outputSegments[1] !== "release-evidence" || !outputSegments.at(-1)?.endsWith(".json")) {
    throw new Error("GROQ_EVIDENCE_OUTPUT must be a JSON file beneath artifacts/release-evidence/.");
  }
  const gitOutputPath = relativeOutput.split(path.sep).join("/");
  const checkoutChanges = execFileSync("git", [
    "-C", repoRoot, "status", "--porcelain", "--untracked-files=all", "--", ".", ":!" + gitOutputPath,
  ], { encoding: "utf8" }).trim();
  if (checkoutHead.toLowerCase() !== candidateCommit.toLowerCase() || checkoutChanges) {
    throw new Error("The live Groq check must run from a clean checkout at GROQ_VERIFICATION_COMMIT.");
  }
  if (!model || model.length > 128) {
    throw new Error("GROQ_MODEL must be a non-empty model identifier up to 128 characters.");
  }

  const testedAt = new Date().toISOString();
  const scenario = "single authenticated live chat-completions request; exact-token response; no game secrets or player data";
  let httpStatus = 0;
  let requestId: string | null = null;
  let responseBody = "";
  let passed = false;
  let responseText: string | null = null;

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Reply with exactly GROQ_LIVE_OK and no other text." },
          { role: "user", content: "Confirm live provider connectivity. Return the exact token." },
        ],
        max_completion_tokens: 16,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    httpStatus = response.status;
    requestId = response.headers.get("x-request-id") ??
      response.headers.get("x-groq-request-id");
    responseBody = await response.text();
    if (response.ok) {
      try {
        const payload = JSON.parse(responseBody) as {
          choices?: Array<{ message?: { content?: unknown } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        responseText = typeof content === "string" ? content.trim() : null;
        passed = responseText === SUCCESS_TOKEN;
      } catch {
        passed = false;
      }
    }
  } catch {
    // Never persist provider exception text: implementations may include
    // request details, URLs or headers. The evidence record stores status only.
    passed = false;
  }

  // Persist only the exact expected token (and only on success), never the raw
  // provider response body. This creates a byte-verifiable response artifact
  // without retaining provider headers, unrelated completion text or secrets.
  const outputSegments = outputPath.split(/[\\\\/]/);
  const outputFile = outputSegments.pop()!;
  const responseEvidencePath = [...outputSegments, outputFile.replace(/\\.json$/i, "-response.json")].join("/");
  const responseEvidenceContent = JSON.stringify({
    version: 1,
    provider: "groq",
    candidateCommit,
    model,
    testedAt,
    httpStatus,
    requestId,
    responseToken: passed ? SUCCESS_TOKEN : null,
    responseTokenMatched: passed,
  }, null, 2) + "\\n";
  const responseEvidenceSha256 = sha256(responseEvidenceContent);
  await writeEvidenceOutput(repoRoot, responseEvidencePath, responseEvidenceContent);

  const record = {
    version: 1,
    provider: "groq",
    candidateCommit,
    model,
    testerName,
    testedAt,
    scenario,
    httpStatus,
    requestId,
    responseEvidencePath,
    responseEvidenceSha256,
    responseTokenMatched: passed,
    sessionCredentialOnly: true,
    passed,
    credentialPolicy: "GROQ_API_KEY read from process environment; never logged or persisted",
  };
  await writeEvidenceOutput(repoRoot, outputPath, JSON.stringify(record, null, 2) + "\\n");

  // Print only non-secret evidence metadata. Do not print the raw model response.
  console.log(JSON.stringify({
    ...record,
    outputPath: path.resolve(repoRoot, outputPath),
    responseEvidencePath: path.resolve(repoRoot, responseEvidencePath),
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

await main();
