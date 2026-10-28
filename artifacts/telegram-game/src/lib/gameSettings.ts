import { useEffect, useState } from 'react';

export type JoystickSide = 'left' | 'right';

export interface GameSettings {
  joystickSide: JoystickSide;
}

const STORAGE_KEY = 'amongGas.settings';
const CHANGE_EVENT = 'among-gas-settings-change';
const DEFAULT_SETTINGS: GameSettings = { joystickSide: 'right' };

export function getGameSettings(): GameSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<GameSettings>;
    return {
      joystickSide: parsed.joystickSide === 'left' ? 'left' : 'right',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setJoystickSide(joystickSide: JoystickSide): void {
  const next = { ...getGameSettings(), joystickSide };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory setting usable when storage is unavailable in a WebView.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Shared persisted controls preference for the lobby, gameplay, and joystick. */
export function useGameSettings(): GameSettings {
  const [settings, setSettings] = useState<GameSettings>(getGameSettings);

  useEffect(() => {
    const sync = () => setSettings(getGameSettings());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return settings;
}
