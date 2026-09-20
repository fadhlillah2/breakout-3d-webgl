// Impact effects, kept pure so they can be pinned in Node: seeded brick shards
// out of a fixed pool, and a ball trail sampled by distance rather than by
// frame (a per-frame trail is four times shorter at 240 Hz than at 60 Hz).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createShards, createTrail, SHARD_GRAVITY, SHARD_LIFE, SHARD_PER_BRICK, TRAIL_MAX, TRAIL_STEP,
} from '../src/fx.js';

const live = (s) => s.pool.filter((p) => p.life > 0);
const dump = (s) => live(s).map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz].map((n) => n.toFixed(6)).join(','));

test('a broken brick throws a full set of shards, and the same seed throws the same set', () => {
  const a = createShards();
  const b = createShards();
  a.spawn(1.5, 4, 5.8, 7);
  b.spawn(1.5, 4, 5.8, 7);
  assert.equal(live(a).length, SHARD_PER_BRICK);
  assert.deepEqual(dump(a), dump(b), 'seeded, so a replay throws identical shards');

  const c = createShards();
  c.spawn(1.5, 4, 5.8, 8);
  assert.notDeepEqual(dump(c), dump(a), 'a different brick throws a different set');
  // Down to the directions: two bricks breaking side by side must not throw
  // their pieces along the same twelve spokes.
  const spokes = (s) => live(s).map((p) => Math.atan2(p.y - 4, p.x - 1.5).toFixed(6)).join('|');
  assert.notEqual(spokes(c), spokes(a), 'the fan itself is seeded, not a fixed wheel');
});

test('shards leave the brick in every direction, then fall and expire', () => {
  const s = createShards();
  s.spawn(0, 3, 5.8, 3);
  const dirs = live(s).map((p) => Math.atan2(p.vy, p.vx));
  assert.ok(Math.max(...dirs) - Math.min(...dirs) > 4, 'the burst is not a single jet');

  const one = live(s)[0];
  const vy0 = one.vy;
  s.step(0.1);
  assert.ok(Math.abs(one.vy - (vy0 - SHARD_GRAVITY * 0.1)) < 1e-9, 'gravity pulls them down');
  s.step(SHARD_LIFE);
  assert.equal(live(s).length, 0, `nothing outlives ${SHARD_LIFE}s`);
});

test('the pool is fixed: spawning past capacity recycles instead of growing', () => {
  const s = createShards();
  const size = s.pool.length;
  for (let i = 0; i < 40; i++) s.spawn(0, 3, 5.8, i);
  assert.equal(s.pool.length, size, 'no allocation per brick');
  assert.equal(live(s).length, size, 'and the oldest shards are the ones reused');
});

test('the trail is sampled by distance, so its length is the same at any frame rate', () => {
  const walk = (samples) => {
    const t = createTrail();
    const stepX = 12 / samples;
    for (let i = 0; i <= samples; i++) t.sample(i * stepX, 0, 5.8);
    return t;
  };
  const slow = walk(60);
  const fast = walk(240);
  const span = (t) => t.points[0].x - t.points[t.points.length - 1].x;
  const want = (TRAIL_MAX - 1) * TRAIL_STEP;
  for (const [label, t] of [['60 Hz', slow], ['240 Hz', fast]]) {
    assert.equal(t.points.length, TRAIL_MAX, `${label} fills the tail`);
    assert.ok(Math.abs(span(t) - want) <= TRAIL_STEP,
      `${label} tail spans ${span(t).toFixed(3)} world units, within one step of ${want.toFixed(3)}`);
  }
});

test('the trail ignores moves shorter than a step and drops everything on reset', () => {
  const t = createTrail();
  assert.equal(t.sample(0, 0, 5.8), true, 'the first point always lands');
  assert.equal(t.sample(TRAIL_STEP * 0.4, 0, 5.8), false, 'a nudge is not a sample');
  assert.equal(t.points.length, 1);
  assert.equal(t.sample(TRAIL_STEP * 1.1, 0, 5.8), true);
  t.reset();
  assert.equal(t.points.length, 0);
  assert.equal(t.sample(99, 0, 5.8), true, 'and the next point starts a fresh tail');
});
