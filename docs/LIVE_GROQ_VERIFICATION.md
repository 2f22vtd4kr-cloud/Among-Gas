# Live Groq provider verification

Run from the repository root with the scripts workspace installed:

```bash
GROQ_API_KEY='<securely-injected-session-key>' \
GROQ_VERIFIER_NAME='<tester identity>' \
GROQ_VERIFICATION_COMMIT='<exact 40-character candidate commit>' \
pnpm --filter @workspace/scripts verify:groq-live
```

Required environment variables:
- `GROQ_VERIFICATION_COMMIT` — exact candidate commit being tested; the command verifies that the current checkout is clean and at this commit.

Optional environment variables:
- `GROQ_MODEL` — defaults to `openai/gpt-oss-120b`.
- `GROQ_EVIDENCE_OUTPUT` — defaults to `artifacts/release-evidence/live-groq-verification.json`; it must be a `.json` file beneath `artifacts/release-evidence/`.

The evidence output path is restricted to `artifacts/release-evidence/` so an environment override cannot overwrite repository control files. Existing evidence records are never overwritten; choose a new filename for each run.

The command sends one minimal chat-completions request containing no player or game data and requires the exact `GROQ_LIVE_OK` response. It writes two non-overwriting JSON files: a provider metadata record and a separate redacted response-evidence file containing only the exact success token (or `null` on failure), candidate commit, model, timestamp, HTTP status and request ID. The metadata record includes the relative `responseEvidencePath` and the SHA-256 of the exact response-evidence file bytes, so the release byte-verifier can recompute it. The raw provider response body and API key are never persisted, and provider exception details are never logged.

A missing/invalid key, timeout, provider error or non-matching response exits non-zero. The evidence record is only a provider connectivity check; the game-specific bot behaviour and reconnect flow must still pass their own tests. Do not commit a real key or a generated evidence record containing private operational metadata.
