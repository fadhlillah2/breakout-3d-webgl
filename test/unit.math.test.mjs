import test from 'node:test';
import assert from 'node:assert/strict';
import { multiply, perspective, lookAt } from '../src/math.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Written out rather than imported: the identity/translation/scaling helpers
// were deleted once gl.js started composing the model matrix in closed form,
// and a test-only helper would have been the last thing keeping them alive.
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

test('multiply(identity, m) === m', () => {
  const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -1, 0.5, 1]);
  const out = multiply(IDENTITY, m);
  for (let i = 0; i < 16; i++) assert.ok(close(out[i], m[i]), `idx ${i}`);
});

test('perspective keeps w = -z', () => {
  const p = perspective(Math.PI / 3, 16 / 9, 0.1, 60);
  assert.ok(close(p[11], -1) && close(p[15], 0));
});

test('lookAt puts the eye at the origin', () => {
  const eye = [3.2, 2.4, 3.2];
  const v = lookAt(eye, [0, 0.6, 0], [0, 1, 0]);
  const x = v[0] * eye[0] + v[4] * eye[1] + v[8] * eye[2] + v[12];
  const y = v[1] * eye[0] + v[5] * eye[1] + v[9] * eye[2] + v[13];
  const z = v[2] * eye[0] + v[6] * eye[1] + v[10] * eye[2] + v[14];
  assert.ok(close(x, 0, 1e-5) && close(y, 0, 1e-5) && close(z, 0, 1e-5));
});
