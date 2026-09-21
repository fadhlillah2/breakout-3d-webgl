import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLeftKey, isRightKey, keyAction } from '../src/input.js';

test('paddle keys: arrows and A/D, repeat allowed (held keys)', () => {
  assert.equal(isLeftKey({ code: 'ArrowLeft' }), true);
  assert.equal(isLeftKey({ code: 'KeyA' }), true);
  assert.equal(isRightKey({ code: 'ArrowRight', repeat: true }), true);
  assert.equal(isRightKey({ code: 'KeyD' }), true);
  assert.equal(isLeftKey({ code: 'KeyD' }), false);
  assert.equal(isRightKey({ code: 'KeyA' }), false);
});

// The routing used to live inside main.js's keydown listener, where no test
// could reach it: a swapped left/right or a dropped interactive-target check was
// invisible to every gate. keyAction is now the only export main.js routes
// through, so the per-key predicates are tested through it rather than twice.
test('keyAction routes each key to the action main.js applies', () => {
  const on = (code, extra = {}) => keyAction({ code, repeat: false, target: null, ...extra });
  assert.equal(on('Space'), 'serve');
  assert.equal(on('Enter'), 'serve');
  assert.equal(on('NumpadEnter'), 'serve');
  assert.equal(on('Space', { repeat: true }), null, 'auto-repeat never re-serves');
  assert.equal(on('Escape'), 'pause');
  assert.equal(on('Escape', { repeat: true }), null, 'a held Escape never re-pauses');
  assert.equal(on('KeyM'), 'mute');
  assert.equal(on('KeyM', { repeat: true }), null, 'a held M never re-toggles mute');
  assert.equal(on('KeyM', { target: { closest: () => ({}) } }), 'mute',
    'a focused button never gates M (T4/B3)');
  assert.equal(on('ArrowLeft'), 'left');
  assert.equal(on('KeyA'), 'left');
  assert.equal(on('ArrowRight'), 'right');
  assert.equal(on('KeyD'), 'right');
  assert.equal(on('KeyB'), null);
});

test('a serve key on a focused button is left to the browser', () => {
  const button = { closest: () => ({}) };
  assert.equal(keyAction({ code: 'Space', repeat: false, target: button }), 'native');
  assert.equal(keyAction({ code: 'Space', repeat: false, target: { closest: () => null } }), 'serve');
  assert.equal(keyAction({ code: 'Space', repeat: false, target: null }), 'serve');
});

test('the mute branch in main.js toggles, syncs and announces', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, ''); // a commented-out statement must not satisfy the pin
  assert.match(main, /action === 'mute'\)\s*\{[^}]*sfx\.toggle\(\);\s*syncMute\(\);\s*if \(document\.activeElement !== muteButton\)\s*\{?\s*announce\.textContent = sfx\.muted \? 'Sound muted\.' : 'Sound on\.';/,
    'the mute branch calls sfx.toggle() then syncMute() then writes #announce unless #mute has focus');
});
