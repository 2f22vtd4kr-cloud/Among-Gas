# Detached-region review records

These five JSON files are **review scaffolds**, not geometry and not design decisions:

- C0
- C20
- C27
- C38
- C56

Each record starts with `status: not-started`, `decision: deferred`, no owner/reviewer identities, no evidence digest and incomplete route evidence. The five components are diagnostic connected-component IDs, not map-zone identifiers.

Use the dev-only Vector Collision Editor section **Detached-region owner decisions** to load and save a record. A record may be saved as `in-review` while evidence is gathered. It can only be marked `approved` when it includes:

1. A source-backed decision of `accessible` or `intentionally-sealed`.
2. Distinct independent reviewer and design-owner names.
3. A SHA-256 digest for the source and route evidence.
4. Completed full-player-footprint connectivity evidence.
5. A written rationale.

The editor records self-attested names; it does not authenticate identities. Saving a record does not alter geometry, collision, navigation or live gameplay. No area is made accessible or sealed by these templates.
