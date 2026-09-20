// DOM wiring: canvas, pointer/keyboard input, HUD, and the
// ?autotest=1 / ?shot=1 / ?nogl=1 modes. The camera lives in camera.js.
import { createGame, BALL_R, BALL_Z, BRICK_D, COLORS, HALF_W, PADDLE_D, PADDLE_H, PADDLE_HALF, PADDLE_Y, PADDLE_Z } from './game.js';
import { createRenderer } from './gl.js';
import { EYE, viewProjection } from './camera.js';
import { getStorage, readBest, writeBest } from './storage.js';
import { isInteractiveTarget, isLeftKey, isPauseKey, isRightKey, isServeKey } from './input.js';
import { playEndOver, playMiss, playTracking } from './autotest.js';

const BG = new Float32Array([0.027, 0.039, 0.063]);
const FLOOR = new Float32Array([0.07, 0.09, 0.13]);
const TRAIL = new Float32Array([0.2, 0.55, 0.5]);
const params = new URLSearchParams(location.search);
const body = document.body;
const setStatus = (key, value) => body.setAttribute(`data-${key}`, String(value));
// Status attributes and gl.getError() exist for the harnesses only; getError
// alone costs ~0.5 ms/frame because it flushes the GPU pipeline.
const QA = params.get('autotest') === '1' || params.get('shot') === '1' || params.get('debug') === '1';

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
// The serve instructions are authored in index.html; this is the only copy.
const READY_TEXT = overlayText.textContent;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
setStatus('reduced', reduced ? '1' : '0');

const storage = getStorage();
const game = createGame({ best: readBest(storage) });
// QA hook: ?debug=1 exposes the live game object for scripted playthroughs.
if (params.get('debug') === '1') window.__game = game;

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
  if (QA) {
    // Boot probes for the smoke test, read once while the 'ready' overlay is up:
    // the overlay must not swallow pointer hits, and the stage must be on screen.
    const rect = canvas.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height * 0.8);
    setStatus('hit', hit === canvas ? 'canvas' : hit?.id || hit?.tagName || 'none');
    setStatus('fit', rect.top >= 0 && rect.bottom <= window.innerHeight ? '1' : '0');
    setStatus('vp', `${window.innerWidth}x${window.innerHeight}`);
  }
  const trail = [];
  const held = { left: false, right: false };

  // Sampling is a state change, so it belongs to the game loop: render() must
  // stay idempotent for the resize/pause/serve paths that also call it.
  const sampleTrail = () => {
    const view = game.view();
    if (reduced || view.state !== 'playing') { trail.length = 0; return; }
    const ball = view.ball;
    trail.unshift({ x: ball.x, y: ball.y, z: ball.z });
    if (trail.length > 6) trail.length = 6;
  };

  const render = (snap = game.snapshot()) => {
    updateHud(snap);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // 0x0 = not laid out (hidden tab, display:none, print): the aspect ratio
    // would be NaN and the frame would be thrown away anyway.
    if (!width || !height) return;
    const view = game.view();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.resize(width, height, dpr);
    renderer.setCamera(viewProjection(width / height), EYE, BG);
    renderer.clear();
    // Runs past the camera so the frame never shows the floor slab's near edge.
    renderer.drawCube(0, -0.02, 7, 10, 0.04, 18, FLOOR, 1);
    for (const brick of view.bricks) {
      // On the play plane, not 5.65 units behind it: a brick may only break
      // where the ball is seen to touch it.
      if (brick.alive) renderer.drawCube(brick.x, brick.y, BALL_Z, brick.w, brick.h, BRICK_D, COLORS[brick.c]);
    }
    // In front of the ball's depth slab, so paddle and ball never interpenetrate.
    renderer.drawCube(view.paddleX, PADDLE_Y, PADDLE_Z + PADDLE_D / 2, PADDLE_HALF * 2, PADDLE_H, PADDLE_D, COLORS[0]);
    const ball = view.ball;
    // A lost ball stops being drawn at the floor instead of sinking through it.
    if (ball && ball.y >= BALL_R) {
      for (let i = 1; i < trail.length; i++) {
        const s = BALL_R * 2 * (1 - i / 9);
        renderer.drawCube(trail[i].x, trail[i].y, trail[i].z, s, s, s, TRAIL);
      }
      renderer.drawCube(ball.x, ball.y, ball.z, BALL_R * 2, BALL_R * 2, BALL_R * 2, COLORS[2]);
    }
    if (QA) {
      const glError = renderer.getError();
      if (glError) setStatus('error', `gl 0x${glError.toString(16)}`);
      setStatus('draws', renderer.drawCount);
      setStatus('state', snap.state);
      setStatus('score', snap.score);
      setStatus('lives', snap.lives);
      setStatus('level', snap.level);
      setStatus('bricks', snap.bricksLeft);
    }
  };

  const updateHud = (snap) => {
    scoreEl.textContent = String(snap.score);
    livesEl.textContent = String(snap.lives);
    levelEl.textContent = String(snap.level);
    bestEl.textContent = String(Math.max(snap.best, snap.score));
    const hideOverlay = snap.state === 'playing' || snap.state === 'life-lost';
    overlay.hidden = hideOverlay;
    // single source of truth for the toggle state (resume paths included)
    pauseButton.setAttribute('aria-pressed', String(snap.state === 'paused'));
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
      overlayText.textContent = READY_TEXT;
      overlayButton.textContent = 'Serve';
    }
  };

  // The live HUD already treats the running score as the best, so persisting
  // mid-run must use the same number or a good run dies with the tab.
  const persistBest = () => {
    const snap = game.snapshot();
    const best = Math.max(snap.best, snap.score);
    if (best > readBest(storage)) writeBest(storage, best);
    setStatus('stored', readBest(storage));
  };

  let lastState = game.snapshot().state;
  let lastLives = game.snapshot().lives;
  let lastLevel = game.snapshot().level;
  const syncStatus = (snap = game.snapshot()) => {
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
    if (snap.state === 'paused') game.resume();
    else if (snap.state === 'playing' || snap.state === 'life-lost') game.pause(); // never from ready/over
    render();
  };

  const releaseKeys = () => { held.left = false; held.right = false; };

  const pointToArena = (event) => {
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width * 2 - 1) * HALF_W;
  };

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' && event.buttons === 0) return; // touch drags only while pressed
    game.setPaddle(pointToArena(event));
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.focus();
    game.setPaddle(pointToArena(event));
    const snap = game.snapshot();
    if (snap.state === 'ready' || snap.state === 'over') primaryAction();
  });
  overlayButton.addEventListener('click', (event) => { event.preventDefault(); primaryAction(); });
  pauseButton.addEventListener('click', togglePause);

  window.addEventListener('keydown', (event) => {
    if (isServeKey(event)) {
      if (isInteractiveTarget(event.target)) return; // let focused buttons activate natively
      event.preventDefault();
      primaryAction();
      return;
    }
    if (isPauseKey(event)) { togglePause(); return; }
    if (isLeftKey(event)) { event.preventDefault(); held.left = true; return; }
    if (isRightKey(event)) { event.preventDefault(); held.right = true; }
  });
  window.addEventListener('keyup', (event) => {
    if (isLeftKey(event)) held.left = false;
    if (isRightKey(event)) held.right = false;
  });
  // A key held while the window loses focus never sends keyup: the paddle would
  // drift on its own when the player comes back.
  window.addEventListener('blur', releaseKeys);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    releaseKeys();
    persistBest();
    const state = game.snapshot().state;
    if (state === 'ready' || state === 'over') return;
    game.pause();
    render();
  });

  // render() is idempotent, so a resize can simply redraw the current state.
  window.addEventListener('resize', () => render());

  let last = 0;
  let frame = 0;
  let lostWhileRunning = false;
  const loop = (now) => {
    // Scheduled first: one thrown frame must not kill the loop for good.
    frame = requestAnimationFrame(loop);
    try {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (held.left) game.nudgePaddle(-1, dt);
      if (held.right) game.nudgePaddle(1, dt);
      game.tick(dt);
      sampleTrail();
      const snap = game.snapshot();
      syncStatus(snap);
      render(snap);
    } catch (error) {
      setStatus('error', error.message || 'frame error');
    }
  };

  canvas.addEventListener('webglcontextlost', (event) => {
    // Without preventDefault the browser never fires webglcontextrestored, and
    // without stopping the loop the simulation runs on unseen until the lives
    // are gone.
    event.preventDefault();
    lostWhileRunning = frame !== 0;
    cancelAnimationFrame(frame);
    frame = 0;
    const state = game.snapshot().state;
    if (state === 'playing' || state === 'life-lost') game.pause();
    setStatus('gl', 'lost');
    announce.textContent = 'Graphics context lost. Waiting for the browser to restore it.';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    // Every GL object died with the context, so the renderer is rebuilt.
    const fresh = createRenderer(canvas);
    if (!fresh.ok) { setStatus('gl', 'error'); setStatus('error', fresh.error); return; }
    renderer = fresh;
    setStatus('gl', 'ok');
    announce.textContent = '';
    last = 0; // the lost interval must not arrive as one huge dt
    if (lostWhileRunning) frame = requestAnimationFrame(loop);
    else render();
  });

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
    // Pre-roll a few ticks with trail samples so the trail is populated in the
    // captured frame; the final ball state sits exactly at ?ticks=.
    const asked = Number(params.get('ticks') || 480); // '0' is truthy, so ?ticks=0 survives
    // Clamped so a typo cannot hang the tab; 0 stays 0.
    const ticks = Math.min(Math.max(Number.isFinite(asked) ? asked : 480, 0), 5000);
    playTracking(game, { ticks: Math.max(0, ticks - 15) });
    for (let i = 0; i < 15; i++) {
      if (game.snapshot().state === 'playing') game.tick(1 / 60);
      if (i % 3 === 2) sampleTrail();
    }
    body.classList.add('shot');
    overlay.hidden = true;
    render();
    return;
  }

  render();
  frame = requestAnimationFrame(loop);
}
