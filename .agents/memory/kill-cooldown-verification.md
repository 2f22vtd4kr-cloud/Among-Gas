---
name: Timer/cooldown features need live protocol tests
description: Mock-driven UI screenshots don't catch server-side cooldown/timer initialization bugs — use a raw WS client script against the live server.
---

When implementing a cooldown, timer, or other stateful gating mechanic in a
client/server game protocol, screenshot-based QA against hardcoded mock
states (e.g. `killCooldownMs: 0`) cannot catch bugs in how the *server*
initializes or transitions that state — the mock already assumes the "happy"
value.

**Why:** A kill-mechanics feature shipped with the cooldown wrongly
initialized to the full cooldown value at game start (instead of 0/ready),
silently blocking the very first action for the whole cooldown duration with
no client-side error. Screenshots of the kill button looked correct because
the mock harness set `killCooldownMs: 0` directly, bypassing the real
server-driven init path entirely.

**How to apply:** For any feature involving server-authoritative timers,
cooldowns, or multi-step state transitions, write a small raw-socket
(e.g. `ws` npm package) Node script that drives the real protocol end-to-end
(connect → join/create → transition → trigger the timed action → assert the
result) against the actual running dev server, in addition to UI mock
screenshots. Do this before considering the feature verified.
