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

// The one place the product contract is a literal. Every other brick count in
// the suite is derived from parsePattern, so it moves silently with the wall;
// smoke is pure parity and holds no literal either. Edit these two numbers only
// together with the smoke summary line and screenshots/breakout-3d.png.
// The score is above 10 per brick because a rally multiplies the brick price;
// the brick count is untouched by that, which is how this test shows the
// multiplier is scoring and not physics.
test('the tracking run lands on its published golden', () => {
  const s = playTracking(createGame());
  assert.equal(s.score, 290, 'golden score');
  assert.equal(s.bricksLeft, 14, 'golden bricks left');
  assert.equal(s.level, 1);
  assert.equal(s.lives, LIVES);
});
