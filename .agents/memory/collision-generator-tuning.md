---
name: Collision generator tuning (checkerboard/fragmentation bugs)
description: How to diagnose and fix over-blocking / fragmented walkable areas produced by the red-line collision-tracing pipeline (scripts/src/analyzeCollisionMap.ts).
---

## Symptom
A region of the map feels "checkerboard"-blocked in play (player can't move freely even though the art shows open floor), and/or the debug collision overlay (`showCollision` in GameMap.tsx) looks densely red in that area.

## Don't trust the overlay's "busyness" alone
`showCollision` draws a marker in every cell (bold red = blocked, faint green = walkable). Any area with a non-trivial number of real traced obstacles looks visually busy regardless of whether the data is actually broken. Verify with a real connectivity/BFS check on the decoded grid (count disconnected walkable islands and their sizes) instead of eyeballing the overlay.

## Two independent root causes found so far (both live in `scripts/src/analyzeCollisionMap.ts`)
1. **Downsample majority-vote threshold too low** — the per-cell "blocked if >= X% of source pixels blocked" threshold. A low threshold (e.g. 0.35) lets the wall-dilation halo around every nearby traced line/prop tip many adjacent cells over the line, fragmenting an open floor into many small disconnected islands. Fix: raise the threshold (0.6 confirmed safe) — but always re-run a whole-map connectivity sweep afterward, since it's a global constant that can theoretically merge rooms or thin out real walls elsewhere, not just fix the one room you're looking at.
2. **Small props block their full silhouette instead of their base** — cones/bins/barrels are just background art (no separate object/coordinate list in code — grep for the prop name to confirm before assuming a data hook exists). The generator now has `SMALL_PROP_MAX_SIZE` / `SMALL_PROP_BASE_FRACTION`: components below the size threshold only block the bottom fraction of their bounding box (their base), not the whole traced shape.

**Why:** Both are due to the fixed grid cell size being coarse relative to how tightly obstacles are packed in some scenes (e.g. a gas station with kiosk + pumps + several cones in a modest area) — the generator's constants were tuned against the map's average complexity, not its densest scene.

**How to apply:** When a specific room/scene reports over-blocking, first reproduce with a decode+BFS connectivity check restricted to that room's cell range (largest island size vs total walkable — heavy fragmentation = threshold problem). Then check whether the blocked cells trace back to small (<~3000px source-image component size) props vs real furniture — small isolated blobs near the reported obstacle are candidates for the base-fraction rule. Re-verify the whole map's connectivity and a full-map reference-image overlay after any constant change, not just the reported room.
