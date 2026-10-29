import { useEffect, useState } from 'react';

export type JoystickSide = 'left' | 'right';

export interface GameSettings {
  joystickSide: JoystickSide;
}

const STORAGE_KEY = 'amongGas.settings';
const CHANGE_EVENT = 'among-gas-settings-change';
const DEFAULT_SETTINGS: GameSettings = { joystickSide: 'right' };

let inMemorySettings: GameSettings = DEFAULT_SETTINGS;
let initialized = false;

function readStoredSettings(): GameSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<GameSettings>;
    return { joystickSide: parsed.joystickSide === 'left' ? 'left' : 'right' };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Storage hydrates the in-memory source of truth once; denied writes never undo a user's current choice. */
export function getGameSettings(): GameSettings {
  if (!initialized) {
    inMemorySettings = readStoredSettings();
    initialized = true;
  }
  return { ...inMemorySettings };
}

function refreshGameSettingsFromStorage(): void {
  inMemorySettings = readStoredSettings();
  initialized = true;
}

export function setJoystickSide(joystickSide: JoystickSide): void {
  const next = { ...getGameSettings(), joystickSide };
  inMemorySettings = next;
  initialized = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory choice remains active when private/restricted WebViews deny storage.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Shared joystick preference for the lobby, gameplay, and joystick. */
export function useGameSettings(): GameSettings {
  const [settings, setSettings] = useState<GameSettings>(getGameSettings);

  useEffect(() => {
    const sync = () => setSettings(getGameSettings());
    const syncExternalStorage = () => {
      refreshGameSettingsFromStorage();
      sync();
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', syncExternalStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', syncExternalStorage);
    };
  }, []);

  return settings;
}
