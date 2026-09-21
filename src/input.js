// Keyboard policy for the game, kept DOM-free so Node tests can pin the rules:
// serve/pause/mute never auto-repeat, paddle keys are held (repeat is fine).

function isServeKey(event) {
  if (event.repeat) return false;
  return event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter';
}

function isPauseKey(event) {
  return !event.repeat && event.code === 'Escape';
}

function isMuteKey(event) {
  return !event.repeat && event.code === 'KeyM';
}

export function isLeftKey(event) {
  return event.code === 'ArrowLeft' || event.code === 'KeyA';
}

export function isRightKey(event) {
  return event.code === 'ArrowRight' || event.code === 'KeyD';
}

// Space/Enter activate a focused button natively; the global serve handler must
// not swallow that (or double-fire with it).
function isInteractiveTarget(node) {
  return Boolean(node && typeof node.closest === 'function'
    && node.closest('button, a[href], input, select, textarea, [contenteditable]'));
}

// What a keydown means, decided here rather than in main.js's listener, so the
// routing itself is testable without a DOM. 'native' = leave it to the browser.
export function keyAction(event) {
  if (isServeKey(event)) return isInteractiveTarget(event.target) ? 'native' : 'serve';
  if (isPauseKey(event)) return 'pause';
  if (isMuteKey(event)) return 'mute';
  if (isLeftKey(event)) return 'left';
  if (isRightKey(event)) return 'right';
  return null;
}
