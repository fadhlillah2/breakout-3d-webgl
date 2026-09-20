// Best-score persistence. Storage can be blocked (private mode, quota) — that is
// non-critical, so every helper swallows failures instead of breaking the game.

export function getStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readBest(storage, key = 'breakout-3d.best') {
  try {
    const value = Number(storage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function writeBest(storage, value, key = 'breakout-3d.best') {
  try {
    storage.setItem(key, String(value));
  } catch {
    /* blocked storage: keeping a best score is not worth interrupting play */
  }
}
