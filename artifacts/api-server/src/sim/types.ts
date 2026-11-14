/**
 * Types for the headless simulation runner (SINGLE_PLAY.md §8).
 */

export type SimWinner = 'crew' | 'impostor' | 'timeout';
export type SimWinReason = 'tasks' | 'vote' | 'elimination' | 'parity' | 'sabotage' | 'timeout' | 'unknown';

export interface SimTimeoutSnapshot {
  phase: string;
  sabotage: { systemId: number; lockedTaskIds: number[]; fixedPads: number[] } | null;
  completedTaskSteps: number;
  totalTaskSteps: number;
  collisionViolation?: { slot: number; x: number; y: number };
  players: Array<{
    slot: number;
    role: string;
    alive: boolean;
    x: number;
    y: number;
    inVent: boolean;
    unfinishedTasks: Array<{ taskId: number; name: string; remainingSteps: number[] }>;
  }>;
}

export interface SimGameResult {
  gameIndex: number;
  code: string;
  botCount: number;
  impostorCount: number;
  winner: SimWinner;
  winReason: SimWinReason;
  aliveCrewAtEnd: number;
  aliveImpostorsAtEnd: number;
  ejectedSlot: number | null;
  durationMs: number;
  kills: number;
  meetings: number;
  sabotageStarts: number;
  sabotageResolved: number;
  sabotageFixed: number;
  tasksCompleted: number;
  totalTaskSteps: number;
  /** Per-impostor decision counters for diagnosing seeded balance cohorts. */
  impostorDiagnostics?: Array<{
    slot: number; roamingTicks: number; huntTicks: number; visibleHuntTicks: number;
    hiddenHuntTicks: number; huntAcquisitions: number; isolationAborts: number;
    lostTargetResets: number; navigationCalls: number; navigationReachedKillRangeTicks: number;
    navigationMovementTicks: number; navigationNoMovementTicks: number;
    navigationProgressPx: number; killAttempts: number; successfulKills: number;
    fakeNavigationCalls: number; fakeNavigationMovementTicks: number;
    fakeNavigationNoMovementTicks: number; fakeNavigationDistancePx: number;
    fakeNavigationArrivals: number; fakeTargetSelections: number;
    targetSearchCalls: number; targetSearchVisibleCandidates: number;
    targetSearchNearVisionCandidates: number; targetSearchNoVisibleCandidates: number;
    targetSearchNoNearCandidates: number; targetSearchRejectedByIsolation: number;
    targetSearchBestIsolationScorePx: number;
    losCandidateChecks: number; losOriginBlockedCandidates: number;
    losTargetBlockedCandidates: number; losBlockedBetweenClearEndpoints: number;
    losBlockedSamples: Array<{
      from: { x: number; y: number };
      to: { x: number; y: number };
      blockerFeet: { x: number; y: number };
    }>;
    hiddenHuntNoLastKnown: number; hiddenHuntExpiredLastKnown: number;
    hiddenHuntReachedLastKnown: number; hiddenHuntRetargeted: number;
  }>;
  /** Snapshot captured before cleanup when the simulator safety watchdog fires. */
  timeoutState?: SimTimeoutSnapshot;
}
