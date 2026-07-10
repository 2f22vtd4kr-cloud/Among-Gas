---
name: Dev-only file-write endpoints in Vite artifacts
description: Pattern and pitfalls for adding an in-app editor that writes back to a source file via a Vite dev-server-only middleware (used for the telegram-game collision editor).
---

When a static-build artifact (no backend at runtime, e.g. Vite apps deployed as static sites) needs an in-app "editor + commit" tool that persists to a source file, implement it as a Vite plugin middleware with `apply: 'serve'` in `vite.config.ts`, not as a real API route. It only exists under `pnpm dev`; the production static build has no server to receive it, so gate the UI's save action on `import.meta.env.DEV`.

**Why:** Cross-artifact imports are disallowed by workspace convention, so a separate api-server can't cleanly read/write files inside another artifact's `src/`. Keeping it inside the same Vite process is the smallest-footprint option and matches how the dev-only tool is actually used (by a developer running the workspace, not end users).

**How to apply:**
- Any endpoint that writes to disk from the browser needs real hardening even in "dev only" framing, because the dev server is reachable over the network (Replit preview proxy): require a custom header (e.g. `X-My-Tool: 1`) that native HTML forms can never set — this forces a CORS preflight, and since the dev server doesn't grant CORS, cross-origin browsers block the real request. This closes the classic `enctype="text/plain"` JSON-CSRF trick without needing a full token exchange.
- Validate exact shape AND value domain of incoming data (e.g. every array element is strictly `0`/`1`, not just correct length) — don't rely on truthy coercion.
- Cap request body size while streaming (before `JSON.parse`), reject early with 413.
- If the UI tracks "unsaved changes", diff the live working state against a saved baseline snapshot, not against undo-history-stack length — a capped/truncated history stack will silently under-report dirtiness once it overflows.
