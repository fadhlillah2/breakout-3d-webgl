import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALL_R, BALL_Z, PADDLE_H, PADDLE_Y, createGame } from '../src/game.js';
import { createShards, createTrail } from '../src/fx.js';
import { DEEP_TICKS, playEndOver, playMiss, playTracking } from '../src/autotest.js';
import { findChrome, runChrome, startServer } from './harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = findChrome();
if (!CHROME) { console.error('FAIL no Chrome found (set CHROME or install google-chrome)'); process.exit(1); }

// The autotest page runs its scenario through the same feedback pipeline as the
// game loop, so the frame it dumps carries flying debris and a ball trail. This
// restates that pipeline in Node — the contract written out again, not a call
// into main.js — so the cube count below stays derived rather than trusted.
const fxMirror = (game) => {
  const shards = createShards();
  const trail = createTrail();
  const onTick = (dt) => {
    const view = game.view();
    for (const event of view.events) {
      if (event.type === 'brick' && event.destroyed) shards.spawn(event.x, event.y, BALL_Z, event.index);
    }
    if (view.state === 'playing') trail.sample(view.ball.x, view.ball.y, view.ball.z);
    else trail.reset();
    shards.step(dt);
  };
  return { onTick, shards, trail, debris: () => shards.pool.filter((p) => p.life > 0).length };
};

const trackGame = createGame();
const trackFx = fxMirror(trackGame);
const expected = playTracking(trackGame, { onTick: trackFx.onTick });
const expectedMiss = playMiss(createGame());
const expectedOver = playEndOver(createGame());
assert.equal(expectedOver.state, 'over', 'over scenario reaches over in Node');
// The deep run is the only browser frame that draws a steel brick, a capsule and
// a cracked brick, so its discriminating power is asserted here in Node before
// the browser checks below are trusted to mean anything.
const deepGame = createGame();
const deepFx = fxMirror(deepGame);
const expectedDeep = playTracking(deepGame, { ticks: DEEP_TICKS, onTick: deepFx.onTick });
const deepBricks = deepGame.view().bricks;
const deepSteel = deepBricks.filter((b) => b.alive && b.solid).length;
const deepCracked = deepBricks.filter((b) => b.alive && !b.solid && b.hp < b.hp0).length;
assert.ok(deepSteel > 0, `deep scenario still has steel bricks standing (got ${deepSteel})`);
assert.ok(deepCracked > 0, `deep scenario still has a cracked brick standing (got ${deepCracked})`);
assert.ok(expectedDeep.drops > 0, `deep scenario still has a capsule in flight (got ${expectedDeep.drops})`);
// The deep run is also the only frame drawn while a brick is still coming apart
// and a catch is still squashing the paddle, so it is the one that can gate the
// feedback path at all. Both are asserted here before the browser is believed.
assert.ok(deepFx.debris() > 0, `deep scenario still has shards in the air (got ${deepFx.debris()})`);
assert.ok(trackFx.trail.points.length > 1, `tracking scenario draws a trail (got ${trackFx.trail.points.length} points)`);
const catchLine = (PADDLE_Y + PADDLE_H / 2).toFixed(4);

const baseFlags = ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--disable-gpu'];
const attr = (dom, name) => new RegExp(`data-${name}="([^"]*)"`).exec(dom)?.[1];
const hud = (dom, id) => Number(new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(dom)?.[1]);
// The cubes every frame draws whatever the state is: the floor, the two side
// walls, the ceiling and the back wall of the arena shell, and the paddle.
const FIXED_CUBES = 6;
// data-draws counts one frame now, and the autotest path renders exactly once,
// so the browser's draw count is derivable from the state Node just computed:
// the fixed set + every brick still standing + every capsule in flight + the
// ball. Nothing samples the trail in autotest mode. A brick, a steel block or a
// capsule that stops being drawn changes this number; a running total would not.
const expectedDraws = (game, fx = null) => {
  const view = game.view();
  const lit = view.ball.y >= BALL_R;
  return FIXED_CUBES + view.bricks.filter((b) => b.alive).length + view.drops.length
    + (lit ? 1 + (fx ? Math.max(0, fx.trail.points.length - 1) : 0) : 0)
    + (fx ? fx.debris() : 0);
};
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

const { server, port } = await startServer(ROOT);
try {
  const base = `http://127.0.0.1:${port}`;

  const auto = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=8000', '--dump-dom', `${base}/?autotest=1`]);
  check(attr(auto, 'gl') === 'ok', 'webgl2 context created');
  check(!attr(auto, 'error'), 'no runtime error');
  check(Number(attr(auto, 'draws')) === expectedDraws(trackGame, trackFx),
    `one frame drew ${attr(auto, 'draws')} cubes === ${expectedDraws(trackGame, trackFx)} derived from the state`);
  check(attr(auto, 'state') === expected.state, `state ${attr(auto, 'state')} === ${expected.state}`);
  check(Number(attr(auto, 'score')) === expected.score, `score ${attr(auto, 'score')} === ${expected.score}`);
  check(Number(attr(auto, 'lives')) === expected.lives, `lives ${attr(auto, 'lives')} === ${expected.lives}`);
  check(Number(attr(auto, 'level')) === expected.level, `level ${attr(auto, 'level')} === ${expected.level}`);
  check(Number(attr(auto, 'bricks')) === expected.bricksLeft, `bricks ${attr(auto, 'bricks')} === ${expected.bricksLeft}`);
  check(attr(auto, 'hit') === 'canvas', `pointer hits reach the canvas under the ready overlay (got ${attr(auto, 'hit')})`);
  // Only score and best: lives and level happen to match the HTML defaults of
  // this run, so asserting them would pass on a HUD that never updated at all.
  check(hud(auto, 'score') === expected.score, `HUD score ${hud(auto, 'score')} === ${expected.score}`);
  check(hud(auto, 'best') === Math.max(expected.best, expected.score),
    `HUD best ${hud(auto, 'best')} === ${Math.max(expected.best, expected.score)}`);

  const miss = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=8000', '--dump-dom', `${base}/?autotest=1&end=miss`]);
  check(attr(miss, 'state') === 'ready', `miss run respawns to ready (got ${attr(miss, 'state')})`);
  check(Number(attr(miss, 'lives')) === expectedMiss.lives, `miss loses one life (${attr(miss, 'lives')} === ${expectedMiss.lives})`);

  const over = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=10000', '--dump-dom', `${base}/?autotest=1&end=over`]);
  check(attr(over, 'state') === 'over', `over run ends over (got ${attr(over, 'state')})`);
  check(Number(attr(over, 'stored')) === expectedOver.best, `best persisted (${attr(over, 'stored')} === ${expectedOver.best})`);
  check(/id="announce"[^>]*>[^<]*Game over/.test(over), 'game over announced in the live region');

  const deep = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=12000', '--dump-dom', `${base}/?autotest=1&end=deep`]);
  check(!attr(deep, 'error'), `${deepSteel} steel, ${deepCracked} cracked and ${expectedDeep.drops} capsule(s) drawn without error`);
  check(Number(attr(deep, 'draws')) === expectedDraws(deepGame, deepFx),
    `deep frame drew ${attr(deep, 'draws')} cubes === ${expectedDraws(deepGame, deepFx)} derived from the state (${deepFx.debris()} of them shards)`);
  // The catch squash is the one effect that touches a hitbox: it may compress
  // the paddle, never move the face the physics catches on. The deep frame is
  // drawn three ticks after a catch, so the squash is live while this is read.
  const [drawnTop, drawnSquash] = (attr(deep, 'paddle') || ',').split(',');
  check(Number(drawnSquash) > 0, `the deep frame is drawn mid-squash (${drawnSquash}), so the check below discriminates`);
  check(drawnTop === catchLine, `the squashed paddle is drawn with its top face on the catch line (${drawnTop} === ${catchLine})`);
  // A cube count cannot see which branch drew the cube: steel draws exactly as
  // many cubes as an ordinary brick would. Steel takes the grid branch (so does
  // the floor) and a damaged brick takes the crack branch, so each branch gets
  // its own count derived from the same state.
  check(Number(attr(deep, 'grid')) === deepSteel + 1,
    `deep frame drew ${attr(deep, 'grid')} grid cubes === ${deepSteel + 1} (floor + ${deepSteel} steel)`);
  check(Number(attr(deep, 'cracked')) === deepCracked,
    `deep frame drew ${attr(deep, 'cracked')} cracked bricks === ${deepCracked}`);
  check(Number(attr(deep, 'level')) === expectedDeep.level, `deep level ${attr(deep, 'level')} === ${expectedDeep.level}`);
  check(Number(attr(deep, 'score')) === expectedDeep.score, `deep score ${attr(deep, 'score')} === ${expectedDeep.score}`);
  check(Number(attr(deep, 'bricks')) === expectedDeep.bricksLeft, `deep bricks ${attr(deep, 'bricks')} === ${expectedDeep.bricksLeft}`);

  // The only run whose animation loop really turns: nothing serves, so every
  // frame redraws the same ready board. That makes the per-frame meaning of
  // data-draws testable — a running total would grow with the frame count. How
  // many loop frames a runner gets is scheduling, not something we pin (2 to 7
  // here), so it is asserted rather than assumed: with the boot render, one loop
  // frame already means data-draws was written twice, and a total would read
  // double. At zero the run is not discriminating and must say so, not pass.
  const idle = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=4000', '--dump-dom', `${base}/?debug=1`]);
  check(Number(attr(idle, 'frames')) >= 1, `the idle run looped ${attr(idle, 'frames')} frame(s) past the boot render, so the count below was written more than once`);
  check(Number(attr(idle, 'draws')) === expectedDraws(createGame()),
    `the loop redraws ${attr(idle, 'draws')} cubes per frame === ${expectedDraws(createGame())}, not a running total`);

  const nogl = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=4000', '--dump-dom', `${base}/?nogl=1`]);
  check(attr(nogl, 'gl') === 'nogl', 'fallback flag set when WebGL2 is unavailable');
  check(/id="fallback"(?![^>]*hidden)/.test(nogl), 'fallback content visible');

  // Chrome clamps the window to 500 CSS px wide, so the label reports the
  // viewport the page actually measured instead of the flag we asked for. The
  // height is low on purpose: at 500x393 the stage fits with or without the
  // canvas height cap, so that run proved nothing.
  const small = await runChrome(CHROME, [...baseFlags, '--window-size=500,340', '--virtual-time-budget=8000', '--dump-dom', `${base}/?autotest=1`]);
  check(attr(small, 'gl') === 'ok' && !attr(small, 'error'), `boots at ${attr(small, 'vp')} without error`);
  check(attr(small, 'fit') === '1', `stage fits the ${attr(small, 'vp')} viewport`);
  check(attr(small, 'hit') === 'canvas', `paddle row is reachable at ${attr(small, 'vp')} (got ${attr(small, 'hit')})`);

  const short = await runChrome(CHROME, [...baseFlags, '--window-size=740,360', '--virtual-time-budget=4000', '--dump-dom', `${base}/?autotest=1`]);
  check(attr(short, 'fit') === '1', `stage fits the ${attr(short, 'vp')} landscape viewport`);
  check(attr(short, 'hit') === 'canvas', `paddle row is reachable at ${attr(short, 'vp')} (got ${attr(short, 'hit')})`);

  // Two browser conditions no plain run reaches: a reduced-motion preference and
  // storage that throws on every access.
  const calm = await runChrome(CHROME, [...baseFlags, '--force-prefers-reduced-motion', '--window-size=1366,768', '--virtual-time-budget=8000', '--dump-dom', `${base}/?autotest=1`]);
  check(attr(calm, 'reduced') === '1' && attr(auto, 'reduced') === '0',
    `prefers-reduced-motion is read, not assumed (${attr(auto, 'reduced')} without the flag, ${attr(calm, 'reduced')} with it)`);

  const blocked = await runChrome(CHROME, [...baseFlags, '--disable-local-storage', '--window-size=1366,768', '--virtual-time-budget=10000', '--dump-dom', `${base}/?autotest=1&end=over`]);
  check(!attr(blocked, 'error') && attr(blocked, 'state') === 'over',
    `a full game runs with localStorage blocked (state ${attr(blocked, 'state')}, error ${attr(blocked, 'error') || 'none'})`);
  check(Number(attr(blocked, 'stored')) === 0 && Number(attr(over, 'stored')) > 0,
    `blocked storage keeps no best (${attr(over, 'stored')} with storage, ${attr(blocked, 'stored')} without)`);
} finally {
  server.closeAllConnections?.();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log(`\nall smoke checks passed (score ${expected.score}, lives ${expected.lives}, level ${expected.level}, ${expected.bricksLeft} bricks left)`);
