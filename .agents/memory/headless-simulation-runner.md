---
name: Headless game simulation runner
description: Where the bot-vs-bot batch simulation tool lives, why, and the design tradeoffs behind it.
---

## Location: inside the artifact, not `scripts/`

The `scripts` package and `artifacts/*` are leaf workspace packages that must
never import from each other (see `pnpm-workspace` skill). A headless
simulation tool that needs `LobbyManager`/bot classes must live inside the
same artifact package as those classes (`artifacts/api-server/src/sim/`),
not in `scripts/`, even if an earlier design doc suggested `scripts/`.

**Why:** sharing code across leaf packages by direct import is explicitly
disallowed; the fix for "two leaf packages need the same code" is always a
new `lib/*`, never a cross-leaf import. When the reusable code IS the
artifact's own internals (not something a client/other artifact also needs),
the simplest correct answer is to put the tool inside that artifact instead
of creating a lib for a single consumer.

## Structured event log via listener, not polling

To get exact kill/task/meeting/vote/sabotage/gameOver events out of a
stateful game-loop class without touching its control flow: add one optional
`setEventListener(fn)` sink that no-ops when unset, and call it at the
existing points where those actions already happen. This is safer and far
less fragile than polling + diffing snapshots (which can't distinguish
attacker identity, sabotage-fixed vs sabotage-timeout, etc.).

## Concurrent batching instead of clock-warp for "fast" simulation

To run many simulated games "fast", don't thread a scaled clock through
every `Date.now()`/`setTimeout` in game logic that real players depend on
(timing bugs there are subtle and have bitten this project before — see
kill-cooldown-verification.md, position-echo-reconciliation.md). Instead run
N games truly concurrently in one manager/loop; wall time for the batch ≈
wall time of one game. Zero risk to production timing code.

## Lobby disposal must clear pending timers

When removing a finished/abandoned lobby from a manager's registry, always
clear its pending `setTimeout`s (meeting discussion/voting, sabotage
countdown) first — otherwise a late timer callback can fire after the lobby
is gone, or misattribute a stale event if the lobby's ID/code is later
reused. Centralize this as one `disposeLobby()` method reused by every
teardown path (human-leave, sim-runner game-finish) rather than duplicating
the clear-then-delete sequence.

## CLI numeric arg validation

A CLI that consumes `--concurrency`/`--timeoutMs`-style flags via bare
`Number(...)` can silently hang (e.g. `concurrency <= 0` → the worker pool
never starts a single job → the returned promise never resolves). Always
validate as strict positive integers with clear range errors before use.
