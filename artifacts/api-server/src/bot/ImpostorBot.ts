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
 *   Every ~60s (configurable), trigger a sabotage to force crewmates apart
 *   and create hunting opportunities. Only fires when FAKING or HUNTING and
 *   no sabotage is currently active.
 *
 * Voting (MEETING phase):
 *   Vote for a random crewmate. If someone voted for this bot this meeting,
 *   return-vote for the accuser.
 */
import { BotAgent, grid } from './BotAgent.js';
import { KILL_RANGE_PX } from '@workspace/shared/collisionMap';
import { SABOTAGE_DEFS, SABOTAGE_O2, type SabotageSystemId } from '@workspace/shared/sabotage';
import { NO_TARGET } from '@workspace/shared/coords';
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from '@workspace/shared/tasks';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';
import type { Point } from '@workspace/shared';

type BotState = 'FAKING' | 'HUNTING' | 'COOLDOWN';

/** How isolated a target must be (px) before the impostor commits to a hunt. */
const ISOLATION_THRESHOLD_PX = 300;

/** Sabotage trigger interval: ~60s = 300 × 200ms ticks. */
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

  /** Countdown ticks until the next sabotage attempt. */
  private _sabotageCountdown = Math.floor(Math.random() * SABOTAGE_INTERVAL_TICKS);

  override roamingTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    // Decrement sabotage countdown and fire if ready
    this._sabotageCountdown--;
    if (this._sabotageCountdown <= 0) {
      this._trySabotage(lobby, self, manager);
      this._sabotageCountdown = SABOTAGE_INTERVAL_TICKS +
        Math.floor(Math.random() * 60); // jitter ±60 ticks
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

    // If someone accused this bot this meeting, vote for the accuser
    if (meeting) {
      for (const [voterSlot, targetSlot] of meeting.votes) {
        if (targetSlot === self.slot) {
          return voterSlot;
        }
      }
    }

    // Vote for a random alive crewmate (never vote for a known impostor ally)
    const targets = Array.from(lobby.players.values()).filter(p => {
      if (!p.alive || p.slot === self.slot) return false;
      if (p.role === 'impostor') return false; // never vote teammate
      return true;
    });
    if (targets.length === 0) return NO_TARGET;
    return targets[Math.floor(Math.random() * targets.length)].slot;
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
    this._fakeTarget = this.nearestApproachPoint(raw, TASK_INTERACTION_RANGE_PX - 30);
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
      this.clearPath();
    }

    const victim = lobby.players.get(this._huntTargetSlot!)!;

    // Re-check isolation; abort hunt if target is no longer isolated
    const score = this._isolationScore(lobby, self, victim);
    if (score < -ISOLATION_THRESHOLD_PX) {
      this._state = 'FAKING';
      this._huntTargetSlot = null;
      this.clearPath();
      return;
    }

    this.navigateTo(self, { x: victim.x, y: victim.y });

    // Attempt kill if in range
    if (self.killCooldownMs === 0) {
      const applied = manager.applyKill(lobby, self.slot, victim.slot);
      if (applied) {
        this._state = 'COOLDOWN';
        this._huntTargetSlot = null;
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
  private _findIsolatedTarget(lobby: Lobby, self: LobbyPlayer): number | null {
    let bestSlot: number | null = null;
    let bestScore = -Infinity;

    for (const candidate of lobby.players.values()) {
      if (!candidate.alive) continue;
      if (candidate.role === 'impostor') continue;
      if (candidate.slot === self.slot) continue;

      const score = this._isolationScore(lobby, self, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = candidate.slot;
      }
    }

    return bestScore >= 0 ? bestSlot : null;
  }

  private _isolationScore(lobby: Lobby, self: LobbyPlayer, target: LobbyPlayer): number {
    const distToTarget = Math.hypot(self.x - target.x, self.y - target.y);

    let minDistToOther = Infinity;
    for (const other of lobby.players.values()) {
      if (!other.alive) continue;
      if (other.slot === target.slot || other.slot === self.slot) continue;
      const d = Math.hypot(target.x - other.x, target.y - other.y);
      if (d < minDistToOther) minDistToOther = d;
    }

    // score = how far others are from target - how far we are from target
    // Positive → target is isolated relative to us (good)
    return (minDistToOther === Infinity ? ISOLATION_THRESHOLD_PX * 2 : minDistToOther) - distToTarget;
  }

  // ── Sabotage ─────────────────────────────────────────────────────────────

  private _trySabotage(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    if (lobby.sabotage !== null) return; // already active
    if (lobby.sabotageCooldownMs > 0) return;

    // Pick a sabotage system at random from available ones
    const availableIds = Object.keys(SABOTAGE_DEFS)
      .map(Number)
      .filter(id => SABOTAGE_DEFS[id as SabotageSystemId] !== undefined);
    if (availableIds.length === 0) return;

    const systemId = availableIds[Math.floor(Math.random() * availableIds.length)] as SabotageSystemId;
    const triggered = manager.triggerSabotage(lobby, self.slot, systemId);
    if (triggered) {
      manager.broadcastSabotageStart(lobby, systemId, self.slot);
    }
  }
}
