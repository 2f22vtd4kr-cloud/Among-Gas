/**
 * Fire-and-forget sound-effect player. Never throws — if audio is blocked
 * or unsupported the calls are silently ignored.
 */
const cache = new Map<string, HTMLAudioElement>();
let audioContext: AudioContext | null = null;
let lastFootstepAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContext) audioContext = new AudioContextCtor();
    return audioContext;
  } catch {
    return null;
  }
}

/** Call from a real pointer/key gesture to unlock Web Audio in mobile browsers. */
export function unlockSfx(): void {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
}

/** Original procedural soft bootstep; no external copyrighted audio asset needed. */
function playFootstep(volume: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const nowMs = performance.now();
  if (nowMs - lastFootstepAt < 220) return;
  lastFootstepAt = nowMs;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  try {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(92, now);
    oscillator.frequency.exponentialRampToValueAtTime(43, now + 0.085);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(190, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, Math.min(0.12, volume * 0.11)), now + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  } catch {
    // Audio is decorative; a browser/device audio failure must not affect gameplay.
  }
}

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
  if (key === 'footstep') {
    playFootstep(volume);
    return;
  }
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
