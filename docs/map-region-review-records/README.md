# Detached-region review records

These five JSON files are **review scaffolds**, not geometry and not design decisions:

- C0
- C20
- C27
- C38
- C56

Each record starts with `status: not-started`, `decision: deferred`, no author/reviewer/owner identities or dates, no evidence digest and incomplete route evidence. The five components are diagnostic connected-component IDs, not map-zone identifiers.

Use the dev-only Vector Collision Editor section **Detached-region owner decisions** to load and save a record. A record may be saved as `in-review` while evidence is gathered. It can only be marked `approved` when it includes:

1. A named source author and completion date for the source-art/route trace.
2. A distinct independent reviewer, review date and explicit `accepted` disposition.
3. A third, distinct design owner with a dated `accessible` or `intentionally-sealed` decision. The validator enforces author → reviewer → owner chronology.
4. A relative path to a committed source/route evidence bundle and its matching SHA-256 digest. The dev API verifies that the file exists, stays inside the region evidence directory, and hashes to the recorded value.
5. Completed full-player-footprint connectivity evidence and a written rationale.

Keep each evidence bundle under its own region directory, for example `C0/evidence/` or `C20/evidence/`. The record stores a path relative to that region directory (for C0, `evidence/C0-evidence.json`). The API rejects references into another region's evidence namespace. The editor records self-attested names and dates; it does not authenticate identities. The three-role and chronology checks prevent accidental/self-approval but are not cryptographic proof of who made a decision. Saving a record does not alter geometry, collision, navigation or live gameplay. No area is made accessible or sealed by these templates.
