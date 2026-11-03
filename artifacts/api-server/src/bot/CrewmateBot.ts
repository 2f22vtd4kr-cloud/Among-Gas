/**
 * CrewmateBot — AI agent for crewmate-role bots.
 *
 * Priority loop (every 200ms while ROAMING):
 *   1. Sabotage active  → navigate to nearest repair pad → repair
 *   2. Dead body nearby → call meeting (report it)
 *   3. Incomplete task  → navigate to task console → complete steps
 *   4. All tasks done   → wander randomly (social behaviour)
 *
 * Voting (MEETING phase, once votingOpen):
 *   Evidence-weighted vote from public meeting discussion; skip when evidence
 *   is weak, contradictory, or the roster has no eligible target.
 */
import { BotAgent, BOT_SPEED_PX } from './BotAgent.js';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import { REPORT_RANGE_PX } from '@workspace/shared/collisionMap';
import { LIGHTS_CREWMATE_VISION_RADIUS_PX, NORMAL_VISION_RADIUS_PX, SABOTAGE_COMMS, SABOTAGE_DEFS, SABOTAGE_DOORS, SABOTAGE_INTERACTION_RANGE_PX, SABOTAGE_LIGHTS } from '@workspace/shared/sabotage';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';
import type { Point } from '@workspace/shared';
import { chooseEvidenceWeightedVote } from './voting.js';
import { requestGroqDialogue } from './groqDialogue.js';
import { buildCrewTaskPlanningMessages, observeVisiblePlayers, parseCrewTaskChoice } from './strategicPolicy.js';

/** How long (ms) the bot waits at a task console before completing each step. */
const TASK_DWELL_TICKS = 11; // 11 × 200ms = 2.2s per task step; one-variable balance adjustment after 300-game seed spread

export class CrewmateBot extends BotAgent {
  /** Current target task ID (null = none selected yet). */
  private _targetTaskId: number | null = null;
  /** Current target pad ID for sabotage repair. */
  private _targetPadId: number | null = null;
  /** Ticks spent dwelling at current task console. */
  private _dwellTicks = 0;
  /** Wander target (used when all tasks are complete). */
  private _wanderTarget: Point | null = null;
  /** At most one structured task-planning request may be in flight per bot. */
  private _taskPlanningPending = false;
  private _taskPlanningGeneration = 0;

  override roamingTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    // ── 1. Sabotage active ────────────────────────────────────────────────
    if (lobby.sabotage !== null && lobby.sabotage.systemId !== SABOTAGE_DOORS) {
      this._handleSabotage(lobby, self, manager);
      return;
    }
    // Doors auto-unlock and have no repair pads. Keep working on unlocked tasks
    // instead of idling until the 15-second disruption ends.
    this._targetPadId = null;

    // ── 2. Report a nearby body ───────────────────────────────────────────
    // Meetings are rejected while sabotage is active. Do not return after a
    // rejected report attempt: during Doors sabotage the bot can still work
    // on every task that is not explicitly locked by the sabotage.
    if (lobby.sabotage === null) {
      const body = this._nearbyDeadBody(lobby, self);
      if (body !== null) {
        manager.callMeeting(lobby, self.slot, body);
        return;
      }
    }

    // ── 3. Work on an assigned task ───────────────────────────────────────
    const taskId = this._pickTask(lobby, self);
    if (taskId !== null) {
      this._handleTask(lobby, self, manager, taskId);
      return;
    }

    // ── 4. All tasks done — wander ────────────────────────────────────────
    this._wander(self);
  }

  override ghostTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    // Ghosts work only on tasks: no body reports, sabotage repairs, or votes.
    // Communications sabotage still blocks task progress in the base game.
    if (lobby.sabotage?.systemId === SABOTAGE_COMMS) return;
    const taskId = this._pickGhostTask(lobby, self);
    if (taskId === null) return;

    const def = TASK_DEFS.find(task => task.id === taskId);
    if (!def) return;
    const dx = def.x - self.x;
    const dy = def.y - self.y;
    const distance = Math.hypot(dx, dy);
    // Keep an 8px margin so floating-point rounding cannot strand a ghost
    // infinitesimally outside the exact interaction threshold forever.
    const interactionDistance = Math.max(1, TASK_INTERACTION_RANGE_PX - 8);
    // A 1px arrival tolerance avoids a floating-point residue just outside
    // the target radius being treated as a new movement request every tick.
    if (distance > interactionDistance + 1) {
      const travel = Math.min(BOT_SPEED_PX * 1.5, distance - interactionDistance);
      self.x += (dx / distance) * travel;
      self.y += (dy / distance) * travel;
      return;
    }

    // Ghosts ignore walls and do not need a console dwell animation. Submit
    // the pending step as soon as the authoritative range check can succeed;
    // this prevents a killed bot's final task from stalling the crew win.
    const step = this._nextStep(lobby, self, taskId);
    if (step !== null && !manager.applyTaskStep(lobby, self.slot, taskId, step)) {
      // Keep the retry deterministic if rounding or a future server-side
      // interaction rule changes the exact boundary.
      self.x = def.x;
      self.y = def.y;
    }
  }

  override chooseVote(lobby: Lobby, self: LobbyPlayer): number {
    // Use only the public roster and meeting transcript. The voting helper
    // deliberately has no access to hidden roles, private positions or events.
    return chooseEvidenceWeightedVote(
      self.slot,
      Array.from(lobby.players.values(), player => ({
        slot: player.slot,
        username: player.username,
        alive: player.alive,
      })),
      lobby.meeting?.messages ?? [],
    );
  }

  // ── Sabotage repair ─────────────────────────────────────────────────────

  private _handleSabotage(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    const sabotage = lobby.sabotage!;
    const def = SABOTAGE_DEFS[sabotage.systemId];
    if (!def) return;

    // Choose a pad to repair (prefer pad 0; try pad 1 if there are two and
    // pad 0 is already fixed within the sync window).
    if (this._targetPadId === null) {
      this._targetPadId = def.pads.length > 1 && sabotage.padFixedAt.has(0) ? 1 : 0;
      this.clearPath();
    }

    const pad = def.pads[this._targetPadId];
    if (!pad) return;

    // Same wall-mounted-console caveat as tasks: approach within range rather
    // than navigating to the exact (possibly unwalkable) pad pixel.
    const goal = this.nearestApproachPoint(
      { x: pad.x, y: pad.y },
      SABOTAGE_INTERACTION_RANGE_PX - 8,
    );
    const arrived = this.navigateTo(self, goal, 8);
    if (!arrived) return;

    // Attempt repair — delegate broadcast to manager convenience method
    const result = manager.applyRepair(lobby, self.slot, sabotage.systemId, this._targetPadId);
    if (result === 'fixed' || result === 'rejected') {
      this._targetPadId = null;
      this.clearPath();
    }
  }

  // ── Body detection ──────────────────────────────────────────────────────

  private _nearbyDeadBody(lobby: Lobby, self: LobbyPlayer): number | null {
    for (const p of lobby.players.values()) {
      // Ejection creates a ghost but no body. Only killed players with a
      // stored corpse position are reportable, and the corpse never follows
      // the moving ghost.
      if (p.alive || p.bodyReported || p.corpseX === undefined || p.corpseY === undefined) continue;
      const dSq = CrewmateBot.distSq(self.x, self.y, p.corpseX, p.corpseY);
      if (dSq > REPORT_RANGE_PX * REPORT_RANGE_PX) continue;
      // Do not spam a rejected report from behind a wall; wait until the corpse
      // is actually visible from the bot's feet-space position.
      if (!this.hasLineOfSightToPoint(self, { x: p.corpseX, y: p.corpseY })) continue;
      return p.slot;
    }
    return null;
  }

  // ── Task selection ──────────────────────────────────────────────────────

  /** Returns the task ID to work on next, or null if all tasks are done. */
  private _pickTask(lobby: Lobby, self: LobbyPlayer): number | null {
    // Stick with current target if it still has steps remaining
    const isDoorLocked = (taskId: number) =>
      lobby.sabotage?.systemId === SABOTAGE_DOORS &&
      lobby.sabotage.lockedTaskIds.includes(taskId);

    if (this._targetTaskId !== null && isDoorLocked(this._targetTaskId)) {
      this._targetTaskId = null;
      this._dwellTicks = 0;
      this.clearPath();
    }
    if (
      this._targetTaskId !== null &&
      this._nextStep(lobby, self, this._targetTaskId) !== null &&
      !isDoorLocked(this._targetTaskId)
    ) {
      return this._targetTaskId;
    }

    // Build only from this crewmate's own assigned, unfinished tasks. The
    // language model may rank this bounded candidate list but cannot invent a
    // task or issue an authoritative game action.
    const options = self.assignedTasks
      .filter(taskId => !isDoorLocked(taskId))
      .map(taskId => {
        const definition = TASK_DEFS.find(task => task.id === taskId);
        const nextStep = this._nextStep(lobby, self, taskId);
        if (!definition || nextStep === null) return null;
        return {
          taskId,
          name: definition.name,
          remainingSteps: definition.steps - nextStep,
          approximateDistancePx: Math.round(Math.hypot(definition.x - self.x, definition.y - self.y)),
        };
      })
      .filter((option): option is NonNullable<typeof option> => option !== null)
      .sort((a, b) => a.approximateDistancePx - b.approximateDistancePx || a.taskId - b.taskId);

    const fallback = options[0];
    if (!fallback) {
      this._targetTaskId = null;
      return null;
    }

    this._targetTaskId = fallback.taskId;
    this._dwellTicks = 0;
    this.clearPath();
    this._requestTaskPlan(lobby, self, options, fallback.taskId);
    return fallback.taskId;
  }

  /**
   * Let the crewmate model rank its own assigned tasks using only an
   * observation snapshot: no hidden roles, unseen player positions, or private
   * server events enter the prompt. The nearest-task choice remains the
   * deterministic fallback whenever AI is unavailable or invalid.
   */
  private _requestTaskPlan(
    lobby: Lobby,
    self: LobbyPlayer,
    options: readonly {
      taskId: number;
      name: string;
      remainingSteps: number;
      approximateDistancePx: number;
    }[],
    fallbackTaskId: number,
  ): void {
    const apiKey = this.getSessionGroqApiKey(lobby);
    if (!apiKey || this._taskPlanningPending) return;

    const visionRadiusPx = lobby.sabotage?.systemId === SABOTAGE_LIGHTS
      ? LIGHTS_CREWMATE_VISION_RADIUS_PX
      : NORMAL_VISION_RADIUS_PX;
    const nearbyPlayers = observeVisiblePlayers(
      self.slot,
      self.x,
      self.y,
      Array.from(lobby.players.values()).filter(player =>
        !player.inVent && player.disconnectedAtMs === undefined,
      ),
      visionRadiusPx,
      (x, y) => this.hasLineOfSightToPoint(self, { x, y }),
    );
    const messages = buildCrewTaskPlanningMessages({
      username: self.username,
      availableTasks: options,
      nearbyPlayers,
    });
    const generation = ++this._taskPlanningGeneration;
    const roundStartedAtMs = lobby.startedAtMs;
    this._taskPlanningPending = true;

    void requestGroqDialogue(apiKey, messages, Date.now() + 8_000, { temperature: 0.2, jsonMode: true })
      .then(response => {
        if (!response || lobby.phase !== 'ROAMING' || lobby.players.get(self.slot) !== self ||
            !self.alive || lobby.startedAtMs !== roundStartedAtMs ||
            this._targetTaskId !== fallbackTaskId) return;

        const choice = parseCrewTaskChoice(response, options.map(option => option.taskId));
        if (choice === null || choice === fallbackTaskId) return;
        const chosenOption = options.find(option => option.taskId === choice);
        if (!chosenOption || this._nextStep(lobby, self, choice) === null || this.isDoorLockedTask(lobby, choice)) return;

        this._targetTaskId = choice;
        this._dwellTicks = 0;
        this.clearPath();
      })
      .catch(() => {
        // The local nearest-task policy remains authoritative on provider errors.
      })
      .finally(() => {
        if (this._taskPlanningGeneration === generation) this._taskPlanningPending = false;
      });
  }

  private isDoorLockedTask(lobby: Lobby, taskId: number): boolean {
    return lobby.sabotage?.systemId === SABOTAGE_DOORS &&
      lobby.sabotage.lockedTaskIds.includes(taskId);
  }

  /** Ghosts retain their tasks and can pass through walls/closed doors. */
  private _pickGhostTask(lobby: Lobby, self: LobbyPlayer): number | null {
    if (this._targetTaskId !== null && this._nextStep(lobby, self, this._targetTaskId) !== null) {
      return this._targetTaskId;
    }
    for (const taskId of self.assignedTasks) {
      if (this._nextStep(lobby, self, taskId) !== null) {
        if (this._targetTaskId !== taskId) {
          this._targetTaskId = taskId;
        }
        return taskId;
      }
    }
    this._targetTaskId = null;
    return null;
  }

  /** Returns the next step index to complete for taskId, or null if all done. */
  private _nextStep(lobby: Lobby, self: LobbyPlayer, taskId: number): number | null {
    const def = TASK_DEFS.find(t => t.id === taskId);
    if (!def) return null;
    for (let step = 0; step < def.steps; step++) {
      if (!lobby.completedTaskSteps.has(`${self.slot}:${taskId}:${step}`)) return step;
    }
    return null;
  }

  // ── Task execution ──────────────────────────────────────────────────────

  private _handleTask(
    lobby: Lobby,
    self: LobbyPlayer,
    manager: LobbyManager,
    taskId: number,
  ): void {
    const def = TASK_DEFS.find(t => t.id === taskId)!;
    // Consoles are often wall-mounted (exact pixel unwalkable); bots only need
    // to be within TASK_INTERACTION_RANGE_PX, same as the server's own check.
    // Cap the search radius below that range, minus navigateTo's ~25px arrival
    // tolerance, so "arrived at approach point" always implies "in range".
    // Search almost the full server interaction radius for a visible stand-off
    // point. Arrive precisely so the final position remains inside that radius.
    const goal = this.nearestApproachPoint(
      { x: def.x, y: def.y },
      TASK_INTERACTION_RANGE_PX - 8,
      def.interactionTargetRadiusPx ?? 24,
    );
    const arrived = this.navigateTo(self, goal, 8);
    if (!arrived) return;

    // Dwell briefly at the console before submitting each step (looks natural)
    this._dwellTicks++;
    if (this._dwellTicks < TASK_DWELL_TICKS) return;
    this._dwellTicks = 0;

    const step = this._nextStep(lobby, self, taskId);
    if (step === null) return;

    manager.applyTaskStep(lobby, self.slot, taskId, step);
  }

  // ── Wander ──────────────────────────────────────────────────────────────

  private _wander(self: LobbyPlayer): void {
    if (
      this._wanderTarget === null ||
      CrewmateBot.distSq(self.x, self.y, this._wanderTarget.x, this._wanderTarget.y) < 30 * 30
    ) {
      this._wanderTarget = this.randomWalkablePoint();
      this.clearPath();
    }
    this.navigateTo(self, this._wanderTarget);
  }
}
