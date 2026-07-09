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

## Recurring import failure mode

Every re-import of this project so far has dropped artifact registration (`listArtifacts()` returns empty, workflows missing) and wiped `node_modules`, even though `artifact.toml` files and source code are untouched.

**Why:** Import doesn't preserve the platform-side artifact registration metadata or installed dependencies, only the repo contents.

**How to apply:** At the start of a session, if workflows are missing/fail to start: (1) run `pnpm install`, (2) for each `artifacts/*/.replit-artifact/artifact.toml`, copy it to a sibling `artifact.edit.toml` and call `verifyAndReplaceArtifactToml()` with no content changes to re-register, then restart workflows.
