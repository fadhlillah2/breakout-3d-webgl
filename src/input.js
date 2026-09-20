// Keyboard policy for the game, kept DOM-free so Node tests can pin the rules:
// serve/pause never auto-repeat, paddle keys are held (repeat is fine).

export function isServeKey(event) {
  if (event.repeat) return false;
  return event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter';
}

export function isPauseKey(event) {
  return !event.repeat && event.code === 'Escape';
}

export function isLeftKey(event) {
  return event.code === 'ArrowLeft' || event.code === 'KeyA';
}

export function isRightKey(event) {
  return event.code === 'ArrowRight' || event.code === 'KeyD';
}
