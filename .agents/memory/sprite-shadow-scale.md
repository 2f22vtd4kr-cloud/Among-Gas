---
name: Sprite effects must be tested at actual render scale
description: Drop shadows / outlines added to a sprite sheet at full source resolution can vanish once downscaled to in-game size.
---

When adding visual effects (drop shadows, outline removal, glow, etc.) to a game sprite sheet, always verify by screenshotting the actual running game — not just by inspecting the processed sprite sheet at full resolution.

**Why:** The telegram-game player sprite is drawn at only ~50-90px tall in-game (camera zoom + nearest-neighbor downscale from a ~156px source cell). A shadow with realistic soft/low-opacity falloff looked correct in a full-res crop but was nearly invisible after downscaling. It took much higher contrast/opacity/radius than "correct" at full res to read clearly at actual gameplay size.

**How to apply:** After editing `artifacts/telegram-game/public/sprites/characters.png` (or any similar sprite sheet), restart the game workflow and take an in-game screenshot (zoom into the player) before considering the change done. Don't rely solely on cropped full-resolution previews of the sprite sheet.


## 2026-10-30 implementation update — synchronized bob clock

Local and remote gameplay characters now share `getCharacterWalkBobOffset()` and `getCharacterShadowScale()` from `characterAnimation.ts`. The local path uses `playerStateRef.current.animElapsedMs`, the same accumulator used to select walk-1/walk-2; the remote path uses its matching `animMs`. Do not use global RAF wall-clock time for local bob phase, because it drifts from the footstep frames. The ground ellipse remains anchored at ground Y and scales down as the sprite rises.
