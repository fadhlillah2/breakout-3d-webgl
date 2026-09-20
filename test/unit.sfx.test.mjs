// Synthesised audio: oscillators only, nothing decoded from a file, and no
// AudioContext before a user gesture (browsers block it, and a blocked context
// stays suspended for the whole session).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSfx, VOICES } from '../src/sfx.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const param = (log, label) => ({
  setValueAtTime: (v) => log.push(`${label}=${v}`),
  exponentialRampToValueAtTime: (v) => log.push(`${label}->${v}`),
});
// Records what the game asked the audio hardware to do, without any audio.
const fakeAudio = () => {
  const log = [];
  class Ctx {
    constructor() { log.push('context'); this.currentTime = 0; this.destination = {}; }
    createOscillator() {
      log.push('oscillator');
      return { type: '', frequency: param(log, 'freq'), connect() {}, start() {}, stop() {} };
    }
    createGain() { return { gain: param(log, 'gain'), connect() {} }; }
  }
  return { log, Ctx };
};
const fakeStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
};
const count = (log, what) => log.filter((entry) => entry === what).length;

test('no audio context exists until a user gesture unlocks one', () => {
  const { log, Ctx } = fakeAudio();
  const sfx = createSfx({ storage: fakeStorage(), Ctx });
  assert.equal(sfx.play('brick'), false, 'a pre-gesture sound is dropped, not queued');
  assert.equal(count(log, 'context'), 0, 'and no context was built to drop it');
  sfx.unlock();
  assert.equal(count(log, 'context'), 1);
  sfx.unlock();
  assert.equal(count(log, 'context'), 1, 'later gestures reuse the one context');
});

test('every voice is built from oscillators and nothing else', () => {
  const { log, Ctx } = fakeAudio();
  const sfx = createSfx({ storage: fakeStorage(), Ctx });
  sfx.unlock();
  for (const [name, notes] of Object.entries(VOICES)) {
    log.length = 0;
    assert.equal(sfx.play(name), true, `${name} plays`);
    assert.equal(count(log, 'oscillator'), notes.length, `${name} is ${notes.length} note(s)`);
    assert.ok(log.some((e) => e.startsWith('freq=')), `${name} sets a pitch`);
    assert.ok(log.some((e) => e.startsWith('gain->')), `${name} fades out instead of clicking`);
  }
});

test('the pitch argument bends a voice without editing the table', () => {
  const { log, Ctx } = fakeAudio();
  const sfx = createSfx({ storage: fakeStorage(), Ctx });
  sfx.unlock();
  const pitchOf = (mult) => {
    log.length = 0;
    sfx.play('brick', mult);
    return Number(log.find((e) => e.startsWith('freq='))?.slice(5));
  };
  assert.ok(pitchOf(1.5) > pitchOf(1), 'a longer combo rings higher');
  assert.equal(pitchOf(1), VOICES.brick[0].from);
});

test('mute silences every voice and survives a reload', () => {
  const { log, Ctx } = fakeAudio();
  const storage = fakeStorage();
  const sfx = createSfx({ storage, Ctx });
  sfx.unlock();
  assert.equal(sfx.muted, false);
  assert.equal(sfx.toggle(), true, 'toggle reports the new state');
  log.length = 0;
  assert.equal(sfx.play('brick'), false);
  assert.equal(count(log, 'oscillator'), 0, 'a muted game makes no sound at all');

  const reloaded = createSfx({ storage, Ctx });
  assert.equal(reloaded.muted, true, 'the mute choice is persisted');
  reloaded.unlock();
  assert.equal(reloaded.play('brick'), false);
  assert.equal(reloaded.toggle(), false);
  assert.equal(reloaded.play('brick'), true, 'and unmuting brings the sound back');
});

test('blocked storage never breaks the mute toggle', () => {
  const { Ctx } = fakeAudio();
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const sfx = createSfx({ storage: blocked, Ctx });
  assert.equal(sfx.muted, false);
  assert.equal(sfx.toggle(), true);
  assert.equal(sfx.muted, true);
});

test('a missing AudioContext leaves the game playable and silent', () => {
  const sfx = createSfx({ storage: fakeStorage(), Ctx: undefined });
  sfx.unlock();
  assert.equal(sfx.play('brick'), false);
});

// The game asks for voices by name, so a renamed voice is a silent sound.
test('every voice main.js asks for exists in the table', () => {
  const main = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');
  const asked = [...main.matchAll(/sfx\.play\('([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(asked.length >= 5, `main.js plays sounds (found ${asked.length} calls)`);
  for (const name of asked) assert.ok(VOICES[name], `main.js plays "${name}", which the table has`);
});
