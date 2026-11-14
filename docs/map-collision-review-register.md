# Map collision review register — evidence vs design approval

Updated: 2026-11-10

Status: **reviewed against the recovered source-art and red-line references; the five isolated-region dispositions remain provisional and are not approved for production collision cut-over.**

This register records what can be established from current repository evidence without converting an inferred visual boundary into a gameplay decision. It is deliberately separate from production collision geometry. No polygons, masks, player movement rules, or vision occluders are changed by this document.

## Coordinate and footprint contract

- Runtime map: 3224 × 1858 world pixels.
- Fine movement mask: 680 × 392 cells (approximately 4.741 × 4.740 world pixels per cell).
- Player footprint: 4 px feet-circle radius and 10 px horizontal half-width; sprite-centre-to-feet offset is 31 px.
- Client prediction and authoritative server movement must continue to use the same shared swept-footprint/path contract.
- The compact 104 × 58 mask remains a navigation/editor representation; it is not an interchangeable substitute for fine-grid movement validation.

## Evidence sources

- Original custom map artwork: [recovered 1652 × 952 PNG](../attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png), SHA-256 c840fdafe3a1667616a44f6c64bb79fb5ba23c2ad54ba70461416dae153d1a80.
- Red-line collision reference: [1359 × 784 JPEG](../attached_assets/IMG_2907_1783632830477.jpeg), Git blob 4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2.
- Detailed five-region review: [source-art boundary review register](map-connectivity-island-review.md).
- Source inventory and coordinate transform: [map geometry source manifest](map-geometry-source-manifest.md).

The recovered review compared each listed boundary with both source references. The labels below describe visible source-art features; they do not establish whether a room or enclosure should be playable.

## Five detached source-art regions

| Candidate | World bounds [minX,minY,maxX,maxY] | Observed source-art feature | Current recovery-branch interpretation | Design status |
|---|---|---|---|---|
| C0 | [1337,19,2138,270] | Upper cafeteria furniture/bench strip behind a continuous partition | Irregular prop/furniture contour; keep adjacent cafeteria floor open | **Owner sign-off pending** |
| C20 | [597,507,929,801] | Northwest tank/pipe machinery enclosure behind a continuous wall | Irregular machinery contour; keep surrounding corridor open | **Owner sign-off pending** |
| C27 | [597,673,1645,1531] | South-central playground/service-fixture enclosure | Irregular equipment contour; keep surrounding paths open | **Owner sign-off pending** |
| C38 | [1821,801,2589,1327] | East office / vehicle-service bay; internal floor and van silhouette are visible behind a continuous perimeter, with no doorway visible in the references | Preserve the bay interior and van clearance, but keep the current perimeter blocked; do not invent an entry | **Owner sign-off pending** |
| C56 | [147,1209,427,1555] | Southwest shelving/canister display interior behind a diagonal wall | Irregular shelving/display contour; keep adjacent shop floor open | **Owner sign-off pending** |

The C0/C20/C27/C38/C56 identifiers are retained from the review register as diagnostic labels. They are scan-order component IDs, not runtime identifiers. The table does not treat any of these areas as approved inaccessible or approved accessible spaces.

## Working candidate disposition for continued verification — 2026-11-12

For this candidate's verification, use the conservative no-entry default for all five regions: retain the existing source-art perimeters as movement boundaries, preserve the surrounding playable corridors, and add no door, entrance, vent, teleport, or collision hole that is not present in the source art.

| Candidate | Working disposition | Explicit non-change |
|---|---|---|
| C0 | Retain the upper cafeteria furniture/partition boundary; keep adjacent cafeteria floor and corridor routes open | Do not invent an opening through the partition |
| C20 | Retain the tank/pipe machinery enclosure boundary; keep its surrounding corridor open | Do not turn the machinery enclosure into a traversable shortcut |
| C27 | Retain the south-central playground/service-fixture perimeter; keep surrounding paths open | Do not invent a door through the equipment enclosure |
| C38 | Keep the east vehicle-service bay perimeter blocked while preserving its existing internal bay floor and van-clearance geometry | Do not add a bay entrance or change the van footprint |
| C56 | Retain the southwest shelving/display boundary; keep the adjacent shop floor open | Do not add a passage through the diagonal shelving wall |

This is a conservative working disposition for candidate implementation and route verification, **not a claim that a design owner has approved the game-design intent**. The owner-approval fields below remain pending until the owner or an independent reviewer confirms the five decisions. The vector movement runtime remains a candidate and must not be deployed or treated as final production geometry until all release gates pass.


The 12-zone authoring/review partition is tracked in [map-zone-review-register.md](map-zone-review-register.md); all 12 zones are currently untraced and unreviewed. The five sector approach targets A–E are a separate acceptance set. They must continue to have full-player-footprint, spawn-connected routes; they are not the same thing as the five detached candidate pockets above.

## Remaining classification questions

1. **Parking-car corridors:** a generic connectivity or centreline test is not sufficient. Each intended gap needs a named route around/between the actual parked-car silhouettes, swept using the complete player footprint in both directions, including diagonal entry/exit and a player starting inside the passage. Capture the first rejected movement sample and minimum clearance.
2. **Planter / pedestal contours:** do not create a synthetic rectangle or broad circle from a visual guess. The former unsupported statue-pedestal occluder was removed; any replacement must follow a source-art contour and be separately evaluated for movement, sight and decorative shadow.
3. **Parking lines versus solid boundaries:** classify each line from the recovered art and red-line reference. Paint/markings are not blockers unless the canonical collision/design contract says they are.
4. **Collision versus vision:** a movement-only line must not automatically become a sight blocker or decorative shadow. Preserve independent contracts and validate each from the same reviewed object geometry when such geometry is approved.

## Production status on main

At the main baseline used for this review, the manual collision overrides are limited to the green service-van silhouette and the east-generator approach aisle. The four prop/furniture contour candidates and the east-bay isolation interpretation on the recovery branch have **not** been promoted to main. Do not describe the recovery-branch polygons as production geometry.

Live vector collision remains a candidate/review tool. A production cut-over requires all of the following:

- Explicit owner disposition for each of the five detached candidate regions, including intended door/entry behaviour.
- Source-backed, independently traced contours rather than broad inferred blockers.
- Named full-footprint route tests for every intended room/corridor and parked-car passage.
- Client/server/bot movement parity and regression against spawn, task, vent, Admin and sabotage anchors.
- Separate wall-vision and shadow-contour review; movement collision alone is not proof of visual occlusion.
- Exact-head CI plus inspected full-map and per-sector visual QA at desktop and mobile DPR.

**Decision rule:** where design intent is unknown, preserve the current production geometry and mark the region unresolved. If a region is meant to be accessible, author the doorway in the source map art and add a swept-path regression through it. Do not punch an undocumented collision hole to satisfy a connectivity count.
