import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, BASE_SPEED, SPEED_STEP, MAX_DT, BALL_R, BRICK_D, PADDLE_HALF, PADDLE_Z,
  SCORE_BRICK, SCORE_LEVEL, HALF_W, LIVES, CEILING,
} from '../src/game.js';

const DT = 1 / 60;

test('initial ready state: 3 lives, 40 bricks, ball attached', () => {
  const g = createGame();
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.lives, LIVES);
  assert.equal(s.bricksLeft, 40);
  assert.equal(s.level, 1);
  assert.equal(s.speed, BASE_SPEED);
  assert.ok(s.ball.z > PADDLE_Z - 1, 'ball sits on the paddle');
});

test('serve launches the ball at the level speed toward the wall', () => {
  const g = createGame();
  g.serve();
  const s = g.snapshot();
  assert.equal(s.state, 'playing');
  const v = g.view().ball;
  assert.ok(Math.abs(Math.hypot(v.vx, v.vy, v.vz) - BASE_SPEED) < 1e-9);
  assert.ok(v.vz < 0, 'served toward the brick wall');
});

test('side wall and ceiling bounces flip the matching velocity', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  ball.x = HALF_W - BALL_R - 0.01; ball.vx = Math.abs(ball.vx) + 1; ball.vz = 0; ball.vy = 0;
  g.tick(0.02);
  assert.ok(ball.vx < 0, 'right wall flips vx');
  ball.y = CEILING - BALL_R - 0.01; ball.vy = 2; ball.vx = 0;
  g.tick(0.02);
  assert.ok(ball.vy < 0, 'ceiling flips vy');
});

test('paddle returns the ball and the hit offset steers vx', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(0.2);
  ball.x = 0.6; ball.y = 1.0; ball.z = PADDLE_Z - 0.3; ball.vx = 0; ball.vy = 0; ball.vz = 3;
  g.tick(MAX_DT);
  assert.ok(ball.vz < 0, 'vz flips back toward the bricks');
  assert.ok(ball.vx > 0, 'right-of-centre hit steers right');
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy, ball.vz) - BASE_SPEED) < 1e-9);
});

test('edge hit just inside the paddle still returns; just outside misses', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(0);
  ball.x = PADDLE_HALF + BALL_R - 0.01; ball.y = 1; ball.z = PADDLE_Z - 0.3; ball.vx = 0; ball.vy = 0; ball.vz = 3;
  g.tick(MAX_DT);
  assert.equal(g.snapshot().state, 'playing', 'inside edge returns');
  ball.x = PADDLE_HALF + BALL_R + 0.05; ball.z = PADDLE_Z - 0.3; ball.vz = 3; ball.vx = 0; ball.vy = 0;
  g.tick(MAX_DT);
  assert.equal(g.snapshot().state, 'life-lost');
  assert.equal(g.snapshot().lives, LIVES - 1);
});

test('brick hit destroys it, scores and reflects vz (swept at max speed)', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  const brick = g.view().bricks[0];
  ball.x = brick.x; ball.y = brick.y; ball.z = 0.5; ball.vx = 0; ball.vy = 0; ball.vz = -8;
  g.tick(MAX_DT); // dz = 0.4 > tebal bata → harus tetap terdeteksi
  assert.equal(g.snapshot().bricksLeft, 39);
  assert.equal(g.snapshot().score, SCORE_BRICK);
  assert.ok(ball.vz > 0, 'reflected off the brick');
});

test('back-side brick crossing destroys it and reflects back to the wall', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  const brick = g.view().bricks[0];
  ball.x = brick.x; ball.y = brick.y; ball.z = 0.1; ball.vx = 0; ball.vy = 0; ball.vz = 8;
  g.tick(0.01); // satu sub-step: kembali dari dinding belakang menembus bata hidup
  assert.equal(g.snapshot().bricksLeft, 39);
  assert.equal(g.snapshot().score, SCORE_BRICK);
  assert.ok(ball.vz < 0, 'reflected back toward the wall');
  assert.ok(ball.z < BRICK_D, 'pushed out behind the brick plane');
});

test('life-lost respawns on the paddle after the timer when lives remain', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(0);
  ball.x = 3.9; ball.z = PADDLE_Z - 0.3; ball.vz = 3; ball.vx = 0; ball.vy = 0;
  g.tick(MAX_DT);
  assert.equal(g.snapshot().state, 'life-lost');
  for (let i = 0; i < 60; i++) g.tick(DT);
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.lives, LIVES - 1);
  assert.ok(s.ball.z > PADDLE_Z - 1, 'respawned on the paddle');
});

test('three misses end the game and persist best', () => {
  const g = createGame({ best: 0 });
  for (let life = 0; life < LIVES; life++) {
    if (g.snapshot().state === 'ready') g.serve();
    const ball = g.view().ball;
    ball.x = 3.9; ball.z = PADDLE_Z - 0.3; ball.vz = 3; ball.vx = 0; ball.vy = 0;
    g.setPaddle(-3);
    g.tick(MAX_DT);
    for (let i = 0; i < 60; i++) g.tick(DT);
  }
  const s = g.snapshot();
  assert.equal(s.state, 'over');
  assert.equal(s.lives, 0);
  assert.equal(s.best, 0);
});

test('clearing the last brick starts the next level faster and re-lays bricks', () => {
  const g = createGame();
  g.serve();
  for (const brick of g.view().bricks) brick.alive = false;
  const last = g.view().bricks[0];
  last.alive = true;
  const ball = g.view().ball;
  ball.x = last.x; ball.y = last.y; ball.z = 0.5; ball.vx = 0; ball.vy = 0; ball.vz = -8;
  const before = g.snapshot().score;
  g.tick(MAX_DT);
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.level, 2);
  assert.equal(s.speed, BASE_SPEED + SPEED_STEP);
  assert.equal(s.bricksLeft, 40);
  assert.equal(s.score, before + SCORE_BRICK + SCORE_LEVEL);
});

test('pause blocks tick and serve; resume restores the previous state', () => {
  const g = createGame();
  g.pause();
  assert.equal(g.snapshot().state, 'paused');
  g.serve();
  assert.equal(g.snapshot().state, 'paused');
  g.resume();
  assert.equal(g.snapshot().state, 'ready');
  g.serve();
  const z = g.view().ball.z;
  g.pause();
  g.tick(1);
  assert.equal(g.view().ball.z, z);
  g.resume();
  assert.equal(g.snapshot().state, 'playing');
});

test('same inputs produce the same snapshot (deterministic)', () => {
  const run = () => {
    const g = createGame();
    g.serve();
    for (let i = 0; i < 600; i++) {
      g.setPaddle(g.view().ball.x);
      g.tick(DT);
    }
    return JSON.stringify(g.snapshot());
  };
  assert.equal(run(), run());
});

test('restart resets score/lives/level and keeps best', () => {
  const g = createGame({ best: 5 });
  g.serve();
  for (let i = 0; i < 3 * 61; i++) {
    const s = g.snapshot();
    if (s.state === 'ready') g.serve();
    if (s.state === 'over') break;
    const ball = g.view().ball;
    ball.x = 3.9; ball.z = PADDLE_Z - 0.3; ball.vz = 3; ball.vx = 0; ball.vy = 0;
    g.setPaddle(-3);
    g.tick(MAX_DT);
  }
  assert.equal(g.snapshot().state, 'over');
  g.restart();
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.lives, LIVES);
  assert.equal(s.level, 1);
  assert.equal(s.score, 0);
  assert.equal(s.best, 5);
});
