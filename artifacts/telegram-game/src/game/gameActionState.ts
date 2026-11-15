export type UseActionKind = "task" | "repair" | "vent" | "admin" | null;

export interface UseActionStateInput {
  hasNearbyTask: boolean;
  isCrewmate: boolean;
  hasNearbyRepairPad: boolean;
  isImpostor: boolean;
  hasNearbyVent: boolean;
  isInVent: boolean;
  hasNearbyAdminTable: boolean;
  hasActiveTask: boolean;
  showAdminTable: boolean;
  showMiniMap: boolean;
}

/** Preserve the existing contextual-action priority used by the gameplay HUD. */
export function getUseActionKind(input: UseActionStateInput): UseActionKind {
  if (input.hasNearbyTask && input.isCrewmate) return "task";
  if (input.hasNearbyRepairPad) return "repair";
  if (input.isImpostor && input.hasNearbyVent && !input.isInVent) return "vent";
  if (input.hasNearbyAdminTable) return "admin";
  return null;
}

/** The control stays visible; this value alone determines whether it is actionable. */
export function isUseActionEnabled(kind: UseActionKind, input: UseActionStateInput): boolean {
  return kind !== null &&
    !input.hasActiveTask &&
    !input.isInVent &&
    !input.showAdminTable &&
    !input.showMiniMap;
}


/** Remaining fraction for the Kill cooldown ring, clamped to the full circle. */
export function getCooldownSweepProgress(remainingMs: number, maximumMs: number): number {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(maximumMs) ||
      remainingMs <= 0 || maximumMs <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMs / maximumMs));
}
