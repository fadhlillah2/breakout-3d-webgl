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
export const PADDLE_SPEED = 9.0;
export const BASE_SPEED = 4.2;
export const SPEED_STEP = 0.4;
export const MAX_SPEED = 7.0;
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
// Float32Array so uniform3fv uploads them without converting on every draw.
export const COLORS = [
  new Float32Array([0.36, 0.88, 0.78]), // teal #5ce1c6
  new Float32Array([0.95, 0.75, 0.47]), // amber #f2c078
  new Float32Array([0.93, 0.95, 0.97]), // off-white #eef2f8
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
    if (!Number.isFinite(x)) return; // one NaN here would poison the paddle and the ball for good
    if (state.state === 'paused' || state.state === 'over') return;
    const limit = HALF_W - PADDLE_HALF;
    state.paddleX = Math.max(-limit, Math.min(limit, x));
    if (state.state === 'ready') {
      state.ball.x = state.paddleX;
      state.ball.y = paddleTop() + BALL_R + 0.05;
      state.ball.z = BALL_Z;
    }
  };

  const nudgePaddle = (dir, dt) => setPaddle(state.paddleX + dir * PADDLE_SPEED * dt);

  // Arcade guard: after any bounce keep a minimum horizontal component, so the
  // ball always sweeps across columns instead of stalling in a vertical line.
  // Speed is preserved; only the angle is clamped.
  const clampAngle = () => {
    const ball = state.ball;
    const speed = Math.hypot(ball.vx, ball.vy) || state.speed;
    if (Math.abs(ball.vx) >= MIN_VX) return;
    const sign = ball.vx !== 0 ? Math.sign(ball.vx) : (ball.x >= 0 ? 1 : -1);
    ball.vx = sign * MIN_VX;
    const vyMag = Math.sqrt(Math.max(0, speed * speed - MIN_VX * MIN_VX));
    ball.vy = (ball.vy >= 0 ? 1 : -1) * vyMag;
  };

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

    // Brick collision: exact circle-vs-rect contact, reflected about the
    // contact normal. Unlike an inflated-box test, a ball only hits a brick it
    // actually touches, so grazing the seam between two bricks never removes
    // one from a distance.
    let hit = null;
    let bestDist = Infinity;
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      const cx = Math.max(brick.x - brick.w / 2, Math.min(ball.x, brick.x + brick.w / 2));
      const cy = Math.max(brick.y - brick.h / 2, Math.min(ball.y, brick.y + brick.h / 2));
      const nx = ball.x - cx;
      const ny = ball.y - cy;
      const dist = Math.hypot(nx, ny);
      if (dist >= BALL_R) continue;
      if (dist < bestDist) { bestDist = dist; hit = { brick, nx, ny, dist }; }
    }
    if (hit) {
      const { brick, nx, ny, dist } = hit;
      let ux, uy, push;
      if (dist > 1e-9) {
        ux = nx / dist;
        uy = ny / dist;
        push = BALL_R - dist;
      } else {
        // centre inside the rect: leave along the shallowest face
        const ox = brick.w / 2 - Math.abs(ball.x - brick.x);
        const oy = brick.h / 2 - Math.abs(ball.y - brick.y);
        if (ox < oy) { ux = ball.x >= brick.x ? 1 : -1; uy = 0; push = ox + BALL_R; }
        else { ux = 0; uy = ball.y >= brick.y ? 1 : -1; push = oy + BALL_R; }
      }
      ball.x += ux * push;
      ball.y += uy * push;
      const dot = ball.vx * ux + ball.vy * uy;
      if (dot < 0) {
        ball.vx -= 2 * dot * ux;
        ball.vy -= 2 * dot * uy;
      }
      clampAngle();
      if (clearBrick(brick)) return;
    }

    // Paddle: only a descending ball arriving from above the paddle top, inside
    // its x-range, is returned. A ball that slips below the top is lost — no
    // sideways pop-up.
    if (ball.vy < 0
      && ball.y <= paddleTop() + BALL_R
      && ball.y >= paddleTop()
      && Math.abs(ball.x - state.paddleX) <= PADDLE_HALF + BALL_R) {
      const offset = (ball.x - state.paddleX) / PADDLE_HALF;
      ball.y = paddleTop() + BALL_R;
      ball.vy = Math.abs(ball.vy);
      ball.vx = Math.max(-1, Math.min(1, offset)) * 3.2;
      const dir = normalize2([ball.vx, ball.vy]);
      ball.vx = dir[0] * state.speed;
      ball.vy = dir[1] * state.speed;
      clampAngle();
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
    if (!Number.isFinite(dt)) return; // a stalled frame must not poison positions or timers
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
    // Adaptive sub-stepping: never advance more than half a ball radius per
    // step, so fast balls cannot skip a brick face or a paddle catch window.
    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    const n = Math.min(16, Math.max(1, Math.ceil((d * speed) / (BALL_R * 0.5))));
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
