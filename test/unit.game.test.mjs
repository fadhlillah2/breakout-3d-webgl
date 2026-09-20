import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, BASE_SPEED, SPEED_STEP, MAX_DT, BALL_R, PADDLE_HALF, PADDLE_Y, PADDLE_H,
  SCORE_BRICK, SCORE_LEVEL, HALF_W, LIVES, CEILING, MIN_VX, LOST_Y,
} from '../src/game.js';

const DT = 1 / 60;
const PADDLE_TOP = PADDLE_Y + PADDLE_H / 2;

test('initial ready state: 3 lives, 40 bricks, ball attached above the paddle', () => {
  const g = createGame();
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.lives, LIVES);
  assert.equal(s.bricksLeft, 40);
  assert.equal(s.level, 1);
  assert.equal(s.speed, BASE_SPEED);
  assert.ok(s.ball.y > PADDLE_TOP, 'ball sits on the paddle');
});

test('serve launches the ball upward at the level speed', () => {
  const g = createGame();
  g.serve();
  const s = g.snapshot();
  assert.equal(s.state, 'playing');
  const v = g.view().ball;
  assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - BASE_SPEED) < 1e-9);
  assert.ok(v.vy > 0, 'served upward');
});

test('side wall and ceiling bounces flip the matching velocity', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  ball.x = HALF_W - BALL_R - 0.01; ball.vx = 3; ball.vy = 0;
  g.tick(0.02);
  assert.ok(ball.vx < 0, 'right wall flips vx');
  ball.y = CEILING - BALL_R - 0.01; ball.vy = 3; ball.vx = 0;
  g.tick(0.02);
  assert.ok(ball.vy < 0, 'ceiling flips vy');
});

test('paddle returns a descending ball and the hit offset steers vx', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(0.2);
  ball.x = 0.6; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -3;
  g.tick(0.02);
  assert.ok(ball.vy > 0, 'vy flips back up');
  assert.ok(ball.vx > 0, 'right-of-centre hit steers right');
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - BASE_SPEED) < 1e-9);
});

test('centred paddle hit still leaves a minimum horizontal component', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(0);
  ball.x = 0; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -4;
  g.tick(0.02);
  assert.ok(Math.abs(ball.vx) >= MIN_VX - 1e-9, `|vx| ${ball.vx} >= ${MIN_VX}`);
  assert.ok(ball.vy > 0, 'vy flips back up');
});

test('edge hit just inside the paddle still returns; just outside falls through', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(0);
  ball.x = PADDLE_HALF + BALL_R - 0.01; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -3;
  g.tick(0.02);
  assert.equal(g.snapshot().state, 'playing', 'inside edge returns');
  assert.ok(ball.vy > 0);
  g.setPaddle(-3);
  ball.x = PADDLE_HALF + BALL_R + 0.05; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -3;
  g.tick(0.02);
  assert.equal(g.snapshot().state, 'playing', 'still falling');
  for (let i = 0; i < 60 && g.snapshot().state === 'playing'; i++) g.tick(DT);
  assert.equal(g.snapshot().state, 'life-lost');
  assert.equal(g.snapshot().lives, LIVES - 1);
});

test('brick hit from below destroys it, scores and flips vy (no tunnelling)', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  const brick = g.view().bricks[1];
  ball.x = brick.x; ball.y = brick.y - brick.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = 8;
  g.tick(0.01);
  assert.equal(g.snapshot().bricksLeft, 39);
  assert.equal(g.snapshot().score, SCORE_BRICK);
  assert.ok(ball.vy < 0, 'reflected downward off the brick underside');
});

test('brick hit from the side flips vx and destroys the brick', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  const brick = g.view().bricks[1];
  ball.x = brick.x - brick.w / 2 - BALL_R + 0.02; ball.y = brick.y; ball.vx = 8; ball.vy = 0;
  g.tick(0.01);
  assert.equal(g.snapshot().bricksLeft, 39);
  assert.ok(ball.vx < 0, 'reflected back off the left face');
});

test('life-lost respawns on the paddle after the timer when lives remain', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(-3);
  ball.x = 3.9; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -3;
  for (let i = 0; i < 90 && g.snapshot().state === 'playing'; i++) g.tick(DT);
  assert.equal(g.snapshot().state, 'life-lost');
  for (let i = 0; i < 60; i++) g.tick(DT);
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.lives, LIVES - 1);
  assert.ok(s.ball.y > PADDLE_TOP, 'respawned on the paddle');
});

test('three misses end the game and persist best', () => {
  const g = createGame({ best: 0 });
  for (let life = 0; life < LIVES; life++) {
    if (g.snapshot().state === 'ready') g.serve();
    const ball = g.view().ball;
    g.setPaddle(-3);
    ball.x = 3.9; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -3;
    for (let i = 0; i < 90 && g.snapshot().state === 'playing'; i++) g.tick(DT);
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
  ball.x = last.x; ball.y = last.y - last.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = 8;
  const before = g.snapshot().score;
  g.tick(0.01);
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
  const y = g.view().ball.y;
  g.pause();
  g.tick(1);
  assert.equal(g.view().ball.y, y);
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
  for (let guard = 0; guard < 4000 && g.snapshot().state !== 'over'; guard++) {
    const s = g.snapshot();
    if (s.state === 'ready') g.serve();
    g.setPaddle(-3);
    if (s.state === 'playing') g.view().ball.x = 3.9; // keep the ball away from the paddle
    g.tick(DT);
  }
  assert.equal(g.snapshot().state, 'over');
  const bestBefore = g.snapshot().best;
  assert.ok(bestBefore >= 5, 'best never drops below the seeded value');
  g.restart();
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.lives, LIVES);
  assert.equal(s.level, 1);
  assert.equal(s.score, 0);
  assert.equal(s.best, bestBefore);
});
