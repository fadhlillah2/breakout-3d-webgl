import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorage, readBest, writeBest } from '../src/storage.js';

test('getStorage returns null when window is unavailable', () => {
  assert.equal(getStorage(), null);
});

test('readBest: missing, invalid, and throwing storage yield 0', () => {
  const blocked = { getItem() { throw new Error('blocked'); } };
  assert.equal(readBest(blocked), 0);
  assert.equal(readBest({ getItem: () => null }), 0);
  assert.equal(readBest({ getItem: () => 'nope' }), 0);
  assert.equal(readBest(null), 0);
  assert.equal(readBest({ getItem: () => '7' }), 7);
  assert.equal(readBest({ getItem: () => '7.9' }), 7, 'a fractional best is floored, never rounded up');
  assert.equal(readBest({ getItem: () => '-5' }), 0, 'a negative best is not a best');
});

test('writeBest never throws on blocked or null storage', () => {
  assert.doesNotThrow(() => writeBest({ setItem() { throw new Error('blocked'); } }, 9));
  assert.doesNotThrow(() => writeBest(null, 9));
});
