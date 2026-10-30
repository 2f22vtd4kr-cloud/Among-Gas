/**
 * Types for the headless simulation runner (SINGLE_PLAY.md §8).
 */

export type SimWinner = 'crew' | 'impostor' | 'timeout';

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
  durationMs: number;
  kills: number;
  meetings: number;
  tasksCompleted: number;
  totalTaskSteps: number;
  /** Snapshot captured before cleanup when the simulator safety watchdog fires. */
  timeoutState?: SimTimeoutSnapshot;
}
