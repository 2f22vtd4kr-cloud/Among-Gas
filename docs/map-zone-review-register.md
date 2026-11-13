# Plan 2 — 12-zone map authoring and review register

**Baseline:** main `925a465458e8462cef8b6112daff90a0edc239b3`; world 3224×1858.  
**Purpose:** establish the non-overlapping 12-zone authoring/review partition required by Master Plan Phase 2. This is a work-allocation and evidence register only. It does not add, infer, approve or change any collision, vision or shadow geometry. The dev-only vector editor/API now uses this same Z01–Z12 partition, enforces primary-owner centroid assignment and stores each zone separately with its own 20-backup rotation. This is authoring infrastructure only; no zone is thereby traced, independently reviewed or owner-approved.

## Partition contract

- Four equal columns and three equal rows in canonical world coordinates.
- Zone bounds use half-open ownership intervals `[minX,maxX) × [minY,maxY)`, except the final east/south edges include the map maximum. This gives every in-bounds point exactly one primary zone.
- The existing CI 4×3 QA gallery uses overlapping 900×650 crops for visual context. Those crops are diagnostic images, not these non-overlapping authoring boundaries.
- Every zone review must include at least 24 world-pixel context beyond its owned boundary, so walls, paths, shadows and vision contours crossing a seam can be checked in both adjacent zones.
- A shape crossing a zone boundary has one primary owner (the zone containing its ground-footprint centroid); the adjacent zone reviewer must sign the seam continuity. No duplicate independent shapes across zones.
- World-to-image comparisons must use the source manifest's independent X/Y transforms. Never trace from a scaled screenshot without recording its exact source rectangle and transform.

## Zone status

| Zone | Working area label | World bounds [minX,minY,maxX,maxY] | Author trace | Independent review | Owner approval |
|---|---|---|---|---|---|
| Z01 | North-west rooms and entry | [0, 0.000, 806, 619.333] | Not traced | Not independently reviewed | Owner decision pending |
| Z02 | North-central cafeteria and upper furniture | [806, 0.000, 1612, 619.333] | Not traced | Not independently reviewed | Owner decision pending |
| Z03 | North-east generator approach | [1612, 0.000, 2418, 619.333] | Not traced | Not independently reviewed | Owner decision pending |
| Z04 | North-east technical / vehicle rooms | [2418, 0.000, 3224, 619.333] | Not traced | Not independently reviewed | Owner decision pending |
| Z05 | West-central machinery and pipe rooms | [0, 619.333, 806, 1238.667] | Not traced | Not independently reviewed | Owner decision pending |
| Z06 | Central lobby and statue garden | [806, 619.333, 1612, 1238.667] | Not traced | Not independently reviewed | Owner decision pending |
| Z07 | East-central offices and generator bay | [1612, 619.333, 2418, 1238.667] | Not traced | Not independently reviewed | Owner decision pending |
| Z08 | East service / vehicle perimeter | [2418, 619.333, 3224, 1238.667] | Not traced | Not independently reviewed | Owner decision pending |
| Z09 | South-west shop and shelving | [0, 1238.667, 806, 1858.000] | Not traced | Not independently reviewed | Owner decision pending |
| Z10 | South-central playground / service fixtures | [806, 1238.667, 1612, 1858.000] | Not traced | Not independently reviewed | Owner decision pending |
| Z11 | South-east service corridors | [1612, 1238.667, 2418, 1858.000] | Not traced | Not independently reviewed | Owner decision pending |
| Z12 | South-east admin and lower rooms | [2418, 1238.667, 3224, 1858.000] | Not traced | Not independently reviewed | Owner decision pending |

All 12 zones are currently **not traced / not reviewed** in this register. The 370-shape candidate in PR #138 is a five-sector A–E red-line movement trace and does not satisfy this 12-zone requirement.

## Required evidence per zone

1. Source image crop with exact source path, Git blob SHA, native dimensions, source rectangle and world transform.
2. Author-traced object/edge IDs with ground-footprint vertices and explicit independent `blocksMove`, `blocksSight` and `castsShadow` semantics. Do not infer sight/shadow from movement-only red lines.
3. Explicit doors/gaps and intended traversability, with no invented openings. Mark unknown design intent as unresolved.
4. Full-player-footprint paths in both directions for every intended doorway/corridor, including diagonal entry/exit and starts inside narrow passages.
5. Task, vent, Admin, sabotage, spawn and interaction anchors in the zone, with approach point, clearance, LOS and route result.
6. Collision, vision and shadow overlays rendered from the same source crop at desktop and mobile scale, with the source art visible beside them.
7. Author name/date and independent reviewer name/date, each with a written disposition. The author cannot self-approve.
8. Owner decision for any ambiguity affecting access, gameplay semantics, or a visible object whose collision/occlusion role is not evident.

## Per-zone review record workflow

The dev-only vector editor exposes a separate review record at
`/__vector-collision-api/zones/Z01/review` (replace Z01 with the selected zone).
Review records are stored separately from collision geometry, have independent
20-version backup rotation, and include:

- native source path, SHA-256, dimensions, crop rectangle and exact world transform;
- author name and completion date;
- independent reviewer name/date, disposition and notes; and
- design-owner name/date and explicit approve/reject/defer decision.

The API rejects a submitted record without source evidence, rejects an author
reviewing their own work, requires a reviewer before review completion, and
requires an accepted independent review plus a distinct design-owner approval
before the status can be `approved`. A rejected record must contain an explicit
reviewer change request or owner rejection.

**Identity limitation:** this is a local, self-attested audit record, not an
identity provider or cryptographic signature. It does not prove that the names
entered correspond to real reviewers or the design owner. The record must be
corroborated through the project's external review/approval process before any
geometry is considered production-eligible. An `approved` record is metadata
only and never changes runtime geometry or authorizes a cut-over.
## Cross-zone acceptance

- Test every adjacent seam for continuous walls, continuous walkable lanes and no duplicate/gapped contours.
- Test every named cross-zone route end-to-end using the complete three-circle player footprint, not a centerline.
- Include the five detached-region decisions C0/C20/C27/C38/C56 as cross-zone references where they overlap; their diagnostic IDs are not zone IDs.
- Review parking-car passages and paint-vs-solid markings as named route/classification items, not as generic connectivity counts.
- Review the statue/planter perimeter, bench/table movement collision, sight blocking and decorative shadow as separate semantic decisions.
- Preserve main's current production geometry until all affected zone and cross-zone approvals are complete.

## Current release decision

**NOT APPROVED** The 12-zone authoring/review requirement remains open. This register makes the ownership boundaries explicit; it is not evidence that any zone has been authored, independently reviewed or owner-approved.


**Baseline note (2026-11-13):** PR #144 merged this review register to main at `a8ccf734066d16178c0c7f8537bf82d82f3aef13`. No geometry was changed or approved by that documentation merge.
