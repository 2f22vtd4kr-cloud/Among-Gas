# Plan v2 implementation audit

**Audit date:** 2026-11-08  
**Audited baseline:** main at 82433bc5adf65f427c113f5a9d6df6e26ecf6139  
**Implementation branch:** work/plan-v2-map-refinement-hardening  
**Release status:** NOT READY. This audit does not authorize Replit/Vercel access, a production deployment, or live vector-collision cut-over.

## Executive result

Plan v2 is partly implemented already. The most substantial completed work is the 2× tiled-map delivery path and its browser integration, the initial vector-collision engine/editor foundation, the player sprite atlas, the five existing minigames, and several server-authoritative movement/bot/gameplay improvements. The main unfinished work is not another basic tile splitter or a generic collision-grid rewrite. It is (1) genuine source-preserving tile refinement beyond sharpening, (2) author-traced and independently reviewed map geometry, followed by route- and vision-validated runtime cut-over, (3) complete editor and HUD acceptance evidence, and (4) product refactoring, multi-client gameplay and release gates.

This branch implements the safe tooling and lifecycle/test gaps that can be addressed without inventing map contours or breaching the active recovery restrictions. It intentionally does not promote any generated geometry or visual candidate into live gameplay.

## Requirement-by-requirement assessment

| Plan v2 area | State on audited main | What already exists | Remaining work / decision |
|---|---|---|---|
| Single map coordinate system and exact 2× transform | DONE in source; device QA incomplete | Logical world is 3224×1858. Runtime texture path uses an exact 6448×3716 master, a 1612×929 overview and a 7×4 manifest of 28 tiles. Tile world rectangles are exact halves of their texture rectangles. Transform tests cover full-map and interior crops. | Preserve current transform and run on real target devices after recovery restrictions are lifted. |
| Tiled renderer integrated into gameplay | DONE in source; hardening added in this branch | GameMap loads map-overview.webp, then optional map-tiles or map-tiles-sharp based on map-art=sharp; visible detail tiles are drawn over the overview. If tile loading fails, the overview remains a complete fallback. Runtime no longer selects the old full-size PNG/WebP as its display path. | Execute the browser smoke on CI and real devices, capture visual evidence at planned viewports, and assess decoded memory and first-frame timing on actual mobile hardware. |
| Tile generation and pixel-fidelity QA | DONE for baseline and optional sharpened sets | Existing buildMapTiles.ts and mapTilePipeline.ts regenerate baseline and sharpened WebP sets, their manifests and the 1612×929 overview from map-hires.webp. Existing TypeScript QA checks geometry, source digests, pixel/edge fidelity and synthetic regressions. The supplied archive's two 28-tile sets reconstruct to complete masters. | The sharpened set is not new detail. Preserve it as an optional visual variant only; do not treat sharpness as evidence of a super-resolution result. |
| Stage 1 faithful enhancement | PARTLY DONE | There is a faithful 2× resample baseline, exact tile geometry and an optional sharpened candidate. | A documented, reproducible comparison against the original map and visual approval are still required. No unreviewed variant should replace production art. |
| Stage 2 context-aware image-to-image refinement | NOT DONE as artwork; TOOLING ADDED in this branch | Main had no context-crop, overlap-blend and generated-tile QA workflow. This branch adds context crop preparation, a manifest, cosine-feathered stitching, core-only stitching, validation against mixed dimensions, and separate colour/geometry/edge/seam QA. | No AI/SR model output has been generated or supplied. Run the model offline, retain prompts/model/version metadata, inspect the gallery, and require QA plus owner review. Generated candidates stay outside public runtime assets. |
| Manifest integrity and tile runtime lifecycle | PARTLY DONE on main; HARDENED in this branch | Main validates fixed world dimensions, tile count, tile row/column, rectangles and safe filename pattern. It loads images lazily and maintains an LRU-style cache. | This branch adds strict canonical tile filenames, finite positive camera/zoom/DPR validation, restoration of caller canvas smoothing settings, deterministic one-device-pixel edge bleed, status snapshots, explicit retry of failed tiles, cancellation of pending image requests, and disposal/eviction cleanup. Regression tests are wired through the scripts package; exact-head CI is still required. |
| Mobile vector editor foundation | PARTLY DONE; substantial editor-only functionality added in this branch | Main already has pointer editing, pinch takeover, freehand active chains, endpoint snapping, RDP simplification, undo/redo, local draft restore, import/export and full-document candidate save/hash/20 backups. This branch adds candidate-only long-press vision preview (shared raycast), 4× source/candidate loupe, analysis of point-vs-three-circle clearance, spawn-connected nav components, disconnected islands, narrow corridors, all 11 shared task + 6 vent approaches with LOS, and separate Z01–Z12 zone load/save files, matching the canonical 4×3 partition, with centroid-based primary ownership and independent 20-backup rotation. | Browser acceptance on the exact current head remains pending. Remaining authoring/review gaps: verified snap/magnet ergonomics, a reviewable per-zone approval/disposition workflow, independent author/reviewer sign-off, and completed source-traced real map geometry. Analyzer and preview are diagnostic only and do not edit or approve contours. |
| Candidate zone save/load and version history | ADDED in this branch; exact-head tests pending | Dev-only same-origin endpoints `/__vector-collision-api/zones/Z01` through `/zones/Z12` store each zone in a separate candidate file; zone writes reject mixed-zone shapes and shapes whose ground-footprint centroid belongs to another primary zone, return SHA-256 and retain 20 backups per zone. The UI can load a saved zone into the unsaved working document or save the current zone without overwriting the full candidate. | Run the existing API test suite and mobile browser smoke on the final head. Add author/reviewer disposition and approval metadata before any candidate can be accepted for runtime use. The 12-zone endpoints and centroid ownership rules are authoring infrastructure only; all 12 zone traces, independent reviews and owner approvals remain outstanding. |
| Collision model and live cut-over | FOUNDATION ONLY; NOT PRODUCTION-READY | Shared vector collision document/schema/engine, validation, rasterization helpers and editor walk preview exist. Walk preview calls the vector engine's production feet movement method. Movement currently uses the established fine-grid asymmetric feet footprint; bot navigation derives a clearance-aware grid from that source. | Live client, server, bots and vision still rely on raster/fine-grid and separate vision derivations. The canonical author-traced and reviewed vector map is not complete. No cut-over or deletion of raster sources is allowed until the 4×3 regional evidence is reviewed, all 24 gameplay anchors and five candidate disconnected regions have documented author/reviewer dispositions, full-footprint routes and sight tests pass, and client/server parity is proven. |
| 4×3 collision/map QA gallery | GENERATOR DONE on main; review incomplete | `scripts/renderCollisionQa.ts` creates 12 overlapping 900×650 region tiles with collision, shadow and sampled-vision overlays, plus eight 3× source-vs-collision detail comparisons. The CI workflow runs it and uploads the image gallery as `among-gas-visual-qa`. | Inspect all 12 regions and eight detail crops against the red-line source; record dispositions for the 24 gameplay anchors and five candidate disconnected regions. Generated QA images are diagnostic previews, not approval of collision geometry. |
| Statue planter and pedestal sight contour | NOT DONE in current main | The old misplaced statue offset circle has already been removed; visibility.ts explicitly warns that the baked raster shadow must not be duplicated. The current buildCollisionDocument.ts also excludes that obsolete circle, and collisionOverrides.ts contains the van silhouette but no statue planter/pedestal polygon. Inspection of the generated central-atrium QA comparison confirms the red-line source traces a closed planter outline while the current production collision overlay has no corresponding authored vector contour. The older Plan v2 seed note gave an estimated pedestal rectangle (1700–1790 × 464–531), not a reviewed contour. | Author-trace the actual planter ring and pedestal from the map source, decide separately whether to retain the painted shadow, and obtain independent sight/route review. Do not promote the estimate as canonical geometry. |
| Parking lines and other map connectivity defects | NOT DONE | Current collision overrides contain the existing green service van footprint and east-generator approach aisle. | Parking paint/line collision and the other identified regions still need visual classification and author review. Painted markings must remain walkable unless a visible physical obstacle supports a collider. |
| HUD action bar | PARTLY DONE; visual states not accepted | Kill is impostor-only, disabled without target/on cooldown, shows a countdown and conic cooldown sweep. Report is persistently visible for living players and disabled without a reportable body. Use is persistently visible and disabled when no contextual action is available. Position uses the game control layout preferences. | This branch adds the requested disabled-Kill opacity of 45% and desaturation. Context-specific task/repair/vent/admin Use iconography and a VENT label are now implemented, reusing the existing server-authoritative enterVent callback. The six-state screenshot matrix and visual acceptance remain outstanding. No visual acceptance is claimed without running-browser screenshots. |
| GameMap modularization | NOT DONE | The main file retains the map rendering, camera, pointer/input, gameplay overlay and HUD responsibilities together. | Split into stable render/camera/input/HUD boundaries with no gameplay changes. This remains a large, separately testable refactor. |
| Minigame modularization | NOT DONE | TaskMinigame.tsx contains the current five implemented minigames and their shared overlay logic. | Extract independent minigame components/shared primitives and create functional and visual regression coverage. The presence of working minigames is not completion of the refactor/gallery requirement. |
| Sprites and animation | PARTLY DONE | Authored character source, an atlas loading path, runtime palette expansion and character geometry/animation tests already exist. | Complete the full 18-palette × 9-frame baked/golden-image review with visor/filter, suit shading, feet anchor, corpse bone and walk-pose comparisons. Existing extraction previews alone are not acceptance. |
| Bots and strategic behaviour | PARTLY DONE | Recent merged work includes role-scoped strategic AI, seeded balance evaluation and a solo human/bot movement verification path. Server authority and shared raster movement contracts remain. | Prove bots on the final reviewed map, with grounded visibility/event reactions, path reachability and human-vs-bot balance. A solo simulation or mock does not replace full live-game acceptance. |
| Meetings, reports, voting and multi-client networking | INCOMPLETE at release-gate level | Server-backed WebSocket protocol and UI flows exist in source. | A two-real-client server-backed emergency/report/meeting/discussion/voting/ejection proof is still a mandatory gate; issue #90 explicitly records the E2E gap. |
| Asset provenance | INCOMPLETE | ASSETS.md records project-authored assets and identifies the legacy au-assets directory as not cleared for commercial redistribution. | Replace or license the uncleared runtime assets, record provenance/attribution and remove reliance on uncleared art before commercial release. Do not delete assets blindly where historic fixtures depend on them. |
| Real device, Replit/Vercel and release verification | BLOCKED / NOT DONE | Repository-level and browser automation exist. | Active recovery issue #90 prohibits Replit/Vercel access and publishing. No real-phone acceptance, 20-minute soak or release dossier is claimed. Resume only when the owner explicitly clears that gate. |

## Changes made on this branch

1. Hardened the browser TiledMap implementation:
   - camera and device scale validation;
   - preserve and restore canvas image-smoothing state;
   - one-device-pixel overlap to protect tile edges at fractional scales;
   - status snapshot, failed-tile retry and explicit dispose;
   - cancel pending image loads and release image references on eviction/dispose.
2. Updated GameMap's map-image effect to dispose a loaded tile map on unmount and dispose a map whose asynchronous load completes after cancellation.
3. Added a standalone offline map pipeline under scripts/map-tiles:
   - exact 2× baseline and tile cutting;
   - validated 28-entry manifests and exact re-stitching;
   - context-crop preparation;
   - cosine-feather blending for context outputs;
   - strict rejection of mixed core/context output sizes;
   - geometry, colour, edge and seam QA separate from production runtime.
4. Corrected seam QA to compare per-pixel seam residual changes against the faithful reference using a 95th-percentile measure. This allows natural gradients already present in an unchanged map while detecting newly introduced narrow edge stripes.
5. Added seven Python regression tests for coverage, lossless cut/stitch, context feather round-trip, mixed output rejection, missing tile detection, geometric shift rejection and localized seam rejection.
6. Added a dedicated browser TiledMap renderer regression harness for load, edge bleed, smoothing restoration, explicit retry, disposal, invalid viewport and manifest validation; wired a separate TypeScript config and package script.
7. Expanded the map browser-smoke matrix with mobile 390×844 at DPR 3.
8. Changed disabled Kill styling to 45% opacity plus desaturation, added contextual task/repair/vent/admin icons with a localized VENT label to the persistent Use action, and extended browser-smoke assertions for the task icon and disabled Kill treatment.
9. Changed vector-editor mobile browser smoke to draw its first freehand wall stroke with real Chromium touchscreen input, reusing the touch session for pinch tests.

## Verification and limits

- The supplied baseline and sharpened tile sets each have a complete 7×4 / 28-tile manifest and reconstruct to a full 6448×3716 master.
- Supplied-map QA: faithful baseline against itself passes. The optional sharpened candidate versus baseline measured low-frequency Lab MAD 0.4725, quarter-scale chamfer 0.145 px, edge F1 0.9879, worst per-tile Lab drift 0.6686 and no new seam step; its Laplacian-variance ratio is about 2.65. This is a sharpness change, not proof of generated detail.
- The local offline Python test working copy passed 7/7 tests, including the localized-seam regression. The branch's exact-head Python and TypeScript/browser CI must still be run and reviewed.
- The new TypeScript renderer test is wired as scripts package command test:map-renderer; do not mark it passed until exact-head CI executes it.
- The browser smoke scripts have not been run against a live game in this work session. No screenshots from a running browser or a real phone are claimed.
- No generated AI tile candidates, collision geometry, deploys, database changes or production map changes were made.

## Required next acceptance sequence

1. Run exact-head repository CI and fix all regressions without weakening tests.
2. Review the baseline and any Stage-2 image-to-image gallery at mobile/desktop scale; retain only candidates that pass the QA gate and owner visual review.
3. Establish source-map provenance; inspect the already-generated 4×3 / 12-image QA gallery and eight detail comparisons; record independent author/reviewer dispositions for all 24 gameplay anchors and five candidate disconnected regions.
4. Trace statue/prop outlines and doors with explicit blocksMove/blocksSight flags; resolve parking-line and connectivity defects; run full three-circle-footprint routes for every gameplay anchor and all cross-zone paths.
5. Add visibility/shadow tests from the required viewpoints; profile on a mid-range phone; prove that low props remain move-only where appropriate.
6. Only after geometry review, test vector/raster parity for client, server and bots, then plan a separately reviewed production cut-over.
7. Complete the HUD six-state screenshot matrix, touch editor acceptance, GameMap/TaskMinigame modularization, sprite golden images, asset provenance, two-client E2E, balance matrix and soak.
8. Obtain explicit owner clearance for the recovery restriction before any Replit/Vercel or target-device integration. Issue #90 remains controlling until then.

**Decision:** this branch advances the map refinement tooling and runtime resource management, but Plan v2 is not complete and the game is not release-ready.

---

## Current-main reconciliation — 2026-11-13

This addendum supersedes stale status rows above where later merged PRs changed the repository. It does not waive any map-design or target-device gate.

### Updated implementation state

| Area | Verified current state | Remaining acceptance |
|---|---|---|
| Mainline baseline | Main is `925a465458e8462cef8b6112daff90a0edc239b3`. Main CI run [43358830692](https://github.com/2f22vtd4kr-cloud/Among-Gas/actions/runs/43358830692) passed all 45 verify steps. Its three 100-game cohorts were 58%, 66% and 58% crew wins, zero timeouts, with 0.9/1.0/1.0 average kills. | The mainline baseline is green; it does not verify the separate PR #138 vector candidate. |
| Tiled map | Runtime now uses the 1612×929 overview and 28 viewport-detail tiles; CI has tile lifecycle, retry/fallback, seam and mobile/desktop capture coverage. | The optional sharpened set is not neural super-resolution. No model-generated detail candidate or owner-approved artwork switch exists. |
| Minigames | All 11 task minigames are independent modules under `components/minigames/`, behind a registry. The registry test and CI browser gallery mount all 11. | Continue per-game functional/visual review; the previous statement that the minigames remain a single monolith is stale. |
| GameMap and input/render refactors | Camera, keyboard lifecycle, map base layer, task/sabotage markers, HUD actions, sprite projection/rendering and vision overlay have been incrementally extracted across merged PRs. | `GameMap.tsx` remains a large module (roughly 2.7k lines at the last measured baseline). A complete behavior-preserving scene/render decomposition remains open. |
| HUD/editor | The persistent action bar and six-state HUD matrix exist. The editor's touch/pinch browser acceptance was merged, including a 20px-offset hit inside the specified 48px target. | Chromium touch is not physical iOS/Android/Telegram hardware acceptance. |
| Multiplayer meetings/reports | Main CI exercises real server-backed multi-socket kill/body-report, out-of-range report rejection, emergency call, discussion, early-vote rejection, voting/ejection, sabotage authorization, reconnect and a solo human-plus-four-bots contextual meeting reply. | Reconnect during an active meeting/vote and a complete human-versus-bot match playtest remain separate acceptance items. |
| Audio and legacy artwork | PR #142 replaced nine upstream-clone-identical runtime sound files with original procedural Web Audio while preserving the public SFX API. PR #137 removed uncleared legacy artwork from active runtime use; PR #139 removed unreferenced third-party HUD reference screenshots. | Complete retained-asset provenance classification for the remaining attached/source images and any other third-party assets before commercial release. |
| Source provenance | The missing historical map geometry manifest is restored in this documentation PR and now includes a current-main delta. | Verify all retained source assets and reproducible transforms; a manifest does not approve collision contours. |
| Sprite QA | CI emits the 18-colour × 9-pose atlas matrix, gameplay-scale matrix and frame metrics. | Review all frames against authored source/anchors and record explicit golden-image acceptance; a generated matrix alone is not owner approval. |

### Current vector-collision candidate — PR #138

PR #138 remains a separate draft candidate and must not be described as merged or production-approved. Its current generated document contains 370 movement-only shapes (14 closed and 356 open), all `blocksMove:true`, with zero `blocksSight:true` and zero `castsShadow:true`. It has five coarse sectors A–E, not the Plan's 12 author/reviewer zones.

The earlier candidate exact-head run failed seed 17002 at 70% crew wins (other seeds 62% and 60%), despite zero timeouts. Tightening the moving-target route refresh alone did not fix it. The latest follow-up aligns impostor target observation with the server's authoritative interaction sight grid, restores the accepted 30-second sabotage cadence, corrects the browser camera fixture, and removes CI's push-only generated-file writeback. The new exact-head run is still in progress; no balance pass is claimed until all three unchanged 100-game cohorts finish.

The candidate must remain unmerged until:
- exact-head CI and all three balance cohorts pass without changing acceptance limits;
- the 12-zone source tracing and independent review are complete;
- C0/C20/C27/C38/C56 dispositions and all gameplay-anchor routes have explicit design-owner/reviewer decisions;
- parking gaps/markings, vehicle clearance and statue/planter contours are source-backed and reviewed;
- movement, sight and shadow semantics are independently authored and tested; and
- client/server/bot parity and visual evidence are reviewed on the same candidate head.

### Still blocked by the active recovery restrictions

Issue #90 remains controlling: no Replit/Vercel access, publishing, deployment, production mutation or real external investigation is authorized during repository recovery. CI's local production-serving checks are not a deployment. Physical-device acceptance, a 20-minute soak, external target-platform verification and the final release dossier therefore remain uncompleted. Do not mark Plan v2 complete or release-ready until the owner explicitly lifts the restriction and the remaining geometry/design decisions are recorded.
