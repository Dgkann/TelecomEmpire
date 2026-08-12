// Tiny WebAudio blips. No assets, and the game is fully playable muted.
let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Blip = { freq: number; dur: number; type: OscillatorType; gain: number; sweep?: number };

const SOUNDS: Record<string, Blip> = {
  click: { freq: 620, dur: 0.05, type: 'triangle', gain: 0.05 },
  build: { freq: 320, dur: 0.16, type: 'square', gain: 0.05, sweep: 520 },
  connect: { freq: 880, dur: 0.14, type: 'sine', gain: 0.05, sweep: 1320 },
  alert: { freq: 440, dur: 0.28, type: 'sawtooth', gain: 0.05, sweep: 220 },
  cash: { freq: 1040, dur: 0.12, type: 'sine', gain: 0.045, sweep: 1560 },
};

export function playSound(name: keyof typeof SOUNDS, enabled: boolean) {
  if (!enabled) return;
  const c = audio();
  if (!c) return;
  const s = SOUNDS[name];
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = s.type;
  osc.frequency.setValueAtTime(s.freq, c.currentTime);
  if (s.sweep) osc.frequency.exponentialRampToValueAtTime(s.sweep, c.currentTime + s.dur);
  gain.gain.setValueAtTime(s.gain, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + s.dur);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + s.dur);
}
