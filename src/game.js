// Breakout 3D game logic — no DOM, no WebGL. Pure state + math so Node tests,
// the browser smoke test, and the screenshot tool all drive the same code.

export const HALF_W = 4.0;
export const CEILING = 6.0;
export const BALL_R = 0.12;
export const PADDLE_Z = 6.0;
export const PADDLE_HALF = 0.8;
export const PADDLE_SPEED = 7.0;
export const BASE_SPEED = 4.2;
export const SPEED_STEP = 0.4;
export const MAX_SPEED = 8.0;
export const MAX_DT = 0.05;
export const SUB_DT = 0.02;
export const LIVES = 3;
export const SCORE_BRICK = 10;
export const SCORE_LEVEL = 100;
export const BRICK_COLS = 8;
export const BRICK_ROWS = 5;
export const BRICK_W = 0.9;
export const BRICK_H = 0.5;
export const BRICK_D = 0.3;
export const COLORS = [
  [0.36, 0.88, 0.78], // teal #5ce1c6
  [0.95, 0.75, 0.47], // amber #f2c078
  [0.93, 0.95, 0.97], // off-white #eef2f8
];

const SERVE_DIR = [0.25, 0.55, -0.79];
const LOST_TIME = 0.8;

const normalize3 = (v) => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

export function createGame({ best = 0, reduced = false } = {}) {
  let allTimeBest = best;
  let state = null;

  const layoutBricks = () => {
    const bricks = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        bricks.push({
          x: -3.6 + col * 1.0,
          y: 2.6 + row * 0.6,
          w: BRICK_W,
          h: BRICK_H,
          c: row % COLORS.length,
          alive: true,
        });
      }
    }
    return bricks;
  };

  const attachBall = () => {
    state.ball = { x: state.paddleX, y: 0.55, z: PADDLE_Z - 0.35, vx: 0, vy: 0, vz: 0 };
  };

  const bricksLeft = () => state.bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0);

  const reset = () => {
    state = {
      state: 'ready',
      resumeTo: null,
      bricks: layoutBricks(),
      ball: null,
      paddleX: 0,
      score: 0,
      lives: LIVES,
      level: 1,
      best: allTimeBest,
      speed: BASE_SPEED,
      lostTimer: 0,
    };
    attachBall();
  };

  const serve = () => {
    if (state.state !== 'ready') return;
    const dir = normalize3(SERVE_DIR);
    state.ball.vx = dir[0] * state.speed;
    state.ball.vy = dir[1] * state.speed;
    state.ball.vz = dir[2] * state.speed;
    state.state = 'playing';
  };

  const setPaddle = (x) => {
    const limit = HALF_W - PADDLE_HALF;
    state.paddleX = Math.max(-limit, Math.min(limit, x));
    if (state.state === 'ready') {
      state.ball.x = state.paddleX;
      state.ball.y = 0.55;
      state.ball.z = PADDLE_Z - 0.35;
    }
  };

  const nudgePaddle = (dir, dt) => setPaddle(state.paddleX + dir * PADDLE_SPEED * dt);

  const hitBrick = (x, y) => {
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      if (Math.abs(x - brick.x) <= brick.w / 2 + BALL_R * 0.5
        && Math.abs(y - brick.y) <= brick.h / 2 + BALL_R * 0.5) return brick;
    }
    return null;
  };

  const stepPhysics = (dt) => {
    const ball = state.ball;
    const prevZ = ball.z;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;

    if (ball.x < -(HALF_W - BALL_R)) { ball.x = -(HALF_W - BALL_R); ball.vx = Math.abs(ball.vx); }
    else if (ball.x > HALF_W - BALL_R) { ball.x = HALF_W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y > CEILING - BALL_R) { ball.y = CEILING - BALL_R; ball.vy = -Math.abs(ball.vy); }
    else if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

    // swept brick-plane test: prevents tunnelling at max speed
    if (ball.vz < 0 && prevZ - BALL_R > BRICK_D && ball.z - BALL_R <= BRICK_D) {
      const brick = hitBrick(ball.x, ball.y);
      if (brick) {
        brick.alive = false;
        state.score += SCORE_BRICK;
        ball.z = BRICK_D + BALL_R;
        ball.vz = Math.abs(ball.vz);
        if (bricksLeft() === 0) {
          state.score += SCORE_LEVEL;
          state.level += 1;
          state.speed = Math.min(MAX_SPEED, state.speed + SPEED_STEP);
          state.bricks = layoutBricks();
          state.state = 'ready';
          attachBall();
          return;
        }
      }
    }
    if (ball.vz < 0 && ball.z - BALL_R <= 0) { ball.z = BALL_R; ball.vz = Math.abs(ball.vz); }

    // paddle plane: x-shield (any y inside the paddle's x range returns the ball)
    if (ball.vz > 0 && ball.z + BALL_R >= PADDLE_Z - 0.1) {
      if (Math.abs(ball.x - state.paddleX) <= PADDLE_HALF + BALL_R) {
        const offset = (ball.x - state.paddleX) / PADDLE_HALF;
        ball.z = PADDLE_Z - 0.1 - BALL_R;
        ball.vz = -Math.abs(ball.vz);
        ball.vx = Math.max(-1, Math.min(1, offset)) * 3.2;
        const dir = normalize3([ball.vx, ball.vy, ball.vz]);
        ball.vx = dir[0] * state.speed;
        ball.vy = dir[1] * state.speed;
        ball.vz = dir[2] * state.speed;
      } else {
        state.state = 'life-lost';
        state.lives -= 1;
        state.lostTimer = LOST_TIME;
        state.ball.vy = -2.4;
      }
    }
  };

  const tick = (dt) => {
    const d = Math.min(Math.max(dt, 0), MAX_DT);
    if (state.state === 'paused' || state.state === 'over' || state.state === 'ready') return;
    if (state.state === 'life-lost') {
      const n = Math.max(1, Math.ceil(d / SUB_DT));
      const sub = d / n;
      for (let i = 0; i < n; i++) {
        state.ball.vy -= 9.8 * sub;
        state.ball.x += state.ball.vx * sub;
        state.ball.y += state.ball.vy * sub;
        state.ball.z += state.ball.vz * sub;
      }
      state.lostTimer -= d;
      if (state.lostTimer <= 0) {
        if (state.lives <= 0) {
          state.state = 'over';
          allTimeBest = Math.max(allTimeBest, state.score);
          state.best = allTimeBest;
        } else {
          state.state = 'ready';
          attachBall();
        }
      }
      return;
    }
    const n = Math.max(1, Math.ceil(d / SUB_DT));
    const sub = d / n;
    for (let i = 0; i < n && state.state === 'playing'; i++) stepPhysics(sub);
  };

  reset();

  return {
    serve,
    tick,
    setPaddle,
    nudgePaddle,
    pause() {
      if (state.state === 'paused' || state.state === 'over') return;
      state.resumeTo = state.state;
      state.state = 'paused';
    },
    resume() {
      if (state.state !== 'paused') return;
      state.state = state.resumeTo || 'playing';
      state.resumeTo = null;
    },
    restart() {
      allTimeBest = Math.max(allTimeBest, state.best);
      reset();
    },
    view() { return state; },
    snapshot() {
      return {
        state: state.state,
        paused: state.state === 'paused',
        score: state.score,
        best: state.best,
        lives: state.lives,
        level: state.level,
        bricksLeft: bricksLeft(),
        paddleX: state.paddleX,
        speed: state.speed,
        ball: { x: state.ball.x, y: state.ball.y, z: state.ball.z },
      };
    },
  };
}
