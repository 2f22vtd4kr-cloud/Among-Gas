/**
 * Types for the headless simulation runner (SINGLE_PLAY.md §8).
 */

export type SimWinner = 'crew' | 'impostor' | 'timeout';

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
}
