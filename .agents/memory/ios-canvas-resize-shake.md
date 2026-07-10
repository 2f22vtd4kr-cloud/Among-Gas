---
name: iOS Safari canvas resize "shake" bug
description: Canvas-only visual shake on iPhone browsers right after a game map/canvas view appears; root cause and fix pattern.
---

# iOS Safari canvas resize "shake"

Symptom: on a phone browser (iOS Safari, including inside an iframe like Replit's
preview proxy), a full-viewport `<canvas>`-rendered view visibly "shakes"/jitters —
usually right when the view first mounts, sometimes right as the user starts
interacting — while DOM-based UI overlays (buttons, HUD) stay perfectly still.
Desktop browsers never reproduce it.

## Root cause

iOS Safari fires a *burst* of `resize` events with different
`window.innerWidth`/`innerHeight` values while its dynamic toolbar (URL bar)
animates in/out, especially right after page load. If a `resize` listener
synchronously mutates a canvas's backing buffer (`canvas.width`/`canvas.height`)
on every event, and the render loop derives its camera/crop rect from that
buffer size each frame, every intermediate resize event changes the crop —
which reads as the rendered content shaking, even though the per-frame render
logic itself is correct and stable. DOM overlays don't shake because CSS layout
doesn't thrash the same way.

**Why this is easy to miss:** bot/WS-based repro scripts and desktop screenshots
can't reproduce it — there's no server-side bug and no desktop browser fires the
resize burst. It only shows up live on an actual iOS device/browser.

## Fix pattern

Debounce the canvas resize handler (trailing ~150ms) instead of calling the
resize function synchronously on every `resize` event; also listen on
`window.visualViewport`'s `resize` event, since that's the more accurate source
on mobile Safari. Do not remove the listeners without also clearing the pending
timeout on cleanup.

**How to apply:** any full-viewport canvas/WebGL view that resizes itself via a
raw `window.resize` listener is a candidate for this bug on iOS. If a user
reports shaking/jitter specific to a phone browser that doesn't reproduce via
scripted bots or desktop screenshots, suspect this before re-deriving new
hypotheses server-side. Still requires live-device verification — this fix
reduces/eliminates the thrash mechanism but hasn't been confirmed against a real
iPhone in this project as of 2026-07-10; if jitter persists, switch the sizing
source itself from `window.innerWidth/innerHeight` to
`visualViewport.width/height`.
