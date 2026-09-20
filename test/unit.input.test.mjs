import test from 'node:test';
import assert from 'node:assert/strict';
import { isServeKey, isPauseKey, isLeftKey, isRightKey, isInteractiveTarget, keyAction } from '../src/input.js';

test('serve keys: Space/Enter/NumpadEnter, no auto-repeat', () => {
  assert.equal(isServeKey({ code: 'Space', repeat: false }), true);
  assert.equal(isServeKey({ code: 'Enter', repeat: false }), true);
  assert.equal(isServeKey({ code: 'NumpadEnter', repeat: false }), true);
  assert.equal(isServeKey({ code: 'Space', repeat: true }), false);
  assert.equal(isServeKey({ code: 'KeyA', repeat: false }), false);
});

test('pause key: Escape only, no auto-repeat', () => {
  assert.equal(isPauseKey({ code: 'Escape', repeat: false }), true);
  assert.equal(isPauseKey({ code: 'Escape', repeat: true }), false);
});

test('interactive targets are excluded from serve keys', () => {
  assert.equal(isInteractiveTarget({ closest: () => ({}) }), true);
  assert.equal(isInteractiveTarget({ closest: () => null }), false);
  assert.equal(isInteractiveTarget(null), false);
});

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
// invisible to every gate.
test('keyAction routes each key to the action main.js applies', () => {
  const on = (code, extra = {}) => keyAction({ code, repeat: false, target: null, ...extra });
  assert.equal(on('Space'), 'serve');
  assert.equal(on('Enter'), 'serve');
  assert.equal(on('Space', { repeat: true }), null, 'auto-repeat never re-serves');
  assert.equal(on('Escape'), 'pause');
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
});
