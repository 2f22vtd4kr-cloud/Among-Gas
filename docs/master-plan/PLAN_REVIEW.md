# Master plan review — 2026-11-02

## Disposition

The ZIP is a valuable architecture proposal and evidence pack, but it is not safe to apply verbatim. The revised root `MASTER_PLAN.md` keeps its target architecture and staged specialist model while correcting assumptions and making runtime cut-over conditional on authored/approved map geometry.

## Confirmed findings

1. **Split raster systems:** `collisionData.ts` is the 104×58 legacy grid; `collisionDataFine.ts` is 680×392 and backs live player movement. Bot code creates a 208×116 clearance-aware nav grid from the fine mask. The old CollisionEditor edits only the 104×58 representation and cannot repair what a live player feels.
2. **Movement/vision semantics differ:** player movement uses an asymmetric feet footprint (radius 4px circles at offsets −10/0/+10px), while shadows/vision derive separate fine/coarse representations and manually maintained occluders. A shared authored geometry is a sound destination, but switching to a 12–14px circle before clearance tests would silently change gameplay.
3. **The vector prototype is not production-ready as supplied:** its XOR-combined spatial-hash key can alias cell pairs; `move(..., radius=0)` can generate an infinite substep count; the unobstructed visibility perimeter is square/1.5×radius rather than a circular range; and it scans every sight segment for each angular ray. The uploaded test is written to run with `tsx`, not bare Node type stripping.
4. **ZIP evidence is local, not whole-map proof:** the parking and statue images make credible defect cases, but cannot establish all obstacle boundaries, doorway semantics or exact contour measurements. The statue coordinates in the plan are estimates and must be measured.
5. **Sprite sample scope:** the contact sheet is 7 authored colours × 9 poses. The repo already expands to 18 runtime colours. The extractor's morphological filter can discard detached art, so it requires per-frame review and golden-image/browser checks before replacing the current renderer.
6. **Large monoliths are real maintenance concerns:** `GameMap.tsx` and `lobby.ts` are large, and `TaskMinigame.tsx` contains the 11 task games. Refactoring should be behavior-preserving and staged before those areas receive broad redesigns.
7. **Asset/IP warning requires an inventory:** suspicious asset names are not a legal conclusion. Inventory actual use, author/source and licence; replace unclear third-party assets with original work before commercial handoff. Do not remove assets blindly where production screens or CI still depend on them.
8. **Repository process overrides ZIP device-gate suggestion for now:** active issue #90 currently says no Replit/Vercel access or publishing during the recovery programme. Therefore real-phone editor acceptance is deferred; local/CI proof must be completed first, and no live target-platform claim may be made.

## Corrections and rejected shortcuts

- Do not replace the current fine mask with an empty vector document or a blind contour conversion.
- Do not globally shrink collision masks or force every disconnected region to connect. Classify each region against the actual map and player footprint.
- Do not delete `attached_assets/` while the collision analysis/generation scripts and CI still read source images from it. Archive/relocate source references only after all paths are updated and CI proves it.
- Do not claim the 104×58 bot navigation grid is the active bot runtime; it is a 208×116 clearance grid derived from the fine mask.
- Do not call mock screenshots live multiplayer acceptance.
- Do not bake the 18-colour atlas until the generated frames are compared against the source and current runtime on desktop and mobile.

## Foundation implementation in this PR

- Introduces a pure shared vector geometry core and editor geometry helpers without changing live runtime behavior.
- Adds strict validation for document dimensions, unique IDs, finite/in-bounds points, non-zero edges, polygon area and self-intersections.
- Uses collision-safe spatial-hash keys, bounded substeps, finite input guards, super-cover ray traversal and circular-range visibility.
- Adds tests for diagonal sliding, thin-wall tunnelling, filled solids, independent movement/sight flags, statue occlusion alignment, circular vision bounds, map edges, invalid documents, navigation rasterization, editor snapping/history and a performance smoke.
- Deliberately does **not** create a guessed `collision.v1.json`, change production movement, remove raster files, alter sprites or modify the proprietary map.

## Still required after this foundation

Mobile editor UI and save endpoint; map zone authoring/review; production vector cut-over; client/server/bot integration; vision renderer cut-over; map route sign-off; asset provenance/replacement; sprite golden/browser QA; minigame modularization; complete live multi-client/solo-vs-bots tests; clean-install/security/device/release dossier. These cannot be honestly declared complete from this repository-only foundation pass.
