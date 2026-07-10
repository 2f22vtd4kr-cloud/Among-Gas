---
name: Task-bar denominator must drop a dead crewmate's unfinished steps
description: Among-Us-style task-completion win condition stalls forever if a fixed total-steps denominator isn't decremented when a crewmate dies with incomplete tasks.
---

## The rule

If a game's "crew wins when task bar reaches 100%" condition is implemented as
`completedSteps.size >= totalStepsAssignedAtGameStart`, and dead players can
never submit another task step, then any crewmate dying with unfinished
tasks makes that denominator permanently unreachable for the rest of the
game. The only remaining win paths become ejection-by-vote or kill-parity/
sabotage-timeout — and if bot voting has no real suspicion logic (i.e. it's
close to random), a meaningful fraction of games will hit none of those
before a safety timeout, showing up as unexplained "stuck" or "timeout"
games in simulation.

**Why:** discovered while debugging a ~10% game-timeout rate in a headless
Among-Us-style bot simulator. The dead-body-never-reported bug had already
been fixed, tasksCompleted was no longer stuck at zero, but timeouts
persisted — the actual cause was one level deeper: the task-bar denominator
itself, not body-reporting. Matches standard Among Us behavior (a dead
player's unfinished tasks come off the shared bar, they don't block it).

**How to apply:** when a life/death game has a "finish all the work" win
condition with a denominator fixed at round/game start, check whether death
removes a participant's remaining contribution from that denominator. If
not, that's the fix — decrement the total by the dying participant's
still-incomplete units at the moment of death, and re-check the win
condition immediately after (the decrement can itself complete the bar).

**Watch for multiple exit paths, not just one.** "A participant stops being
able to act" usually has more than one trigger — e.g. killed, voted out/
ejected, and disconnected/left are three *separate* code paths that each
need the same denominator fix independently. Fixing only the first
(typically "killed", since it's the most visible one during debugging)
leaves the bug fully reachable via the others. A first-pass code review
caught the ejection case; a second pass caught the disconnect case. Grep
for every place a participant's "can no longer act" flag gets set and check
each one has the same treatment before considering the bug closed.

**Tuning is fragile across correctness fixes.** Each additional exit-path
fix here changed the measured win-rate baseline substantially (a bug fix
can matter far more than the tuning knob being adjusted) — don't finalize a
tuning pass until you're confident every instance of the underlying bug is
fixed, or you'll tune against a moving target.

## Debugging tip: simulation batches and shell timeouts

Headless game-simulation batches (100+ games) routinely exceed a 5-minute
shell command timeout even though each individual game is short — the
batch runs many games concurrently against one shared timeout budget.
Redirect stdout/stderr to files; if the shell call times out anyway, the
partial NDJSON output already written is still valid — parse it directly
rather than re-running. Also check where the game engine's logger writes:
if it goes to stdout (common with pino's default transport), it will be
interleaved with any NDJSON the simulator itself prints there — grep counts
of specific log lines (e.g. "after kill", "Sabotage timed out") out of that
same file for a free win-reason breakdown instead of adding new
instrumentation.

## Tuning noise

A single ~100-game batch of a stochastic bot-vs-bot simulation carries
roughly ±5 percentage points of sampling noise on a win-rate metric. Don't
conclude a tuning change helped or hurt from one batch — run 2-3 batches (or
split one large batch to dodge timeouts) before deciding.
