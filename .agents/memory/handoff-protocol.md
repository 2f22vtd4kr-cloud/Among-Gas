---
name: Handoff protocol
description: Every session must read handoff.md first and append to it before finishing.
---

# Handoff Protocol

**Rule:** At the start of every session, read `handoff.md` before doing anything else.

**Why:** The project uses `handoff.md` as a persistent, human-readable session log. It records what was built, decisions made, and where work left off. `replit.md` contains an explicit agent instruction enforcing this.

**How to apply:**
1. On session start → `ReadFile("handoff.md")` before any other work.
2. After meaningful work → append a new dated entry to `handoff.md` following the format at the top of that file.
3. Commit `handoff.md` with the rest of your changes so it stays in the repo.

**Format defined in:** `handoff.md` (top section).
