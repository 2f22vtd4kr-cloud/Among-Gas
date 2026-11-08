export type MovementAxes = { dx: number; dy: number };

export const MOVEMENT_KEY_ALIASES = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
} as const;

export const JOYSTICK_MOVEMENT_KEYS = ['w', 'a', 's', 'd'] as const;

const TRACKED_MOVEMENT_KEYS = new Set<string>([
  ...MOVEMENT_KEY_ALIASES.up,
  ...MOVEMENT_KEY_ALIASES.down,
  ...MOVEMENT_KEY_ALIASES.left,
  ...MOVEMENT_KEY_ALIASES.right,
]);

/** Normalize and add/remove one supported keyboard movement key. */
export function setMovementInputKey(
  keys: Set<string>,
  key: string,
  pressed: boolean,
): boolean {
  const normalized = key.toLowerCase();
  if (!TRACKED_MOVEMENT_KEYS.has(normalized)) return false;
  if (pressed) keys.add(normalized);
  else keys.delete(normalized);
  return true;
}

/** Keyboard movement must not steal typing or move a player behind a modal. */
export function shouldCaptureMovementKey(
  key: string,
  isEditableTarget: boolean,
  modalOpen: boolean,
): boolean {
  return TRACKED_MOVEMENT_KEYS.has(key.toLowerCase()) && !isEditableTarget && !modalOpen;
}

/** Clear every held movement key after focus loss, modal changes or pointer cancellation. */
export function clearMovementInput(keys: Set<string>): void {
  keys.clear();
}

/** Read WASD and arrow aliases as raw signed axes; diagonal normalization stays in stepPlayer. */
export function getMovementAxes(keys: ReadonlySet<string>): MovementAxes {
  const hasAny = (aliases: readonly string[]) => aliases.some(key => keys.has(key));
  return {
    dx: Number(hasAny(MOVEMENT_KEY_ALIASES.right)) - Number(hasAny(MOVEMENT_KEY_ALIASES.left)),
    dy: Number(hasAny(MOVEMENT_KEY_ALIASES.down)) - Number(hasAny(MOVEMENT_KEY_ALIASES.up)),
  };
}

/**
 * Convert a joystick displacement into the same WASD key set consumed by stepPlayer.
 * Keeping the dead-zone and directional threshold here makes touch and keyboard
 * input share one testable contract.
 */
export function applyJoystickDirection(
  keys: Set<string>,
  dx: number,
  dy: number,
  baseRadius = 52,
  deadZone = 0.18,
  axisThreshold = 0.4,
): void {
  const values = [dx, dy, baseRadius, deadZone, axisThreshold];
  if (!values.every(Number.isFinite) || baseRadius <= 0 ||
      deadZone < 0 || deadZone > 1 || axisThreshold < 0 || axisThreshold > 1) {
    throw new RangeError('Joystick displacement and thresholds must be finite and within valid bounds');
  }

  const distance = Math.hypot(dx, dy);
  if (distance < baseRadius * deadZone || distance === 0) {
    for (const key of JOYSTICK_MOVEMENT_KEYS) keys.delete(key);
    return;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  if (ny < -axisThreshold) keys.add('w'); else keys.delete('w');
  if (ny > axisThreshold) keys.add('s'); else keys.delete('s');
  if (nx < -axisThreshold) keys.add('a'); else keys.delete('a');
  if (nx > axisThreshold) keys.add('d'); else keys.delete('d');
}
