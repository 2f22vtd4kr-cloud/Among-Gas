---
name: Collision sampling and headless-browser testing limits
description: Circular-entity collision needs circumference sampling, not just 4 cardinal points; no Playwright/Puppeteer in the CodeExecution sandbox.
---

## Circular collision checks need more than 4 cardinal points

A `canMoveTo(grid, cx, cy, radius)`-style check that only tests the 4
cardinal edge points (left/right/up/down) of a circular entity lets it clip
through the corners of blocked grid cells during diagonal movement — the
untested arc between cardinal points can overlap a blocked cell while all 4
sampled points remain clear.

**Why:** Found via code review on a top-down game's player-movement feature;
the 4-point version passed casual visual testing but failed a "no wall
clipping" correctness bar under diagonal-into-corner movement.

**How to apply:** Sample the center plus points around the full
circumference, with sample count scaled to radius so the arc length between
samples stays under roughly half a grid cell (e.g.
`samples = max(8, ceil(2*pi*radius / (cellSize*0.5)))`). Apply this any time
you're doing tile/grid collision for a circular or roughly-circular entity.

## No headless browser in the CodeExecution sandbox

Playwright and Puppeteer are not installed/available for `await import(...)`
inside `"use impure"` CodeExecution functions — attempts fail with
`ERR_MODULE_NOT_FOUND`. There is no keyboard/mouse-driven interactive testing
of a running dev server from that sandbox.

**Why:** Needed to validate real-time keyboard-driven player movement and
collision resolution end-to-end; browser automation was the natural approach
but isn't available.

**How to apply:** To validate game-loop / interactive logic, compile the
relevant pure `.ts` modules with `npx tsc <files> --module commonjs --target
es2020 --outDir <tmp> --skipLibCheck` and `require()` them in a plain Node
script (via ShellExec) to simulate input frame-by-frame. Keep movement/physics
logic in pure, framework-free modules (no DOM/React) specifically so this kind
of simulation is possible. Use the `Screenshot` tool for static visual
verification only — it cannot send key/mouse events.
