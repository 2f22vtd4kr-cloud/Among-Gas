# Gameplay-anchor source/review register

**Status: scaffold only — 0/24 author/reviewer dispositions are supplied by this file.** The automated route and interaction-LOS checks are not human source-authorship or review.

This register covers the canonical 24 anchors: 11 tasks, 6 vents, Admin Table, and 6 sabotage pads. Fill the machine-readable companion `gameplay-anchor-review-template.json` only after the source route and sight approach have been independently inspected. Each record must use a real author and a distinct independent reviewer, with chronological timestamps and separate movement and interaction-sight evidence files.

| Anchor | Source author | Independent reviewer | Movement evidence | Sight evidence | Disposition |
|---|---|---|---|---|---|
| `task-1` | Pending | Pending | Pending | Pending | Unresolved |
| `task-2` | Pending | Pending | Pending | Pending | Unresolved |
| `task-3` | Pending | Pending | Pending | Pending | Unresolved |
| `task-4` | Pending | Pending | Pending | Pending | Unresolved |
| `task-5` | Pending | Pending | Pending | Pending | Unresolved |
| `task-6` | Pending | Pending | Pending | Pending | Unresolved |
| `task-7` | Pending | Pending | Pending | Pending | Unresolved |
| `task-8` | Pending | Pending | Pending | Pending | Unresolved |
| `task-9` | Pending | Pending | Pending | Pending | Unresolved |
| `task-10` | Pending | Pending | Pending | Pending | Unresolved |
| `task-11` | Pending | Pending | Pending | Pending | Unresolved |
| `vent-1` | Pending | Pending | Pending | Pending | Unresolved |
| `vent-2` | Pending | Pending | Pending | Pending | Unresolved |
| `vent-3` | Pending | Pending | Pending | Pending | Unresolved |
| `vent-4` | Pending | Pending | Pending | Pending | Unresolved |
| `vent-5` | Pending | Pending | Pending | Pending | Unresolved |
| `vent-6` | Pending | Pending | Pending | Pending | Unresolved |
| `admin-table` | Pending | Pending | Pending | Pending | Unresolved |
| `sabotage-1` | Pending | Pending | Pending | Pending | Unresolved |
| `sabotage-2` | Pending | Pending | Pending | Pending | Unresolved |
| `sabotage-3` | Pending | Pending | Pending | Pending | Unresolved |
| `sabotage-4` | Pending | Pending | Pending | Pending | Unresolved |
| `sabotage-5` | Pending | Pending | Pending | Pending | Unresolved |
| `sabotage-6` | Pending | Pending | Pending | Pending | Unresolved |

## Required evidence per anchor

1. Identify the actual source-art object/interaction anchor and record its exact source reference and candidate commit.
2. Record a bidirectional approach using the production three-circle player-footprint movement contract; include spawn-connected route and reverse return.
3. Record interaction line-of-sight separately from movement. Do not infer LOS acceptance from a successful movement route.
4. Preserve the raw test/evidence bytes under `evidence/gameplay-anchors/<anchor-id>/movement/` and `.../sight/`; record each exact SHA-256.
5. Record source-author completion and independent-review timestamps. The reviewer must be a different person and must disposition the evidence as accepted or changes-requested.
6. Do not set either pass flag or the accepted disposition until the evidence is real, reviewed and tied to the candidate under consideration.

The release gate requires exactly one accepted record for every listed anchor. Blank scaffold values, CI fixtures, automated test success, or self-attested identities do not satisfy the gate. This register does not change collision geometry or authorize a production cut-over.
