// Breakout 3D game logic — no DOM, no WebGL. Pure state + math so Node tests,
// the browser smoke test, and the screenshot tool all drive the same code.
//
// Gameplay is a classic breakout plane (x/y) at a fixed depth, rendered in 3D:
// ball, paddle and brick wall all sit on that one play plane — the depth of each
// body is render-only.
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
export const PADDLE_D = 0.2;
export const PADDLE_SPEED = 9.0;
export const BASE_SPEED = 4.2;
export const SPEED_STEP = 0.4;
export const MAX_SPEED = 7.0;
export const MAX_DT = 0.05;
export const SUB_DT = 0.02;
export const MIN_VX = 1.2;
export const MIN_VY = 0.9;
export const LOST_Y = 0.2;
export const LIVES = 3;
export const SCORE_CHIP = 5;
export const SCORE_BRICK = 10;
export const SCORE_LEVEL = 100;
export const BRICK_COLS = 8;
export const BRICK_W = 0.9;
export const BRICK_H = 0.5;
export const BRICK_D = 0.3;
// The arena shell — the room the ball is actually inside. The side walls stand
// on |x| = HALF_W and the ceiling on y = CEILING, so the surface the player
// sees is the plane the ball turns on, with the slab thickness drawn outward,
// away from the play space. The back wall closes the room behind the bricks.
export const WALL_T = 0.3;
export const ARENA_BACK = BALL_Z - BRICK_D / 2 - 1.0;
// Past the camera: a shell that stopped in front of it showed its own cut ends
// and let the floor outside the room show past them.
export const ARENA_FRONT = PADDLE_Z + 10;
// The floor slab runs well outside the frustum on every side, so what ends it
// on screen is the fog and never an edge. Gated in unit.camera.test.mjs.
export const FLOOR_W = 40;
export const FLOOR_D = 60;
export const FLOOR_Z = 7;
// The wall hangs from the ceiling, so a pattern may be any number of rows deep.
const BRICK_TOP_Y = CEILING - 0.9;
const BRICK_ROW_PITCH = 0.6;
// Difficulty curve beyond speed: the paddle narrows every level down to a floor
// that a perfect tracker still survives (gated in unit.content.test.mjs).
const PADDLE_SHRINK = 0.94;
export const PADDLE_MIN_HALF = 0.5;
// Power-ups: one capsule in eight bricks, half of each kind.
export const DROP_RATE = 0.12;
export const DROP_TYPES = ['wide', 'slow'];
export const DROP_SPEED = 2.2;
export const DROP_W = 0.26;
export const DROP_H = 0.16;
export const WIDE_FACTOR = 1.55;
export const WIDE_TIME = 8;
export const SLOW_FACTOR = 0.75;
export const SLOW_TIME = 6;
// End-of-level tail: a level closes on its last stragglers instead of turning
// into a hunt for them across a board that is mostly holes by then.
export const CLEAR_THRESHOLD = 2;
// Rally scoring: every brick broken before the ball comes back to the paddle is
// worth one more multiple of the brick price, up to this cap.
export const COMBO_MAX = 5;

// Float32Array so uniform3fv uploads them without converting on every draw.
export const BG_COLOR = new Float32Array([0.027, 0.039, 0.063]);
export const FLOOR_COLOR = new Float32Array([0.07, 0.09, 0.13]);
// Deliberately recessive: the shell explains where the ball turns, it does not
// compete with the wall for attention. Gated from above in unit.content.test.mjs.
export const WALL_COLOR = new Float32Array([0.23, 0.27, 0.36]);
export const PADDLE_COLOR = new Float32Array([0.36, 0.88, 0.78]);
// Neutral white is the ball's alone: every brick, capsule and the steel block is
// far enough off it in RGB that the ball can never be read as part of the wall
// (gated in unit.content.test.mjs). The trail is the ball dimmed, so it always
// reads as the ball's own motion instead of as a second body.
export const BALL_COLOR = new Float32Array([0.93, 0.95, 0.97]);
export const TRAIL_COLOR = BALL_COLOR.map((c) => c * 0.62);
export const STEEL_COLOR = new Float32Array([0.44, 0.49, 0.57]);
export const DROP_COLORS = {
  wide: new Float32Array([0.45, 0.95, 0.55]),
  slow: new Float32Array([0.55, 0.7, 1.0]),
};
// One palette per level, indexed by hit points: [1 hit, 2 hits, 3 hits]. Every
// colour is gated against BG_COLOR for contrast in unit.content.test.mjs.
export const PALETTES = [
  [
    new Float32Array([0.36, 0.88, 0.78]), // teal #5ce1c6
    new Float32Array([0.95, 0.75, 0.47]), // amber #f2c078
    new Float32Array([0.70, 0.55, 1.0]),  // violet #b38cff
  ],
  [
    new Float32Array([1.0, 0.56, 0.48]),  // coral #ff8f7a
    new Float32Array([1.0, 0.82, 0.4]),   // gold #ffd166
    new Float32Array([0.30, 0.65, 1.0]),  // azure #4da6ff
  ],
  [
    new Float32Array([0.49, 0.77, 1.0]),  // sky #7cc4ff
    new Float32Array([0.79, 0.65, 1.0]),  // lilac #c9a7ff
    new Float32Array([1.0, 0.69, 0.23]),  // tangerine #ffb03a
  ],
  [
    new Float32Array([0.66, 0.88, 0.39]), // lime #a8e063
    new Float32Array([0.35, 0.82, 0.91]), // aqua #5ad2e8
    new Float32Array([1.0, 0.44, 0.66]),  // magenta #ff70a8
  ],
  [
    new Float32Array([1.0, 0.62, 0.77]),  // rose #ff9ec4
    new Float32Array([0.62, 0.71, 1.0]),  // periwinkle #9fb6ff
    new Float32Array([0.40, 0.90, 0.66]), // jade #66e6a8
  ],
];

// Level drawings: '.' empty, '1'..'3' hit points, 'X' indestructible.
// House rule, gated by unit.content.test.mjs: no breakable brick may sit
// directly on top of an indestructible one, or the shielded brick turns the
// level into an unwinnable hunt.
export const PATTERNS = [
  [
    '.111111.',
    '11111111',
    '.222222.',
    '11111111',
    '..1111..',
  ],
  [
    '...11...',
    'X.1221.X',
    '.122221.',
    '12222221',
    '.111111.',
  ],
  [
    '1X1111X1',
    '1X2222X1',
    '11222211',
    '.122221.',
    '..1111..',
  ],
  [
    '2.2.2.2.',
    '.2.2.2.2',
    '11111111',
    '.3.33.3.',
    '1.1111.1',
  ],
  [
    '2X1111X2',
    '22.11.22',
    '11.11.11',
    '11111111',
    '.1.11.1.',
  ],
];

const LOST_TIME = 0.8;
// The paddle bounce fan. The exit angle comes from the contact offset alone, so
// the middle of the paddle steers exactly as much as the tips do.
const PADDLE_MIN_ANGLE = 16 * Math.PI / 180;
const PADDLE_MAX_ANGLE = 60 * Math.PI / 180;
// Column pitch that centres the wall and puts both outer brick faces exactly on
// the limit of where the ball centre can travel, so no brick is out of reach.
const BRICK_PITCH = (2 * (HALF_W - BALL_R) - BRICK_W) / (BRICK_COLS - 1);
const X_LIMIT = HALF_W - BALL_R;
// The serve fan: wide enough that no two consecutive levels open the same way.
const SERVE_MIN_ANGLE = 14 * Math.PI / 180;
const SERVE_MAX_ANGLE = 38 * Math.PI / 180;

// Deterministic stand-in for randomness (FNV-1a over three small integers): the
// whole game stays replayable because every "roll" is a pure function of state.
// The murmur3 finaliser is load-bearing, not decoration: without a full
// avalanche the low bits of the last input barely reach the high bits the float
// is taken from, so two rolls that differ only in the salt — the drop gate and
// the drop type — come out correlated and one capsule never appears.
export const hash01 = (a, b, c) => {
  let h = 2166136261;
  for (const v of [a, b, c]) { h ^= v | 0; h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

export function parsePattern(rows) {
  const bricks = [];
  rows.forEach((row, r) => {
    for (let col = 0; col < row.length; col++) {
      const char = row[col];
      if (char === '.') continue;
      const solid = char === 'X';
      const hp = solid ? Infinity : Number(char);
      bricks.push({
        x: (col - (BRICK_COLS - 1) / 2) * BRICK_PITCH,
        y: BRICK_TOP_Y - r * BRICK_ROW_PITCH,
        w: BRICK_W,
        h: BRICK_H,
        c: solid ? 0 : hp - 1, // the palette tier is the toughness, so colour reads as hit points
        hp,
        hp0: hp,
        solid,
        alive: true,
      });
    }
  });
  return bricks;
}

export const patternFor = (level) => PATTERNS[(level - 1) % PATTERNS.length];
export const levelPalette = (level) => PALETTES[(level - 1) % PALETTES.length];
export const levelPaddleHalf = (level) =>
  Math.max(PADDLE_MIN_HALF, PADDLE_HALF * PADDLE_SHRINK ** (level - 1));

export function createGame({ best = 0 } = {}) {
  let allTimeBest = best;
  let state = null;

  const emit = (event) => { state.events.push(event); };
  const emitWall = () => emit({ type: 'wall', x: state.ball.x, y: state.ball.y });
  // Every brick contact reports the same shape: where it was, which palette tier
  // of which level it wore, whether it broke, and what the rally paid for it.
  // The level travels with it because a brick that closes the wall is emitted
  // before the level number moves on.
  const emitBrick = (brick, index, destroyed, points) => emit({
    type: 'brick', x: brick.x, y: brick.y, index, tier: brick.c, level: state.level,
    destroyed, solid: brick.solid, points, combo: state.combo,
  });

  const paddleTop = () => PADDLE_Y + PADDLE_H / 2;
  // The one source of paddle width: physics, the clamp and the drawn cube all
  // read it, so the hitbox can never drift from the geometry on screen.
  const paddleHalf = () =>
    levelPaddleHalf(state.level) * (state.effects.wide > 0 ? WIDE_FACTOR : 1);
  const ballSpeed = () => state.speed * (state.effects.slow > 0 ? SLOW_FACTOR : 1);

  const attachBall = () => {
    state.ball = { x: state.paddleX, y: paddleTop() + BALL_R, z: BALL_Z, vx: 0, vy: 0 };
  };

  // Indestructible bricks are scenery, not targets: counting them would leave
  // every level unfinishable.
  const bricksLeft = () => state.bricks.reduce((n, b) => n + (b.alive && !b.solid ? 1 : 0), 0);

  // Starts the level whose number is already in state: fresh wall, no capsules
  // in flight, no leftover effects, and the paddle re-clamped to its new width.
  const startLevel = () => {
    state.bricks = parsePattern(patternFor(state.level));
    state.combo = 0;
    state.drops = [];
    state.effects = { wide: 0, slow: 0 };
    state.state = 'ready';
    state.paddleX = clampPaddleX(state.paddleX);
    attachBall();
  };

  const reset = () => {
    state = {
      state: 'ready',
      resumeTo: null,
      // Impact feed for main.js, cleared on the first line of every tick. Never
      // part of snapshot(): two determinism tests compare whole snapshots.
      events: [],
      combo: 0,
      bricks: [],
      drops: [],
      effects: { wide: 0, slow: 0 },
      ball: null,
      paddleX: 0,
      score: 0,
      lives: LIVES,
      level: 1,
      best: allTimeBest,
      speed: BASE_SPEED,
      lostTimer: 0,
    };
    startLevel();
  };

  const serve = () => {
    if (state.state !== 'ready') return;
    // Seeded from the level alone, so the opening differs per level and still
    // replays identically.
    const magnitude = SERVE_MIN_ANGLE + hash01(state.level, 3, 7) * (SERVE_MAX_ANGLE - SERVE_MIN_ANGLE);
    const angle = hash01(state.level, 4, 9) < 0.5 ? -magnitude : magnitude;
    const speed = ballSpeed();
    state.ball.vx = Math.sin(angle) * speed;
    state.ball.vy = Math.cos(angle) * speed;
    state.state = 'playing';
  };

  const clampPaddleX = (x) => {
    const limit = HALF_W - paddleHalf();
    return Math.max(-limit, Math.min(limit, x));
  };

  const setPaddle = (x) => {
    if (!Number.isFinite(x)) return; // one NaN here would poison the paddle and the ball for good
    if (state.state === 'paused' || state.state === 'over') return;
    state.paddleX = clampPaddleX(x);
    if (state.state === 'ready') {
      state.ball.x = state.paddleX;
      state.ball.y = paddleTop() + BALL_R;
      state.ball.z = BALL_Z;
    }
  };

  const nudgePaddle = (dir, dt) => setPaddle(state.paddleX + dir * PADDLE_SPEED * dt);

  // Arcade guard for brick bounces: keep both components off zero, so
  // the ball neither stalls in a vertical line nor crawls along a horizontal
  // one. Speed is preserved; only the angle is clamped. The paddle does not use
  // this — its exit angle is set outright from the contact offset.
  const clampAngle = () => {
    const ball = state.ball;
    const speed = Math.hypot(ball.vx, ball.vy) || state.speed;
    // Vertical floor before the horizontal early-return: after it, this branch
    // would be dead for exactly the bounces that produce a crawling ball.
    if (Math.abs(ball.vy) < MIN_VY) {
      ball.vy = (ball.vy >= 0 ? 1 : -1) * MIN_VY;
      ball.vx = (ball.vx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, speed * speed - MIN_VY * MIN_VY));
    }
    if (Math.abs(ball.vx) >= MIN_VX) return;
    const sign = ball.vx !== 0 ? Math.sign(ball.vx) : (ball.x >= 0 ? 1 : -1);
    ball.vx = sign * MIN_VX;
    const vyMag = Math.sqrt(Math.max(0, speed * speed - MIN_VX * MIN_VX));
    ball.vy = (ball.vy >= 0 ? 1 : -1) * vyMag;
  };

  // Whether a brick drops a capsule, and which one, is a hash of the level and
  // the brick's slot — never a counter or a roll, so replays cannot diverge.
  const maybeDrop = (brick, index) => {
    if (hash01(state.level, index, 1) >= DROP_RATE) return;
    const type = DROP_TYPES[Math.floor(hash01(state.level, index, 2) * DROP_TYPES.length)];
    state.drops.push({ x: brick.x, y: brick.y, type });
  };

  const stepDrops = (dt) => {
    for (let i = state.drops.length - 1; i >= 0; i--) {
      const drop = state.drops[i];
      drop.y -= DROP_SPEED * dt;
      // Caught anywhere in the paddle's own band, not only on its top face (a
      // capsule is a pickup, so it is forgiving where the ball is strict). The
      // band is the paddle's full box, so nothing is picked up out of thin air —
      // except for the 0.16 s the catch squash in main.js draws it shorter.
      if (drop.y - DROP_H / 2 <= paddleTop()
        && drop.y + DROP_H / 2 >= PADDLE_Y - PADDLE_H / 2
        && Math.abs(drop.x - state.paddleX) <= paddleHalf() + DROP_W / 2) {
        emit({ type: 'capsule', kind: drop.type, x: drop.x, y: drop.y });
        state.effects[drop.type] = drop.type === 'wide' ? WIDE_TIME : SLOW_TIME;
        if (drop.type === 'wide') state.paddleX = clampPaddleX(state.paddleX);
        else setBallSpeed(ballSpeed());
        state.drops.splice(i, 1);
      } else if (drop.y < LOST_Y) {
        state.drops.splice(i, 1);
      }
    }
  };

  const setBallSpeed = (target) => {
    const ball = state.ball;
    const length = Math.hypot(ball.vx, ball.vy);
    if (length < 1e-9) return;
    ball.vx = ball.vx / length * target;
    ball.vy = ball.vy / length * target;
  };

  const clearBrick = (brick, index) => {
    brick.alive = false;
    state.combo = Math.min(COMBO_MAX, state.combo + 1);
    const points = SCORE_BRICK * state.combo;
    state.score += points;
    emitBrick(brick, index, true, points);
    const stragglers = bricksLeft();
    if (stragglers <= CLEAR_THRESHOLD) {
      // The last stragglers on a holed board are a hunt, not a challenge, so the
      // level closes on them — paid for at full price, never scored away.
      state.score += SCORE_LEVEL + stragglers * SCORE_BRICK;
      state.level += 1;
      state.speed = Math.min(MAX_SPEED, state.speed + SPEED_STEP);
      startLevel();
      emit({ type: 'level', level: state.level });
      return true;
    }
    return false;
  };

  const stepPhysics = (dt) => {
    const ball = state.ball;
    stepDrops(dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < -X_LIMIT) { ball.x = -X_LIMIT; ball.vx = Math.abs(ball.vx); emitWall(); }
    else if (ball.x > X_LIMIT) { ball.x = X_LIMIT; ball.vx = -Math.abs(ball.vx); emitWall(); }
    if (ball.y > CEILING - BALL_R) { ball.y = CEILING - BALL_R; ball.vy = -Math.abs(ball.vy); emitWall(); }

    // Brick collision: exact circle-vs-rect contact, reflected about the
    // contact normal. Unlike an inflated-box test, a ball only hits a brick it
    // actually touches, so grazing the seam between two bricks never removes
    // one from a distance.
    let hit = null;
    let bestDist = Infinity;
    for (let index = 0; index < state.bricks.length; index++) {
      const brick = state.bricks[index];
      if (!brick.alive) continue;
      const cx = Math.max(brick.x - brick.w / 2, Math.min(ball.x, brick.x + brick.w / 2));
      const cy = Math.max(brick.y - brick.h / 2, Math.min(ball.y, brick.y + brick.h / 2));
      const nx = ball.x - cx;
      const ny = ball.y - cy;
      const dist = Math.hypot(nx, ny);
      if (dist >= BALL_R) continue;
      if (dist < bestDist) { bestDist = dist; hit = { brick, index, nx, ny, dist }; }
    }
    if (hit) {
      const { brick, index, nx, ny, dist } = hit;
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
      ball.x = Math.max(-X_LIMIT, Math.min(X_LIMIT, ball.x)); // separation must not push through a wall
      const dot = ball.vx * ux + ball.vy * uy;
      // No bounce, no kill: a ball already leaving the brick only gets pushed out.
      if (dot < 0) {
        ball.vx -= 2 * dot * ux;
        ball.vy -= 2 * dot * uy;
        clampAngle();
        // Solid bricks are pure geometry: they bounce, score nothing, stay put.
        if (brick.solid) {
          emitBrick(brick, index, false, 0);
        } else {
          brick.hp -= 1;
          if (brick.hp > 0) {
            state.score += SCORE_CHIP;
            emitBrick(brick, index, false, SCORE_CHIP);
          } else {
            maybeDrop(brick, index);
            if (clearBrick(brick, index)) return;
          }
        }
      }
    }

    // Paddle: only a descending ball arriving from above the paddle top, inside
    // its x-range, is returned. A ball that slips below the top is lost — no
    // sideways pop-up.
    const half = paddleHalf();
    if (ball.vy < 0
      && ball.y <= paddleTop() + BALL_R
      && ball.y >= paddleTop()
      && Math.abs(ball.x - state.paddleX) <= half + BALL_R) {
      const offset = Math.max(-1, Math.min(1, (ball.x - state.paddleX) / half));
      ball.y = paddleTop() + BALL_R;
      const side = offset < 0 ? -1 : 1; // dead centre is a fixed tie-break, not a coin flip
      const angle = side * Math.max(PADDLE_MIN_ANGLE, Math.abs(offset) * PADDLE_MAX_ANGLE);
      const speed = ballSpeed();
      ball.vx = Math.sin(angle) * speed;
      ball.vy = Math.cos(angle) * speed;
      state.combo = 0; // the rally ends where the ball comes home
      emit({ type: 'paddle', x: ball.x, offset });
      return;
    }

    if (ball.y < LOST_Y) {
      emit({ type: 'lost', x: ball.x, y: ball.y });
      state.state = 'life-lost';
      state.combo = 0;
      state.lives -= 1;
      state.lostTimer = LOST_TIME;
      state.ball.vy = -2.4;
      // Capsules and their effects die with the ball that earned them.
      state.drops = [];
      state.effects = { wide: 0, slow: 0 };
      state.paddleX = clampPaddleX(state.paddleX);
    }
  };

  const tick = (dt) => {
    state.events.length = 0; // one tick of life, so main.js cannot read a hit twice
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
    // The 16 is only a safety belt — the worst legal frame (MAX_DT at
    // MAX_SPEED) needs 6 sub-steps, so the cap never binds in play.
    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    const n = Math.min(16, Math.max(1, Math.ceil((d * speed) / (BALL_R * 0.5))));
    const sub = d / n;
    for (let i = 0; i < n && state.state === 'playing'; i++) stepPhysics(sub);
    if (state.state !== 'playing') return; // a level change already reset the timers
    expireEffects(d);
  };

  const expireEffects = (d) => {
    const wasWide = state.effects.wide > 0;
    const wasSlow = state.effects.slow > 0;
    state.effects.wide = Math.max(0, state.effects.wide - d);
    state.effects.slow = Math.max(0, state.effects.slow - d);
    if (wasWide && state.effects.wide === 0) state.paddleX = clampPaddleX(state.paddleX);
    if (wasSlow && state.effects.slow === 0) setBallSpeed(ballSpeed());
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
        paddleHalf: paddleHalf(),
        speed: state.speed,
        combo: state.combo,
        drops: state.drops.length,
        wide: state.effects.wide,
        slow: state.effects.slow,
        ball: { x: state.ball.x, y: state.ball.y, z: state.ball.z },
      };
    },
  };
}
