// The impact feed: tick() clears state.events on its first line, stepPhysics
// fills it, and it must never reach snapshot() — two determinism tests compare
// whole snapshots as JSON, and an event list would make every run differ.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, BALL_R, CLEAR_THRESHOLD, COMBO_MAX, DROP_H, HALF_W, LOST_Y,
  PADDLE_H, PADDLE_Y, SCORE_BRICK, SCORE_CHIP,
} from '../src/game.js';

const PADDLE_TOP = PADDLE_Y + PADDLE_H / 2;

// Keeps the first `count` bricks of every other row. Skipping rows matters: a
// brick directly below the target would be the closer contact once the ball is
// placed under the target's own face, and the test would smash the neighbour.
const keepAlive = (g, count) => {
  const bricks = g.view().bricks;
  const rows = [...new Set(bricks.map((b) => b.y.toFixed(3)))];
  const kept = bricks.filter((b) => rows.indexOf(b.y.toFixed(3)) % 2 === 0).slice(0, count);
  for (const b of bricks) b.alive = kept.includes(b);
  for (const b of kept) { b.solid = false; b.hp = 1; b.hp0 = 1; }
  return kept;
};

const smash = (g, brick) => {
  const ball = g.view().ball;
  ball.x = brick.x; ball.y = brick.y - brick.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = 8;
  g.tick(0.01);
};

const types = (g) => g.view().events.map((e) => e.type);
const only = (g, type) => g.view().events.filter((e) => e.type === type);

test('tick clears the queue on its first line, so events last exactly one tick', () => {
  const g = createGame();
  g.serve();
  const [target] = keepAlive(g, 8);
  smash(g, target);
  assert.ok(only(g, 'brick').length > 0, 'the hit queued its event');
  g.tick(0.01);
  assert.deepEqual(only(g, 'brick'), [], 'and the next tick dropped it');
});

test('events never reach snapshot()', () => {
  const g = createGame();
  g.serve();
  const [target] = keepAlive(g, 8);
  smash(g, target);
  const snap = g.snapshot();
  assert.equal(snap.events, undefined, 'snapshot has no events field');
  // The shape contract the parity smoke and two determinism tests rest on:
  // scalars, plus the one ball position object.
  for (const [key, value] of Object.entries(snap)) {
    if (key === 'ball') continue;
    assert.notEqual(typeof value, 'object', `snapshot.${key} is a scalar`);
  }
});

test('a destroyed brick queues its own position, points and combo', () => {
  const g = createGame();
  g.serve();
  const [target] = keepAlive(g, 8);
  smash(g, target);
  const [event, ...rest] = only(g, 'brick');
  assert.equal(rest.length, 0, 'one hit, one event');
  assert.equal(event.destroyed, true);
  assert.equal(event.x, target.x);
  assert.equal(event.y, target.y);
  assert.equal(event.points, SCORE_BRICK);
  assert.equal(event.combo, 1);
  assert.equal(g.view().bricks[event.index], target, 'the index names the brick that broke');
});

test('a chip, a steel bounce, the paddle, a wall, a capsule and a lost ball all queue', () => {
  const g = createGame();
  g.serve();
  const [chipped, steel] = keepAlive(g, 8);
  chipped.hp = 2; chipped.hp0 = 2;
  smash(g, chipped);
  assert.deepEqual(only(g, 'brick').map((e) => [e.destroyed, e.points]), [[false, SCORE_CHIP]],
    'a chip is an event too, at the chip price');

  steel.solid = true; steel.hp = Infinity; steel.hp0 = Infinity;
  smash(g, steel);
  assert.deepEqual(only(g, 'brick').map((e) => [e.destroyed, e.solid, e.points]), [[false, true, 0]]);

  const ball = g.view().ball;
  ball.x = HALF_W - BALL_R - 0.01; ball.y = 3; ball.vx = 6; ball.vy = 0;
  g.tick(0.02);
  assert.equal(only(g, 'wall').length, 1, 'the side wall reports its bounce');

  g.setPaddle(0);
  ball.x = 0; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -4;
  g.tick(0.001);
  assert.equal(only(g, 'paddle').length, 1, 'the catch reports itself');

  g.view().drops.push({ x: 0, y: PADDLE_TOP + DROP_H / 2 - 1e-6, type: 'wide' });
  g.tick(0);
  assert.deepEqual(only(g, 'capsule').map((e) => e.kind), ['wide']);

  ball.y = LOST_Y - 0.01; ball.vx = 0; ball.vy = -4;
  g.tick(0.001);
  assert.equal(only(g, 'lost').length, 1, 'the lost ball reports itself');
});

test('clearing the wall queues the brick before the level it finished', () => {
  const g = createGame();
  g.serve();
  const kept = keepAlive(g, CLEAR_THRESHOLD + 1);
  smash(g, kept[0]);
  assert.deepEqual(types(g), ['brick', 'level'], 'order matters: the pop belongs to the old level');
  assert.equal(only(g, 'level')[0].level, 2);
  assert.equal(g.snapshot().combo, 0, 'a new wall starts a new rally');
});

test('the combo grows per brick in a rally, pays for it, and the paddle resets it', () => {
  const g = createGame();
  g.serve();
  const kept = keepAlive(g, 10);
  const paid = [];
  for (const brick of kept.slice(0, 4)) {
    smash(g, brick);
    paid.push(only(g, 'brick')[0].points);
  }
  assert.deepEqual(paid, [SCORE_BRICK, SCORE_BRICK * 2, SCORE_BRICK * 3, SCORE_BRICK * 4],
    'each brick in the same rally is worth one more multiple');
  assert.equal(g.snapshot().combo, 4);

  const ball = g.view().ball;
  g.setPaddle(0);
  ball.x = 0; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -4;
  g.tick(0.001);
  assert.equal(g.snapshot().combo, 0, 'the paddle ends the rally');
  smash(g, kept[4]);
  assert.equal(only(g, 'brick')[0].points, SCORE_BRICK, 'so the next brick is back to face value');
});

test('the combo multiplier is capped', () => {
  const g = createGame();
  g.serve();
  const kept = keepAlive(g, COMBO_MAX + 6);
  for (const brick of kept.slice(0, COMBO_MAX + 3)) smash(g, brick);
  assert.equal(g.snapshot().combo, COMBO_MAX);
  assert.equal(only(g, 'brick')[0].points, SCORE_BRICK * COMBO_MAX, 'and the payout stops there too');
});

test('losing the ball ends the rally', () => {
  const g = createGame();
  g.serve();
  const kept = keepAlive(g, 8);
  smash(g, kept[0]);
  assert.equal(g.snapshot().combo, 1);
  const ball = g.view().ball;
  ball.y = LOST_Y - 0.01; ball.vx = 0; ball.vy = -4;
  g.tick(0.001);
  assert.equal(g.snapshot().combo, 0);
});
