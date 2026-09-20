// DOM wiring: canvas, pointer/keyboard input, HUD, impact feedback, and the
// ?autotest=1 / ?shot=1 / ?nogl=1 modes. The camera lives in camera.js.
import {
  createGame, levelPalette, BALL_COLOR, BALL_R, BALL_Z, BG_COLOR, BRICK_D, DROP_COLORS, DROP_H,
  DROP_W, FLOOR_COLOR, HALF_W, PADDLE_COLOR, PADDLE_D, PADDLE_H, PADDLE_Y, PADDLE_Z, STEEL_COLOR,
  TRAIL_COLOR,
} from './game.js';
import { createRenderer } from './gl.js';
import {
  EYE, TRAUMA_BREAK, TRAUMA_CHIP, TRAUMA_LOST, addTrauma, projectPoint, resetCamera, stepCamera,
  viewProjection,
} from './camera.js';
import { createShards, createTrail, SHARD_LIFE, SHARD_SIZE } from './fx.js';
import { createSfx } from './sfx.js';
import { getStorage, readBest, writeBest } from './storage.js';
import { isLeftKey, isRightKey, keyAction } from './input.js';
import { DEEP_TICKS, playEndOver, playMiss, playTracking } from './autotest.js';

const params = new URLSearchParams(location.search);
const body = document.body;
const setStatus = (key, value) => body.setAttribute(`data-${key}`, String(value));
// Status attributes and gl.getError() exist for the harnesses only; getError
// alone costs ~0.5 ms/frame because it flushes the GPU pipeline.
const QA = params.get('autotest') === '1' || params.get('shot') === '1' || params.get('debug') === '1';
const SHOT = params.get('shot') === '1';

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');
const bestEl = document.getElementById('best');
const pauseButton = document.getElementById('pause');
const muteButton = document.getElementById('mute');
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
// Everything timed and moving is off for a frozen capture and for a player who
// asked for less motion. This is where `reduced` is finally consumed — never in
// createGame(), which must stay a pure simulation.
const FX = !reduced && !SHOT;

const storage = getStorage();
const game = createGame({ best: readBest(storage) });
const sfx = createSfx({ storage });
// QA hook: ?debug=1 exposes the live game object for scripted playthroughs.
if (params.get('debug') === '1') window.__game = game;

const syncMute = () => {
  muteButton.setAttribute('aria-pressed', String(sfx.muted));
  muteButton.textContent = sfx.muted ? 'Unmute' : 'Mute';
};
muteButton.addEventListener('click', () => { sfx.unlock(); sfx.toggle(); syncMute(); });
syncMute();

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
  const trail = createTrail();
  const shards = createShards();
  const held = { left: false, right: false };

  // Impact feedback, tuned to be felt rather than to be polite: a broken brick
  // freezes the simulation for 90 ms while the camera keeps shaking (8 px of
  // arena at that trauma, 19 px on a lost ball), the paddle squashes to 40 % of
  // its height, and a lost ball pulls the background towards red for half a
  // second. The trauma each one is worth lives in camera.js, where it is gated.
  const HIT_STOP_CHIP = 0.045;
  const HIT_STOP_BREAK = 0.09;
  const HIT_STOP_LOST = 0.14;
  const SQUASH_TIME = 0.16;
  const SQUASH_DEPTH = 0.6;
  const LOST_FLASH_TIME = 0.5;
  const LOST_TINT = [0.34, 0.05, 0.07];
  const LOST_TINT_MIX = 0.6;
  // The wall falls in over ~0.8 s from five units above its slot, one brick
  // after another, so a new level arrives with movement instead of appearing.
  const WALL_DROP_TIME = 0.8;
  const WALL_DROP_FALL = 0.38;
  const WALL_DROP_STAGGER = 0.012;
  const WALL_DROP_RISE = 5;
  const BALL_LIGHT = 1.7;
  const BALL_LIGHT_Z = 0.6;
  const MAX_FAILURES = 5;

  let hitStop = 0;
  let squash = 0;
  let lostFlash = 0;
  let wallDrop = FX ? WALL_DROP_TIME : 0;
  let failures = 0;

  // Scratch background for the life-lost tint. gl.setCamera compares the three
  // components, so reusing one array is safe and allocates nothing per frame.
  const tinted = new Float32Array(BG_COLOR);
  const background = () => {
    if (lostFlash <= 0) return BG_COLOR;
    const k = LOST_TINT_MIX * lostFlash;
    for (let i = 0; i < 3; i++) tinted[i] = BG_COLOR[i] + (LOST_TINT[i] - BG_COLOR[i]) * k;
    return tinted;
  };

  // Floating score numbers: projected from the world and laid over the canvas as
  // DOM, so they stay crisp text instead of becoming cubes inside the arena.
  const pop = (x, y, text, kind) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const [nx, ny] = projectPoint(viewProjection(width / height), x, y, BALL_Z);
    if (!Number.isFinite(nx) || Math.abs(nx) > 1 || Math.abs(ny) > 1) return;
    const el = document.createElement('span');
    el.className = kind ? `pop pop-${kind}` : 'pop';
    el.textContent = text;
    el.style.left = `${(nx * 0.5 + 0.5) * width}px`;
    el.style.top = `${(0.5 - ny * 0.5) * height}px`;
    el.addEventListener('animationend', () => el.remove());
    stage.appendChild(el);
  };

  const onBrick = (event) => {
    if (event.solid) {
      sfx.play('steel');
      if (FX) { hitStop = Math.max(hitStop, HIT_STOP_CHIP); addTrauma(TRAUMA_CHIP); }
      return;
    }
    if (!event.destroyed) {
      sfx.play('chip');
      if (FX) { hitStop = Math.max(hitStop, HIT_STOP_CHIP); addTrauma(TRAUMA_CHIP); }
      return;
    }
    // Pitch rises with the rally, so a long combo is audible before it is read.
    sfx.play('brick', 1 + 0.07 * (event.combo - 1));
    pop(event.x, event.y, event.combo > 1 ? `+${event.points} ×${event.combo}` : `+${event.points}`,
      event.combo > 1 ? 'combo' : '');
    if (!FX) return;
    // Tier and level both travel with the event: by now the wall may already
    // have been replaced by the next level's, and neither bricks[index] nor the
    // running palette would still describe the brick that just broke.
    shards.spawn(event.x, event.y, BALL_Z, event.index, levelPalette(event.level)[event.tier]);
    hitStop = Math.max(hitStop, HIT_STOP_BREAK);
    addTrauma(TRAUMA_BREAK);
  };

  const consume = (events) => {
    for (const event of events) {
      if (event.type === 'brick') onBrick(event);
      else if (event.type === 'wall') sfx.play('wall');
      else if (event.type === 'paddle') { sfx.play('paddle'); if (FX) squash = 1; }
      else if (event.type === 'capsule') {
        sfx.play('capsule');
        pop(event.x, event.y, event.kind === 'wide' ? 'WIDE' : 'SLOW', 'good');
      } else if (event.type === 'lost') {
        sfx.play('lost');
        if (FX) { lostFlash = 1; hitStop = Math.max(hitStop, HIT_STOP_LOST); addTrauma(TRAUMA_LOST); }
      } else if (event.type === 'level') {
        sfx.play('level');
        if (FX) wallDrop = WALL_DROP_TIME;
      }
    }
  };

  // Sampling and decay are state changes, so they belong to the game loop:
  // render() must stay idempotent for the resize/pause/serve paths.
  const stepFx = (dt) => {
    const view = game.view();
    if (reduced || view.state !== 'playing') trail.reset();
    else trail.sample(view.ball.x, view.ball.y, view.ball.z);
    shards.step(dt);
    squash = Math.max(0, squash - dt / SQUASH_TIME);
    lostFlash = Math.max(0, lostFlash - dt / LOST_FLASH_TIME);
    wallDrop = Math.max(0, wallDrop - dt);
  };

  // The wall only falls while the board is idle: the moment the ball is live,
  // every brick must be drawn exactly where the physics says it is. The state is
  // read here rather than in stepFx because serve, resize and the deterministic
  // modes all draw without ever going round the loop.
  const brickLift = (index, state) => {
    if (wallDrop <= 0 || state !== 'ready') return 0;
    const t = (WALL_DROP_TIME - wallDrop - index * WALL_DROP_STAGGER) / WALL_DROP_FALL;
    const eased = Math.min(1, Math.max(0, t));
    return (1 - eased) ** 3 * WALL_DROP_RISE;
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
    const ball = view.ball;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.resize(width, height, dpr);
    renderer.setCamera(viewProjection(width / height), EYE, background());
    // The ball lights the scene from wherever it is; a ball below the floor has
    // stopped being drawn, so it stops lighting too.
    const lit = ball && ball.y >= BALL_R;
    // The light sits BALL_LIGHT_Z in front of the play plane: every body is drawn
    // on that one plane, so a light exactly inside it would only ever graze the
    // faces the player is looking at.
    if (lit) renderer.setBall(ball.x, ball.y, ball.z + BALL_LIGHT_Z, BALL_LIGHT);
    else renderer.setBall(0, 0, 0, 0);
    renderer.clear();
    // Runs past the camera so the frame never shows the floor slab's near edge.
    renderer.drawCube(0, -0.02, 7, 10, 0.04, 18, FLOOR_COLOR, 1);
    const palette = levelPalette(snap.level);
    for (let i = 0; i < view.bricks.length; i++) {
      const brick = view.bricks[i];
      if (!brick.alive) continue;
      // On the play plane, not 5.65 units behind it: a brick may only break
      // where the ball is seen to touch it.
      const y = brick.y + brickLift(i, snap.state);
      // Steel gets the world-space grid lines, so it reads as a different
      // material without a second shader.
      if (brick.solid) {
        renderer.drawCube(brick.x, y, BALL_Z, brick.w, brick.h, BRICK_D, STEEL_COLOR, 1);
        continue;
      }
      const damage = 1 - brick.hp / brick.hp0;
      const color = damage > 0 ? damaged(palette[brick.c], damage) : palette[brick.c];
      renderer.drawCube(brick.x, y, BALL_Z, brick.w, brick.h, BRICK_D, color, 0, damage);
    }
    for (const shard of shards.pool) {
      if (shard.life <= 0) continue;
      const s = SHARD_SIZE * (shard.life / SHARD_LIFE);
      renderer.drawCube(shard.x, shard.y, shard.z, s, s, s, shard.color, 0, 0, 0.4);
    }
    for (const drop of view.drops) {
      renderer.drawCube(drop.x, drop.y, BALL_Z, DROP_W, DROP_H, DROP_H, DROP_COLORS[drop.type], 0, 0, 0.3);
    }
    // Drawn from the same half-width the physics catches with, so a widened or
    // shrunken paddle is never a lie on screen. The catch squash takes its
    // height off the bottom only: the top face stays on the catch line the ball
    // is caught at, and the width never leaves the hitbox. In front of the
    // ball's depth slab, so paddle and ball never interpenetrate.
    const paddleH = PADDLE_H * (1 - SQUASH_DEPTH * squash);
    const paddleCy = PADDLE_Y + (PADDLE_H - paddleH) / 2;
    renderer.drawCube(view.paddleX, paddleCy, PADDLE_Z + PADDLE_D / 2,
      snap.paddleHalf * 2, paddleH, PADDLE_D, PADDLE_COLOR, 0, 0, 0.7 * squash);
    // A lost ball stops being drawn at the floor instead of sinking through it.
    if (lit) {
      const points = trail.points;
      for (let i = 1; i < points.length; i++) {
        const s = BALL_R * 2 * (1 - i / 9);
        renderer.drawCube(points[i].x, points[i].y, points[i].z, s, s, s, TRAIL_COLOR, 0, 0, 0.35);
      }
      renderer.drawCube(ball.x, ball.y, ball.z, BALL_R * 2, BALL_R * 2, BALL_R * 2, BALL_COLOR, 0, 0, 1);
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
      // The box the paddle was drawn in, top face first: the squash must never
      // move it off the line the physics catches on.
      setStatus('paddle', `${(paddleCy + paddleH / 2).toFixed(4)},${squash.toFixed(3)}`);
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
    sfx.unlock(); // browsers only allow audio to start inside a gesture
    game.setPaddle(pointToArena(event));
    const snap = game.snapshot();
    if (snap.state === 'ready' || snap.state === 'over') primaryAction();
  });
  overlayButton.addEventListener('click', (event) => { event.preventDefault(); sfx.unlock(); primaryAction(); });
  pauseButton.addEventListener('click', togglePause);

  window.addEventListener('keydown', (event) => {
    const action = keyAction(event); // 'native' = a focused button handles it
    if (action) sfx.unlock();
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
      // Hit-stop freezes the simulation and the debris, never the frame: the
      // camera keeps shaking through the freeze, which is what sells the hit.
      if (hitStop > 0) hitStop = Math.max(0, hitStop - dt);
      else {
        if (held.left) game.nudgePaddle(-1, dt);
        if (held.right) game.nudgePaddle(1, dt);
        game.tick(dt);
        consume(game.view().events);
        stepFx(dt);
      }
      stepCamera(dt);
      const snap = game.snapshot();
      syncStatus(snap);
      render(snap);
      failures = 0;
    } catch (error) {
      setStatus('error', error.message || 'frame error');
      // A deterministic throw repeats every frame: without a budget the loop
      // rewrites data-error 60 times a second behind a frozen HUD forever.
      failures += 1;
      if (failures >= MAX_FAILURES) { cancelAnimationFrame(frame); frame = 0; }
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
    if (!fresh.ok) {
      // Without this the canvas stays dead with no visible explanation.
      showFallback(fresh.error);
      setStatus('gl', 'error');
      setStatus('error', fresh.error);
      return;
    }
    renderer = fresh;
    setStatus('gl', 'ok');
    announce.textContent = '';
    last = 0; // the lost interval must not arrive as one huge dt
    if (lostWhileRunning) frame = requestAnimationFrame(loop);
    else render();
  });

  // Deterministic modes (smoke test + screenshot): results pinned.
  if (params.get('autotest') === '1') {
    // The scenario runs through the loop's own feedback pipeline, so the frame
    // the harness dumps holds the debris, trail and squash the run really
    // produced. Hit-stop is the one part left out: the tick sequence itself is
    // the contract Node computes the expectations from.
    const fx = { onTick: (dt) => { consume(game.view().events); stepFx(dt); stepCamera(dt); } };
    const end = params.get('end');
    if (end === 'miss') playMiss(game, fx);
    else if (end === 'over') playEndOver(game, fx);
    else if (end === 'deep') playTracking(game, { ...fx, ticks: DEEP_TICKS });
    else playTracking(game, fx);
    syncStatus();
    render();
    return;
  }
  if (SHOT) {
    // Pre-roll a few ticks with trail samples so the trail is populated in the
    // captured frame; the final ball state sits exactly at ?ticks=.
    const asked = Number(params.get('ticks') || 480); // '0' is truthy, so ?ticks=0 survives
    // Clamped so a typo cannot hang the tab; 0 stays 0.
    const ticks = Math.min(Math.max(Number.isFinite(asked) ? asked : 480, 0), 5000);
    playTracking(game, { ticks: Math.max(0, ticks - 15) });
    for (let i = 0; i < 15; i++) {
      // Sampled under the same condition the loop uses, so the captured tail can
      // never be one the game itself would not have drawn.
      if (game.snapshot().state !== 'playing') break;
      game.tick(1 / 60);
      const ball = game.view().ball;
      trail.sample(ball.x, ball.y, ball.z);
    }
    // Nothing above consumed an event, so no shard, squash, tint or freeze can
    // exist here; the camera is pinned back to its rest position to say so.
    resetCamera();
    body.classList.add('shot');
    overlay.hidden = true;
    // Chrome captures the PNG after the DOM is dumped, re-laying out the page at
    // the window size the harness asked for. Pinning the frame to that size is
    // what makes the captured pixels the ones the guard just checked.
    const px = (name, fallbackSize) => {
      const value = Number(params.get(name));
      return Number.isFinite(value) && value > 0 ? Math.min(value, 4096) : fallbackSize;
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
