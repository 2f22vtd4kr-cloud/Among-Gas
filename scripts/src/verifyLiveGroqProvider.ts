import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
  const model = (process.env.GROQ_MODEL ?? DEFAULT_MODEL).trim();
  const outputPath = process.env.GROQ_EVIDENCE_OUTPUT ??
    "artifacts/release-evidence/live-groq-verification.json";

  if (!/^gsk_[A-Za-z0-9_-]{20,240}$/.test(apiKey)) {
    throw new Error("GROQ_API_KEY is missing or has an invalid format; provide it through a secure environment variable.");
  }
  if (!testerName || testerName.length > 120) {
    throw new Error("GROQ_VERIFIER_NAME must identify the person performing the live provider check.");
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

  const record = {
    version: 1,
    provider: "groq",
    model,
    testerName,
    testedAt,
    scenario,
    httpStatus,
    requestId,
    responseEvidenceSha256: sha256(responseBody),
    responseTokenMatched: passed,
    sessionCredentialOnly: true,
    passed,
    credentialPolicy: "GROQ_API_KEY read from process environment; never logged or persisted",
  };
  const destination = path.resolve(outputPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(record, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });

  // Print only non-secret evidence metadata. Do not print the raw model response.
  console.log(JSON.stringify({ ...record, outputPath: destination }, null, 2));
  if (!passed) process.exitCode = 1;
}

await main();
