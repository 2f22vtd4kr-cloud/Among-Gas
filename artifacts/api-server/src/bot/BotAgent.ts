/**
 * BotAgent — abstract base class for server-side bot AI agents.
 *
 * Bots occupy real LobbyPlayer slots (with a NullWebSocket sentinel) and
 * update their x/y directly. The existing 25Hz delta-broadcast loop picks
 * up those position changes automatically — no extra broadcast code needed.
 *
 * Subclasses implement tick() and chooseVote().
 */
import {
  buildCollisionGrid,
  buildPreciseCollisionGrid,
  buildPreciseVisionGrid,
  isPlayerPositionWalkable,
  isBlocked,
  isLineOfSightClear,
  isLineOfSightToInteractionTarget,
} from '@workspace/shared/collisionMap';
import {
  FEET_OFFSET_Y,
  PLAYER_RADIUS,
  PLAYER_HALF_WIDTH,
  MAP_W,
  MAP_H,
  MEETING_DISCUSSION_MS,
  MEETING_VOTING_MS,
} from '@workspace/shared/coords';
import { PathCache } from '@workspace/shared';
import {
  BOT_NAVIGATION_GEOMETRY,
  BOT_NAVIGATION_GRID,
  isBotNavigationReachable,
} from '@workspace/shared/collision/botNavigation';
import { getProductionCollisionWorld } from '@workspace/shared/collision/productionWorld';
import { buildFineShadowGrid, buildFineShadowSegments, buildNarrowShadowOccluders, isVisionLineClear, isVisionPointBlocked as isVisionGridPointBlocked } from '@workspace/shared/collision/visibility';
import type { CollisionWorld } from '@workspace/shared/collision';
import type { Point } from '@workspace/shared';
import type { Lobby, LobbyPlayer, LobbyManager } from '../ws/lobby.js';
import { SPAWN_X, SPAWN_Y } from '../ws/lobby.js';
import { NO_TARGET } from '@workspace/shared/coords';
import { buildPublicBotDialogueMessages, GROQ_DECISION_RESERVE_MS, requestGroqDialogue } from './groqDialogue.js';
import { buildInternalBotDialogue } from './internalDialogue.js';
import { buildPublicBotVoteMessages, canCommitBotVote, parsePublicBotVoteResponse } from './aiVoting.js';

export { NO_TARGET };

/** Legacy compact grid retained for compatibility; bot movement uses the vector world below. */
export const grid = buildCollisionGrid();
const movementGrid: CollisionWorld = getProductionCollisionWorld();
// The red-line reference authors movement barriers, not vision occluders.
// Match the server's independent sight grid so bots never choose a task point
// that the authoritative interaction-visibility check will reject.
const sightGrid = buildPreciseCollisionGrid();
const visionSourceGrid = buildPreciseVisionGrid();
const botVisionGrid = buildFineShadowGrid(visionSourceGrid);
const botVisionOccluders = buildNarrowShadowOccluders(visionSourceGrid, true);
const botVisionSegments = buildFineShadowSegments(visionSourceGrid);
const NAV_COLS = BOT_NAVIGATION_GEOMETRY.cols;
const NAV_ROWS = BOT_NAVIGATION_GEOMETRY.rows;
const NAV_CELL_X = BOT_NAVIGATION_GEOMETRY.cellX;
const NAV_CELL_Y = BOT_NAVIGATION_GEOMETRY.cellY;
const navigationGeometry = BOT_NAVIGATION_GEOMETRY;
const navigationGrid = BOT_NAVIGATION_GRID;
export { isBotNavigationReachable };

/** Empty routes represent cached pathfinding failure, not successful arrival. */
export function hasCompletedNavigationRoute(route: readonly Point[] | null, index: number): boolean {
  return route !== null && route.length > 0 && index >= route.length;
}

/**
 * If a valid continuous player position lies in a blocked/coarse A* cell,
 * connect it to the nearest safely reachable centre in the spawn component.
 * Every connector is checked by the authoritative swept player footprint.
 */
function nearestCollisionSafeNavigationStart(feetStart: Point): Point | null {
  const startCol = Math.floor(feetStart.x / NAV_CELL_X);
  const startRow = Math.floor(feetStart.y / NAV_CELL_Y);

  for (let radius = 0; radius <= 4; radius++) {
    const candidates: Array<{ point: Point; distanceSquared: number }> = [];
    for (let row = startRow - radius; row <= startRow + radius; row++) {
      for (let col = startCol - radius; col <= startCol + radius; col++) {
        if (Math.max(Math.abs(col - startCol), Math.abs(row - startRow)) !== radius ||
            col < 0 || col >= NAV_COLS || row < 0 || row >= NAV_ROWS) continue;
        const index = row * NAV_COLS + col;
        if (navigationGrid[index] !== 0) continue;
        const point = {
          x: (col + 0.5) * NAV_CELL_X,
          y: (row + 0.5) * NAV_CELL_Y,
        };
        if (!isBotNavigationReachable(point.x, point.y)) continue;
        candidates.push({
          point,
          distanceSquared: (point.x - feetStart.x) ** 2 + (point.y - feetStart.y) ** 2,
        });
      }
    }
    candidates.sort((a, b) => a.distanceSquared - b.distanceSquared);
    for (const candidate of candidates) {
      const [x, y] = movementGrid.movePlayerAtFeet(
        feetStart.x,
        feetStart.y,
        candidate.point.x - feetStart.x,
        candidate.point.y - feetStart.y,
      );
      if (Math.hypot(x - candidate.point.x, y - candidate.point.y) <= 0.75) {
        return candidate.point;
      }
    }
  }
  return null;
}

/** Keep the bot inside navigation cells that A* can represent. */
function isNavigationPositionWalkable(feetX: number, feetY: number): boolean {
  const col = Math.floor(feetX / NAV_CELL_X);
  const row = Math.floor(feetY / NAV_CELL_Y);
  return col >= 0 && col < NAV_COLS && row >= 0 && row < NAV_ROWS &&
    navigationGrid[row * NAV_COLS + col] === 0;
}

/** Snap goals to the same cell centres returned by PathCache's A* waypoints. */
function snapNavigationPoint(point: Point): Point {
  const col = Math.floor(point.x / NAV_CELL_X);
  const row = Math.floor((point.y + FEET_OFFSET_Y) / NAV_CELL_Y);
  return {
    x: (col + 0.5) * NAV_CELL_X,
    y: (row + 0.5) * NAV_CELL_Y - FEET_OFFSET_Y,
  };
}

/**
 * Find nearby walkable graph nodes that are within the caller's arrival range
 * of a continuous target. Chasing a moving player must end at a safe nav node,
 * not require a straight swept-footprint segment from that node to the exact
 * (off-centre) target coordinate; that final segment may cross a thin wall
 * even when both positions are independently walkable.
 */
function nearbyCollisionSafeNavigationGoals(feetGoal: Point, maxDistance: number): Point[] {
  if (!Number.isFinite(maxDistance) || maxDistance < 0) return [];
  const minCol = Math.max(0, Math.floor((feetGoal.x - maxDistance) / NAV_CELL_X));
  const maxCol = Math.min(NAV_COLS - 1, Math.floor((feetGoal.x + maxDistance) / NAV_CELL_X));
  const minRow = Math.max(0, Math.floor((feetGoal.y - maxDistance) / NAV_CELL_Y));
  const maxRow = Math.min(NAV_ROWS - 1, Math.floor((feetGoal.y + maxDistance) / NAV_CELL_Y));
  const candidates: Array<{ point: Point; distanceSquared: number }> = [];

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const index = row * NAV_COLS + col;
      if (navigationGrid[index] !== 0) continue;
      const point = {
        x: (col + 0.5) * NAV_CELL_X,
        y: (row + 0.5) * NAV_CELL_Y,
      };
      const dx = point.x - feetGoal.x;
      const dy = point.y - feetGoal.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > maxDistance * maxDistance ||
          !isBotNavigationReachable(point.x, point.y)) continue;
      candidates.push({ point, distanceSquared });
    }
  }

  candidates.sort((a, b) => a.distanceSquared - b.distanceSquared);
  return candidates.slice(0, 24).map(candidate => candidate.point);
}

/** Keep approach goals out of pinched wall gaps; leave extra room for the feet collider. */
function hasApproachClearance(point: Point): boolean {
  const feetY = point.y + FEET_OFFSET_Y;
  const radius = PLAYER_RADIUS + 4;
  return movementGrid.isWalkable(point.x - PLAYER_HALF_WIDTH, feetY, radius) &&
    movementGrid.isWalkable(point.x, feetY, radius) &&
    movementGrid.isWalkable(point.x + PLAYER_HALF_WIDTH, feetY, radius);
}

/** Return the actual safe feet endpoint, never the requested point near a blocked edge. */
function traverseTo(from: Point, to: Point): Point | null {
  const [x, y] = movementGrid.movePlayerAtFeet(
    from.x, from.y, to.x - from.x, to.y - from.y,
  );
  // The vector world is authoritative. Do not reject a safe continuous
  // position merely because the centre of its coarse A* cell is blocked.
  // Sliding may stop short of the requested point while still making safe
  // progress along a wall, so return the actual swept endpoint.
  if (Math.hypot(x - from.x, y - from.y) < 0.01) return null;
  return { x, y };
}

/** Exact continuous swept-footprint test between adjacent A* cell centres. */
function traverseVector(from: Point, to: Point): Point | null {
  const [x, y] = movementGrid.movePlayerAtFeet(
    from.x, from.y, to.x - from.x, to.y - from.y,
  );
  return Math.hypot(x - to.x, y - to.y) <= 0.75 ? { x, y } : null;
}

/** Distance from a point to a finite route segment. */
/** A* may traverse a nav edge only when the exact player footprint can sweep it. */
const validateProductionNavigationStep = (from: Point, to: Point): boolean => {
  const [x, y] = movementGrid.movePlayerAtFeet(
    from.x, from.y, to.x - from.x, to.y - from.y,
  );
  return Math.hypot(x - to.x, y - to.y) <= 0.75;
};

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  ));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

/** Pixel distance per 200ms tick ≈ 400px/s — legacy movement basis used by ghost tasks. */
export const BOT_SPEED_PX = 80;
/** Living bots tick at 5Hz and walk at roughly 200px/s, matching the human player. */
// Match the human player's roughly 200px/s walk speed on the custom map.
export const BOT_MOVEMENT_STEP_PX = BOT_SPEED_PX / 2;

/** Arrive when squared distance to goal is ≤ this (25px radius). */

const BOT_DISCUSSION_MIN_GAP_MS = 3_200;
const BOT_DISCUSSION_REPLY_MIN_GAP_MS = 1_600;
const BOT_DISCUSSION_MAX_MESSAGES_PER_MEETING = 4;

interface MeetingBotDiscussionSchedule {
  nextMessageAtMs: number;
  lastMessageAtMs: number;
  reservedMessages: number;
  answeredQuestionKeys: Set<string>;
}

const meetingBotDiscussionSchedules = new WeakMap<object, MeetingBotDiscussionSchedule>();

/**
 * Reserve a single global speaking slot for all bots in this meeting.
 * Ordinary turns retain the 3.2–3.9s meeting-wide cadence. A single selected
 * responder may answer an unanswered public question after a shorter 1.6s
 * human-like pause; the question key is then consumed so other bots cannot
 * dog-pile the same prompt. Every turn still counts toward the meeting cap.
 */
export function reserveBotDiscussionSlot(
  meeting: object,
  nowMs: number,
  slot: number,
  livingBotCount: number,
  questionReplyKey?: string,
): boolean {
  let schedule = meetingBotDiscussionSchedules.get(meeting);
  if (!schedule) {
    schedule = {
      nextMessageAtMs: 0,
      lastMessageAtMs: 0,
      reservedMessages: 0,
      answeredQuestionKeys: new Set<string>(),
    };
    meetingBotDiscussionSchedules.set(meeting, schedule);
  }
  const messageLimit = Math.min(
    BOT_DISCUSSION_MAX_MESSAGES_PER_MEETING,
    Math.max(1, Math.trunc(livingBotCount)),
  );
  if (schedule.reservedMessages >= messageLimit) return false;

  const isQuestionReply = questionReplyKey !== undefined;
  if (isQuestionReply) {
    if (schedule.answeredQuestionKeys.has(questionReplyKey)) return false;
    if (schedule.lastMessageAtMs > 0 &&
        nowMs - schedule.lastMessageAtMs < BOT_DISCUSSION_REPLY_MIN_GAP_MS) return false;
  } else if (nowMs < schedule.nextMessageAtMs) {
    return false;
  }

  schedule.reservedMessages++;
  schedule.lastMessageAtMs = nowMs;
  if (isQuestionReply) schedule.answeredQuestionKeys.add(questionReplyKey);
  // A reply is a real turn, so the normal minimum gap applies again after it.
  // Deterministic variation avoids a metronomic cadence without allowing
  // multiple agents to reserve the same turn in one 200ms frame.
  schedule.nextMessageAtMs = nowMs + BOT_DISCUSSION_MIN_GAP_MS + (Math.abs(slot) % 3) * 350;
  return true;
}

export abstract class BotAgent {
  protected readonly pathCache = new PathCache();
  private navigationRoute: Point[] | null = null;
  private navigationRouteGoal: Point | null = null;
  private navigationRouteIndex = 0;
  private navigationRouteOrigin: Point | null = null;
  private discussionMeeting: Lobby['meeting'] = null;
  private discussionSentInMeeting = false;
  private nextDiscussionChatAtMs = 0;
  private lastDiscussionMessageKey = '';
  private discussionRequestPending = false;
  private lastDiscussionReplyAtMs = 0;
  private voteRequestMeeting: Lobby['meeting'] = null;
  private voteRequestPending = false;

  // ── Abstract interface ──────────────────────────────────────────────────

  /** Called every 200ms by LobbyManager's 5Hz bot tick while the lobby is ROAMING. */
  abstract roamingTick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void;

  /**
   * Ghosts can still complete tasks, but cannot kill, report bodies, or repair
   * sabotage. Subclasses opt in; the default intentionally does nothing.
   */
  ghostTick(_lobby: Lobby, _self: LobbyPlayer, _manager: LobbyManager): void {}

  /**
   * Choose a vote target slot.  Called once per meeting, after votingOpen.
   * Return NO_TARGET (0xFF) to skip.
   */
  abstract chooseVote(lobby: Lobby, self: LobbyPlayer): number;

  // ── Main dispatch ───────────────────────────────────────────────────────

  tick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void {
    if (!self.alive) {
      // In the base game, dead crewmates become ghosts but keep doing tasks.
      // Impostor ghosts have no assigned tasks and remain inert.
      if (self.role === 'crewmate' && lobby.phase === 'ROAMING') {
        this.ghostTick(lobby, self, manager);
      }
      return;
    }

    if (lobby.phase === 'ROAMING') {
      this.roamingTick(lobby, self, manager);
      return;
    }

    if (lobby.phase === 'MEETING') {
      const meeting = lobby.meeting;
      if (!meeting) return;
      if (!meeting.votingOpen) {
        this.discuss(lobby, self, manager, meeting);
        return;
      }
      if (meeting.votes.has(self.slot)) return; // already voted
      this.requestMeetingVote(lobby, self, manager, meeting);
    }
  }

  /** Retrieve the session-scoped Groq key without exposing it to client state. */
  protected getSessionGroqApiKey(lobby: Lobby): string | undefined {
    return lobby.players.get(lobby.hostSlot)?.groqApiKey ??
      Array.from(lobby.players.values()).find(player => !player.isBot && player.groqApiKey)?.groqApiKey;
  }

  /**
   * Request an asynchronous model vote without blocking the 5Hz bot loop.
   * Each bot's request is staggered to respect the shared per-key provider
   * cooldown. The deterministic role-aware vote remains the fail-closed path.
   */
  private requestMeetingVote(
    lobby: Lobby,
    self: LobbyPlayer,
    manager: LobbyManager,
    meeting: NonNullable<Lobby['meeting']>,
  ): void {
    if (this.voteRequestMeeting !== meeting) {
      this.voteRequestMeeting = meeting;
      this.voteRequestPending = false;
    }
    if (meeting.votes.has(self.slot)) return;
    const fallback = this.chooseVote(lobby, self);
    const voteDeadlineAtMs = (meeting.startedAtMs ?? 0) + MEETING_DISCUSSION_MS + MEETING_VOTING_MS;

    // Do not let a slow provider or a long shared-key queue leave a bot with no
    // vote. Commit its deterministic decision with one provider-timeout of
    // safety margin; any eventual model response is rejected by the voted guard.
    if (Date.now() >= voteDeadlineAtMs - GROQ_DECISION_RESERVE_MS) {
      manager.castVote(lobby, self.slot, fallback);
      return;
    }
    if (this.voteRequestPending) return;

    const sessionKey = this.getSessionGroqApiKey(lobby);

    // Without a configured provider, preserve immediate deterministic play.
    if (!sessionKey) {
      manager.castVote(lobby, self.slot, fallback);
      return;
    }

    this.voteRequestPending = true;
    const publicRoster = Array.from(lobby.players.values())
      .filter(player => player.alive)
      .map(player => ({ slot: player.slot, username: player.username, alive: true }));
    const publicTranscript = meeting.messages.slice(-12).map(message => ({
      slot: message.slot,
      text: message.text,
    }));
    const prompt = buildPublicBotVoteMessages(self.username, publicRoster, publicTranscript);

    void (async () => {
      const response = await requestGroqDialogue(sessionKey, prompt, voteDeadlineAtMs, { temperature: 0.2, jsonMode: true });

      if (!canCommitBotVote({
        phase: lobby.phase,
        currentMeeting: lobby.meeting,
        requestedMeeting: meeting,
        votingOpen: meeting.votingOpen,
        alive: self.alive,
        hasVoted: meeting.votes.has(self.slot),
      })) return;

      const parsed = response === null
        ? null
        : parsePublicBotVoteResponse(response, self.slot, publicRoster);
      const candidate = parsed === null ? fallback : parsed;
      const target = candidate === NO_TARGET ? undefined : lobby.players.get(candidate);
      // The model sees no roles. The authoritative server enforces role rules:
      // impostors cannot vote for an impostor ally; nobody can vote for self/dead.
      const legal = candidate === NO_TARGET ||
        (!!target && target.alive && target.slot !== self.slot &&
          (self.role !== 'impostor' || target.role !== 'impostor'));
      manager.castVote(lobby, self.slot, legal ? candidate : fallback);
    })().catch(() => {
      if (canCommitBotVote({
        phase: lobby.phase,
        currentMeeting: lobby.meeting,
        requestedMeeting: meeting,
        votingOpen: meeting.votingOpen,
        alive: self.alive,
        hasVoted: meeting.votes.has(self.slot),
      })) manager.castVote(lobby, self.slot, fallback);
    }).finally(() => {
      // A request from an older meeting must not clear the pending state of a
      // newer meeting that started while the provider call was still in flight.
      if (this.voteRequestMeeting === meeting) this.voteRequestPending = false;
    });
  }

  /**
   * Public-transcript-only meeting dialogue. With a host-provided Groq key,
   * bots generate contextual replies server-side. Without it (or on any
   * provider failure), deterministic local dialogue remains available.
   */
  private discuss(
    lobby: Lobby,
    self: LobbyPlayer,
    manager: LobbyManager,
    meeting: NonNullable<Lobby['meeting']>,
  ): void {
    if (this.discussionMeeting !== meeting) {
      this.discussionMeeting = meeting;
      this.lastDiscussionMessageKey = '';
      this.discussionSentInMeeting = false;
      this.discussionRequestPending = false;
      this.lastDiscussionReplyAtMs = 0;
      this.nextDiscussionChatAtMs = Date.now() + 500 + (self.slot % 5) * 650;
    }
    const now = Date.now();
    if (this.discussionSentInMeeting || this.discussionRequestPending || meeting.votingOpen || now < this.nextDiscussionChatAtMs) return;

    const recentMessages = meeting.messages.slice(-8);
    const latestRelevant = [...recentMessages].reverse().find(entry => {
      if (entry.slot === self.slot) return false;
      const speaker = lobby.players.get(entry.slot);
      if (!speaker || !speaker.alive) return false;
      if (!speaker.isBot) return true;
      const lower = entry.text.toLocaleLowerCase();
      const addressedToSelf = lower.includes(self.username.toLocaleLowerCase()) ||
        lower.includes(`#${String(self.slot + 1).padStart(2, '0')}`) ||
        lower.includes(`player ${String(self.slot + 1).padStart(2, '0')}`);
      if (addressedToSelf) return true;
      // Let exactly one other living bot answer a bot's open question. The
      // message timestamp deterministically chooses the responder so a six-bot
      // lobby does not produce six simultaneous replies or a chat storm.
      if (!entry.text.includes('?')) return false;
      const responderSlots = Array.from(lobby.players.values())
        .filter(player => player.alive && player.isBot && player.slot !== entry.slot)
        .map(player => player.slot)
        .sort((a, b) => a - b);
      if (responderSlots.length === 0) return false;
      const responderIndex = Math.abs(Math.trunc(entry.sentAtMs)) % responderSlots.length;
      return responderSlots[responderIndex] === self.slot;
    });
    const messageKey = latestRelevant
      ? `${latestRelevant.slot}:${latestRelevant.sentAtMs}`
      : 'opening';
    if (messageKey === this.lastDiscussionMessageKey || now - this.lastDiscussionReplyAtMs < 1400) return;
    const livingBotCount = Array.from(lobby.players.values()).filter(player => player.alive && player.isBot).length;
    const questionReplyKey = latestRelevant?.text.includes('?') ? messageKey : undefined;
    if (!reserveBotDiscussionSlot(meeting, now, self.slot, livingBotCount, questionReplyKey)) return;
    this.discussionSentInMeeting = true;

    const hasBody = meeting.bodySlot !== NO_TARGET;
    const speaker = latestRelevant ? lobby.players.get(latestRelevant.slot) : undefined;
    const humanText = latestRelevant?.text.toLocaleLowerCase() ?? '';
    const fallback = buildInternalBotDialogue({
      username: self.username,
      role: self.role,
      meetingType: hasBody ? 'body report' : 'emergency call',
      livingRoster: Array.from(lobby.players.values()).filter(player => player.alive).map(player => player.username),
      latestSpeaker: speaker?.username,
      latestSpeakerIsBot: speaker?.isBot === true,
      latestMessage: latestRelevant?.text,
    });

    this.lastDiscussionMessageKey = messageKey;
    this.lastDiscussionReplyAtMs = now;
    this.discussionRequestPending = true;
    const sessionKey = this.getSessionGroqApiKey(lobby);
    const roster = Array.from(lobby.players.values())
      .filter(player => player.alive)
      .map(player => player.username)
      .join(', ');
    const transcript = recentMessages.map(entry => {
      const player = lobby.players.get(entry.slot);
      return `${player?.username ?? 'Player'}: ${entry.text.slice(0, 220)}`;
    }).join('\n');

    void (async () => {
      let reply: string | null = null;
      if (sessionKey) {
        reply = await requestGroqDialogue(sessionKey, buildPublicBotDialogueMessages({
          username: self.username,
          livingRoster: roster,
          meetingType: hasBody ? 'body report' : 'emergency call',
          publicTranscript: transcript,
        }), (meeting.startedAtMs ?? 0) + MEETING_DISCUSSION_MS);
      }
      if (lobby.meeting !== meeting || meeting.votingOpen || lobby.phase !== 'MEETING') return;
      manager.sendMeetingChat(lobby, self.slot, reply ?? fallback);
    })().catch(() => {
      if (lobby.meeting === meeting && !meeting.votingOpen && lobby.phase === 'MEETING') {
        manager.sendMeetingChat(lobby, self.slot, fallback);
      }
    }).finally(() => {
      // Do not let a stale meeting request mutate the scheduling state of the
      // next meeting after a fast meeting rollover.
      if (this.discussionMeeting === meeting) {
        this.discussionRequestPending = false;
        this.nextDiscussionChatAtMs = Date.now() + 1000 + (self.slot % 4) * 300;
      }
    });
  }

  // ── Shared movement helpers ─────────────────────────────────────────────

  /**
   * Move the bot one step along the path to `goal` (pixel coords).
   * Directly mutates self.x / self.y — picked up by the 25Hz delta loop.
   * Returns true when the bot has arrived within the arrival threshold.
   *
   * Offset handling: `self.x/y` and `goal` are stored in sprite-anchor space
   * (matching the client/wsServer convention — see coords.ts), but the
   * collision grid's walls were traced at the character's *feet*, offset
   * FEET_OFFSET_Y below the anchor. Every other collision check in this
   * codebase (client movement, wsServer 0x11, randomWalkablePoint below)
   * adds that offset right before touching the grid. `findPath` previously
   * did not, so it validated walkability at the raw anchor position while
   * this method separately re-validated the resulting waypoint at
   * anchor+offset — often a *different* grid cell — which silently blocked
   * nearly every real path (see .agents/memory/ for the investigation).
   * Fix: do the whole search in feet-space, then shift back once at the end.
   */
  private rebuildNavigationRoute(feetStart: Point, feetGoal: Point, arrivalTolerancePx: number): void {
    const routeStart = nearestCollisionSafeNavigationStart(feetStart) ?? feetStart;
    const goalCandidates = nearbyCollisionSafeNavigationGoals(feetGoal, arrivalTolerancePx);
    let result: ReturnType<PathCache["find"]> = null;
    let selectedGoal = feetGoal;

    // Prefer a route ending at a nearby safe nav-cell centre. This avoids
    // rejecting legitimate continuous targets merely because the final
    // centre-to-target connector crosses a thin, independently authored wall.
    for (const candidate of goalCandidates) {
      const attempt = this.pathCache.find(
        navigationGrid, routeStart, candidate, false, navigationGeometry, true, validateProductionNavigationStep,
      );
      if (attempt) {
        result = attempt;
        selectedGoal = candidate;
        break;
      }
    }

    // Keep a best-effort exact target fallback for goals that have no reachable
    // node inside arrival range; the movement sweeper still prevents wall cuts.
    if (!result) {
      result = this.pathCache.find(
        navigationGrid, routeStart, feetGoal, false, navigationGeometry, true, validateProductionNavigationStep,
      );
    }

    this.navigationRoute = result?.waypoints ?? [];
    this.navigationRouteGoal = selectedGoal;
    this.navigationRouteIndex = 0;
    this.navigationRouteOrigin = feetStart;
  }

  protected navigateTo(self: LobbyPlayer, goal: Point, arrivalTolerancePx = 25): boolean {
    const dxGoal = goal.x - self.x;
    const dyGoal = goal.y - self.y;
    if (dxGoal * dxGoal + dyGoal * dyGoal <= arrivalTolerancePx * arrivalTolerancePx) return true;

    const feetStart: Point = { x: self.x, y: self.y + FEET_OFFSET_Y };
    const feetGoal: Point = { x: goal.x, y: goal.y + FEET_OFFSET_Y };

    // Moving hunt targets can change coordinates on every 200ms bot tick.
    // Retain the in-progress safe route while its endpoint remains useful;
    // rebuild when it is exhausted or the target has moved materially away.
    // The previous exact-coordinate key discarded the route every tick and
    // repeatedly reset the follower at its current cell centre.
    const routeGoalDrift = this.navigationRouteGoal
      ? Math.hypot(this.navigationRouteGoal.x - feetGoal.x, this.navigationRouteGoal.y - feetGoal.y)
      : Number.POSITIVE_INFINITY;
    // An empty route means A* found no path. Keep that negative result
    // cached while the bot is stationary; only a successful route can be
    // "complete" and trigger the normal next-tick rebuild.
    const routeComplete = hasCompletedNavigationRoute(this.navigationRoute, this.navigationRouteIndex);
    const routeRefreshDistance = Math.max(
      48,
      arrivalTolerancePx + Math.hypot(NAV_CELL_X, NAV_CELL_Y),
    );

    if (this.navigationRoute === null || routeComplete || routeGoalDrift >= routeRefreshDistance) {
      this.rebuildNavigationRoute(feetStart, feetGoal, arrivalTolerancePx);
    }

    let route: Point[] | null = this.navigationRoute;
    if (route && route.length > 0) {
      while (this.navigationRouteIndex < route.length &&
          Math.hypot(
            route[this.navigationRouteIndex].x - feetStart.x,
            route[this.navigationRouteIndex].y - feetStart.y,
          ) <= 2) {
        this.navigationRouteIndex++;
      }

      if (this.navigationRouteIndex < route.length) {
        const segmentStart = this.navigationRouteIndex === 0
          ? this.navigationRouteOrigin ?? feetStart
          : route[this.navigationRouteIndex - 1];
        if (distanceToSegment(
          feetStart, segmentStart, route[this.navigationRouteIndex],
        ) > 18) {
          this.clearPath();
          this.rebuildNavigationRoute(feetStart, feetGoal, arrivalTolerancePx);
          route = this.navigationRoute;
        }
      }
    }

    let current = feetStart;
    let remaining = BOT_MOVEMENT_STEP_PX;
    let failedWaypoint: Point | null = null;

    if (route && route.length > 0) {
      // Follow the raw A* polyline edge by edge. Each adjacent segment is
      // swept against the vector collision world, and several safe segments
      // can be consumed in one tick without ever cutting across a corner.
      let cursor = this.navigationRouteIndex;
      while (remaining > 0.75 && cursor < route.length) {
        const waypoint = route[cursor];
        const dx = waypoint.x - current.x;
        const dy = waypoint.y - current.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 0.75) {
          cursor++;
          continue;
        }

        const travel = Math.min(remaining, distance);
        const candidate = {
          x: current.x + (dx / distance) * travel,
          y: current.y + (dy / distance) * travel,
        };
        const traversed = traverseVector(current, candidate);
        if (!traversed ||
            Math.hypot(traversed.x - candidate.x, traversed.y - candidate.y) > 0.75) {
          failedWaypoint = waypoint;
          break;
        }

        const moved = Math.hypot(traversed.x - current.x, traversed.y - current.y);
        if (moved <= 0.01) {
          failedWaypoint = waypoint;
          break;
        }
        current = traversed;
        remaining -= moved;
        if (travel >= distance - 0.75) cursor++;
        else break;
      }
      this.navigationRouteIndex = cursor;
    }

    // If a raw edge is unexpectedly blocked, or no A* route exists, probe a
    // short collision-safe detour from the last safe position. Replan on the
    // next tick rather than retaining a waypoint that the live world rejects.
    const madeProgress = Math.hypot(current.x - feetStart.x, current.y - feetStart.y) > 0.01;
    if (failedWaypoint || (!madeProgress && (!route || route.length === 0))) {
      const from = current;
      const target = failedWaypoint ?? feetGoal;
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      const distance = Math.hypot(dx, dy);
      const step = Math.min(BOT_MOVEMENT_STEP_PX, distance);
      const direct = distance > 0
        ? { x: from.x + (dx / distance) * step, y: from.y + (dy / distance) * step }
        : feetGoal;
      let detour = traverseTo(from, direct);
      if (!detour || Math.hypot(detour.x - from.x, detour.y - from.y) <= 0.01) {
        const baseAngle = Math.atan2(dy, dx);
        const angleOffsets = [
          0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4,
          3 * Math.PI / 8, -3 * Math.PI / 8, Math.PI / 2, -Math.PI / 2,
          5 * Math.PI / 8, -5 * Math.PI / 8, 3 * Math.PI / 4, -3 * Math.PI / 4,
          7 * Math.PI / 8, -7 * Math.PI / 8, Math.PI,
        ];
        const stepLengths = [
          Math.min(BOT_MOVEMENT_STEP_PX, distance),
          BOT_MOVEMENT_STEP_PX * 0.75, BOT_MOVEMENT_STEP_PX * 0.5, BOT_MOVEMENT_STEP_PX * 0.25, 8,
        ];
        let bestScore = -Infinity;
        detour = null;
        for (const length of stepLengths) {
          for (const offset of angleOffsets) {
            const angle = baseAngle + offset;
            const candidate = {
              x: from.x + Math.cos(angle) * length,
              y: from.y + Math.sin(angle) * length,
            };
            const traversed = traverseTo(from, candidate);
            if (!traversed) continue;
            const remainingDistance = Math.hypot(target.x - traversed.x, target.y - traversed.y);
            const progress = distance - remainingDistance;
            const score = progress - Math.abs(offset) * 2 - (BOT_MOVEMENT_STEP_PX - length) * 0.05;
            if (score > bestScore) {
              bestScore = score;
              detour = traversed;
            }
          }
          if (detour !== null && bestScore > 0) break;
        }
      }
      if (detour) current = detour;
      // A missing route is cached while the bot is stationary. Replan after
      // a real detour advances at least one navigation cell, not on every
      // 200ms tick; this avoids repeatedly searching the entire grid at a wall.
      const detourProgress = Math.hypot(current.x - feetStart.x, current.y - feetStart.y);
      if (failedWaypoint || (route && route.length > 0) ||
          detourProgress >= Math.min(NAV_CELL_X, NAV_CELL_Y)) this.clearPath();
    }

    if (Math.hypot(current.x - feetStart.x, current.y - feetStart.y) > 0.01) {
      self.x = current.x;
      self.y = current.y - FEET_OFFSET_Y;
    }
    return false;
  }

  /**
   * Clear cached path state.  Call when the bot switches strategy so the next
   * navigateTo doesn't follow a stale path towards the old destination.
   */
  protected clearPath(): void {
    this.pathCache.clear();
    this.navigationRoute = null;
    this.navigationRouteGoal = null;
    this.navigationRouteIndex = 0;
    this.navigationRouteOrigin = null;
  }

  /** Pick a random walkable position in the spawn-connected component. */
  protected randomWalkablePoint(): Point {
    for (let i = 0; i < 100; i++) {
      const x = 80 + Math.random() * (MAP_W - 160);
      const y = 80 + Math.random() * (MAP_H - 160);
      if (
        isPlayerPositionWalkable(movementGrid, x, y) &&
        isBotNavigationReachable(x, y + FEET_OFFSET_Y)
      ) return { x, y };
    }
    // Spawn is verified walkable; it is safer than a potentially disconnected map centre.
    return { x: SPAWN_X, y: SPAWN_Y };
  }

  /**
   * Find the nearest walkable point to `target`, searching outward in rings
   * up to `maxRadius`. Interactive props (task consoles, sabotage pads) are
   * often placed against a wall, so their exact pixel can be unwalkable —
   * bots only need to stand within interaction range of them, not on top of
   * them (matches the server's own proximity check, which uses a range, not
   * an exact-position match).
   *
   * A candidate must also be *reachable* from the shared spawn point, not
   * merely locally walkable: the collision grid (traced pixel-accurately
   * from reference artwork) has isolated one-cell walkable pockets fully
   * enclosed by blocked cells — a downsampling artifact, not a real room
   * (confirmed via BFS; see .agents/memory/). Picking one of those as an
   * approach point would strand the bot permanently, since no path to it
   * exists from anywhere else on the map. All live players originate from
   * the same spawn point and can only ever occupy its connected component,
   * so spawn-reachability here is equivalent to "reachable at all".
   *
   * Results are memoized per target since both the grid and spawn point are
   * static for the lifetime of the process.
   */
  protected isSightPointBlocked(point: Point): boolean {
    return isBlocked(sightGrid, point.x, point.y + FEET_OFFSET_Y);
  }

  protected hasLineOfSightToPoint(from: Point, to: Point): boolean {
    return isLineOfSightClear(
      sightGrid,
      from.x, from.y + FEET_OFFSET_Y,
      to.x, to.y + FEET_OFFSET_Y,
    );
  }

  /** Match the client's filtered visual occlusion model for player visibility. */
  protected isVisionPointBlocked(point: Point): boolean {
    return isVisionGridPointBlocked(botVisionGrid, point.x, point.y + FEET_OFFSET_Y);
  }

  protected hasVisionLineOfSightToPoint(from: Point, to: Point): boolean {
    return isVisionLineClear(botVisionGrid, from.x, from.y + FEET_OFFSET_Y, to.x, to.y + FEET_OFFSET_Y, botVisionOccluders, botVisionSegments);
  }

  /**
   * Find a spawn-reachable, vector-collision-safe approach point that can
   * actually see the interaction target. Movement uses the authored red-line
   * vector world; visibility uses the same fine-grid occlusion model as the
   * server because the red-line reference does not author vision blockers.
   */
  protected nearestApproachPoint(target: Point, maxRadius: number, targetRadiusPx = 24): Point {
    const key = `${target.x},${target.y},${maxRadius},${targetRadiusPx}`;
    const cached = BotAgent._approachCache.get(key);
    if (cached) return cached;

    const reachable = (p: Point): boolean =>
      isPlayerPositionWalkable(movementGrid, p.x, p.y) &&
      isBotNavigationReachable(p.x, p.y + FEET_OFFSET_Y);
    const visible = (p: Point): boolean =>
      isLineOfSightToInteractionTarget(
        sightGrid,
        p.x, p.y + FEET_OFFSET_Y,
        target.x, target.y + FEET_OFFSET_Y,
        targetRadiusPx,
      );

    // Task target radii describe the solid prop perimeter, not a point the
    // player should stand inside. Always approach from outside that footprint;
    // targeting its centre can put a bot in a narrow car/console pocket that is
    // technically walkable but cannot be reached by the swept player collider.
    const minStandOff = Math.max(8, targetRadiusPx + PLAYER_RADIUS + 12);
    let result: Point | null = null;
    let nearestReachable: Point | null = null;
    {
      const step = 4;
      const firstRadius = Math.ceil(minStandOff / step) * step;
      outer: for (let r = firstRadius; r <= maxRadius; r += step) {
        const samples = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
        for (let i = 0; i < samples; i++) {
          const angle = (i / samples) * Math.PI * 2;
          const candidate = snapNavigationPoint({
            x: target.x + Math.cos(angle) * r,
            y: target.y + Math.sin(angle) * r,
          });
          const candidateDistance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
          if (candidateDistance < minStandOff || candidateDistance > maxRadius ||
              !hasApproachClearance(candidate) || !reachable(candidate)) continue;
          nearestReachable ??= candidate;
          if (!visible(candidate)) continue;
          result = candidate;
          break outer;
        }
      }
    }
    // Preserve the previous best-effort fallback for unusual geometry, but
    // prefer a visible approach whenever one exists inside interaction range.
    result ??= nearestReachable ?? target;
    BotAgent._approachCache.set(key, result);
    return result;
  }

  private static _approachCache = new Map<string, Point>();

  /** Squared pixel distance between two positions. */
  protected static distSq(ax: number, ay: number, bx: number, by: number): number {
    return (ax - bx) ** 2 + (ay - by) ** 2;
  }
}
