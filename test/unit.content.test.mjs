// Level content: pattern table, multi-hit and indestructible bricks, seeded
// drops, the per-level difficulty curve, palettes, and the end-of-level cut.
// Everything here must stay a pure function of game state — no RNG, no clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, hash01, parsePattern, patternFor, levelPalette, levelPaddleHalf,
  PATTERNS, PALETTES, BG_COLOR, STEEL_COLOR, DROP_COLORS, BRICK_COLS, BRICK_W, BRICK_H, BALL_R, HALF_W, CEILING,
  PADDLE_Y, PADDLE_H, PADDLE_HALF, PADDLE_MIN_HALF, SCORE_BRICK, SCORE_CHIP, SCORE_LEVEL,
  DROP_RATE, DROP_TYPES, DROP_SPEED, DROP_H, WIDE_FACTOR, WIDE_TIME, SLOW_FACTOR, SLOW_TIME,
  CLEAR_THRESHOLD, BASE_SPEED, LOST_Y, LIVES,
} from '../src/game.js';

const DT = 1 / 60;
const PADDLE_TOP = PADDLE_Y + PADDLE_H / 2;

// Keep the target plus enough far-away bricks that destroying it never trips
// CLEAR_THRESHOLD, and no neighbour can steal the contact under test.
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

const smash = (g, brick, { vy = 8 } = {}) => {
  const ball = g.view().ball;
  ball.x = brick.x; ball.y = brick.y - brick.h / 2 - BALL_R + 0.02; ball.vx = 0; ball.vy = vy;
  g.tick(0.01);
};

// Only slots that exist on this level count: a hit past the wall would come
// back as `undefined` from view().bricks and fail as a TypeError instead.
const dropIndex = (level, type) => {
  const slots = parsePattern(patternFor(level)).length;
  for (let i = 0; i < slots; i++) {
    if (hash01(level, i, 1) >= DROP_RATE) continue;
    if (DROP_TYPES[Math.floor(hash01(level, i, 2) * DROP_TYPES.length)] === type) return i;
  }
  throw new Error(`level ${level} seeds no ${type} capsule in its ${slots} brick slots`);
};

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (c) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('hash01 is a pure function of its three inputs', () => {
  assert.equal(hash01(3, 17, 1), hash01(3, 17, 1));
  assert.notEqual(hash01(3, 17, 1), hash01(3, 18, 1));
  assert.notEqual(hash01(3, 17, 1), hash01(4, 17, 1));
  for (let i = 0; i < 50; i++) {
    const v = hash01(i, i * 7, 2);
    assert.ok(v >= 0 && v < 1, `hash01 stays in [0,1) (got ${v})`);
  }
});

test('every pattern is a legal 8-column drawing with breakable bricks', () => {
  assert.ok(PATTERNS.length >= 4, `at least four level patterns (got ${PATTERNS.length})`);
  for (const [i, rows] of PATTERNS.entries()) {
    assert.ok(rows.length >= 1 && rows.length <= 6, `pattern ${i} has 1..6 rows`);
    for (const row of rows) {
      assert.equal(row.length, BRICK_COLS, `pattern ${i} row "${row}" is ${BRICK_COLS} wide`);
      assert.match(row, /^[.123X]+$/, `pattern ${i} row "${row}" uses the legend`);
    }
    for (let r = 1; r < rows.length; r++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        const shielded = rows[r][col] === 'X' && /[123]/.test(rows[r - 1][col]);
        assert.ok(!shielded, `pattern ${i} roofs a breakable brick at row ${r - 1}, col ${col}`);
      }
    }
    const bricks = parsePattern(rows);
    const breakable = bricks.filter((b) => !b.solid);
    assert.ok(breakable.length >= 20, `pattern ${i} has a real wall (${breakable.length} breakable)`);
    assert.ok(breakable.length <= 44, `pattern ${i} does not balloon (${breakable.length} breakable)`);
  }
});

test('pattern bricks are centred, reachable, and never overlap', () => {
  for (const [i, rows] of PATTERNS.entries()) {
    const bricks = parsePattern(rows);
    const lo = Math.min(...bricks.map((b) => b.x - b.w / 2));
    const hi = Math.max(...bricks.map((b) => b.x + b.w / 2));
    assert.ok(Math.abs(lo + hi) < 1e-9, `pattern ${i} wall centred (${lo}..${hi})`);
    assert.ok(lo >= -(HALF_W - BALL_R) - 1e-9, `pattern ${i} left face reachable (${lo})`);
    assert.ok(hi <= HALF_W - BALL_R + 1e-9, `pattern ${i} right face reachable (${hi})`);
    for (const b of bricks) {
      assert.ok(b.y + b.h / 2 <= CEILING, `pattern ${i} stays under the ceiling`);
      assert.ok(b.y - b.h / 2 > PADDLE_TOP + 4 * BALL_R,
        `pattern ${i} leaves a reaction corridor above the paddle (${b.y})`);
    }
    for (let a = 0; a < bricks.length; a++) {
      for (let b = a + 1; b < bricks.length; b++) {
        const overlap = Math.abs(bricks[a].x - bricks[b].x) < BRICK_W - 1e-9
          && Math.abs(bricks[a].y - bricks[b].y) < BRICK_H - 1e-9;
        assert.ok(!overlap, `pattern ${i} bricks ${a}/${b} overlap`);
      }
    }
  }
});

test('the level layout rotates through the pattern table', () => {
  const shape = (bricks) => bricks.map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)},${b.hp}`).join('|');
  for (let level = 1; level <= PATTERNS.length + 2; level++) {
    assert.deepEqual(patternFor(level), PATTERNS[(level - 1) % PATTERNS.length], `level ${level} pattern`);
  }
  const g = createGame();
  assert.equal(g.snapshot().bricksLeft, 32, 'level 1 is the published 32-brick wall'); // product contract, not a restatement of parsePattern
  assert.equal(shape(g.view().bricks), shape(parsePattern(PATTERNS[0])), 'level 1 lays out pattern 0');
  assert.notEqual(shape(parsePattern(PATTERNS[0])), shape(parsePattern(PATTERNS[1])), 'patterns differ');
});

test('a multi-hit brick chips on the first hit and breaks on the second', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g, 0);
  brick.hp = 2; brick.hp0 = 2;
  const before = g.snapshot().bricksLeft;
  smash(g, brick);
  let s = g.snapshot();
  assert.equal(s.bricksLeft, before, 'the first hit does not remove the brick');
  assert.equal(s.score, SCORE_CHIP, 'a chip scores less than a kill');
  assert.equal(brick.hp, 1, 'one hit point gone');
  assert.ok(g.view().ball.vy < 0, 'it still bounces');
  const speed = Math.hypot(g.view().ball.vx, g.view().ball.vy);
  smash(g, brick);
  s = g.snapshot();
  assert.equal(s.bricksLeft, before - 1, 'the second hit breaks it');
  assert.equal(s.score, SCORE_CHIP + SCORE_BRICK, 'the kill pays the full brick score');
  assert.ok(Math.abs(Math.hypot(g.view().ball.vx, g.view().ball.vy) - speed) < 1e-9, 'speed preserved');
});

test('an indestructible brick bounces the ball but never scores or clears', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g, 0);
  brick.solid = true; brick.hp = Infinity; brick.hp0 = Infinity;
  const before = g.snapshot().bricksLeft;
  smash(g, brick);
  const s = g.snapshot();
  assert.ok(g.view().ball.vy < 0, 'a solid brick still reflects');
  assert.equal(s.score, 0, 'no score');
  assert.equal(brick.alive, true, 'it survives');
  assert.equal(s.bricksLeft, before, 'solid bricks are not counted as targets');
});

test('the level completes once only indestructible bricks remain', () => {
  const g = createGame();
  g.serve();
  const bricks = g.view().bricks;
  const target = bricks[0];
  for (const b of bricks) {
    b.alive = true;
    if (b === target) { b.solid = false; b.hp = 1; b.hp0 = 1; }
    else { b.solid = true; b.hp = Infinity; b.hp0 = Infinity; }
  }
  assert.equal(g.snapshot().bricksLeft, 1, 'one target left');
  smash(g, target);
  const s = g.snapshot();
  assert.equal(s.level, 2, 'the level ends with solid bricks still standing');
  assert.equal(s.state, 'ready');
  assert.equal(s.score, SCORE_BRICK + SCORE_LEVEL);
});

test('every pattern can be cleared by a perfect tracker', () => {
  const g = createGame();
  const target = PATTERNS.length + 1;
  let ticks = 0;
  while (g.snapshot().level < target && ticks < 200000) {
    const s = g.snapshot();
    if (s.state === 'ready') g.serve();
    else if (s.state === 'playing') g.setPaddle(s.ball.x);
    g.tick(DT);
    ticks++;
    assert.notEqual(g.snapshot().state, 'over', `died on level ${g.snapshot().level}`);
  }
  assert.equal(g.snapshot().level, target, `cleared every pattern (stopped at ${g.snapshot().level})`);
});

test('drops are decided by a seeded hash, identical across game instances', () => {
  const run = () => {
    const g = createGame();
    g.serve();
    const seen = [];
    for (let i = 0; i < 3000; i++) {
      const s = g.snapshot();
      if (s.state === 'ready') g.serve();
      else if (s.state === 'playing') g.setPaddle(s.ball.x);
      g.tick(DT);
      seen.push(g.view().drops.map((d) => `${d.type}@${d.x.toFixed(4)},${d.y.toFixed(4)}`).join('/'));
    }
    return seen.join(';');
  };
  const a = run();
  assert.equal(a, run(), 'two instances drop the same capsules at the same ticks');
  assert.ok(a.includes('wide') || a.includes('slow'), 'capsules actually drop during play');
});

test('a caught wide capsule widens the drawn paddle and expires on its timer', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g, dropIndex(1, 'wide'));
  const base = g.snapshot().paddleHalf;
  smash(g, brick);
  const drop = g.view().drops[0];
  assert.ok(drop, 'the seeded brick dropped a capsule');
  assert.equal(drop.type, 'wide');
  drop.y = PADDLE_TOP + 0.2;
  g.setPaddle(drop.x);
  for (let i = 0; i < 20 && g.view().drops.length; i++) g.tick(DT);
  assert.equal(g.view().drops.length, 0, 'the capsule was caught');
  assert.ok(Math.abs(g.snapshot().paddleHalf - base * WIDE_FACTOR) < 1e-9,
    `paddle widened (${g.snapshot().paddleHalf} vs ${base * WIDE_FACTOR})`);
  for (let i = 0; i < Math.ceil(WIDE_TIME * 60) + 2; i++) g.tick(DT);
  assert.equal(g.snapshot().wide, 0, 'the effect runs out');
  assert.ok(Math.abs(g.snapshot().paddleHalf - base) < 1e-9, 'and the paddle returns to its level width');
});

test('a caught slow capsule slows the ball and restores the level speed', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g, dropIndex(1, 'slow'));
  smash(g, brick);
  const drop = g.view().drops[0];
  assert.equal(drop?.type, 'slow');
  drop.y = PADDLE_TOP + 0.2;
  g.setPaddle(drop.x);
  for (let i = 0; i < 20 && g.view().drops.length; i++) g.tick(DT);
  assert.equal(g.view().drops.length, 0, 'the capsule was caught');
  const ball = g.view().ball;
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - BASE_SPEED * SLOW_FACTOR) < 1e-9,
    `ball slowed to ${BASE_SPEED * SLOW_FACTOR} (got ${Math.hypot(ball.vx, ball.vy)})`);
  for (const b of g.view().bricks) b.alive = false; // no level change while the timer runs out
  for (let i = 0; i < Math.ceil(SLOW_TIME * 60) + 2; i++) {
    g.setPaddle(g.view().ball.x);
    g.tick(DT);
  }
  assert.equal(g.snapshot().slow, 0, 'the effect runs out');
  assert.ok(Math.abs(Math.hypot(g.view().ball.vx, g.view().ball.vy) - BASE_SPEED) < 1e-9,
    'and the ball is back at the level speed');
});

test('a capsule that falls past the paddle is discarded without effect', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g, dropIndex(1, 'wide'));
  const base = g.snapshot().paddleHalf;
  smash(g, brick);
  const drop = g.view().drops[0];
  drop.x = 3.5;
  drop.y = LOST_Y + 0.05;
  g.setPaddle(-3);
  for (let i = 0; i < 30 && g.view().drops.length; i++) g.tick(DT);
  assert.equal(g.view().drops.length, 0, 'the capsule left the arena');
  assert.equal(g.snapshot().wide, 0, 'a missed capsule grants nothing');
  assert.equal(g.snapshot().paddleHalf, base);
  assert.ok(DROP_SPEED > 0);
});

test('the paddle shrinks per level to a floor, and the snapshot carries the drawn width', () => {
  assert.equal(levelPaddleHalf(1), PADDLE_HALF, 'level 1 is the published width');
  for (let level = 2; level <= 40; level++) {
    assert.ok(levelPaddleHalf(level) <= levelPaddleHalf(level - 1), `level ${level} never widens`);
    assert.ok(levelPaddleHalf(level) >= PADDLE_MIN_HALF, `level ${level} respects the floor`);
  }
  assert.equal(levelPaddleHalf(60), PADDLE_MIN_HALF, 'the curve bottoms out');
  const g = createGame();
  assert.equal(g.snapshot().paddleHalf, PADDLE_HALF, 'the snapshot exposes the geometry that is drawn');
  const limit = HALF_W - PADDLE_HALF;
  g.setPaddle(99);
  assert.equal(g.snapshot().paddleX, limit, 'the clamp follows the same width');
});

test('a perfect tracker survives the shrink curve', () => {
  const g = createGame();
  for (let i = 0; i < 30000; i++) {
    const s = g.snapshot();
    if (s.state === 'ready') g.serve();
    else if (s.state === 'playing') g.setPaddle(s.ball.x);
    g.tick(DT);
  }
  const s = g.snapshot();
  assert.equal(s.lives, LIVES, `no life lost in 500s of perfect tracking (level ${s.level})`);
  assert.ok(s.level > PATTERNS.length, `the run got past every pattern (level ${s.level})`);
});

test('the serve angle varies by level but always leaves at the level speed', () => {
  const angles = new Set();
  for (let level = 1; level <= 8; level++) {
    const g = createGame();
    for (let i = 1; i < level; i++) {
      for (const b of g.view().bricks) { b.solid = false; b.hp = 1; b.hp0 = 1; }
      const last = g.view().bricks.find((b) => b.alive);
      for (const b of g.view().bricks) b.alive = b === last;
      g.serve();
      smash(g, last);
    }
    assert.equal(g.snapshot().level, level);
    const speed = g.snapshot().speed;
    g.serve();
    const ball = g.view().ball;
    assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - speed) < 1e-9, `level ${level} serves at ${speed}`);
    assert.ok(ball.vy > 0, 'always served upward');
    angles.add(Math.atan2(ball.vx, ball.vy).toFixed(6));
  }
  assert.ok(angles.size >= 4, `the opening is not a replay every level (${angles.size} distinct angles)`);
});

test('level palettes are deterministic and stay readable on the background', () => {
  assert.ok(PALETTES.length >= 4, 'more than a couple of looks');
  for (let level = 1; level <= PALETTES.length * 2 + 1; level++) {
    const palette = levelPalette(level);
    assert.equal(palette, PALETTES[(level - 1) % PALETTES.length], `level ${level} palette`);
  }
  for (const [i, palette] of PALETTES.entries()) {
    assert.equal(palette.length, 3, `palette ${i} covers the three hit-point tiers`);
  }
  // Every colour drawn into the wall, not only the palettes: steel and the
  // capsules are read at the same glance and were the two left out of the gate.
  const named = [
    ...PALETTES.flatMap((p, i) => p.map((c, tier) => [`palette ${i} tier ${tier}`, c])),
    ['steel', STEEL_COLOR],
    ...DROP_TYPES.map((type) => [`${type} capsule`, DROP_COLORS[type]]),
  ];
  for (const [label, color] of named) {
    for (const channel of color) assert.ok(channel >= 0 && channel <= 1, `${label} channel in range`);
    const ratio = contrast(color, BG_COLOR);
    assert.ok(ratio >= 4.5, `${label} ${[...color]} has ${ratio.toFixed(2)}:1 on the background`);
  }
});

test('a level closes on its last stragglers, and pays for them', () => {
  const g = createGame();
  g.serve();
  const bricks = g.view().bricks;
  const alive = bricks.slice(0, CLEAR_THRESHOLD + 1);
  for (const b of bricks) b.alive = alive.includes(b);
  for (const b of alive) { b.solid = false; b.hp = 1; b.hp0 = 1; }
  assert.equal(g.snapshot().bricksLeft, CLEAR_THRESHOLD + 1);
  smash(g, alive[0]);
  const s = g.snapshot();
  assert.equal(s.level, 2, 'the hunt for the last few is cut short');
  assert.equal(s.bricksLeft, parsePattern(PATTERNS[1]).filter((b) => !b.solid).length, 'next wall is up');
  assert.equal(s.score, SCORE_BRICK * (CLEAR_THRESHOLD + 1) + SCORE_LEVEL,
    'every straggler is still paid at full brick price');
});

test('identical tick sequences produce identical runs across several levels', () => {
  const run = () => {
    const g = createGame();
    const trace = [];
    for (let i = 0; i < 6000; i++) {
      const s = g.snapshot();
      if (s.state === 'ready') g.serve();
      else if (s.state === 'playing') g.setPaddle(s.ball.x);
      g.tick(DT);
      if (i % 500 === 0) trace.push(JSON.stringify(g.snapshot()));
    }
    trace.push(JSON.stringify(g.snapshot()));
    return trace.join('\n');
  };
  const first = run();
  assert.equal(first, run());
  assert.match(first, /"level":[2-9]/, 'the run really crossed a level boundary');
});

test('the drop table is not biased towards one capsule type', () => {
  // The gate roll and the type roll differ only in the salt, so a hash that
  // does not avalanche makes one capsule all but unreachable.
  const seen = { wide: 0, slow: 0 };
  for (let level = 1; level <= 200; level++) {
    for (let slot = 0; slot < 40; slot++) {
      if (hash01(level, slot, 1) >= DROP_RATE) continue;
      seen[DROP_TYPES[Math.floor(hash01(level, slot, 2) * DROP_TYPES.length)]] += 1;
    }
  }
  const total = seen.wide + seen.slow;
  assert.ok(total > 500, `enough drops to judge the split (${total})`);
  for (const type of DROP_TYPES) {
    const share = seen[type] / total;
    assert.ok(share >= 0.35 && share <= 0.65,
      `${type} is ${(share * 100).toFixed(1)}% of all capsules (${JSON.stringify(seen)})`);
  }
  // A 12 % rate over ~30 slots leaves a single level short of one type by plain
  // arithmetic; what the bias broke was both types being reachable at all.
  for (const type of DROP_TYPES) {
    const levels = PATTERNS.map((_, i) => i + 1).filter((level) => {
      try { dropIndex(level, type); return true; } catch { return false; }
    });
    assert.ok(levels.length >= PATTERNS.length - 1, `${type} is seeded on ${levels.length} of the patterns`);
  }
});

test('a capsule is caught exactly where it overlaps the drawn paddle', () => {
  const g = createGame();
  g.serve();
  const brick = isolate(g, dropIndex(1, 'wide'));
  smash(g, brick);
  const drop = g.view().drops[0];
  assert.equal(drop?.type, 'wide');
  g.setPaddle(drop.x);
  drop.y = PADDLE_TOP + DROP_H; // still a half-height clear of the paddle's top face
  g.tick(0);
  assert.equal(g.view().drops.length, 1, 'no catch before the two shapes touch');
  assert.equal(g.snapshot().wide, 0, 'and no effect either');
  drop.y = PADDLE_TOP + DROP_H / 2 - 1e-6; // the drawn capsule now grazes the paddle top
  g.tick(0);
  assert.equal(g.view().drops.length, 0, 'caught as soon as they touch');
  assert.ok(g.snapshot().wide > 0, 'and the effect is granted');
});
