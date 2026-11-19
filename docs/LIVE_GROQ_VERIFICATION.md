# Live Groq provider verification

Run from the repository root with the scripts workspace installed:

```bash
GROQ_API_KEY='<securely-injected-session-key>' \
GROQ_VERIFIER_NAME='<tester identity>' \
pnpm --filter @workspace/scripts verify:groq-live
```

Optional environment variables:
- `GROQ_MODEL` — defaults to `openai/gpt-oss-120b`.
- `GROQ_EVIDENCE_OUTPUT` — defaults to `artifacts/release-evidence/live-groq-verification.json`.

The command sends one minimal chat-completions request containing no player or game data and requires the exact `GROQ_LIVE_OK` response. It writes only provider/model, tester, timestamp, HTTP status, provider request ID, response-body SHA-256, pass/fail, and the session-only credential policy. It never writes the API key or raw response and never logs provider exception details.

A missing/invalid key, timeout, provider error or non-matching response exits non-zero. The evidence record is only a provider connectivity check; the game-specific bot behaviour and reconnect flow must still pass their own tests. Do not commit a real key or a generated evidence record containing private operational metadata.
