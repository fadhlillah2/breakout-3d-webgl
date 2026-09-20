import test from 'node:test';
import assert from 'node:assert/strict';
import { viewProjection } from '../src/camera.js';
import {
  createGame, BALL_R, BALL_Z, BRICK_D, CEILING, HALF_W, PADDLE_D, PADDLE_H, PADDLE_Y, PADDLE_Z,
} from '../src/game.js';

// CSS pins the canvas to 16:9 and the screenshot runs 1200x675, so one aspect is
// the whole contract; vertical framing does not depend on the aspect anyway.
const ASPECT = 16 / 9;

const project = (m, x, y, z) => {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
  ];
};

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
