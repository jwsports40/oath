// audio/sfx.ts — WebAudio square/triangle chiptune cues, all ≤400ms.
// Sound is gated by settings.sound and haptics by settings.haptics, read
// lazily from the store at call time (store never imports this module).
import { useOath } from '../app/store';

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return null;
  if (ctx === null) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function soundOn(): boolean {
  return useOath.getState().settings.sound;
}

interface Note {
  freq: number;      // Hz
  at: number;        // offset seconds from cue start
  dur: number;       // seconds
  type: OscillatorType;
  gain?: number;
}

function play(notes: Note[]): void {
  if (!soundOn()) return;
  const ac = audioCtx();
  if (ac === null) return;
  const t0 = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type;
    osc.frequency.value = n.freq;
    const start = t0 + n.at;
    const end = start + n.dur;
    const peak = n.gain ?? 0.08;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/** Quest complete — two ascending squares E5 → B5. */
export function chirpComplete(): void {
  play([
    { freq: 659.25, at: 0, dur: 0.09, type: 'square' },
    { freq: 987.77, at: 0.09, dur: 0.14, type: 'square' },
  ]);
}

/** XP tick / PR — bright triangle blip G5 → C6. */
export function chirpXp(): void {
  play([
    { freq: 783.99, at: 0, dur: 0.07, type: 'triangle' },
    { freq: 1046.5, at: 0.07, dur: 0.09, type: 'triangle' },
  ]);
}

/** Level-up — 4-note square arpeggio C5 E5 G5 C6, ≤400ms total. */
export function fanfareLevelUp(): void {
  play([
    { freq: 523.25, at: 0, dur: 0.09, type: 'square' },
    { freq: 659.25, at: 0.09, dur: 0.09, type: 'square' },
    { freq: 783.99, at: 0.18, dur: 0.09, type: 'square' },
    { freq: 1046.5, at: 0.27, dur: 0.13, type: 'square' },
  ]);
}

/** Siege damage / boss kill — low square-into-triangle thud. */
export function thudDamage(): void {
  play([
    { freq: 110, at: 0, dur: 0.12, type: 'square', gain: 0.1 },
    { freq: 82.41, at: 0.08, dur: 0.16, type: 'triangle', gain: 0.1 },
  ]);
}

/** Day seal — solemn rising triad G4 C5 G5. */
export function sealDay(): void {
  play([
    { freq: 392, at: 0, dur: 0.12, type: 'triangle' },
    { freq: 523.25, at: 0.12, dur: 0.12, type: 'triangle' },
    { freq: 783.99, at: 0.24, dur: 0.16, type: 'square' },
  ]);
}

/** Vibration, gated by settings.haptics. No-op where unsupported (iOS web). */
export function haptic(pattern: number | number[]): void {
  if (!useOath.getState().settings.haptics) return;
  if (typeof navigator !== 'undefined') navigator.vibrate?.(pattern);
}
