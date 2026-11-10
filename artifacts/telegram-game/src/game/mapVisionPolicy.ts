import {
  IMPOSTOR_VISION_RADIUS_PX,
  LIGHTS_CREWMATE_VISION_RADIUS_PX,
  NORMAL_VISION_RADIUS_PX,
  SABOTAGE_LIGHTS,
} from '@workspace/shared/sabotage';

export type VisionPlayerRole = 'crewmate' | 'impostor' | null;

/**
 * Resolve the base-game sight radius for the local living player.
 * Ghosts have unrestricted vision and non-gameplay/unknown roles get no local
 * sight polygon. Lights sabotage reduces crew vision only; impostor vision is
 * intentionally unchanged. This helper selects policy only and does not trace
 * or mutate visibility geometry.
 */
export function getPlayerVisionRadius(
  role: VisionPlayerRole,
  isGhost: boolean,
  activeSabotageSystemId: number | null,
): number | null {
  if (isGhost || (role !== 'crewmate' && role !== 'impostor')) return null;
  if (role === 'impostor') return IMPOSTOR_VISION_RADIUS_PX;
  if (activeSabotageSystemId === SABOTAGE_LIGHTS) return LIGHTS_CREWMATE_VISION_RADIUS_PX;
  return NORMAL_VISION_RADIUS_PX;
}
