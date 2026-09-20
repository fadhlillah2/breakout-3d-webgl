import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EYE, TRAUMA_BREAK, TRAUMA_CHIP, TRAUMA_LOST, addTrauma, projectPoint, resetCamera, stepCamera,
  viewProjection,
} from '../src/camera.js';
import {
  createGame, BALL_R, BALL_Z, BRICK_D, CEILING, HALF_W, PADDLE_D, PADDLE_H, PADDLE_Y, PADDLE_Z,
} from '../src/game.js';

// CSS pins the canvas to 16:9 and the screenshot runs 1200x675, so one aspect is
// the whole contract; vertical framing does not depend on the aspect anyway.
const ASPECT = 16 / 9;
const FRAME_W = 1200;
const FRAME_H = 675;

// The oracle: the column-major matrix times (x, y, z, 1), all four clip
// components, divided here. Written out so the gates below are not measured
// with the very function they exist to keep honest.
const project = (m, x, y, z) => {
  const clip = [0, 1, 2, 3].map((row) => m[row] * x + m[4 + row] * y + m[8 + row] * z + m[12 + row]);
  return [clip[0] / clip[3], clip[1] / clip[3]];
};
const toPixels = (ndc) => [(ndc[0] * 0.5 + 0.5) * FRAME_W, (0.5 - ndc[1] * 0.5) * FRAME_H];

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
    const [nx, ny] = project(m, x, y, z);
    assert.ok(Math.abs(nx) <= 1 && Math.abs(ny) <= 1,
      `${what} (${x}, ${y}) is off screen at ndc ${nx.toFixed(3)}, ${ny.toFixed(3)}`);
  }
});

// projectPoint places the floating score numbers over the canvas, and the test
// above trusts the same matrix: it has to agree with the plain product to the
// last bits, not merely land on the right side of the screen.
test('projectPoint is the plain matrix product, not an approximation of it', () => {
  const m = viewProjection(ASPECT);
  for (const [x, y, z] of [[0, 1.8, 1.5], [3, 1.8, 1.5], [0, 4, 1.5], [-3.6, 5.2, BALL_Z], [2.4, 0.4, PADDLE_Z]]) {
    assert.deepEqual(projectPoint(m, x, y, z), project(m, x, y, z), `(${x}, ${y}, ${z})`);
  }
  const [cx, cy] = projectPoint(m, 0, 1.8, 1.5); // the camera target
  assert.ok(Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6, 'the target is dead centre');
});

// Impact feedback writes the camera, and this is the only module allowed to
// write EYE: the view matrix and the fog origin in the shader both read it.
// What matters is what the player sees move, so the swing is gated in pixels of
// the 1200x675 frame at the play plane — an eye that moves while lookAt rotates
// the movement back out would pass a world-space assert and show nothing.
test('an impact shakes the arena on screen, and the shake settles back exactly', () => {
  const still = [...viewProjection(ASPECT)];
  const ball = [0, 2.5, BALL_Z];
  const restPx = toPixels(project(viewProjection(ASPECT), ...ball));
  const swing = (trauma) => {
    resetCamera();
    addTrauma(trauma);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      stepCamera(1 / 60);
      const px = toPixels(project(viewProjection(ASPECT), ...ball));
      peak = Math.max(peak, Math.hypot(px[0] - restPx[0], px[1] - restPx[1]));
    }
    return peak;
  };
  // Measured 18.8 / 8.1 / 3.9 px; gated well under that so tuning stays free,
  // far enough over zero that "felt" is not a matter of opinion.
  for (const [what, trauma, floor] of [
    ['a lost ball', TRAUMA_LOST, 12], ['a broken brick', TRAUMA_BREAK, 5], ['even a chip', TRAUMA_CHIP, 2],
  ]) {
    const peak = swing(trauma);
    assert.ok(peak > floor, `${what} swings the arena ${peak.toFixed(2)} px, wanted more than ${floor}`);
  }

  assert.deepEqual([...EYE], REST, 'and it ends on the rest position, not near it');
  assert.deepEqual([...viewProjection(ASPECT)], still, 'so the frame is framed exactly as before');
});

test('resetCamera drops the shake in one call, which is what a frozen shot needs', () => {
  addTrauma(1);
  stepCamera(1 / 60);
  assert.notDeepEqual([...EYE], REST);
  resetCamera();
  assert.deepEqual([...EYE], REST);
});
