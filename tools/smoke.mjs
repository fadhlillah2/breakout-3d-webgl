import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame } from '../src/game.js';
import { playEndOver, playMiss, playTracking } from '../src/autotest.js';
import { findChrome, runChrome, startServer } from './harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = findChrome();
if (!CHROME) { console.error('FAIL no Chrome found (set CHROME or install google-chrome)'); process.exit(1); }

const expected = playTracking(createGame());
const expectedMiss = playMiss(createGame());
const expectedOver = playEndOver(createGame());
assert.equal(expectedOver.state, 'over', 'over scenario reaches over in Node');

const baseFlags = ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--disable-gpu'];
const attr = (dom, name) => new RegExp(`data-${name}="([^"]*)"`).exec(dom)?.[1];
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

const { server, port } = await startServer(ROOT);
try {
  const base = `http://127.0.0.1:${port}`;

  const auto = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=8000', '--dump-dom', `${base}/?autotest=1`]);
  check(attr(auto, 'gl') === 'ok', 'webgl2 context created');
  check(!attr(auto, 'error'), 'no runtime error');
  check(Number(attr(auto, 'draws')) > 0, 'frames drawn');
  check(attr(auto, 'state') === expected.state, `state ${attr(auto, 'state')} === ${expected.state}`);
  check(Number(attr(auto, 'score')) === expected.score, `score ${attr(auto, 'score')} === ${expected.score}`);
  check(Number(attr(auto, 'lives')) === expected.lives, `lives ${attr(auto, 'lives')} === ${expected.lives}`);
  check(Number(attr(auto, 'level')) === expected.level, `level ${attr(auto, 'level')} === ${expected.level}`);
  check(Number(attr(auto, 'bricks')) === expected.bricksLeft, `bricks ${attr(auto, 'bricks')} === ${expected.bricksLeft}`);

  const miss = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=8000', '--dump-dom', `${base}/?autotest=1&end=miss`]);
  check(attr(miss, 'state') === 'ready', `miss run respawns to ready (got ${attr(miss, 'state')})`);
  check(Number(attr(miss, 'lives')) === expectedMiss.lives, `miss loses one life (${attr(miss, 'lives')} === ${expectedMiss.lives})`);

  const over = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=10000', '--dump-dom', `${base}/?autotest=1&end=over`]);
  check(attr(over, 'state') === 'over', `over run ends over (got ${attr(over, 'state')})`);
  check(Number(attr(over, 'stored')) === expectedOver.best, `best persisted (${attr(over, 'stored')} === ${expectedOver.best})`);
  check(/id="announce"[^>]*>[^<]*Game over/.test(over), 'game over announced in the live region');

  const nogl = await runChrome(CHROME, [...baseFlags, '--window-size=1366,768', '--virtual-time-budget=4000', '--dump-dom', `${base}/?nogl=1`]);
  check(attr(nogl, 'gl') === 'nogl', 'fallback flag set when WebGL2 is unavailable');
  check(/id="fallback"(?![^>]*hidden)/.test(nogl), 'fallback content visible');

  const small = await runChrome(CHROME, [...baseFlags, '--window-size=320,480', '--virtual-time-budget=8000', '--dump-dom', `${base}/?autotest=1`]);
  check(attr(small, 'gl') === 'ok' && !attr(small, 'error'), 'boots at 320x480 without error');
} finally {
  server.closeAllConnections?.();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log(`\nall smoke checks passed (score ${expected.score}, lives ${expected.lives}, level ${expected.level}, ${expected.bricksLeft} bricks left)`);
