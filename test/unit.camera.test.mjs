import test from 'node:test';
import assert from 'node:assert/strict';
import { EYE, addTrauma, projectPoint, resetCamera, stepCamera, viewProjection } from '../src/camera.js';
import {
  createGame, BALL_R, BALL_Z, BRICK_D, CEILING, HALF_W, PADDLE_D, PADDLE_H, PADDLE_Y, PADDLE_Z,
} from '../src/game.js';

// CSS pins the canvas to 16:9 and the screenshot runs 1200x675, so one aspect is
// the whole contract; vertical framing does not depend on the aspect anyway.
const ASPECT = 16 / 9;

// The rest position, read before any test shakes the camera.
const REST = [...EYE];

test('everything the player can reach projects inside the camera frustum', () => {
  const m = viewProjection(ASPECT);
  const points = [];
  for (const brick of createGame().view().bricks) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        points.push(['brick', brick.x + sx * brick.w / 2, brick.y + sy * brick.h / 2, BALL_Z + BRICK_D / 2]);
      }
    }
  }
  for (const sx of [-1, 1]) {
    // the ball against a side wall, at the ceiling and down at the floor
    points.push(['ball at the ceiling', sx * HALF_W, CEILING, BALL_Z + BALL_R]);
    points.push(['ball at the floor', sx * HALF_W, 0, BALL_Z + BALL_R]);
    // the paddle at its travel limit, front face toward the camera
    points.push(['paddle', sx * HALF_W, PADDLE_Y - PADDLE_H / 2, PADDLE_Z + PADDLE_D]);
  }
  for (const [what, x, y, z] of points) {
    const [nx, ny] = projectPoint(m, x, y, z);
    assert.ok(Math.abs(nx) <= 1 && Math.abs(ny) <= 1,
      `${what} (${x}, ${y}) is off screen at ndc ${nx.toFixed(3)}, ${ny.toFixed(3)}`);
  }
});

// Impact feedback writes the camera, and this is the only module allowed to
// write EYE: the view matrix and the fog origin in the shader both read it.
test('trauma shakes the eye, the view follows, and the shake settles back exactly', () => {
  const still = [...viewProjection(ASPECT)];
  addTrauma(1);
  let peak = 0;
  for (let i = 0; i < 12; i++) {
    stepCamera(1 / 60);
    peak = Math.max(peak, Math.hypot(EYE[0] - REST[0], EYE[1] - REST[1]));
  }
  assert.ok(peak > 0.1, `a full-trauma shake swings the eye ${peak.toFixed(3)} world units, not a polite twitch`);
  assert.notDeepEqual([...viewProjection(ASPECT)], still, 'the cached matrix is rebuilt for the shaken eye');
  for (let i = 0; i < 200; i++) stepCamera(1 / 60);
  assert.deepEqual([...EYE], REST, 'and it ends on the rest position, not near it');
  assert.deepEqual([...viewProjection(ASPECT)], still, 'so the frame is framed exactly as before');
});

test('the score pop projects a world point to the same place the frustum test reads', () => {
  const m = viewProjection(ASPECT);
  const [cx, cy] = projectPoint(m, 0, 1.8, 1.5); // the camera target
  assert.ok(Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6, 'the target is dead centre');
  const [rx] = projectPoint(m, 3, 1.8, 1.5);
  const [, uy] = projectPoint(m, 0, 4, 1.5);
  assert.ok(rx > 0, 'right of the target is right of centre');
  assert.ok(uy > 0, 'above the target is above centre');
});

test('resetCamera drops the shake in one call, which is what a frozen shot needs', () => {
  addTrauma(1);
  stepCamera(1 / 60);
  assert.notDeepEqual([...EYE], REST);
  resetCamera();
  assert.deepEqual([...EYE], REST);
});
