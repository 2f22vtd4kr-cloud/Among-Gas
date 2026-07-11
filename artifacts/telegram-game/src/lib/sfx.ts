/**
 * Fire-and-forget sound-effect player. Never throws — if audio is blocked
 * or unsupported the calls are silently ignored.
 */
const cache = new Map<string, HTMLAudioElement>();

function load(key: string, url: string): void {
  if (cache.has(key)) return;
  try {
    const a = new Audio(url);
    a.preload = 'auto';
    cache.set(key, a);
  } catch {
    // Web Audio not supported
  }
}

export function sfx(key: string, volume = 1): void {
  const src = cache.get(key);
  if (!src) return;
  try {
    const clone = src.cloneNode(true) as HTMLAudioElement;
    clone.volume = Math.min(1, Math.max(0, volume));
    clone.play().catch(() => {});
  } catch { /* ignore */ }
}

// ── Preload ────────────────────────────────────────────────────────────────
load('roundStart',      '/au-sounds/roundstart.wav');
load('victoryCrewmate', '/au-sounds/victory_crew.wav');
load('victoryImpostor', '/au-sounds/victory_impostor.wav');
load('bodyReport',      '/au-sounds/report_body.wav');
load('meeting',         '/au-sounds/meeting.wav');
load('taskComplete',    '/au-sounds/task_complete.wav');
load('kill',            '/au-sounds/kill.wav');
load('uiSelect',        '/au-sounds/ui_select.wav');
