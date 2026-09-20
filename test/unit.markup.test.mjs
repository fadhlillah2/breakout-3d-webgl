// Invariants that only exist in the markup/CSS: the control copy is duplicated
// in three places, and the screenshot gate only checks PNG size, so a canvas
// height cap that leaks into shot mode would go unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'style.css'), 'utf8');

test('every copy of the control text names touch, mouse and keyboard', () => {
  const copies = {
    'canvas aria-label': /aria-label="([^"]*)"/.exec(html)?.[1],
    'overlay text': /id="overlay-text"[^>]*>([^<]*)</.exec(html)?.[1],
    hint: /class="hint"[^>]*>([^<]*)</.exec(html)?.[1],
  };
  for (const [where, text] of Object.entries(copies)) {
    assert.ok(text, `${where} not found`);
    for (const re of [/drag/i, /tap/i, /A\/D/, /arrow|←/i]) {
      assert.match(text, re, `${where} is missing ${re}`);
    }
  }
});

test('the canvas height cap never reaches shot mode', () => {
  assert.doesNotMatch(css, /(^|})\s*canvas\s*\{[^}]*max-height/, 'a global canvas cap would shrink the shot');
  assert.match(css, /body:not\(\.shot\)\s+canvas\s*\{[^}]*max-height/);
  assert.match(css, /body\.shot\s+canvas\s*\{[^}]*max-height:\s*none/);
});

test('the overlay lets pointer events through to the canvas', () => {
  assert.match(css, /\.overlay\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.overlay button\s*\{[^}]*pointer-events:\s*auto/);
});
