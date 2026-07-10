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
 *   Random vote among alive players, or skip. No real information, so
 *   crewmate bots choose uniformly at random.
 */
import { BotAgent, grid } from './BotAgent.js';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import { REPORT_RANGE_PX } from '@workspace/shared/collisionMap';
import { SABOTAGE_DEFS } from '@workspace/shared/sabotage';
import { NO_TARGET } from '@workspace/shared/coords';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';
import type { Point } from '@workspace/shared';

/** How long (ms) the bot waits at a task console before completing each step. */
const TASK_DWELL_TICKS = 2; // 2 × 200ms = 400ms

export class CrewmateBot extends BotAgent {
  /** Current target task ID (null = none selected yet). */
  private _targetTaskId: number | null = null;
  /** Current target pad ID for sabotage repair. */
  private _targetPadId: number | null = null;
  /** Ticks spent dwelling at current task console. */
  private _dwellTicks = 0;
  /** Wander target (used when all tasks are complete). */
  private _wanderTarget: Point | null = null;

  override roamingTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    // ── 1. Sabotage active ────────────────────────────────────────────────
    if (lobby.sabotage !== null) {
      this._handleSabotage(lobby, self, manager);
      return;
    }
    this._targetPadId = null; // clear sabotage state when no sabotage

    // ── 2. Report a nearby body ───────────────────────────────────────────
    const body = this._nearbyDeadBody(lobby, self);
    if (body !== null) {
      manager.callMeeting(lobby, self.slot, body);
      return;
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

  override chooseVote(lobby: Lobby, self: LobbyPlayer): number {
    const candidates = Array.from(lobby.players.values()).filter(
      p => p.alive && p.slot !== self.slot,
    );
    if (candidates.length === 0) return NO_TARGET;
    // ~20% chance to skip, otherwise vote randomly
    if (Math.random() < 0.2) return NO_TARGET;
    return candidates[Math.floor(Math.random() * candidates.length)].slot;
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

    const arrived = this.navigateTo(self, { x: pad.x, y: pad.y });
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
      if (p.alive) continue;
      const dSq = CrewmateBot.distSq(self.x, self.y, p.x, p.y);
      if (dSq <= REPORT_RANGE_PX * REPORT_RANGE_PX) return p.slot;
    }
    return null;
  }

  // ── Task selection ──────────────────────────────────────────────────────

  /** Returns the task ID to work on next, or null if all tasks are done. */
  private _pickTask(lobby: Lobby, self: LobbyPlayer): number | null {
    // Stick with current target if it still has steps remaining
    if (
      this._targetTaskId !== null &&
      this._nextStep(lobby, self, this._targetTaskId) !== null
    ) {
      return this._targetTaskId;
    }

    // Pick a new task (first one with remaining steps)
    for (const taskId of self.assignedTasks) {
      if (this._nextStep(lobby, self, taskId) !== null) {
        if (this._targetTaskId !== taskId) {
          this._targetTaskId = taskId;
          this._dwellTicks = 0;
          this.clearPath();
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
    const goal: Point = { x: def.x, y: def.y };
    const arrived = this.navigateTo(self, goal);
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
