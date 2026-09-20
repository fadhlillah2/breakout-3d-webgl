// Sound effects synthesised on the spot: one oscillator plus one gain envelope
// per note, so the game ships no audio files at all. Browsers refuse to start
// an AudioContext before a user gesture, so the context is built in unlock(),
// which the first pointer or key event calls.
import { readBest, writeBest } from './storage.js';

const MUTE_KEY = 'breakout-3d.muted';

// type, start and end frequency in Hz, duration in seconds, peak gain, and the
// offset from the start of the sound for the notes of a chord.
export const VOICES = {
  wall: [{ type: 'sine', from: 520, to: 470, dur: 0.05, gain: 0.05, at: 0 }],
  steel: [{ type: 'square', from: 180, to: 150, dur: 0.09, gain: 0.07, at: 0 }],
  paddle: [{ type: 'triangle', from: 300, to: 170, dur: 0.1, gain: 0.13, at: 0 }],
  chip: [{ type: 'square', from: 440, to: 360, dur: 0.07, gain: 0.07, at: 0 }],
  brick: [{ type: 'square', from: 700, to: 190, dur: 0.16, gain: 0.1, at: 0 }],
  capsule: [{ type: 'sine', from: 620, to: 980, dur: 0.16, gain: 0.1, at: 0 }],
  lost: [{ type: 'sawtooth', from: 260, to: 70, dur: 0.45, gain: 0.12, at: 0 }],
  level: [
    { type: 'triangle', from: 523, to: 523, dur: 0.12, gain: 0.1, at: 0 },
    { type: 'triangle', from: 659, to: 659, dur: 0.12, gain: 0.1, at: 0.1 },
    { type: 'triangle', from: 880, to: 880, dur: 0.24, gain: 0.1, at: 0.2 },
  ],
};

export function createSfx({ storage = null, Ctx = globalThis.AudioContext } = {}) {
  // readBest is just "read a non-negative integer": 1 = muted.
  let muted = readBest(storage, MUTE_KEY) > 0;
  let ctx = null;

  const note = (n, pitch) => {
    const t0 = ctx.currentTime + n.at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = n.type;
    osc.frequency.setValueAtTime(n.from * pitch, t0);
    osc.frequency.exponentialRampToValueAtTime(n.to * pitch, t0 + n.dur);
    amp.gain.setValueAtTime(n.gain, t0);
    // Exponential to a near-zero floor, never to 0: the Web Audio ramp is
    // undefined at zero and a hard stop clicks.
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.02);
  };

  return {
    get muted() { return muted; },
    // Built even while muted: unmuting happens on a button click, which is the
    // last gesture we are guaranteed to get.
    unlock() {
      if (ctx || !Ctx) return;
      try { ctx = new Ctx(); } catch { ctx = null; }
    },
    play(name, pitch = 1) {
      const voice = VOICES[name];
      if (muted || !ctx || !voice) return false;
      for (const n of voice) note(n, pitch);
      return true;
    },
    toggle() {
      muted = !muted;
      writeBest(storage, muted ? 1 : 0, MUTE_KEY);
      return muted;
    },
  };
}
