import { getCharacterColorForSlot, type CharacterColor } from './characterSprites';

const TASK_NAME_RU: Record<string, string> = {
  'Fix Wiring':             'Починить проводку',
  'Download Data':          'Скачать данные',
  'Calibrate Distributor':  'Настроить распределитель',
  'Empty Garbage':          'Вынести мусор',
  'Clean Filters':          'Почистить фильтры',
  'Stabilize Navigation':  'Стабилизировать навигацию',
  'Reboot WiFi':           'Перезапустить связь',
  'Fuel Engine':           'Заправить двигатель',
  'Start Reactor':         'Запустить реактор',
  'Align Engine':          'Выровнять двигатель',
  'Clear Asteroids':       'Уничтожить астероиды',
};
const SABOTAGE_NAME_RU: Record<string, string> = {
  'Lights':   'Свет',
  'O₂':       'O₂',
  'Reactor':  'Реактор',
  'Comms':    'Связь',
  'Doors':    'Двери',
};
function taskRu(name: string | undefined, language: 'ru' | 'en'): string {
  if (language === 'en') return name || 'Task';
  return (name && TASK_NAME_RU[name]) || name || 'Задание';
}
function sabotageRu(name: string | undefined, language: 'ru' | 'en'): string {
  if (language === 'en') return name || 'System';
  return (name && SABOTAGE_NAME_RU[name]) || name || 'Система';
}

const ADMIN_DOT_COLORS: Record<CharacterColor, string> = {
  teal: '#31c6b4',
  maroon: '#c44958',
  navy: '#4679d4',
  purple: '#9860d3',
  brown: '#8c6755',
  'dark-gray': '#5e6872',
  magenta: '#c94eb6',
  red: '#df3e4c',
  blue: '#438bdc',
  green: '#3d9e62',
  pink: '#ed91c4',
  orange: '#e58b3c',
  yellow: '#e4c84a',
  black: '#30343b',
  white: '#e3e8eb',
  lime: '#9acb3c',
  cyan: '#45c4cf',
  rose: '#e87999',
};


// Player color is keyed by lobby slot, using the 18 runtime palettes.
export function slotColor(slot: number): CharacterColor {
  return getCharacterColorForSlot(slot);
}
