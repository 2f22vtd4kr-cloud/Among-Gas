---
name: Artifact re-registration after import
description: How to re-register dropped artifact metadata after a GitHub import, including the current verifyAndReplaceArtifactToml signature.
---

# Artifact Re-registration After Import

Every GitHub import drops Replit artifact registration metadata. `listArtifacts()` returns empty and no workflows are configured, even though `artifacts/*/.replit-artifact/artifact.toml` files are intact.

## Fix sequence

1. Copy each artifact's `artifact.toml` to a sibling temp file:
   ```sh
   cp artifacts/telegram-game/.replit-artifact/artifact.toml artifacts/telegram-game/.replit-artifact/artifact.edit.toml
   # repeat for api-server, mockup-sandbox
   ```
2. Call `verifyAndReplaceArtifactToml` for each (in CodeExecution):
   ```js
   await verifyAndReplaceArtifactToml({
     tempFilePath: "/home/runner/workspace/artifacts/telegram-game/.replit-artifact/artifact.edit.toml",
     artifactTomlPath: "/home/runner/workspace/artifacts/telegram-game/.replit-artifact/artifact.toml"
   });
   ```
3. Run `pnpm install` (node_modules are not committed).
4. Restart workflows.

## Current API signature

`verifyAndReplaceArtifactToml({ tempFilePath: string, artifactTomlPath: string })`

**Both paths must be absolute** (`/home/runner/workspace/...`). The old single-arg `{ filePath }` form throws a validation error.

**Why:** The import drops Replit-internal registration state (not the TOML files themselves). Re-running the verify/replace tool re-registers each artifact and recreates its managed workflows without touching source code.

**How to apply:** Run this at the start of every session — check `listArtifacts()` first; if empty, run the sequence above.
