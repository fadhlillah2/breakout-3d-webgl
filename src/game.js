// Breakout 3D game logic — no DOM, no WebGL. Pure state + math so Node tests,
// the browser smoke test, and the screenshot tool all drive the same code.
//
// Gameplay is a classic breakout plane (x/y) at a fixed depth, rendered in 3D:
// the ball and paddle live on the play plane, the brick wall stands behind them.
// That keeps every bounce physical — the paddle only returns balls that reach
// its own height — and avoids the depth-travel artefacts of a fully 3D ball.

export const HALF_W = 4.0;
export const CEILING = 6.0;
export const BALL_R = 0.12;
export const BALL_Z = 5.8;
export const PADDLE_Y = 0.4;
export const PADDLE_H = 0.3;
export const PADDLE_Z = 6.0;
export const PADDLE_HALF = 0.8;
export const PADDLE_SPEED = 7.0;
export const BASE_SPEED = 4.2;
export const SPEED_STEP = 0.4;
export const MAX_SPEED = 8.0;
export const MAX_DT = 0.05;
export const SUB_DT = 0.02;
export const MIN_VX = 1.2;
export const LOST_Y = 0.2;
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

const SERVE_DIR = [0.26, 0.966];
const LOST_TIME = 0.8;

const normalize2 = (v) => {
  const len = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / len, v[1] / len];
};

export function createGame({ best = 0 } = {}) {
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

  const paddleTop = () => PADDLE_Y + PADDLE_H / 2;

  const attachBall = () => {
    state.ball = { x: state.paddleX, y: paddleTop() + BALL_R + 0.05, z: BALL_Z, vx: 0, vy: 0 };
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
    const dir = normalize2(SERVE_DIR);
    state.ball.vx = dir[0] * state.speed;
    state.ball.vy = dir[1] * state.speed;
    state.state = 'playing';
  };

  const setPaddle = (x) => {
    const limit = HALF_W - PADDLE_HALF;
    state.paddleX = Math.max(-limit, Math.min(limit, x));
    if (state.state === 'ready') {
      state.ball.x = state.paddleX;
      state.ball.y = paddleTop() + BALL_R + 0.05;
      state.ball.z = BALL_Z;
    }
  };

  const nudgePaddle = (dir, dt) => setPaddle(state.paddleX + dir * PADDLE_SPEED * dt);

  const clearBrick = (brick) => {
    brick.alive = false;
    state.score += SCORE_BRICK;
    if (bricksLeft() === 0) {
      state.score += SCORE_LEVEL;
      state.level += 1;
      state.speed = Math.min(MAX_SPEED, state.speed + SPEED_STEP);
      state.bricks = layoutBricks();
      state.state = 'ready';
      attachBall();
      return true;
    }
    return false;
  };

  const stepPhysics = (dt) => {
    const ball = state.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < -(HALF_W - BALL_R)) { ball.x = -(HALF_W - BALL_R); ball.vx = Math.abs(ball.vx); }
    else if (ball.x > HALF_W - BALL_R) { ball.x = HALF_W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y > CEILING - BALL_R) { ball.y = CEILING - BALL_R; ball.vy = -Math.abs(ball.vy); }

    // Brick collision on the play plane: pick the deepest overlap, resolve on
    // its shallowest axis so the ball leaves through the face it entered.
    let hit = null;
    let deepest = 0;
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      const dx = brick.w / 2 + BALL_R - Math.abs(ball.x - brick.x);
      const dy = brick.h / 2 + BALL_R - Math.abs(ball.y - brick.y);
      if (dx <= 0 || dy <= 0) continue;
      const depth = Math.min(dx, dy);
      if (depth > deepest) { deepest = depth; hit = { brick, dx, dy }; }
    }
    if (hit) {
      const { brick, dx, dy } = hit;
      if (dx < dy) {
        const sign = ball.x >= brick.x ? 1 : -1;
        ball.x = brick.x + sign * (brick.w / 2 + BALL_R);
        ball.vx = sign * Math.abs(ball.vx);
      } else {
        const sign = ball.y >= brick.y ? 1 : -1;
        ball.y = brick.y + sign * (brick.h / 2 + BALL_R);
        ball.vy = sign * Math.abs(ball.vy);
      }
      if (clearBrick(brick)) return;
    }

    // Paddle: only a descending ball that reaches the paddle's own height and
    // x-range is returned; anything else falls past it and is lost.
    if (ball.vy < 0
      && ball.y - BALL_R <= paddleTop()
      && ball.y + BALL_R >= PADDLE_Y
      && Math.abs(ball.x - state.paddleX) <= PADDLE_HALF + BALL_R) {
      const offset = (ball.x - state.paddleX) / PADDLE_HALF;
      ball.y = paddleTop() + BALL_R;
      ball.vy = Math.abs(ball.vy);
      let vx = Math.max(-1, Math.min(1, offset)) * 3.2;
      if (Math.abs(vx) < MIN_VX) {
        vx = (vx !== 0 ? Math.sign(vx) : (offset >= 0 ? 1 : -1)) * MIN_VX;
      }
      const dir = normalize2([vx, ball.vy]);
      ball.vx = dir[0] * state.speed;
      ball.vy = dir[1] * state.speed;
      return;
    }

    if (ball.y < LOST_Y) {
      state.state = 'life-lost';
      state.lives -= 1;
      state.lostTimer = LOST_TIME;
      state.ball.vy = -2.4;
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
