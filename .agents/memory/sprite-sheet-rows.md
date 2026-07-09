---
name: Sprite sheet row count and inter-row bleed
description: characters.png has 9 pose rows (not 8); wrong count and naive floor-snapping both cause visible artifacts at runtime.
---

## Rule
`characters.png` has **9 pose rows**, not 8. `CHARACTER_SHEET_ROWS = 9`, giving `cellH = 1401/9 ≈ 155.67px`.

## Two distinct bugs, both fixed

### Bug 1 — Wrong row count (CHARACTER_SHEET_ROWS = 8)
With 8 rows, `cellH = 175.125px`. Every source rect was ~20px taller than the actual cell, pulling the top of the next row's character into the bottom of every frame — produced the "double ghost" effect visible on mobile.  
**Fix:** `CHARACTER_SHEET_ROWS = 9`.

### Bug 2 — Floor-snapping the source origin pulls in previous-row bleed
Even with 9 rows, `Math.floor(row * 155.67)` starts the source rect a fraction of a pixel *before* the cell boundary. Walk-1's foot outline physically overflows its fractional cell end (pixels at y=312–315 have α≈6–21 when the walk-2 cell starts at y=311.33). With `imageSmoothingEnabled=false` those stray alpha pixels render as a dark crescent floating above the character's head on high-DPR mobile screens.  
**Fix:** `Math.ceil` for the source origin (`sx`, `sy`) so we never start before the cell boundary. Additionally, at sprite-sheet load time, draw to an `OffscreenCanvas` and call `clearRect(0, boundary, width, 5)` at each inter-row boundary to zero out any overflow pixels permanently. This is a one-time O(ROWS) operation.

## How to apply
- Always use `Math.ceil` for sprite source origin, `Math.floor` for source end (derived from `floor(rect.y + rect.height) - sy`).
- On sprite-sheet load: iterate `row = 1..ROWS-1`, compute `boundary = Math.ceil(row * cellH)`, call `octx.clearRect(0, boundary, width, 5)`.
- Store the cleaned `OffscreenCanvas` (not the raw `HTMLImageElement`) in the sprite ref; `ctx.drawImage` accepts `CanvasImageSource` which includes `OffscreenCanvas`.

**Why:** Fractional cell sizes mean floor-snapping the origin rounds DOWN into the previous row. Nearest-neighbor sampling (imageSmoothingEnabled=false) then magnifies even 0.3px of overlap into clearly visible artifacts on high-DPR screens (DPR=3 → scale=1.8, so 1 source pixel becomes 1.8 physical pixels).
