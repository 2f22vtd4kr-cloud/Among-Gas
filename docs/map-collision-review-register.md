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

- Original custom map artwork: [recovered 1652 × 952 PNG](https://github.com/2f22vtd4kr-cloud/Among-Gas/blob/recovery/map-connectivity-regressions/attached_assets/1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png), SHA-256 c840fdafe3a1667616a44f6c64bb79fb5ba23c2ad54ba70461416dae153d1a80.
- Red-line collision reference: [1359 × 784 JPEG](https://github.com/2f22vtd4kr-cloud/Among-Gas/blob/recovery/map-connectivity-regressions/attached_assets/IMG_2907_1783632830477.jpeg), Git blob 4e6018afca7dd8eb27a8b460c3e51c6b58bc33b2.
- Detailed five-region review: [source-art boundary review register](https://github.com/2f22vtd4kr-cloud/Among-Gas/blob/recovery/map-connectivity-regressions/docs/map-connectivity-island-review.md).
- Source inventory and coordinate transform: [map geometry source manifest](https://github.com/2f22vtd4kr-cloud/Among-Gas/blob/recovery/map-connectivity-regressions/docs/map-geometry-source-manifest.md).

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

The five sector approach targets A–E are a separate acceptance set. They must continue to have full-player-footprint, spawn-connected routes; they are not the same thing as the five detached candidate pockets above.

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
