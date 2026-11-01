# Fine-grid disconnected-region review register

Status: **open — all five regions unclassified**  
Baseline: `main` `aef0f099e8924ec1d58359521ce8d235b762c38d`  
Diagnostic branch: `recovery/map-connectivity-regressions`

This register captures candidate regions produced by the shared-production fine-grid diagnostic. The region IDs come from scan order and are not stable identifiers across mask revisions. Use the world bounds and source-image coordinates together.

## Evidence

- Production player footprint: 4 px radius, 10 px horizontal half-width, 31 px sprite-centre-to-feet offset.
- Connectivity nodes use `isPlayerFootprintWalkableAtFeet`; edges use `isPlayerPathWalkable` (<=2 px path samples), the same shared geometry consumed by client/server movement.
- Spawn sprite centre: (1395,481); feet anchor: (1395,512); spawn-connected component: 1.
- Fine grid: 680×392 at approximately 4.741×4.740 world px/cell.
- 72 total player-clearance components; five are larger than 1,000 cells and are outside the spawn component.
- All 24 required gameplay anchors (11 tasks, 6 vents, 1 Admin Table, 6 sabotage pads) have at least one spawn-connected full-footprint and line-of-sight approach.
- All five previously defined sector targets A–E also have a spawn-connected full-footprint approach.

Latest relevant evidence:
- [CI run 41282246380](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/41282246380), artifact [13074385240](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/41282246380/artifacts/13074385240): distinct-colour component map and annotated source-map nearest-boundary overlay.
- [CI run 41281847144](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/41281847144): all 24 gameplay anchors and all five sector targets report a valid approach in spawn component 1.

The nearest-boundary calculation is a coordinate-space distance transform that deliberately ignores obstacles. Its two points are review locators, **not** a navigable route and **not** an instruction to make the intervening cells walkable.

## Candidate region table

| Component ID | Valid cells | World bounds [minX,minY,maxX,maxY] | Spawn-side source px | Region-side source px | Approx. gap | Initial visual hypothesis — not a decision | Disposition |
|---:|---:|---|---|---|---:|---|---|
| 27 | 11,463 | [597,673,1645,1531] | [698,351] | [684,365] | 47 px | South edge of central atrium / lower central passage | **UNCLASSIFIED** |
| 38 | 3,077 | [1821,801,2589,1327] | [1002,343] | [1016,357] | 47 px | East office / vehicle-service boundary | **UNCLASSIFIED** |
| 20 | 2,719 | [597,507,929,801] | [311,201] | [299,215] | 44 px | Upper-left blue equipment or pool enclosure | **UNCLASSIFIED** |
| 0 | 2,509 | [1337,19,2138,270] | [629,59] | [613,43] | 54 px | Northern edge of upper cafeteria / atrium | **UNCLASSIFIED** |
| 56 | 2,304 | [147,1209,427,1555] | [153,631] | [137,615] | 54 px | Southwest utility forecourt / shop boundary | **UNCLASSIFIED** |

World bounds are in the 3224×1858 map coordinate system. Source coordinates refer to `attached_assets/IMG_2907_1783632830477.jpeg`, 1359×784 pixels.

## Required review for each region

Lead 2 (collision/pathing) owns the classification; Lead 5 (sector QA) independently checks the room/route semantics. For every row, record:

1. **Room/prop identity:** name the visible room, floor, water, equipment or decorative object inside the region using the source artwork.
2. **Intended player access:** state whether a human player is meant to stand/walk there during normal play. Do not infer access solely from a large open-looking raster component.
3. **Boundary semantics:** identify the actual red-line/wall/prop edge that separates it from the spawn network. Distinguish a real solid wall or object base from a missing/open doorway.
4. **Door/path decision:** if it is intended walkable space, mark the exact intended crossing and prove the complete production player footprint can traverse it. If it is not playable floor, document the named reason and prove that no gameplay anchor is placed exclusively inside it.
5. **Regression:** add a named region/doorway probe; do not key exclusions only by ephemeral component ID.

### Allowed final dispositions

- `PLAYABLE — REPAIR REQUIRED`: the artwork/game design shows a real floor/corridor that should connect to spawn. Add a tightly bounded, source-aligned geometry correction and a swept-path regression.
- `INTENTIONALLY NON-PLAYABLE`: the region is water, a prop interior, exterior/decorative space, or otherwise not a legal player floor. Keep it blocked by named object/region geometry and add a regression that verifies both its blocked footprint and the surrounding intended walkable route.
- `INTENTIONALLY ISOLATED ROOM`: only allowed if the game design explicitly supports an isolated room/zone and its entry/exit mechanics are documented. This is not currently established for any listed region.
- `UNRESOLVED`: keep the gate open; no whitelist or collision change.

## Review checklist

- [ ] C27 reviewed against the central atrium south threshold and lower central passage.
- [ ] C38 reviewed against the east office / vehicle-service boundary.
- [ ] C20 reviewed against the upper-left blue equipment/pool silhouette.
- [ ] C0 reviewed against the upper north cafeteria/atrium boundary.
- [ ] C56 reviewed against the southwest forecourt/utility boundary.
- [ ] Every region has a named disposition with source-art evidence.
- [ ] Every playable region has a fine-grid continuous player-footprint route test.
- [ ] Every non-playable region has a named blocked-object/area regression and nearby walkable-approach checks.
- [ ] The full fine-grid diagnostic still verifies all 24 gameplay anchors and five sector targets.
- [ ] Full CI is rerun on the exact PR head after any production geometry change.

## Current decision

**Do not edit production collision data yet.** The fine-grid check proves five large clearance islands exist, but the defined tasks, vents, Admin Table, sabotage pads, and five sector targets remain reachable from spawn. The visual/source-art review must decide which islands are false-positive walkable areas and which are genuine missing room connections. The global topology assertion remains red until each region has an explicit, defensible disposition.
