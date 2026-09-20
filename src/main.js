// DOM wiring: canvas, pointer/keyboard input, HUD, and the
// ?autotest=1 / ?shot=1 / ?nogl=1 modes. The camera lives in camera.js.
import {
  createGame, levelPalette, BALL_COLOR, BALL_R, BALL_Z, BG_COLOR, BRICK_D, DROP_COLORS, DROP_H,
  DROP_W, FLOOR_COLOR, HALF_W, PADDLE_COLOR, PADDLE_D, PADDLE_H, PADDLE_Y, PADDLE_Z, STEEL_COLOR,
  TRAIL_COLOR,
} from './game.js';
import { createRenderer } from './gl.js';
import { EYE, viewProjection } from './camera.js';
import { getStorage, readBest, writeBest } from './storage.js';
import { isLeftKey, isRightKey, keyAction } from './input.js';
import { DEEP_TICKS, playEndOver, playMiss, playTracking } from './autotest.js';

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
    // The probe sits on the paddle's own row, off the centre line: on a short
    // viewport the overlay button covers the middle of the canvas, so a centred
    // probe would report the button and fail for a reason that is not the bug.
    const rect = canvas.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width * 0.12, rect.bottom - 8);
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

  // Reused so a damaged brick can darken without allocating a colour per draw.
  const tint = new Float32Array(3);
  const damaged = (color, damage) => {
    const k = 1 - 0.45 * damage;
    tint[0] = color[0] * k; tint[1] = color[1] * k; tint[2] = color[2] * k;
    return tint;
  };

  // The frame size is a parameter because shot mode pins it: the capture
  // re-layouts the page at the harness window size, and a frame measured at load
  // time would reach the PNG stretched to fit.
  const render = (snap = game.snapshot(), width = canvas.clientWidth, height = canvas.clientHeight) => {
    updateHud(snap);
    // 0x0 = not laid out (hidden tab, display:none, print): the aspect ratio
    // would be NaN and the frame would be thrown away anyway.
    if (!width || !height) {
      // The shot guard reads this: an unlaid-out page must not look like a frame.
      if (QA) setStatus('draws', 0);
      return;
    }
    const view = game.view();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.resize(width, height, dpr);
    renderer.setCamera(viewProjection(width / height), EYE, BG_COLOR);
    renderer.clear();
    // Runs past the camera so the frame never shows the floor slab's near edge.
    renderer.drawCube(0, -0.02, 7, 10, 0.04, 18, FLOOR_COLOR, 1);
    const palette = levelPalette(snap.level);
    for (const brick of view.bricks) {
      // On the play plane, not 5.65 units behind it: a brick may only break
      // where the ball is seen to touch it.
      if (!brick.alive) continue;
      // Steel gets the world-space grid lines, so it reads as a different
      // material without a second shader.
      if (brick.solid) {
        renderer.drawCube(brick.x, brick.y, BALL_Z, brick.w, brick.h, BRICK_D, STEEL_COLOR, 1);
        continue;
      }
      const damage = 1 - brick.hp / brick.hp0;
      const color = damage > 0 ? damaged(palette[brick.c], damage) : palette[brick.c];
      renderer.drawCube(brick.x, brick.y, BALL_Z, brick.w, brick.h, BRICK_D, color, 0, damage);
    }
    for (const drop of view.drops) {
      renderer.drawCube(drop.x, drop.y, BALL_Z, DROP_W, DROP_H, DROP_H, DROP_COLORS[drop.type]);
    }
    // Drawn from the same half-width the physics catches with, so a widened or
    // shrunken paddle is never a lie on screen. In front of the ball's depth
    // slab, so paddle and ball never interpenetrate.
    renderer.drawCube(view.paddleX, PADDLE_Y, PADDLE_Z + PADDLE_D / 2, snap.paddleHalf * 2, PADDLE_H, PADDLE_D, PADDLE_COLOR);
    const ball = view.ball;
    // A lost ball stops being drawn at the floor instead of sinking through it.
    if (ball && ball.y >= BALL_R) {
      for (let i = 1; i < trail.length; i++) {
        const s = BALL_R * 2 * (1 - i / 9);
        renderer.drawCube(trail[i].x, trail[i].y, trail[i].z, s, s, s, TRAIL_COLOR);
      }
      renderer.drawCube(ball.x, ball.y, ball.z, BALL_R * 2, BALL_R * 2, BALL_R * 2, BALL_COLOR);
    }
    if (QA) {
      const glError = renderer.getError();
      if (glError) setStatus('error', `gl 0x${glError.toString(16)}`);
      setStatus('draws', renderer.drawCount);
      setStatus('grid', renderer.gridCount);
      setStatus('cracked', renderer.crackCount);
      // A run that only ever drew one frame cannot prove drawCount is per-frame.
      setStatus('frames', loopFrames);
      // The size this frame was actually rendered at: the screenshot gate pins
      // it, so the DOM it inspects cannot describe a different frame than the
      // one in the file.
      setStatus('frame', `${width}x${height}`);
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
    const action = keyAction(event); // 'native' = a focused button handles it
    if (action === 'serve') { event.preventDefault(); primaryAction(); }
    else if (action === 'pause') togglePause();
    else if (action === 'left' || action === 'right') { event.preventDefault(); held[action] = true; }
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

  let last = 0;
  let frame = 0;
  let loopFrames = 0;
  let lostWhileRunning = false;
  const loop = (now) => {
    // Scheduled first: one thrown frame must not kill the loop for good.
    frame = requestAnimationFrame(loop);
    try {
      loopFrames += 1;
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
    else if (end === 'deep') playTracking(game, { ticks: DEEP_TICKS });
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
    // Chrome captures the PNG after the DOM is dumped, re-laying out the page at
    // the window size the harness asked for. Pinning the frame to that size is
    // what makes the captured pixels the ones the guard just checked.
    const px = (name, fallback) => {
      const value = Number(params.get(name));
      return Number.isFinite(value) && value > 0 ? Math.min(value, 4096) : fallback;
    };
    const w = px('w', canvas.clientWidth);
    const h = px('h', canvas.clientHeight);
    // The displayed box is pinned to the same size as the backing store, not
    // just the render: a stylesheet that shrinks the canvas inside the captured
    // frame would otherwise put a band of background in the PNG that the guard
    // never looked at.
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    render(game.snapshot(), w, h);
    const box = canvas.getBoundingClientRect();
    setStatus('box', `${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.width)},${Math.round(box.height)}`);
    return;
  }

  // render() is idempotent, so a resize can simply redraw the current state.
  // Registered only on the interactive path: the deterministic modes have
  // returned by now, and a capture-time resize must never redraw them behind
  // the guard's back.
  window.addEventListener('resize', () => render());
  render();
  frame = requestAnimationFrame(loop);
}
