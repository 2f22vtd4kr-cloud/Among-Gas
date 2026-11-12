/**
 * Original procedural sound-effects and ambient-music player.
 *
 * All cues are synthesized with Web Audio. No third-party samples or remote
 * audio assets are fetched. Calls are fire-and-forget and never affect play.
 */
let audioContext: AudioContext | null = null;
let lastFootstepAt = 0;
let menuMusicTimer: number | null = null;
let menuMusicStep = 0;

interface Tone {
  frequency: number;
  duration: number;
  offset?: number;
  peak?: number;
  wave?: OscillatorType;
  endFrequency?: number;
  attack?: number;
  lowpass?: number;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextCtor = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContext) audioContext = new AudioContextCtor();
    return audioContext;
  } catch {
    return null;
  }
}

function resumeAudio(ctx: AudioContext): void {
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

function playTone(ctx: AudioContext, tone: Tone, volume: number, baseTime: number): void {
  try {
    const startAt = baseTime + Math.max(0, tone.offset ?? 0);
    const duration = Math.max(0.035, tone.duration);
    const attack = Math.min(duration * 0.45, Math.max(0.006, tone.attack ?? 0.018));
    const peak = Math.max(0.0002, Math.min(0.16, (tone.peak ?? 0.07) * volume));
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();

    oscillator.type = tone.wave ?? 'triangle';
    oscillator.frequency.setValueAtTime(Math.max(1, tone.frequency), startAt);
    if (tone.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, tone.endFrequency), startAt + duration);
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(120, tone.lowpass ?? 4200), startAt);
    filter.Q.setValueAtTime(0.65, startAt);

    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(peak, startAt + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(ctx.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.015);
  } catch {
    // Audio is decorative; a device/audio failure must not affect gameplay.
  }
}

function playNoiseBurst(ctx: AudioContext, volume: number, startAt: number, duration = 0.055): void {
  try {
    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index++) {
      const fade = 1 - index / frameCount;
      channel[index] = (Math.random() * 2 - 1) * fade;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, startAt);
    envelope.gain.setValueAtTime(Math.max(0.0002, Math.min(0.045, volume * 0.035)), startAt);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(ctx.destination);
    source.start(startAt);
    source.stop(startAt + duration + 0.01);
  } catch {
    // Noise is an optional transient layer.
  }
}

function cueTones(key: string): Tone[] | null {
  switch (key) {
    case 'roundStart':
      return [
        { frequency: 196, endFrequency: 220, duration: 0.34, peak: 0.075, offset: 0, wave: 'triangle' },
        { frequency: 261.63, endFrequency: 293.66, duration: 0.36, peak: 0.075, offset: 0.17, wave: 'triangle' },
        { frequency: 392, endFrequency: 440, duration: 0.56, peak: 0.09, offset: 0.34, wave: 'sine' },
      ];
    case 'victoryCrewmate':
      return [
        { frequency: 261.63, duration: 0.28, peak: 0.075, offset: 0, wave: 'sine' },
        { frequency: 329.63, duration: 0.3, peak: 0.075, offset: 0.13, wave: 'sine' },
        { frequency: 392, duration: 0.34, peak: 0.085, offset: 0.26, wave: 'sine' },
        { frequency: 523.25, duration: 0.78, peak: 0.095, offset: 0.39, wave: 'triangle' },
        { frequency: 659.25, duration: 0.66, peak: 0.035, offset: 0.43, wave: 'sine' },
      ];
    case 'victoryImpostor':
      return [
        { frequency: 164.81, endFrequency: 146.83, duration: 0.58, peak: 0.09, offset: 0, wave: 'sawtooth', lowpass: 1100 },
        { frequency: 123.47, endFrequency: 98, duration: 0.72, peak: 0.095, offset: 0.34, wave: 'triangle', lowpass: 850 },
        { frequency: 82.41, endFrequency: 65.41, duration: 0.88, peak: 0.09, offset: 0.72, wave: 'sine', lowpass: 500 },
      ];
    case 'bodyReport':
      return [
        { frequency: 740, duration: 0.13, peak: 0.07, offset: 0, wave: 'square', lowpass: 2600 },
        { frequency: 587.33, duration: 0.19, peak: 0.08, offset: 0.15, wave: 'triangle' },
        { frequency: 880, duration: 0.2, peak: 0.08, offset: 0.35, wave: 'triangle' },
      ];
    case 'meeting':
      return [
        { frequency: 220, endFrequency: 196, duration: 0.48, peak: 0.08, offset: 0, wave: 'sawtooth', lowpass: 1000 },
        { frequency: 293.66, endFrequency: 261.63, duration: 0.54, peak: 0.075, offset: 0.42, wave: 'triangle', lowpass: 1300 },
        { frequency: 220, endFrequency: 196, duration: 0.48, peak: 0.08, offset: 0.88, wave: 'sawtooth', lowpass: 1000 },
      ];
    case 'taskComplete':
      return [
        { frequency: 523.25, duration: 0.16, peak: 0.065, offset: 0, wave: 'sine' },
        { frequency: 659.25, duration: 0.18, peak: 0.07, offset: 0.11, wave: 'sine' },
        { frequency: 783.99, duration: 0.32, peak: 0.075, offset: 0.23, wave: 'triangle' },
      ];
    case 'kill':
      return [
        { frequency: 170, endFrequency: 48, duration: 0.22, peak: 0.13, offset: 0, wave: 'sawtooth', lowpass: 900 },
        { frequency: 880, endFrequency: 210, duration: 0.075, peak: 0.035, offset: 0, wave: 'triangle', lowpass: 2200 },
      ];
    case 'uiSelect':
      return [
        { frequency: 660, endFrequency: 740, duration: 0.075, peak: 0.045, offset: 0, wave: 'sine' },
      ];
    case 'sabotage':
      return [
        { frequency: 440, endFrequency: 260, duration: 0.31, peak: 0.085, offset: 0, wave: 'sawtooth', lowpass: 1800 },
        { frequency: 330, endFrequency: 220, duration: 0.26, peak: 0.045, offset: 0.12, wave: 'triangle' },
      ];
    case 'vent':
      return [
        { frequency: 170, endFrequency: 52, duration: 0.23, peak: 0.075, offset: 0, wave: 'triangle', lowpass: 1100 },
      ];
    default:
      return null;
  }
}

function playProceduralCue(key: string, volume: number): void {
  const tones = cueTones(key);
  if (!tones) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);
  const baseTime = ctx.currentTime + 0.012;
  for (const tone of tones) playTone(ctx, tone, volume, baseTime);
  if (key === 'kill' || key === 'bodyReport') playNoiseBurst(ctx, volume, baseTime);
}

/** Call from a trusted pointer/key gesture to unlock Web Audio on mobile browsers. */
export function unlockSfx(): void {
  const ctx = getAudioContext();
  if (ctx) resumeAudio(ctx);
}

/** Original procedural bootstep, rate-limited to avoid a continuous rumble. */
function playFootstep(volume: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const nowMs = performance.now();
  if (nowMs - lastFootstepAt < 220) return;
  lastFootstepAt = nowMs;
  resumeAudio(ctx);
  playTone(ctx, {
    frequency: 92,
    endFrequency: 43,
    duration: 0.13,
    peak: 0.11,
    attack: 0.009,
    wave: 'triangle',
    lowpass: 190,
  }, volume, ctx.currentTime + 0.008);
}

const MENU_MELODY = [
  220, 261.63, 329.63, 261.63,
  196, 246.94, 293.66, 246.94,
  174.61, 220, 261.63, 220,
  196, 246.94, 293.66, 246.94,
];
const MENU_BASS = [110, 98, 87.31, 98];

/** A quiet original ambient loop, started only after a trusted user gesture. */
export function startMenuMusic(): void {
  if (menuMusicTimer !== null) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeAudio(ctx);
  menuMusicStep = 0;

  const tick = () => {
    const step = menuMusicStep % MENU_MELODY.length;
    const now = ctx.currentTime + 0.025;
    playTone(ctx, {
      frequency: MENU_MELODY[step],
      duration: 0.43,
      peak: 0.105,
      attack: 0.08,
      wave: 'sine',
      lowpass: 1450,
    }, 0.18, now);
    if (step % 4 === 0) {
      playTone(ctx, {
        frequency: MENU_BASS[Math.floor(step / 4) % MENU_BASS.length],
        duration: 1.72,
        peak: 0.12,
        attack: 0.22,
        wave: 'triangle',
        lowpass: 520,
      }, 0.18, now);
      playTone(ctx, {
        frequency: MENU_BASS[Math.floor(step / 4) % MENU_BASS.length] * 1.5,
        duration: 1.58,
        peak: 0.055,
        attack: 0.2,
        wave: 'sine',
        lowpass: 900,
      }, 0.18, now);
    }
    menuMusicStep = (menuMusicStep + 1) % MENU_MELODY.length;
  };

  tick();
  menuMusicTimer = window.setInterval(tick, 500);
}

export function stopMenuMusic(): void {
  if (menuMusicTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(menuMusicTimer);
  }
  menuMusicTimer = null;
}
