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
const main = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');

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

test('the sound toggle ships in the HUD, off by default', () => {
  assert.match(html, /id="mute"[^>]*aria-pressed="false"/, 'a mute button with a reported state');
});

test('floating score numbers animate, and reduced motion takes the movement away', () => {
  // The animation is also how a pop is removed (main.js listens for
  // animationend), so losing it leaks a span per brick.
  assert.match(css, /\.pop\s*\{[^}]*animation:\s*pop-rise/, 'the pops are a CSS animation, not a JS timer');
  assert.match(css, /@keyframes pop-rise/, 'and the keyframes they name exist');
  const calm = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1];
  assert.ok(calm, 'the stylesheet answers prefers-reduced-motion');
  assert.match(calm, /\.pop\s*\{[^}]*animation:/, 'and takes the flight away from the pops');
});

// index.html holds the copy a player reads first, but the pause and game-over
// screens are written from main.js — and the game-over screen is the one a
// phone player reads again after losing. Scanning the markup alone let that
// copy drift to keyboard-only wording without a gate noticing.
test('the overlay copy written from main.js names touch as well as keys', () => {
  const written = [...main.matchAll(/overlayText\.textContent = (['"`])([\s\S]*?)\1/g)].map((m) => m[2]);
  assert.equal(written.length, 2, 'the paused and game-over lines are the literals main.js writes');
  for (const text of written) {
    assert.match(text, /tap/i, `"${text}" leaves touch players without a route`);
    assert.match(text, /Esc|Space|Enter/, `"${text}" leaves keyboard players without a route`);
  }
});

// `style` is metadata content: browsers honour it inside <body>, the HTML
// living standard does not allow it there.
test('no stylesheet is declared inside the body', () => {
  const body = html.slice(html.indexOf('<body>'));
  assert.doesNotMatch(body, /<style[\s>]/, 'move it to style.css or into <head>');
});
