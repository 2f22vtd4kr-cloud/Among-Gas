---
name: Client movement jitter from blind position-echo snapping
description: Multiplayer position-sync bug where echoing the local player's own position back over the wire and snapping to it unconditionally causes movement-time jitter/shake.
---

# Blind position-echo snapping causes movement jitter

Symptom: in a client-predicted multiplayer game (client moves locally every
frame, periodically sends its position, server validates and broadcasts state
back), the local player's own on-screen position/camera visibly jitters or
"shakes" — but only once movement starts, never while idle.

## Root cause

If the server's broadcast of "your own last-known-accepted position" is
treated as an authoritative correction and blindly applied every time it's
received, this fights local prediction: local movement never pauses to wait
for acks, so by the time an echo of a position arrives (~1 round trip later),
local prediction has already moved further in the same direction. Snapping
backward on every routine echo (most of which are just normal acks, not real
corrections) produces a persistent sawtooth/rubber-band jitter. It's invisible
while idle because the echoed position then equals the current position.

**Why this is easy to miss:** a scripted bot/WS client that only checks the
server's echoed positions for monotonicity (no real client-side prediction
loop) won't reproduce it — the bug lives entirely in how the *client* applies
the echo, not in server logic.

## Fix pattern

Don't snap on every echo. Keep a small capped history of positions the client
itself has sent; when an echo arrives, check if it matches something in that
history:
- Match found → it's a normal ack of a position already accounted for in
  local prediction. Drop it and everything before it from the history; leave
  local prediction untouched.
- No match → the server actually fell back to an older valid position (a real
  rejection, e.g. wall-clip). Only now snap local prediction to it, and clear
  the pending-send history.

**How to apply:** any "echo my own state back to me" wire message in a
client-authoritative-movement design is a candidate for this bug. If a shake/
jitter bug only reproduces on movement (never idle) and a scripted network-only
repro finds nothing, suspect this pattern before re-investigating collision or
rendering code. Coordinate-only ack matching (no sequence numbers) has a small
theoretical ambiguity — add explicit move/ack sequence IDs to the protocol if
that ever causes a real symptom (e.g. a rejection getting misclassified as an
ack).
