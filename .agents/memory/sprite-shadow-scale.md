---
name: Sprite effects must be tested at actual render scale
description: Drop shadows / outlines added to a sprite sheet at full source resolution can vanish once downscaled to in-game size.
---

When adding visual effects (drop shadows, outline removal, glow, etc.) to a game sprite sheet, always verify by screenshotting the actual running game — not just by inspecting the processed sprite sheet at full resolution.

**Why:** The telegram-game player sprite is drawn at only ~50-90px tall in-game (camera zoom + nearest-neighbor downscale from a ~156px source cell). A shadow with realistic soft/low-opacity falloff looked correct in a full-res crop but was nearly invisible after downscaling. It took much higher contrast/opacity/radius than "correct" at full res to read clearly at actual gameplay size.

**How to apply:** After editing `artifacts/telegram-game/public/sprites/characters.png` (or any similar sprite sheet), restart the game workflow and take an in-game screenshot (zoom into the player) before considering the change done. Don't rely solely on cropped full-resolution previews of the sprite sheet.
