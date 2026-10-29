import { useEffect, useState, type CSSProperties } from 'react';

export type JoystickSide = 'left' | 'right';
export type GameplayControlId =
  | 'joystick'
  | 'map'
  | 'tasks'
  | 'settings'
  | 'emergency'
  | 'taskAction'
  | 'killReport'
  | 'sabotage'
  | 'repair';

export interface ControlPosition {
  /** Horizontal center as a percentage of the viewport width. */
  x: number;
  /** Vertical center as a percentage of the viewport height. */
  y: number;
}

export type ControlLayout = Partial<Record<GameplayControlId, ControlPosition>>;

export interface GameSettings {
  joystickSide: JoystickSide;
  controlLayout: ControlLayout;
}

const STORAGE_KEY = 'amongGas.settings';
const CHANGE_EVENT = 'among-gas-settings-change';
const DEFAULT_SETTINGS: GameSettings = { joystickSide: 'right', controlLayout: {} };
const CONTROL_IDS: readonly GameplayControlId[] = [
  'joystick', 'map', 'tasks', 'settings', 'emergency',
  'taskAction', 'killReport', 'sabotage', 'repair',
];

export const CONTROL_LABELS: Record<GameplayControlId, { en: string; ru: string }> = {
  joystick: { en: 'Movement joystick', ru: 'Джойстик движения' },
  map: { en: 'Map button', ru: 'Кнопка карты' },
  tasks: { en: 'Task list button', ru: 'Кнопка заданий' },
  settings: { en: 'Settings button', ru: 'Кнопка настроек' },
  emergency: { en: 'Emergency button', ru: 'Кнопка тревоги' },
  taskAction: { en: 'Nearby task action', ru: 'Действие задания рядом' },
  killReport: { en: 'Kill / Report actions', ru: 'Убить / доложить' },
  sabotage: { en: 'Sabotage button', ru: 'Кнопка саботажа' },
  repair: { en: 'Repair button', ru: 'Кнопка ремонта' },
};

export function defaultControlPosition(
  id: GameplayControlId,
  joystickSide: JoystickSide,
): ControlPosition {
  const oppositeSide = joystickSide === 'left' ? 84 : 16;
  const sameSide = joystickSide === 'left' ? 16 : 84;
  switch (id) {
    case 'joystick': return { x: sameSide, y: 84 };
    case 'map': return { x: 12, y: 6 };
    case 'tasks': return { x: 14, y: 14 };
    case 'settings': return { x: 93, y: 6 };
    case 'emergency': return { x: 75, y: 6 };
    case 'taskAction': return { x: oppositeSide, y: 72 };
    case 'killReport': return { x: 50, y: 84 };
    case 'sabotage': return { x: 16, y: 84 };
    case 'repair': return { x: 50, y: 74 };
  }
}

function sanitizePosition(value: unknown): ControlPosition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const point = value as Partial<ControlPosition>;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  return {
    x: Math.round(Math.max(5, Math.min(95, point.x as number))),
    y: Math.round(Math.max(5, Math.min(95, point.y as number))),
  };
}

function sanitizeLayout(value: unknown): ControlLayout {
  if (!value || typeof value !== 'object') return {};
  const source = value as Partial<Record<GameplayControlId, unknown>>;
  const layout: ControlLayout = {};
  for (const id of CONTROL_IDS) {
    const point = sanitizePosition(source[id]);
    if (point) layout[id] = point;
  }
  return layout;
}

let inMemorySettings: GameSettings = { ...DEFAULT_SETTINGS, controlLayout: {} };
let initialized = false;

function readStoredSettings(): GameSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS, controlLayout: {} };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS, controlLayout: {} };
    const parsed = JSON.parse(stored) as Partial<GameSettings>;
    return {
      joystickSide: parsed.joystickSide === 'left' ? 'left' : 'right',
      controlLayout: sanitizeLayout(parsed.controlLayout),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, controlLayout: {} };
  }
}

/** Storage hydrates the in-memory source of truth once; denied writes never undo a user's current choice. */
export function getGameSettings(): GameSettings {
  if (!initialized) {
    inMemorySettings = readStoredSettings();
    initialized = true;
  }
  return { ...inMemorySettings, controlLayout: { ...inMemorySettings.controlLayout } };
}

function persistCurrentSettings(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemorySettings));
  } catch {
    // Current-session choices remain usable even when a WebView blocks storage.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

function refreshGameSettingsFromStorage(): void {
  inMemorySettings = readStoredSettings();
  initialized = true;
}

export function setJoystickSide(joystickSide: JoystickSide): void {
  inMemorySettings = { ...getGameSettings(), joystickSide };
  initialized = true;
  persistCurrentSettings();
}

export function setControlPosition(id: GameplayControlId, position: ControlPosition): void {
  const safe = sanitizePosition(position);
  if (!safe) return;
  inMemorySettings = {
    ...getGameSettings(),
    controlLayout: { ...inMemorySettings.controlLayout, [id]: safe },
  };
  initialized = true;
  persistCurrentSettings();
}

/** Restore responsive, side-aware defaults for every gameplay control. */
export function resetControlLayout(): void {
  inMemorySettings = { ...getGameSettings(), controlLayout: {} };
  initialized = true;
  persistCurrentSettings();
}

/** Use a saved viewport-relative position, or leave the original responsive layout untouched. */
export function customControlPositionStyle(
  id: GameplayControlId,
  controlLayout: ControlLayout,
): CSSProperties {
  const point = controlLayout[id];
  if (!point) return {};
  return {
    position: 'fixed',
    left: `${point.x}%`,
    top: `${point.y}%`,
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
  };
}

/** Shared controls preference for the lobby, gameplay, and joystick. */
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
