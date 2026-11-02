/**
 * ImpostorBot — AI agent for impostor-role bots.
 *
 * State machine (ROAMING phase):
 *   FAKING    → Navigate to random task locations, wait briefly, move on.
 *               Maintains cover; doesn't actually send task steps.
 *   HUNTING   → Seek the most isolated crewmate. Kill on contact.
 *               Only enters when kill cooldown is ready.
 *   COOLDOWN  → After a kill: return to FAKING while cooldown drains.
 *
 * Sabotage:
 *   Every ~60s (configurable, ±jitter), trigger a sabotage to force
 *   crewmates apart and create hunting opportunities. Only fires when
 *   FAKING or HUNTING and no sabotage is currently active.
 *
 * Voting (MEETING phase):
 *   Vote for a random crewmate. If someone voted for this bot this meeting,
 *   return-vote for the accuser.
 */
import { BotAgent, grid } from './BotAgent.js';
import { KILL_RANGE_PX } from '@workspace/shared/collisionMap';
import { IMPOSTOR_VISION_RADIUS_PX, SABOTAGE_DEFS, SABOTAGE_DOORS, type SabotageSystemId } from '@workspace/shared/sabotage';
import { VENT_DEFS, VENT_INTERACTION_RANGE_PX, type VentDef } from '@workspace/shared/vents';
import { chooseEvidenceWeightedVote } from './voting.js';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';
import type { Point } from '@workspace/shared';
import { requestGroqDialogue } from './groqDialogue.js';
import {
  buildImpostorHuntPlanningMessages,
  buildImpostorSabotagePlanningMessages,
  observeVisiblePlayers,
  parseImpostorHuntChoice,
  parseImpostorSabotageChoice,
} from './strategicPolicy.js';

type BotState = 'FAKING' | 'HUNTING' | 'COOLDOWN';

/** How much isolation a target may lose before an active hunt is abandoned (px). */
const ISOLATION_THRESHOLD_PX = 300;

/**
 * How isolated a target must be (px) before the impostor *commits* to a new
 * hunt (separate from ISOLATION_THRESHOLD_PX, which only governs abandoning
 * an already-active hunt). Originally hardcoded at 0 ("must be strictly
 * closer to the target than any other player"), which was a fairly strict
 * bar — with 5 wandering bots, this rarely triggered (avg ~1.2-1.4 kills per
 * ~34s game). Tuned negative during the Phase E win-rate pass (SINGLE_PLAY.md
 * §9) after fixing the ejection-path task-bar bug pushed crew win rate to
 * ~65-68%: making the impostor commit to slightly-less-than-perfectly-isolated
 * targets increases kill frequency without changing hunt-abort behaviour.
 */
const HUNT_ACQUIRE_THRESHOLD_PX = -150;

/**
 * Sabotage trigger interval: ~60s = 300 × 200ms ticks.
 * (SINGLE_PLAY.md §9 Phase E tuning notes: this was raised to 450 in an
 * earlier pass of the same session, then reverted back to 300 after a
 * separate correctness fix — ejected crewmates also drop their incomplete
 * steps from the task-bar denominator, same as killed ones — pushed crew
 * win rate to ~65% at interval=450. 300 + the ejection fix together landed
 * back in the 55/45±10% target band; see SINGLE_PLAY.md for the full
 * measurement history before changing this again.)
 */
const SABOTAGE_INTERVAL_TICKS = 300;

/** How many ticks to linger at a fake task console before moving on. */
const FAKE_DWELL_TICKS = 3;
/** Crewmate tasks the impostor pretends to work at (for faking cover). */
const FAKE_TASK_POSITIONS: readonly Point[] = TASK_DEFS.map(t => ({ x: t.x, y: t.y }));

export class ImpostorBot extends BotAgent {
  private _state: BotState = 'FAKING';

  /** Current fake-task target (impostor visits these to look busy). */
  private _fakeTarget: Point | null = null;
  private _fakeDwellTicks = 0;

  /** Slot of the current hunt target. */
  private _huntTargetSlot: number | null = null;
  /** Last position actually seen by this impostor; never refreshed from hidden player state. */
  private _huntLastKnownPosition: { slot: number; x: number; y: number; seenAtMs: number } | null = null;
  private _huntPlanningPending = false;
  private _huntPlanningGeneration = 0;
  private _sabotagePlanningPending = false;

  /** Countdown ticks until the next sabotage attempt. */
  private _sabotageCountdown = Math.floor(Math.random() * SABOTAGE_INTERVAL_TICKS);

  /** Use a vent once after a kill, during cooldown, then exit in a connected room. */
  private _ventMode: 'idle' | 'approaching' | 'inside' = 'idle';
  private _ventTargetId: number | null = null;
  private _ventApproachGoal: Point | null = null;
  private _ventApproachTicks = 0;
  private _ventTicksRemaining = 0;
  private _ventTravelled = false;
  private _ventAttemptedThisCooldown = true;

  override roamingTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    // A meeting can forcibly eject a bot from its vent. Discard that old plan.
    if (this._ventMode === 'inside' && !self.inVent) {
      this._resetVentPlan();
      this._ventAttemptedThisCooldown = true;
    }
    if (self.inVent) {
      this._tickInsideVent(lobby, self, manager);
      return;
    }

    // The 15-second kill cooldown is the natural window for a short vent trip.
    if (this._state === 'COOLDOWN' && self.killCooldownMs > 0 &&
        !this._ventAttemptedThisCooldown && this._approachAndEnterVent(lobby, self, manager)) {
      return;
    }

    // Decrement sabotage countdown and fire if ready
    this._sabotageCountdown--;
    if (this._sabotageCountdown <= 0) {
      this._trySabotage(lobby, self, manager);
      this._sabotageCountdown = SABOTAGE_INTERVAL_TICKS +
        Math.floor(Math.random() * 60); // add 0–12s jitter at 5Hz
    }

    // Transition to HUNTING if cooldown is ready and we were FAKING/COOLDOWN
    if ((this._state === 'FAKING' || this._state === 'COOLDOWN') && self.killCooldownMs === 0) {
      const target = this._findIsolatedTarget(lobby, self);
      if (target !== null) {
        this._state = 'HUNTING';
        this._huntTargetSlot = target;
        this.clearPath();
      }
    }

    // Transition back to FAKING if cooldown has gone up (after kill) or target is gone
    if (this._state === 'COOLDOWN' && self.killCooldownMs > 0) {
      // still cooling down — handled in COOLDOWN tick below
    } else if (this._state === 'COOLDOWN' && self.killCooldownMs === 0) {
      this._state = 'FAKING';
    }

    switch (this._state) {
      case 'FAKING':    this._fakeTick(self); break;
      case 'HUNTING':   this._huntTick(lobby, self, manager); break;
      case 'COOLDOWN':  this._fakeTick(self); break;
    }
  }

  override chooseVote(lobby: Lobby, self: LobbyPlayer): number {
    const meeting = lobby.meeting;

    // Deflect a public vote against this bot, but never sacrifice an impostor
    // teammate merely because they voted tactically.
    if (meeting) {
      for (const [voterSlot, targetSlot] of meeting.votes) {
        const voter = lobby.players.get(voterSlot);
        if (targetSlot === self.slot && voter?.alive && voter.role !== 'impostor') {
          return voterSlot;
        }
      }
    }

    // Use the same public-evidence scoring as crewmates, but exclude known
    // impostor allies from the eligible target set.
    return chooseEvidenceWeightedVote(
      self.slot,
      Array.from(lobby.players.values())
        .filter(player => player.alive && player.role === 'crewmate')
        .map(player => ({
          slot: player.slot,
          username: player.username,
          alive: player.alive,
        })),
      meeting?.messages ?? [],
    );
  }

  // ── Faking tasks ─────────────────────────────────────────────────────────

  private _fakeTick(self: LobbyPlayer): void {
    if (this._fakeTarget === null) {
      this._pickFakeTarget(self);
    }

    const arrived = this.navigateTo(self, this._fakeTarget!);
    if (arrived) {
      this._fakeDwellTicks++;
      if (this._fakeDwellTicks >= FAKE_DWELL_TICKS) {
        this._pickFakeTarget(self);
      }
    }
  }

  private _pickFakeTarget(self: LobbyPlayer): void {
    // Pick a random task position different from the current one
    const choices = FAKE_TASK_POSITIONS.filter(p => {
      if (!this._fakeTarget) return true;
      return ImpostorBot.distSq(p.x, p.y, this._fakeTarget.x, this._fakeTarget.y) > 100 * 100;
    });
    const pool = choices.length > 0 ? choices : FAKE_TASK_POSITIONS;
    const raw = pool[Math.floor(Math.random() * pool.length)];
    // Consoles are often wall-mounted (see CrewmateBot._handleTask) — approach
    // within range rather than navigating to the exact, possibly-unwalkable pixel.
    this._fakeTarget = this.nearestApproachPoint(raw, TASK_INTERACTION_RANGE_PX - 3);
    this._fakeDwellTicks = 0;
    this.clearPath();
  }

  // ── Hunting ──────────────────────────────────────────────────────────────

  private _huntTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    // Validate current target
    const target = this._huntTargetSlot !== null
      ? lobby.players.get(this._huntTargetSlot)
      : null;

    if (!target || !target.alive || target.role === 'impostor') {
      // Target gone — re-evaluate
      const newTarget = this._findIsolatedTarget(lobby, self);
      if (newTarget === null) {
        this._state = 'FAKING';
        this._huntTargetSlot = null;
        this.clearPath();
        return;
      }
      this._huntTargetSlot = newTarget;
      this._huntLastKnownPosition = null;
      this.clearPath();
    }

    const victim = lobby.players.get(this._huntTargetSlot!)!;
    const visibleCrew = this._visibleCrewPlayers(lobby, self);
    const currentlyVisible = visibleCrew.some(player => player.slot === victim.slot);

    if (!currentlyVisible) {
      // Follow only the last position this bot actually observed. Do not read
      // victim.x/y from the authoritative lobby while the victim is hidden.
      const lastKnown = this._huntLastKnownPosition;
      if (lastKnown?.slot === victim.slot && Date.now() - lastKnown.seenAtMs <= 4_000) {
        this.navigateTo(self, { x: lastKnown.x, y: lastKnown.y });
        if (Math.hypot(self.x - lastKnown.x, self.y - lastKnown.y) <= 45 &&
            Date.now() - lastKnown.seenAtMs >= 1_500) {
          this._state = 'FAKING';
          this._huntTargetSlot = null;
          this._huntLastKnownPosition = null;
          this.clearPath();
        }
        return;
      }

      const newTarget = this._findIsolatedTarget(lobby, self);
      if (newTarget === null) {
        this._state = 'FAKING';
        this._huntTargetSlot = null;
        this._huntLastKnownPosition = null;
        this.clearPath();
      } else if (newTarget !== this._huntTargetSlot) {
        this._huntTargetSlot = newTarget;
        this._huntLastKnownPosition = null;
        this.clearPath();
      }
      return;
    }

    this._huntLastKnownPosition = {
      slot: victim.slot,
      x: victim.x,
      y: victim.y,
      seenAtMs: Date.now(),
    };

    // Re-check isolation using only crewmates currently visible to the bot.
    const score = this._isolationScore(self, victim, visibleCrew);
    if (score < -ISOLATION_THRESHOLD_PX) {
      this._state = 'FAKING';
      this._huntTargetSlot = null;
      this._huntLastKnownPosition = null;
      this.clearPath();
      return;
    }

    const distanceToVictim = Math.hypot(victim.x - self.x, victim.y - self.y);
    if (distanceToVictim > KILL_RANGE_PX) {
      this.navigateTo(self, { x: victim.x, y: victim.y });
    }

    // A kill is attempted only while the target is currently visible and in
    // the server-authoritative interaction radius. The server revalidates.
    if (self.killCooldownMs === 0 && distanceToVictim <= KILL_RANGE_PX) {
      const applied = manager.applyKill(lobby, self.slot, victim.slot);
      if (applied) {
        this._state = 'COOLDOWN';
        this._huntTargetSlot = null;
        this._huntLastKnownPosition = null;
        this._ventAttemptedThisCooldown = false;
        this._resetVentPlan();
        this.clearPath();
      }
    }
  }

  // ── Isolation scoring ─────────────────────────────────────────────────────

  /**
   * Returns: distance_to_any_other_alive_player - distance_to_target.
   * Positive = target is more isolated than others (good hunting target).
   * Negative = witnesses nearby (abort hunt).
   */
  private _visibleCrewPlayers(lobby: Lobby, self: LobbyPlayer): LobbyPlayer[] {
    // An impostor knows their allies, but cannot track crewmates through walls
    // or across the map. The observation is bounded by the actual impostor
    // vision radius and the same fine-grid LOS geometry used by gameplay.
    const observations = observeVisiblePlayers(
      self.slot,
      self.x,
      self.y,
      Array.from(lobby.players.values())
        .filter(player => player.role === 'crewmate')
        .map(player => ({
          slot: player.slot,
          username: player.username,
          x: player.x,
          y: player.y,
          alive: player.alive,
        })),
      IMPOSTOR_VISION_RADIUS_PX,
      (x, y) => this.hasLineOfSightToPoint(self, { x, y }),
    );
    return observations
      .map(observation => lobby.players.get(observation.slot))
      .filter((player): player is LobbyPlayer => player !== undefined && player.alive && player.role === 'crewmate');
  }

  private _findIsolatedTarget(lobby: Lobby, self: LobbyPlayer): number | null {
    const visibleCrew = this._visibleCrewPlayers(lobby, self);
    let bestSlot: number | null = null;
    let bestScore = -Infinity;

    for (const candidate of visibleCrew) {
      const score = this._isolationScore(self, candidate, visibleCrew);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = candidate.slot;
      }
    }

    if (bestSlot === null || bestScore < HUNT_ACQUIRE_THRESHOLD_PX) return null;
    this._requestHuntTargetChoice(lobby, self, visibleCrew, bestSlot);
    return bestSlot;
  }

  /**
   * Model chooses among server-filtered visible crewmates. The prompt contains
   * no unseen player positions and cannot authorize a kill; the server remains
   * responsible for range, cooldown and LOS checks.
   */
  private _requestHuntTargetChoice(
    lobby: Lobby,
    self: LobbyPlayer,
    visibleCrew: readonly LobbyPlayer[],
    fallbackSlot: number,
  ): void {
    const apiKey = this.getSessionGroqApiKey(lobby);
    if (!apiKey || this._huntPlanningPending) return;

    const visibleTargets = visibleCrew.map(target => ({
      slot: target.slot,
      username: target.username,
      distancePx: Math.round(Math.hypot(self.x - target.x, self.y - target.y)),
      otherVisibleCrewNearby: visibleCrew.filter(other =>
        other.slot !== target.slot &&
        Math.hypot(target.x - other.x, target.y - other.y) <= 300,
      ).length,
    }));
    const messages = buildImpostorHuntPlanningMessages({
      username: self.username,
      killCooldownMs: self.killCooldownMs,
      visibleCrew: visibleTargets,
    });
    const generation = ++this._huntPlanningGeneration;
    const roundStartedAtMs = lobby.startedAtMs;
    this._huntPlanningPending = true;

    void requestGroqDialogue(apiKey, messages, Date.now() + 8_000)
      .then(response => {
        if (!response || lobby.phase !== 'ROAMING' || lobby.players.get(self.slot) !== self ||
            !self.alive || lobby.startedAtMs !== roundStartedAtMs ||
            this._state !== 'HUNTING' || this._huntTargetSlot !== fallbackSlot) return;
        const choice = parseImpostorHuntChoice(
          response,
          visibleTargets.map(target => target.slot),
        );
        if (choice === null || choice === fallbackSlot) return;
        // Re-check visibility at commit time. A response cannot make the
        // impostor pursue a slot that has already left its legitimate view.
        if (!this._visibleCrewPlayers(lobby, self).some(player => player.slot === choice)) return;
        this._huntTargetSlot = choice;
        this._huntLastKnownPosition = null;
        this.clearPath();
      })
      .catch(() => {
        // The local visible-isolation heuristic is the fail-closed fallback.
      })
      .finally(() => {
        if (this._huntPlanningGeneration === generation) this._huntPlanningPending = false;
      });
  }

  private _isolationScore(
    self: LobbyPlayer,
    target: LobbyPlayer,
    visibleCrew: readonly LobbyPlayer[],
  ): number {
    const distToTarget = Math.hypot(self.x - target.x, self.y - target.y);
    let minDistToOther = Infinity;
    for (const other of visibleCrew) {
      if (other.slot === target.slot) continue;
      const d = Math.hypot(target.x - other.x, target.y - other.y);
      if (d < minDistToOther) minDistToOther = d;
    }

    // An unseen player is not treated as a witness or a target. The baseline
    // is the impostor's actual vision radius, not server-global player state.
    return (minDistToOther === Infinity ? IMPOSTOR_VISION_RADIUS_PX : minDistToOther) - distToTarget;
  }

  // ── Sabotage ─────────────────────────────────────────────────────────────

  private _trySabotage(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    if (lobby.phase !== 'ROAMING' || lobby.sabotage !== null || lobby.sabotageCooldownMs > 0 ||
        this._sabotagePlanningPending) return;

    const availableSystems = Object.values(SABOTAGE_DEFS)
      .map(definition => ({ systemId: definition.id, name: definition.name }));
    if (availableSystems.length === 0) return;
    const availableIds = availableSystems.map(system => system.systemId);
    const fallback = availableIds[Math.floor(Math.random() * availableIds.length)] as SabotageSystemId;
    const apiKey = this.getSessionGroqApiKey(lobby);

    // Without a model key, keep the known local policy. When configured, let
    // the impostor reason over public task progress and currently visible
    // crewmates, but never let its output bypass server sabotage validation.
    if (!apiKey) {
      this._commitSabotageChoice(lobby, self, manager, fallback);
      return;
    }

    const visibleCrew = this._visibleCrewPlayers(lobby, self);
    let visiblePairsWithin350Px = 0;
    for (let i = 0; i < visibleCrew.length; i++) {
      for (let j = i + 1; j < visibleCrew.length; j++) {
        if (Math.hypot(
          visibleCrew[i].x - visibleCrew[j].x,
          visibleCrew[i].y - visibleCrew[j].y,
        ) <= 350) visiblePairsWithin350Px++;
      }
    }
    const publicTaskProgressPct = lobby.totalTaskSteps > 0
      ? (lobby.completedTaskSteps.size / lobby.totalTaskSteps) * 100
      : 0;
    const messages = buildImpostorSabotagePlanningMessages({
      username: self.username,
      availableSystems,
      visibleCrewCount: visibleCrew.length,
      visibleCrewPairsWithin350Px,
      publicTaskProgressPct,
      killCooldownMs: self.killCooldownMs,
    });
    const roundStartedAtMs = lobby.startedAtMs;
    this._sabotagePlanningPending = true;

    void requestGroqDialogue(apiKey, messages, Date.now() + 8_000)
      .then(response => {
        if (lobby.phase !== 'ROAMING' || lobby.players.get(self.slot) !== self || !self.alive ||
            lobby.startedAtMs !== roundStartedAtMs) return;
        const chosen = response
          ? parseImpostorSabotageChoice(response, availableIds)
          : null;
        this._commitSabotageChoice(lobby, self, manager, (chosen ?? fallback) as SabotageSystemId);
      })
      .catch(() => {
        if (lobby.phase === 'ROAMING' && lobby.players.get(self.slot) === self && self.alive &&
            lobby.startedAtMs === roundStartedAtMs) {
          this._commitSabotageChoice(lobby, self, manager, fallback);
        }
      })
      .finally(() => {
        this._sabotagePlanningPending = false;
      });
  }

  private _commitSabotageChoice(
    lobby: Lobby,
    self: LobbyPlayer,
    manager: LobbyManager,
    systemId: SabotageSystemId,
  ): void {
    if (lobby.phase !== 'ROAMING' || lobby.sabotage !== null || lobby.sabotageCooldownMs > 0 ||
        !self.alive || lobby.players.get(self.slot) !== self ||
        SABOTAGE_DEFS[systemId] === undefined) return;

    const triggered = manager.triggerSabotage(lobby, self.slot, systemId);
    if (!triggered) return;
    manager.broadcastSabotageStart(lobby, systemId, self.slot);
    if (systemId === SABOTAGE_DOORS) manager.broadcastDoorLocks(lobby);
  }

  /** Find a vent during kill cooldown and approach it using the shared collision/pathfinding. */
  private _approachAndEnterVent(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): boolean {
    if (this._ventMode === 'idle') {
      const nearest = [...VENT_DEFS].sort((a, b) =>
        Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y),
      )[0];
      if (!nearest) {
        this._ventAttemptedThisCooldown = true;
        return false;
      }
      this._ventTargetId = nearest.id;
      this._ventApproachGoal = this.nearestApproachPoint(
        { x: nearest.x, y: nearest.y },
        VENT_INTERACTION_RANGE_PX - 3,
        20,
      );
      this._ventApproachTicks = 0;
      this._ventMode = 'approaching';
      this.clearPath();
    }

    if (this._ventMode !== 'approaching' || this._ventTargetId === null || !this._ventApproachGoal) {
      return false;
    }

    const vent = VENT_DEFS.find(v => v.id === this._ventTargetId);
    if (!vent) {
      this._finishVentAttempt();
      return false;
    }

    this._ventApproachTicks++;
    const arrived = this.navigateTo(self, this._ventApproachGoal);
    if (arrived) {
      if (manager.enterVent(lobby, self.slot, vent.id)) {
        this._ventMode = 'inside';
        this._ventTicksRemaining = 6 + Math.floor(Math.random() * 6);
        this._ventTravelled = false;
        return true;
      }
      this._finishVentAttempt();
      return false;
    }
    if (this._ventApproachTicks >= 25) {
      // Do not sacrifice the rest of the impostor's turn to an unreachable vent.
      this._finishVentAttempt();
      return false;
    }
    return true;
  }

  /** Stay hidden briefly, travel to a connected vent once, then exit. */
  private _tickInsideVent(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    if (lobby.phase !== 'ROAMING' || !self.inVent) {
      this._finishVentAttempt();
      return;
    }

    this._ventTicksRemaining--;
    if (!this._ventTravelled && this._ventTicksRemaining <= 4) {
      const current = VENT_DEFS.find(v => v.id === self.ventId);
      const exits = current?.connections
        .map(id => VENT_DEFS.find(v => v.id === id))
        .filter((v): v is VentDef => v !== undefined) ?? [];
      if (exits.length > 0) {
        const destination = exits[Math.floor(Math.random() * exits.length)];
        manager.travelVent(lobby, self.slot, destination.id);
      }
      this._ventTravelled = true;
    }

    if (this._ventTicksRemaining <= 0) {
      manager.exitVent(lobby, self.slot);
      this._finishVentAttempt();
    }
  }

  private _finishVentAttempt(): void {
    this._ventAttemptedThisCooldown = true;
    this._resetVentPlan();
    this.clearPath();
  }

  private _resetVentPlan(): void {
    this._ventMode = 'idle';
    this._ventTargetId = null;
    this._ventApproachGoal = null;
    this._ventApproachTicks = 0;
    this._ventTicksRemaining = 0;
    this._ventTravelled = false;
  }
}
