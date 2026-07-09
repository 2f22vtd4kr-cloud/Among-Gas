---
name: Canvas image upscaling vs real upscaling
description: Why stretching a low-res image via canvas drawImage stays blurry, and the fix.
---

# Canvas-time scaling does not add detail

Drawing an image onto a `<canvas>` at a larger destination size than its native resolution (`ctx.drawImage(img, 0, 0, biggerW, biggerH)`) only interpolates existing pixels (bilinear/bicubic) — it does not add real detail. Past roughly 1.2-1.5x this reads as visibly blurry.

**Why:** No AI super-resolution tool is available in this environment's media-generation skill. To make a bitmap look crisper at a larger size, you must pre-process it once into a genuinely higher-pixel-count static file.

**How to apply:** Use `sharp` (already available as a devDependency in this project's `scripts` package) with `kernel: sharp.kernel.lanczos3` plus a light `.sharpen()`, resize to the target resolution, and save as a static PNG asset. Then set any width/height constants in code to match that file's native dimensions exactly, so the runtime canvas draw is ~1:1 with no further stretching.
