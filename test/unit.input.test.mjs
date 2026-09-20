import test from 'node:test';
import assert from 'node:assert/strict';
import { isServeKey, isPauseKey, isLeftKey, isRightKey } from '../src/input.js';

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

test('paddle keys: arrows and A/D, repeat allowed (held keys)', () => {
  assert.equal(isLeftKey({ code: 'ArrowLeft' }), true);
  assert.equal(isLeftKey({ code: 'KeyA' }), true);
  assert.equal(isRightKey({ code: 'ArrowRight', repeat: true }), true);
  assert.equal(isRightKey({ code: 'KeyD' }), true);
  assert.equal(isLeftKey({ code: 'KeyD' }), false);
  assert.equal(isRightKey({ code: 'KeyA' }), false);
});
