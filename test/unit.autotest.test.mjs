import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, LIVES } from '../src/game.js';
import { playTracking, playMiss, playEndOver } from '../src/autotest.js';

test('playTracking is deterministic, scores, and never misses', () => {
  const a = playTracking(createGame(), { ticks: 900 });
  const b = playTracking(createGame(), { ticks: 900 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.score > 0);
  assert.equal(a.lives, LIVES);
});

test('playMiss loses exactly one life and returns to ready', () => {
  const s = playMiss(createGame());
  assert.equal(s.lives, LIVES - 1);
  assert.equal(s.state, 'ready');
});

test('playEndOver reaches over with a positive score', () => {
  const s = playEndOver(createGame());
  assert.equal(s.state, 'over');
  assert.equal(s.lives, 0);
  assert.ok(s.score > 0);
  assert.equal(s.best, s.score);
});
