import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, BASE_SPEED, SPEED_STEP, MAX_DT, MAX_SPEED, BALL_R, PADDLE_HALF, PADDLE_SPEED,
  PADDLE_Y, PADDLE_H, SCORE_BRICK, SCORE_LEVEL, HALF_W, LIVES, CEILING, MIN_VX, MIN_VY, LOST_Y,
  CLEAR_THRESHOLD, parsePattern, patternFor,
} from '../src/game.js';

// The wall is a pattern now, so a fixed index no longer names a given
// neighbour: every contact test isolates its own brick instead.
const targets = (level = 1) => parsePattern(patternFor(level)).filter((b) => !b.solid).length;
const isolate = (g, index = 0) => {
  const bricks = g.view().bricks;
  const target = bricks[index];
  const dist = (b) => Math.hypot(b.x - target.x, b.y - target.y);
  const keep = bricks.filter((b) => b !== target).sort((a, b) => dist(b) - dist(a))
    .slice(0, CLEAR_THRESHOLD + 1);
  for (const b of bricks) b.alive = b === target || keep.includes(b);
  for (const b of [target, ...keep]) { b.solid = false; b.hp = 1; b.hp0 = 1; }
  return target;
};

const DT = 1 / 60;
const PADDLE_TOP = PADDLE_Y + PADDLE_H / 2;
const degrees = (vx, vy) => Math.atan2(vx, vy) * 180 / Math.PI; // 0 = straight up

// Drops the ball onto the paddle at an exact contact point: the pre-move
// position is compensated so one sub-step lands it on `ballX` / just inside the
// catch window, whatever velocity it arrives with.
const paddleBounce = ({ ballX, paddleX = 0, vx, vy }) => {
  const g = createGame();
  g.serve();
  g.setPaddle(paddleX);
  const dt = 0.001;
  const ball = g.view().ball;
  ball.x = ballX - vx * dt;
  ball.y = PADDLE_TOP + BALL_R - 0.01 - vy * dt;
  ball.vx = vx;
  ball.vy = vy;
  g.tick(dt);
  return { vx: ball.vx, vy: ball.vy, angle: degrees(ball.vx, ball.vy), speed: Math.hypot(ball.vx, ball.vy) };
};

test('initial ready state: 3 lives, a full wall, ball attached above the paddle', () => {
  const g = createGame();
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.lives, LIVES);
  assert.equal(s.bricksLeft, targets(1));
  assert.equal(s.level, 1);
  assert.equal(s.speed, BASE_SPEED);
  assert.equal(s.ball.y, PADDLE_TOP + BALL_R, 'ball rests exactly on the paddle top');
  g.setPaddle(1.5);
  assert.equal(g.view().ball.y, PADDLE_TOP + BALL_R, 'and stays there while aiming');
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
  const b = paddleBounce({ ballX: 0.6, paddleX: 0.2, vx: 0, vy: -3 });
  assert.ok(b.vy > 0, 'vy flips back up');
  assert.ok(b.vx > 0, 'right-of-centre hit steers right');
  assert.ok(Math.abs(b.speed - BASE_SPEED) < 1e-9);
});

test('a centred paddle hit leaves at the minimum bounce angle, never straight up', () => {
  const b = paddleBounce({ ballX: 0, paddleX: 0, vx: 0, vy: -4 });
  assert.ok(Math.abs(Math.abs(b.angle) - 16) < 1e-6, `|angle| ${b.angle} === 16`);
  assert.ok(b.vx > 0, 'dead centre breaks the tie to the right, deterministically');
  assert.ok(b.vy > 0, 'vy flips back up');
  assert.ok(Math.abs(b.speed - BASE_SPEED) < 1e-9, 'speed is the level speed');
});

test('the paddle exit angle is a pure function of the contact offset', () => {
  const steep = paddleBounce({ ballX: 0.4, paddleX: 0, vx: 0, vy: -3 });
  const shallow = paddleBounce({ ballX: 0.4, paddleX: 0, vx: -3, vy: -2 });
  assert.ok(Math.abs(steep.angle - shallow.angle) < 1e-9,
    `same contact point, same exit angle (${steep.angle} vs ${shallow.angle})`);
});

test('the contact offset fans the exit angle from 16 to 60 degrees', () => {
  const at = (offset) => paddleBounce({ ballX: offset * PADDLE_HALF, paddleX: 0, vx: 0, vy: -3 }).angle;
  assert.ok(Math.abs(at(0.5) - 30) < 1e-6, `half-way out -> 30deg (got ${at(0.5)})`);
  assert.ok(Math.abs(at(1) - 60) < 1e-6, `paddle tip -> 60deg (got ${at(1)})`);
  assert.ok(Math.abs(at(-1) + 60) < 1e-6, `left tip -> -60deg (got ${at(-1)})`);
  assert.ok(Math.abs(at(1.1) - 60) < 1e-6, `past the tip stays clamped (got ${at(1.1)})`);
  // the middle third used to collapse onto one angle; it must steer now
  assert.ok(at(0.34) > at(0.28) && at(0.28) > at(0.0), 'the middle third still steers');
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

test('brick hit from below destroys it, scores and flips vy', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const before = g.snapshot().bricksLeft;
  const ball = g.view().ball;
  ball.x = brick.x; ball.y = brick.y - brick.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = 8;
  g.tick(0.01);
  assert.equal(brick.alive, false, 'the brick that was aimed at is the one that broke');
  assert.equal(g.snapshot().bricksLeft, before - 1);
  assert.equal(g.snapshot().score, SCORE_BRICK);
  assert.ok(ball.vy < 0, 'reflected downward off the brick underside');
});

// The sub-stepping claim, gated: one whole step of this shot clears the brick
// completely, so the brick survives unless the step is subdivided. Asserting the
// count instead of this brick would pass on a ball that tunnelled into another.
test('a ball fast enough to jump a brick in one frame still breaks it', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const ball = g.view().ball;
  const vy = 20;
  assert.ok(vy * MAX_DT > brick.h + 2 * BALL_R, 'the setup really is a tunnelling shot');
  ball.x = brick.x; ball.y = brick.y - brick.h / 2 - BALL_R - 0.05; ball.vx = 0; ball.vy = vy;
  g.tick(MAX_DT);
  assert.equal(brick.alive, false, 'sub-stepping caught the face it flew through');
  assert.ok(g.view().ball.vy < 0, 'and reflected it downward');
});

test('brick hit from the side flips vx and destroys the brick', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const before = g.snapshot().bricksLeft;
  const ball = g.view().ball;
  ball.x = brick.x - brick.w / 2 - BALL_R + 0.02; ball.y = brick.y; ball.vx = 8; ball.vy = 0;
  g.tick(0.01);
  assert.equal(g.snapshot().bricksLeft, before - 1);
  assert.ok(ball.vx < 0, 'reflected back off the left face');
});

test('corner hit reflects about the brick normal and preserves speed', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const before = g.snapshot().bricksLeft;
  const ball = g.view().ball;
  const off = BALL_R * 0.7;
  ball.x = brick.x - brick.w / 2 - off;
  ball.y = brick.y - brick.h / 2 - off;
  ball.vx = 3; ball.vy = 3;
  g.tick(0.01);
  assert.equal(g.snapshot().bricksLeft, before - 1);
  assert.ok(ball.vx < 0 && ball.vy < 0, `normal reflection (vx ${ball.vx}, vy ${ball.vy})`);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - Math.hypot(3, 3)) < 1e-9, 'speed preserved');
});

test('a ball passing just outside the brick corner does not collide', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const before = g.snapshot().bricksLeft;
  const ball = g.view().ball;
  const off = BALL_R * 1.4;
  ball.x = brick.x - brick.w / 2 - off;
  ball.y = brick.y - brick.h / 2 - off;
  ball.vx = 3; ball.vy = 3;
  g.tick(0.01);
  assert.equal(g.snapshot().bricksLeft, before);
});

test('a dead-vertical brick bounce still keeps a minimum horizontal component', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const before = g.snapshot().bricksLeft;
  const ball = g.view().ball;
  ball.x = brick.x; ball.y = brick.y - brick.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = 8;
  g.tick(0.01);
  assert.equal(g.snapshot().bricksLeft, before - 1);
  assert.ok(Math.abs(ball.vx) >= MIN_VX - 1e-9, `|vx| ${ball.vx} >= ${MIN_VX}`);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - 8) < 1e-9, 'speed preserved');
});

test('a ball slipping below the paddle top cannot be caught from the side', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  g.setPaddle(0);
  ball.x = 0.3; ball.y = PADDLE_Y + 0.02; ball.vx = 0; ball.vy = -2;
  g.tick(1 / 60);
  assert.equal(g.snapshot().state, 'playing', 'no sideways pop-up');
  for (let i = 0; i < 30 && g.snapshot().state === 'playing'; i++) g.tick(1 / 60);
  assert.equal(g.snapshot().state, 'life-lost');
  assert.equal(g.snapshot().lives, LIVES - 1);
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

test('three misses end the game, and the run that scored becomes the best', () => {
  const g = createGame({ best: 0 });
  // Seeded first: with a score of 0 the old assertion (best === 0) held whether
  // or not the game promoted the run at all.
  g.serve();
  const brick = isolate(g);
  const shot = g.view().ball;
  shot.x = brick.x; shot.y = brick.y - brick.h / 2 - BALL_R + 0.02; shot.vx = 0; shot.vy = 8;
  g.tick(0.01);
  const scored = g.snapshot().score;
  assert.equal(scored, SCORE_BRICK, 'the run is on the board before it ends');
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
  assert.equal(s.score, scored, 'the score survives the last life');
  assert.equal(s.best, scored, 'and the finished run is the new best');
});

test('clearing the last brick starts the next level faster and re-lays bricks', () => {
  const g = createGame();
  g.serve();
  for (const brick of g.view().bricks) brick.alive = false;
  const last = g.view().bricks[0];
  last.alive = true; last.solid = false; last.hp = 1; last.hp0 = 1;
  const ball = g.view().ball;
  ball.x = last.x; ball.y = last.y - last.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = 8;
  const before = g.snapshot().score;
  g.tick(0.01);
  const s = g.snapshot();
  assert.equal(s.state, 'ready');
  assert.equal(s.level, 2);
  assert.equal(s.speed, BASE_SPEED + SPEED_STEP);
  assert.equal(s.bricksLeft, targets(2));
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

test('setPaddle is ignored while paused or over', () => {
  const g = createGame();
  g.pause();
  g.setPaddle(2);
  assert.equal(g.snapshot().paddleX, 0, 'paused paddle is frozen');
  g.resume();
  g.setPaddle(2);
  assert.equal(g.snapshot().paddleX, 2);
  for (let guard = 0; guard < 4000 && g.snapshot().state !== 'over'; guard++) {
    const s = g.snapshot();
    if (s.state === 'ready') g.serve();
    if (s.state === 'playing') g.view().ball.x = 3.9; // keep the ball away from the paddle
    g.tick(DT);
  }
  assert.equal(g.snapshot().state, 'over');
  g.setPaddle(-2);
  assert.equal(g.snapshot().paddleX, 2, 'game-over paddle is frozen');
});

test('a non-finite dt cannot poison the ball or the respawn timer', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  const x = ball.x, y = ball.y;
  g.tick(NaN);
  g.tick(undefined);
  assert.equal(ball.x, x);
  assert.equal(ball.y, y);
  assert.equal(g.snapshot().state, 'playing');
  g.setPaddle(-3);
  ball.x = 3.9; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -3;
  for (let i = 0; i < 90 && g.snapshot().state === 'playing'; i++) g.tick(DT);
  assert.equal(g.snapshot().state, 'life-lost');
  g.tick(NaN);
  for (let i = 0; i < 60; i++) g.tick(DT);
  assert.equal(g.snapshot().state, 'ready', 'a stalled frame must not freeze the respawn');
});

test('a non-finite paddle position is ignored, at the root', () => {
  const g = createGame();
  g.setPaddle(1.2);
  g.setPaddle(NaN); // a 0x0 canvas makes main.js hand over 0/0
  assert.equal(g.snapshot().paddleX, 1.2);
  assert.equal(g.view().ball.x, 1.2, 'the attached ball stays finite too');
  g.nudgePaddle(1, NaN);
  assert.equal(g.snapshot().paddleX, 1.2, 'nudgePaddle routes through the same guard');
  g.serve();
  g.tick(DT);
  assert.ok(Number.isFinite(g.view().ball.x), 'play continues from a finite ball');
});

test('a near-horizontal brick bounce is floored in vy, not only in vx', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const before = g.snapshot().bricksLeft;
  const ball = g.view().ball;
  ball.x = brick.x - brick.w / 2 - BALL_R + 0.02; ball.y = brick.y; ball.vx = 4; ball.vy = 0.01;
  const speed = Math.hypot(ball.vx, ball.vy);
  g.tick(0.005);
  assert.equal(g.snapshot().bricksLeft, before - 1);
  assert.ok(Math.abs(ball.vy) >= MIN_VY - 1e-9, `|vy| ${ball.vy} >= ${MIN_VY}`);
  assert.ok(Math.abs(ball.vx) >= MIN_VX - 1e-9, `|vx| ${ball.vx} >= ${MIN_VX}`);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - speed) < 1e-9, 'speed preserved');
});

test('the brick wall is centred and both outer faces stay inside the ball reach', () => {
  const bricks = createGame().view().bricks;
  const lo = Math.min(...bricks.map((b) => b.x - b.w / 2));
  const hi = Math.max(...bricks.map((b) => b.x + b.w / 2));
  assert.ok(Math.abs(lo + hi) < 1e-9, `wall centred (${lo} .. ${hi})`);
  assert.ok(lo >= -(HALF_W - BALL_R) - 1e-9, `left face reachable (${lo})`);
  assert.ok(hi <= HALF_W - BALL_R + 1e-9, `right face reachable (${hi})`);
});

test('the brick separation push cannot shove the ball through a side wall', () => {
  const g = createGame();
  g.serve();
  const ball = g.view().ball;
  const brick = g.view().bricks.reduce((a, b) => (b.x < a.x ? b : a));
  ball.x = -(HALF_W - BALL_R); ball.y = brick.y; ball.vx = 0; ball.vy = 0;
  g.tick(0.005);
  assert.ok(ball.x >= -(HALF_W - BALL_R) - 1e-9, `stays inside the wall (x ${ball.x})`);
});

test('a brick overlapped by a ball moving away from it is not destroyed', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g);
  const before = g.snapshot().bricksLeft;
  const ball = g.view().ball;
  ball.x = brick.x; ball.y = brick.y - brick.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = -0.5;
  g.tick(0.002);
  assert.equal(brick.alive, true, 'the overlapped brick survives');
  assert.equal(g.snapshot().bricksLeft, before, 'no bounce, no kill');
  assert.equal(g.snapshot().score, 0);
  assert.ok(ball.vy < 0, 'velocity untouched, only pushed out');
});

test('an overlong frame is clamped to MAX_DT instead of teleporting the ball', () => {
  const clamped = createGame();
  clamped.serve();
  clamped.tick(MAX_DT);
  const stalled = createGame();
  stalled.serve();
  stalled.tick(5);
  assert.ok(clamped.snapshot().ball.y > createGame().snapshot().ball.y, 'the clamped frame did advance');
  assert.deepEqual(stalled.snapshot().ball, clamped.snapshot().ball, 'a 5 s stall advances exactly one MAX_DT');
});

test('the level speed climbs by a step per level and stops at MAX_SPEED', () => {
  const g = createGame();
  let previous = g.snapshot().speed;
  for (let level = 1; level <= 12; level++) {
    const bricks = g.view().bricks;
    const target = bricks.find((b) => !b.solid);
    for (const b of bricks) b.alive = b === target;
    // Some patterns open with a two- or three-hit brick, so chip until it goes.
    for (let hit = 0; hit < 4 && g.snapshot().level === level; hit++) {
      if (g.snapshot().state === 'ready') g.serve();
      const ball = g.view().ball;
      ball.x = target.x; ball.y = target.y - target.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = 8;
      g.tick(0.01);
    }
    const speed = g.snapshot().speed;
    assert.equal(g.snapshot().level, level + 1, `level ${level} cleared`);
    assert.ok(speed <= MAX_SPEED, `level ${level + 1} runs at ${speed}, under the cap`);
    assert.ok(speed >= previous, 'the curve never steps back');
    previous = speed;
  }
  assert.equal(previous, MAX_SPEED, 'twelve levels in, the speed sits on the cap');
});

// Two numbers a player feels but no other test pins: the depth the ball lives
// at, and the kick that carries a lost ball out of the arena.
test('the ball stays on the play plane, and a lost ball drops away at a fixed speed', () => {
  const g = createGame();
  assert.equal(g.snapshot().ball.z, 5.8, 'the published play plane');
  g.serve();
  g.setPaddle(-3);
  const ball = g.view().ball;
  ball.x = 3.9; ball.y = PADDLE_TOP + BALL_R - 0.01; ball.vx = 0; ball.vy = -3;
  for (let i = 0; i < 90 && g.snapshot().state === 'playing'; i++) g.tick(DT);
  assert.equal(g.snapshot().state, 'life-lost');
  assert.equal(g.view().ball.vy, -2.4, 'the lost ball is kicked down at a fixed speed');
  assert.equal(g.snapshot().ball.z, 5.8, 'and never leaves the plane on the way out');
});

test('nudgePaddle travels at the paddle speed and stops half a paddle short of the wall', () => {
  const g = createGame();
  g.nudgePaddle(1, 0.1);
  assert.ok(Math.abs(g.snapshot().paddleX - PADDLE_SPEED * 0.1) < 1e-9,
    `one nudge covers speed * dt (got ${g.snapshot().paddleX})`);
  for (let i = 0; i < 60; i++) g.nudgePaddle(1, 0.1);
  assert.equal(g.snapshot().paddleX, HALF_W - PADDLE_HALF, 'held right, it parks against the wall');
  for (let i = 0; i < 120; i++) g.nudgePaddle(-1, 0.1);
  assert.equal(g.snapshot().paddleX, -(HALF_W - PADDLE_HALF), 'and against the other one');
});
