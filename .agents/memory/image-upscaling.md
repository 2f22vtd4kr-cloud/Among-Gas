---
name: Canvas image upscaling vs real upscaling
description: Why stretching a low-res image via canvas drawImage stays blurry, and the fix.
---

# Canvas-time scaling does not add detail

Drawing an image onto a `<canvas>` at a larger destination size than its native resolution (`ctx.drawImage(img, 0, 0, biggerW, biggerH)`) only interpolates existing pixels (bilinear/bicubic) — it does not add real detail. Past roughly 1.2-1.5x this reads as visibly blurry.

**Why:** No AI super-resolution tool is available in this environment's media-generation skill. To make a bitmap look crisper at a larger size, you must pre-process it once into a genuinely higher-pixel-count static file.

**How to apply:** Use `sharp` (already available as a devDependency in this project's `scripts` package) with `kernel: sharp.kernel.lanczos3` plus a light `.sharpen()`, resize to the target resolution, and save as **WebP** (quality=90 saves ~94% vs PNG for this map — 17 MB → 1.1 MB). Then set any width/height constants in code to match that file's native dimensions exactly, so the runtime canvas draw is ~1:1 with no further stretching.

**DPR fix is not viable for this map size.** At MAP_W=6608×MAP_H=3808, scaling the canvas buffer by DPR=2 gives 13,216×7,616 px (~400 MB RGBA) — beyond mobile browser limits. Effective DPR for this map is 1. Do not attempt canvas buffer × DPR on any canvas whose native dimensions exceed ~4096 px on either side. Instead, rely on higher source-image resolution and `imageSmoothingQuality = 'high'` on the map canvas context.

**Cap DPR instead of chasing more source pixels, when a camera zoom constant is involved.** In `artifacts/telegram-game/src/pages/GameMap.tsx` the per-frame map draw stretches the native asset by `scale = ZOOM * dpr` (ZOOM is a fixed camera-zoom calibration constant, e.g. 0.6). Once `scale > 1` the draw is upsampling the native image beyond its own resolution — visibly blurry on high-DPR phones (iPhone dpr≈3) even though desktop (dpr=1) looks fine. Fix: cap the DPR used for canvas-buffer sizing *and* the map scale factor at `MAX_RENDER_DPR = 1/ZOOM`, applied consistently everywhere `window.devicePixelRatio` is read in the render path (buffer sizing, frame scale, any dpr-scaled font sizes) via one shared helper. This guarantees `scale <= 1` (no upsampling) on any device with zero asset regeneration and zero added memory/crash risk — cheaper and safer than pushing the source image to more real pixels, which reintroduces the large-decoded-bitmap risk above.
