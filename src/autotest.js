// Deterministic play sequences shared by the browser smoke test and the
// screenshot generator, so browser output can be diffed against Node.
// The game has no randomness, so fixed tick sequences are fully deterministic.

export const TRACK_TICKS = 1500;
export const MISS_TICKS = 320;
// The only sequence that reaches a frame drawing a steel brick, a cracked brick
// and a capsule at once (level 2 pattern, ~33 ticks of slack either side).
// tools/smoke.mjs re-asserts that in Node before trusting the browser run.
export const DEEP_TICKS = 4250;

export function playTracking(game, { ticks = TRACK_TICKS, dt = 1 / 60 } = {}) {
  for (let i = 0; i < ticks; i++) {
    const s = game.snapshot();
    if (s.state === 'ready') game.serve();
    else if (s.state === 'playing') game.setPaddle(s.ball.x);
    game.tick(dt);
  }
  return game.snapshot();
}

export function playMiss(game, { dt = 1 / 60 } = {}) {
  game.setPaddle(-3.0);
  if (game.snapshot().state === 'ready') game.serve();
  for (let i = 0; i < MISS_TICKS; i++) {
    game.setPaddle(-3.0);
    game.tick(dt);
  }
  return game.snapshot();
}

export function playEndOver(game, { dt = 1 / 60, warmup = 300 } = {}) {
  playTracking(game, { ticks: warmup, dt });
  for (let guard = 0; guard < 10000 && game.snapshot().state !== 'over'; guard++) {
    if (game.snapshot().state === 'ready') playMiss(game, { dt });
    else game.tick(dt);
  }
  return game.snapshot();
}
