// The renderer against a recording stand-in for WebGL2. One invariant is worth
// the stub: the background is a Float32Array, and mutating it in place is the
// natural thing to do — but an identity check would then upload neither uBg nor
// the clear colour, the screen would keep the old colour, and no other gate
// looks at colour at all (the shot is frozen, smoke counts cubes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../src/gl.js';

const fakeCanvas = () => {
  const calls = [];
  // Every WebGL entry point is a recording no-op; `true` doubles as the
  // success answer for the shader/program status queries.
  const gl = new Proxy({}, { get: (_t, name) => (...args) => { calls.push([name, ...args]); return true; } });
  return { canvas: { width: 0, height: 0, getContext: () => gl }, calls };
};
const uploads = (calls, name) => calls.filter(([fn]) => fn === name);

test('a background changed inside its own array still reaches the shader and the clear colour', () => {
  const { canvas, calls } = fakeCanvas();
  const renderer = createRenderer(canvas);
  assert.equal(renderer.ok, true);
  const vp = new Float32Array(16);
  const eye = new Float32Array([0, 1, 2]);
  const bg = new Float32Array([0.02, 0.04, 0.06]);

  renderer.setCamera(vp, eye, bg);
  bg[0] = 0.5; // the tint path mutates one scratch array instead of allocating per frame
  calls.length = 0;
  renderer.setCamera(vp, eye, bg);
  assert.equal(uploads(calls, 'clearColor').length, 1, 'the new colour reaches clearColor');
  assert.equal(uploads(calls, 'clearColor')[0][1], 0.5);
  assert.equal(uploads(calls, 'uniform3fv').length, 2, 'uBg goes back up beside the camera position');
});

test('an unchanged background is not re-uploaded every frame', () => {
  const { canvas, calls } = fakeCanvas();
  const renderer = createRenderer(canvas);
  const vp = new Float32Array(16);
  const eye = new Float32Array([0, 1, 2]);
  renderer.setCamera(vp, eye, new Float32Array([0.02, 0.04, 0.06]));
  calls.length = 0;
  renderer.setCamera(vp, eye, new Float32Array([0.02, 0.04, 0.06]));
  assert.equal(uploads(calls, 'clearColor').length, 0, 'same three numbers, no upload');
  assert.equal(uploads(calls, 'uniform3fv').length, 1, 'only the camera position moves');
});

test('clear() restarts the per-frame draw counters', () => {
  const { canvas } = fakeCanvas();
  const renderer = createRenderer(canvas);
  const color = new Float32Array([1, 1, 1]);
  renderer.drawCube(0, 0, 0, 1, 1, 1, color, 1, 0.5);
  assert.deepEqual([renderer.drawCount, renderer.gridCount, renderer.crackCount], [1, 1, 1]);
  renderer.clear();
  assert.deepEqual([renderer.drawCount, renderer.gridCount, renderer.crackCount], [0, 0, 0]);
});

test('the ball light and the emissive term are uploaded, not hard-coded', () => {
  const { canvas, calls } = fakeCanvas();
  const renderer = createRenderer(canvas);
  calls.length = 0;
  renderer.setBall(1, 2, 3, 0.5);
  assert.deepEqual(uploads(calls, 'uniform4f')[0].slice(2), [1, 2, 3, 0.5], 'uBall carries the ball and its strength');
  calls.length = 0;
  renderer.drawCube(0, 0, 0, 1, 1, 1, new Float32Array([1, 1, 1]), 0, 0, 0.75);
  assert.ok(uploads(calls, 'uniform1f').some(([, , value]) => value === 0.75), 'uEmissive follows the draw');
});
