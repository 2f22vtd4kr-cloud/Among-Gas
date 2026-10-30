/**
 * Fire-and-forget sound-effect player. Never throws — if audio is blocked
 * or unsupported the calls are silently ignored.
 */
const cache = new Map<string, HTMLAudioElement>();
let audioContext: AudioContext | null = null;
let lastFootstepAt = 0;
let decodedKillBuffer: AudioBuffer | null = null;
let decodedKillLoad: Promise<void> | null = null;

function preloadDecodedKill(ctx: AudioContext): Promise<void> {
  if (decodedKillBuffer) return Promise.resolve();
  if (decodedKillLoad) return decodedKillLoad;
  decodedKillLoad = fetch('/au-sounds/kill.wav')
    .then(response => {
      if (!response.ok) throw new Error(`Kill sound preload failed: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then(bytes => ctx.decodeAudioData(bytes))
    .then(buffer => { decodedKillBuffer = buffer; })
    .catch(() => {
      // The regular HTMLAudio path remains available if Web Audio decoding fails.
    })
    .finally(() => { decodedKillLoad = null; });
  return decodedKillLoad;
}

function playDecodedKill(volume: number, ctx: AudioContext): boolean {
  if (!decodedKillBuffer) return false;
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), ctx.currentTime);
    source.buffer = decodedKillBuffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
    return true;
  } catch {
    return false;
  }
}

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
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  // The first trusted menu/game gesture primes the kill buffer before a match event needs it.
  void preloadDecodedKill(ctx);
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
    // Construct without a source first so preload='none' is in place before
    // assigning the URL. Otherwise every sound (including multi-megabyte menu
    // music and victory tracks) may download as soon as the lobby imports sfx.
    const a = new Audio();
    a.preload = 'none';
    a.src = url;
    cache.set(key, a);
  } catch {
    // Web Audio not supported
  }
}

function playCue(key: 'sabotage' | 'vent', volume: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  try {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    let duration = 0.23;
    oscillator.type = key === 'sabotage' ? 'sawtooth' : 'triangle';
    if (key === 'sabotage') {
      duration = 0.31;
      oscillator.frequency.setValueAtTime(440, now);
      oscillator.frequency.exponentialRampToValueAtTime(260, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, Math.min(0.1, volume * 0.08)), now + 0.012);
      gain.gain.setValueAtTime(Math.max(0.0002, Math.min(0.1, volume * 0.08)), now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    } else {
      oscillator.frequency.setValueAtTime(170, now);
      oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.19);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, Math.min(0.08, volume * 0.07)), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      duration = 0.23;
    }
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    // Audio is decorative; a browser/device audio failure must not affect gameplay.
  }
}

export function sfx(key: string, volume = 1): void {
  if (key === 'kill') {
    const ctx = getAudioContext();
    if (ctx && playDecodedKill(volume, ctx)) return;
    if (ctx) void preloadDecodedKill(ctx);
  }
  if (key === 'footstep') {
    playFootstep(volume);
    return;
  }
  if (key === 'sabotage' || key === 'vent') {
    playCue(key, volume);
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
load('menuMusic',       '/au-sounds/menu_music.mp3');

const menuTrack = cache.get('menuMusic');
if (menuTrack) {
  menuTrack.loop = true;
  menuTrack.volume = 0.18;
}

/** Start quiet menu music only after a user gesture, respecting browser autoplay rules. */
export function startMenuMusic(): void {
  const track = cache.get('menuMusic');
  if (track && track.paused) track.play().catch(() => {});
}

export function stopMenuMusic(): void {
  const track = cache.get('menuMusic');
  if (!track) return;
  track.pause();
  track.currentTime = 0;
}
