import test from 'node:test';
import assert from 'node:assert/strict';
import { assertShotDom } from '../tools/harness.mjs';

test('assertShotDom accepts a real game frame', () => {
  assert.equal(assertShotDom('<body data-gl="ok" class="shot" data-draws="12"></body>'), true);
});

test('assertShotDom rejects fallback, error, and non-shot pages', () => {
  assert.throws(() => assertShotDom('<body data-gl="nogl" class="shot"></body>'), /not rendering/);
  assert.throws(() => assertShotDom('<body data-gl="error" class="shot"></body>'), /not rendering/);
  assert.throws(() => assertShotDom('<body data-gl="ok" data-error="boom" class="shot"></body>'), /runtime error/);
  assert.throws(() => assertShotDom('<body data-gl="ok"></body>'), /shot mode/);
});
