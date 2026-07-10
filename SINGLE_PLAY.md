# Single-Player Mode, Bot AI & Playtest Simulation — Full Scope

---

## 1. Goal

The project needs three things that share one foundation:

1. **Single-player mode** — a human plays a real game with bot teammates and opponents. This is a shipping game feature.
2. **Bot AI** — autonomous agents that credibly play as crewmates and impostors: navigate the map, complete tasks, kill, report, vote.
3. **Playtest simulation** — a headless mode where all slots are bots and the server runs games end-to-end unattended, producing structured logs for balance analysis (win rates, average game length, task completion rates, kill patterns) before any real players are involved.

All three depend on the same core: **server-side bots that speak the same game logic as real players but need no WebSocket connection**.

---

## 2. What is in scope

| Area | In scope |
|---|---|
| Server-side bot agent (crewmate + impostor) | ✅ |
| Pathfinding on the existing collision grid | ✅ |
| Single-player lobby flow (human + N bots) | ✅ |
| Bot task execution (navigate → interact) | ✅ |
| Bot kill logic (impostor, proximity + cooldown) | ✅ |
| Bot sabotage logic (trigger + repair) | ✅ |
| Bot meeting/voting behaviour | ✅ |
| Fully-headless simulation runner (0 humans) | ✅ |
| Per-session structured log output | ✅ |
| Client UI for starting a single-player game | ✅ |

**Out of scope for this task:**
- Advanced NPC personality / machine learning
- Persistent stats dashboard (follow-up)
- Replay viewer / visual debugger (follow-up)
- Anything requiring changes to the binary wire protocol itself

---

## 3. Architecture: where bots live

Bots are **server-side synthetic players** — they occupy real lobby slots but have no WebSocket connection. The lobby already tracks players as slot-indexed structs; a bot slot is exactly the same struct, flagged `isBot: true`, with a reference to its AI agent instance.

This is the right choice because:
- The game logic (kill validation, task tracking, vote tallying, win checks) is already authoritative on the server. Bots go through the same code paths as real players — no duplication, no protocol mismatch.
- Bot "actions" are direct function calls into the same handlers real player WS messages call. No mock frames, no separate process, no timing games.
- The 25 Hz delta-sync broadcast loop already iterates all slots — bots automatically appear as remote players on every connected human client with zero extra work.
- The headless simulation is just "start a lobby with 0 human slots" and let the tick loop run.

The alternative (bots as real WS clients) was rejected: it adds process management, network overhead, and a fake auth layer while producing no benefit — bots don't need the client-side rendering pipeline.

---

## 4. Pathfinding

The collision grid (`buildCollisionGrid()` in `lib/shared`) is a flat `Uint8Array` of `COLS × ROWS` cells (~104 × 58 = ~6 000 cells), each cell ≈ 31 × 32 px. This is small enough for **A\*** to run in microseconds per query.

The pathfinder will:
- Accept a start and goal in pixel coordinates, convert to grid cells.
- Run A\* (Manhattan heuristic, 4-directional neighbours, diagonal allowed with √2 cost).
- Return a path as a sequence of waypoint pixel positions (cell centres).
- Be cached: if a bot's destination hasn't changed and the path isn't stale, reuse it.
- Live in a new shared file `lib/shared/src/pathfinding.ts` so both the server bot loop and any future client-side debug overlay can import it.

Complications to handle:
- The grid cells are not square (CELL_X ≈ 31, CELL_Y ≈ 32) — the heuristic needs to account for this.
- A bot can't use `resolveMovement` (client-side) — the server validates positions. Bot movement goes through the server's own `canMoveTo` check, same as the existing spawn-point finder.
- Bots need path-smoothing (string-pulling or simply waypoint skipping with line-of-sight checks) so they don't stutter at cell boundaries.

---

## 5. Bot AI: crewmate behaviour

A crewmate bot runs a simple priority-ordered decision loop, ticked every ~200 ms:

```
1. SABOTAGE ACTIVE (O2 / Reactor) → navigate to nearest unoccupied repair pad → fix
2. BODY VISIBLE (within report range) → send 0x13 report
3. HAVE INCOMPLETE TASK → navigate to task location → interact (send 0x15/0x03 step)
4. ALL TASKS DONE → wander near other players (social behaviour, avoids looking AFK)
```

**Voting (in meetings):**
A crewmate bot has no real information — it can't see kills. Its vote is probabilistic:
- If another player reported it (they were near a body) → slight suspicion on them.
- Otherwise, random vote from alive players (or skip, with configurable skip-bias).
- Future enhancement: track "was seen near body" state for light inference.

---

## 6. Bot AI: impostor behaviour

An impostor bot runs a richer loop with a state machine:

```
STATES: FAKING_TASKS → HUNTING → COOLDOWN → MEETING
```

- **FAKING_TASKS:** Navigate to random task locations (same as crewmates), wait briefly, move on — without sending any 0x15 steps. Maintains cover.
- **HUNTING:** When kill cooldown is ready, scan for the nearest isolated crewmate (alive, no other alive player within ~2 cells). Navigate to them → kill (0x15/0x01).
- **COOLDOWN:** After a kill, briefly return to faking tasks until cooldown expires.
- **SABOTAGE:** Periodically (configurable interval, ~60s) trigger a sabotage (0x15/0x04) to force crewmates to split up or to win via timeout.

**Voting (in meetings):**
- Vote for a random crewmate, never for a known impostor ally.
- If accused (someone voted for this bot) → vote for the accuser.

**Isolation scoring** (for hunting):
Score each target by `distance_to_target - min_distance_to_any_other_player`. Higher score = more isolated. Only hunt if score exceeds a threshold, avoiding kills in front of witnesses.

---

## 7. Single-player lobby flow

On the client, the lobby screen gains a **"Play Solo"** button alongside "Create Room". Tapping it sends a new lobby control sub-action (`0x10 / 0x06 — CREATE_SOLO`) carrying a bot count (defaulting to 4, range 1–14). The server:

1. Creates a private room (not joinable by code).
2. Fills remaining slots with bot agents.
3. Auto-starts the game immediately (no waiting, no host Start button needed).
4. Returns the standard `0x10/0x03 Update` + `0x12 Start` sequence so the human client enters the game normally.

The human client sees the bots as regular remote players — they move around, get role-reveal events, appear in meetings. No special client code is needed beyond the "Play Solo" button and the `0x10/0x06` message send.

---

## 8. Headless simulation runner

A new script (`scripts/src/simulateGame.ts`) starts a lobby with a configurable number of bots and zero human players and runs it to completion, capturing structured output.

It will:
- Spin up an in-process lobby (reusing the existing `Lobby` class directly, no HTTP/WS needed for a pure simulation).
- Drive the bot tick loop manually at a configurable speed multiplier (e.g. 10× wall-clock for fast playtests).
- Capture a structured event log: every kill, every meeting, every vote, every task completion, the final win condition and time.
- Write results as NDJSON to stdout (or a file) for aggregation.

A thin runner CLI (`pnpm --filter @workspace/scripts simulate -- --games 100 --bots 5 --impostors 1`) produces aggregate stats:
```
Crewmate win rate: 61%   Impostor win rate: 39%
Avg game length:   4m22s  Avg tasks/game: 12.4
Avg kills before meeting: 1.8
```

This is the playtest tool — run it after tuning bot difficulty, kill cooldowns, or task counts to check balance before inviting real players.

---

## 9. Implementation phases

**Phase A — Pathfinding (`lib/shared/src/pathfinding.ts`)** ✅ DONE
A\* on the existing collision grid. No other changes. Testable in isolation via a small script.
Verified: `pnpm --filter @workspace/scripts run test:pathfinding` → 13/13 pass, avg 0.62ms/path.

**Phase B — Bot agent base + server integration** ✅ DONE
- `artifacts/api-server/src/bot/BotAgent.ts` — abstract base with `navigateTo`, `PathCache`, `tick` dispatch
- `CrewmateBot.ts` — priority loop: sabotage repair → body report → task → wander
- `ImpostorBot.ts` — FAKING/HUNTING/COOLDOWN state machine + periodic sabotage
- `IBotAgent` interface + `isBot`/`botAgent` on `LobbyPlayer` (NullWebSocket sentinel)
- 5Hz `_botInterval` in `LobbyManager`; `addBotPlayer`, `applyKill`, `applyTaskStep`, `applyRepair` convenience methods
- Bots appear as real slot entries; delta-sync broadcasts their positions automatically

**Phase C — Single-player lobby flow**
- Client: "Play Solo" button → `0x10/0x06` message
- Server: handle `CREATE_SOLO`, auto-fill bot slots, auto-start

**Phase D — Headless simulation runner**
- Decouple `Lobby` from WS transport enough for in-process instantiation
- `scripts/src/simulateGame.ts` + CLI

**Phase E — Tuning pass**
- Run 100-game simulations, adjust bot difficulty parameters (hunt threshold, sabotage frequency, vote randomness) until crewmate/impostor win rates are in a reasonable range (target: 55/45 ± 10%).

---

## 10. Key risks and decisions to make before starting

| Question | Options | Recommendation |
|---|---|---|
| Where does the bot tick live? | Server game loop vs. separate setInterval | Inside the existing 25 Hz loop — no extra timer |
| Bot movement granularity | Per-tick (25 Hz) vs. slower (5 Hz) | 5 Hz is plenty; real players aren't perfectly smooth either |
| Simulation speed multiplier | Real-time vs. accelerated | Accelerated (configurable), capped at 50× to avoid starvation bugs |
| `0x10/0x06` vs. reuse existing Create | New sub-action vs. query param | New sub-action — cleaner, explicit intent |
| Bot personality variety | All identical vs. tunable difficulty tiers | Single "medium" difficulty first; difficulty tiers as follow-up |
