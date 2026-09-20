// DOM wiring: canvas, pointer/keyboard input, static camera, HUD, and the
// ?autotest=1 / ?shot=1 / ?nogl=1 modes.
import { createGame, BALL_R, BRICK_D, COLORS, HALF_W, PADDLE_Z } from './game.js';
import { createRenderer } from './gl.js';
import { lookAt, multiply, perspective } from './math.js';
import { getStorage, readBest, writeBest } from './storage.js';
import { isLeftKey, isPauseKey, isRightKey, isServeKey } from './input.js';
import { playEndOver, playMiss, playTracking } from './autotest.js';

const BG = [0.027, 0.039, 0.063];
const FLOOR = [0.07, 0.09, 0.13];
const TRAIL = [0.2, 0.55, 0.5];
const params = new URLSearchParams(location.search);
const body = document.body;
const setStatus = (key, value) => body.setAttribute(`data-${key}`, String(value));

window.addEventListener('error', (event) => setStatus('error', event.message || 'runtime error'));

const canvas = document.getElementById('game');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const bestEl = document.getElementById('best');
const pauseButton = document.getElementById('pause');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const overlayButton = document.getElementById('overlay-button');
const fallback = document.getElementById('fallback');
const announce = document.getElementById('announce');

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
setStatus('reduced', reduced ? '1' : '0');

const storage = getStorage();
const game = createGame({ best: readBest(storage), reduced });

if (params.get('nogl') === '1') {
  showFallback('forced');
  setStatus('gl', 'nogl');
} else {
  const renderer = createRenderer(canvas);
  if (!renderer.ok) {
    showFallback(renderer.error);
    setStatus('gl', renderer.error === 'no-webgl2' ? 'nogl' : 'error');
    if (renderer.error !== 'no-webgl2') setStatus('error', renderer.error);
  } else {
    start(renderer);
  }
}

function showFallback(reason) {
  overlay.hidden = true;
  fallback.hidden = false;
  fallback.dataset.reason = reason || 'webgl2';
}

function start(renderer) {
  setStatus('gl', 'ok');
  const trail = [];
  const held = { left: false, right: false };

  const render = () => {
    const view = game.view();
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 450;
    const dpr = Math.min(window.devicePixelRatio || 1, width < 560 ? 0.75 : 1.5);
    renderer.resize(width, height, dpr);
    const vp = multiply(
      perspective(Math.PI / 3.6, width / height, 0.1, 60),
      lookAt([0, 3.4, 12.0], [0, 2.6, 2.0], [0, 1, 0]),
    );
    renderer.setCamera(vp, [0, 3.4, 12.0], BG);
    renderer.clear();
    renderer.drawCube(0, -0.02, 2.5, 10, 0.04, 9, FLOOR, 1);
    for (const brick of view.bricks) {
      if (brick.alive) renderer.drawCube(brick.x, brick.y, BRICK_D / 2, brick.w, brick.h, BRICK_D, COLORS[brick.c]);
    }
    renderer.drawCube(view.paddleX, 0.4, PADDLE_Z - 0.1, 1.6, 0.3, 0.2, COLORS[0]);
    const ball = view.ball;
    if (ball) {
      if (reduced || view.state !== 'playing') trail.length = 0;
      else {
        trail.unshift({ x: ball.x, y: ball.y, z: ball.z });
        if (trail.length > 6) trail.length = 6;
      }
      for (let i = 1; i < trail.length; i++) {
        const s = BALL_R * 2 * (1 - i / 9);
        renderer.drawCube(trail[i].x, trail[i].y, trail[i].z, s, s, s, TRAIL);
      }
      renderer.drawCube(ball.x, ball.y, ball.z, BALL_R * 2, BALL_R * 2, BALL_R * 2, COLORS[2]);
    }
    updateHud();
    const glError = renderer.getError();
    if (glError) setStatus('error', `gl 0x${glError.toString(16)}`);
    setStatus('draws', renderer.drawCount);
    setStatus('state', view.state);
    setStatus('score', view.score);
    setStatus('lives', view.lives);
    setStatus('level', view.level);
    setStatus('bricks', view.bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0));
  };

  const updateHud = () => {
    const snap = game.snapshot();
    scoreEl.textContent = String(snap.score);
    livesEl.textContent = String(snap.lives);
    levelEl.textContent = String(snap.level);
    bestEl.textContent = String(Math.max(snap.best, snap.score));
    const hideOverlay = snap.state === 'playing' || snap.state === 'life-lost';
    overlay.hidden = hideOverlay;
    if (snap.state === 'paused') {
      overlayTitle.textContent = 'Paused';
      overlayText.textContent = 'Press Esc or the button to resume.';
      overlayButton.textContent = 'Resume';
    } else if (snap.state === 'over') {
      overlayTitle.textContent = `Game over — score ${snap.score}`;
      overlayText.textContent = `Best: ${snap.best}. Press Space, Enter, or click to play again.`;
      overlayButton.textContent = 'Play again';
    } else if (snap.state === 'ready') {
      overlayTitle.textContent = `Level ${snap.level}`;
      overlayText.textContent = 'Move with the mouse or ← → · press Space or click to serve.';
      overlayButton.textContent = 'Serve';
    }
  };

  const persistBest = () => {
    const snap = game.snapshot();
    if (snap.best > readBest(storage)) writeBest(storage, snap.best);
    setStatus('stored', readBest(storage));
  };

  let lastState = game.snapshot().state;
  let lastLives = game.snapshot().lives;
  let lastLevel = game.snapshot().level;
  const syncStatus = () => {
    const snap = game.snapshot();
    if (snap.lives < lastLives) announce.textContent = `Life lost. ${snap.lives} remaining.`;
    if (snap.level > lastLevel) announce.textContent = `Level ${snap.level}.`;
    if (snap.state === 'over' && lastState !== 'over') {
      announce.textContent = `Game over. Score ${snap.score}.`;
      persistBest();
    }
    lastState = snap.state;
    lastLives = snap.lives;
    lastLevel = snap.level;
  };

  const primaryAction = () => {
    const snap = game.snapshot();
    if (snap.state === 'ready') game.serve();
    else if (snap.state === 'over') { game.restart(); announce.textContent = ''; }
    else if (snap.state === 'paused') game.resume();
    render();
  };

  const togglePause = () => {
    const snap = game.snapshot();
    if (snap.state === 'paused') { game.resume(); pauseButton.setAttribute('aria-pressed', 'false'); }
    else if (snap.state !== 'over') { game.pause(); pauseButton.setAttribute('aria-pressed', 'true'); }
    render();
  };

  const pointToArena = (event) => {
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width * 2 - 1) * HALF_W;
  };

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return; // touch drags only while pressed
    game.setPaddle(pointToArena(event));
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.focus();
    game.setPaddle(pointToArena(event));
    const snap = game.snapshot();
    if (snap.state === 'ready' || snap.state === 'over') primaryAction();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch' || event.buttons === 0) return;
    game.setPaddle(pointToArena(event));
  });
  overlayButton.addEventListener('click', (event) => { event.preventDefault(); primaryAction(); });
  pauseButton.addEventListener('click', togglePause);

  window.addEventListener('keydown', (event) => {
    if (isServeKey(event)) { event.preventDefault(); primaryAction(); return; }
    if (isPauseKey(event)) { togglePause(); return; }
    if (isLeftKey(event)) { held.left = true; return; }
    if (isRightKey(event)) { held.right = true; }
  });
  window.addEventListener('keyup', (event) => {
    if (isLeftKey(event)) held.left = false;
    if (isRightKey(event)) held.right = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (game.snapshot().state === 'over') return;
    game.pause();
    pauseButton.setAttribute('aria-pressed', 'true');
    render();
  });

  let last = 0;
  const loop = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (held.left) game.nudgePaddle(-1, dt);
    if (held.right) game.nudgePaddle(1, dt);
    game.tick(dt);
    syncStatus();
    render();
    requestAnimationFrame(loop);
  };

  // Deterministic modes (smoke test + screenshot): results pinned.
  if (params.get('autotest') === '1') {
    const end = params.get('end');
    if (end === 'miss') playMiss(game);
    else if (end === 'over') playEndOver(game);
    else playTracking(game);
    syncStatus();
    render();
    return;
  }
  if (params.get('shot') === '1') {
    playTracking(game, { ticks: Number(params.get('ticks')) || 480 });
    body.classList.add('shot');
    overlay.hidden = true;
    render();
    return;
  }

  render();
  requestAnimationFrame(loop);
}
