import { useEffect, type MutableRefObject } from "react";
import { unlockSfx } from "../lib/sfx";
import { clearMovementInput, setMovementInputKey, shouldCaptureMovementKey } from "./gameInput";

/**
 * Own the browser keyboard lifecycle for GameMap movement.
 *
 * The mutable refs are shared with the render loop and modal state, so this
 * hook can keep event listeners stable without capturing stale React state.
 * Joystick input remains in the existing Joystick component and uses the same
 * movement-key set.
 */
export function useGameMapMovementInput(
  keysRef: MutableRefObject<Set<string>>,
  settingsOpenRef: MutableRefObject<boolean>,
  leaveConfirmOpenRef: MutableRefObject<boolean>,
): void {
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      unlockSfx();
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isEditableTarget = Boolean(target?.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
      ));
      const modalOpen = settingsOpenRef.current || leaveConfirmOpenRef.current;
      if (!shouldCaptureMovementKey(event.key, isEditableTarget, modalOpen)) return;
      event.preventDefault();
      setMovementInputKey(keysRef.current, event.key, true);
    };
    const onUp = (event: KeyboardEvent) => {
      setMovementInputKey(keysRef.current, event.key, false);
    };
    const clear = () => clearMovementInput(keysRef.current);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);
}
