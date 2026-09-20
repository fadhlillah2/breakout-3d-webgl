import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identity, multiply, perspective, lookAt, translation, scaling,
} from '../src/math.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('multiply(identity, m) === m', () => {
  const m = translation(2, -1, 0.5);
  const out = multiply(identity(), m);
  for (let i = 0; i < 16; i++) assert.ok(close(out[i], m[i]), `idx ${i}`);
});

test('translation applies to a point', () => {
  // column-major: out = M * v with v = (1,2,3,1) -> (3,1,3.5,1)
  const m = translation(2, -1, 0.5);
  const x = m[0] * 1 + m[4] * 2 + m[8] * 3 + m[12] * 1;
  const y = m[1] * 1 + m[5] * 2 + m[9] * 3 + m[13] * 1;
  const z = m[2] * 1 + m[6] * 2 + m[10] * 3 + m[14] * 1;
  assert.ok(close(x, 3) && close(y, 1) && close(z, 3.5));
});

test('scaling multiplies axes independently', () => {
  const m = scaling(2, 3, 4);
  assert.ok(close(m[0], 2) && close(m[5], 3) && close(m[10], 4) && close(m[15], 1));
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
