// Impact effects with no DOM and no WebGL: brick shards out of a fixed pool and
// the ball trail. Both are pure state so Node can pin them, and both stay
// seeded — the shards' directions are a hash of the brick, never a roll.
import { hash01 } from './game.js';

export const SHARD_PER_BRICK = 12;
export const SHARD_BRICKS = 5;      // how many simultaneous bursts the pool holds
export const SHARD_LIFE = 0.6;      // seconds
export const SHARD_GRAVITY = 9.8;
export const SHARD_SIZE = 0.09;
const SHARD_SLOW = 2.0;             // m/s, the gentlest shard
const SHARD_FAST = 4.6;             // m/s, the fastest — a brick throws its pieces clear
const SHARD_LIFT = 1.3;             // upward bias, so the burst arcs instead of collapsing
const SPREAD_X = 0.30;              // shards start spread over the brick's own face
const SPREAD_Y = 0.16;

export function createShards({ bricks = SHARD_BRICKS } = {}) {
  const pool = [];
  for (let i = 0; i < SHARD_PER_BRICK * bricks; i++) {
    pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, tier: 0 });
  }
  let next = 0;
  return {
    pool,
    // `seed` is the brick, so the same replay throws the same debris; `tier` is
    // the brick's palette slot, so the pieces keep the colour they broke off.
    spawn(x, y, z, seed, tier = 0) {
      for (let i = 0; i < SHARD_PER_BRICK; i++) {
        const p = pool[next];
        next = (next + 1) % pool.length;
        // Evenly fanned, then jittered by the hash: a burst, not a jet.
        const angle = (i + 0.5 + (hash01(seed, i, 11) - 0.5) * 0.7) * (2 * Math.PI / SHARD_PER_BRICK);
        const speed = SHARD_SLOW + hash01(seed, i, 23) * (SHARD_FAST - SHARD_SLOW);
        p.x = x + Math.cos(angle) * SPREAD_X;
        p.y = y + Math.sin(angle) * SPREAD_Y;
        p.z = z;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed + SHARD_LIFT;
        p.vz = (hash01(seed, i, 31) - 0.5) * 2.2;
        p.tier = tier;
        p.life = SHARD_LIFE;
      }
    },
    step(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vy -= SHARD_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
    },
    clear() { for (const p of pool) p.life = 0; },
  };
}

// A tail of fixed length in world units. Sampling per frame instead would make
// the tail four times shorter on a 240 Hz screen than on a 60 Hz one.
export const TRAIL_STEP = 0.18;
export const TRAIL_MAX = 7;

export function createTrail({ step = TRAIL_STEP, max = TRAIL_MAX } = {}) {
  const points = [];
  let lastX = null;
  let lastY = 0;
  return {
    points,
    reset() { points.length = 0; lastX = null; },
    sample(x, y, z) {
      if (lastX !== null && Math.hypot(x - lastX, y - lastY) < step) return false;
      lastX = x;
      lastY = y;
      points.unshift({ x, y, z });
      if (points.length > max) points.length = max;
      return true;
    },
  };
}
