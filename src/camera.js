// The one place the camera is defined. EYE is read twice per frame — by the view
// matrix and as the fog origin in the shader — so it must never be written twice.
// Impact shake goes through here as well: this module is the only writer.
import { lookAt, multiply, perspective } from './math.js';

// Far enough back that the whole arena fits the frame now that the brick wall is
// drawn on the play plane instead of 5.65 units behind it.
const REST = [0, 3.6, 14.5];
export const EYE = new Float32Array(REST);
const TARGET = [0, 1.8, 1.5];
const UP = [0, 1, 0];
const FOV = Math.PI / 3.6;

// Shake, in world units at the arena plane (~82 px per unit in a 1200x675
// frame): a full-trauma swing is ~18 px, which reads as a hit rather than as a
// polite wobble. Trauma decays in ~0.55 s and is squared, so it lands hard and
// leaves quickly.
const SHAKE_AMP = 0.22;
const SHAKE_FREQ = 27;
const TRAUMA_DECAY = 1.8;

let trauma = 0;
let elapsed = 0;
let cached = null;
let cachedAspect = 0;
let moved = true;

export function addTrauma(amount) {
  trauma = Math.min(1, trauma + amount);
}

// Deterministic wobble: the phase is accumulated dt, never a clock.
export function stepCamera(dt) {
  if (trauma <= 0) return;
  elapsed += dt;
  trauma = Math.max(0, trauma - TRAUMA_DECAY * dt);
  const k = trauma * trauma;
  EYE[0] = REST[0] + Math.sin(elapsed * SHAKE_FREQ) * SHAKE_AMP * k;
  EYE[1] = REST[1] + Math.sin(elapsed * SHAKE_FREQ * 1.7 + 1.3) * SHAKE_AMP * 0.7 * k;
  moved = true;
}

// Used by ?shot=1, where every timed effect is forced to zero.
export function resetCamera() {
  trauma = 0;
  elapsed = 0;
  EYE.set(REST);
  moved = true;
}

export function viewProjection(aspect) {
  if (aspect !== cachedAspect || moved) {
    cachedAspect = aspect;
    moved = false;
    cached = multiply(perspective(FOV, aspect, 0.1, 60), lookAt(EYE, TARGET, UP));
  }
  return cached;
}

// World point to normalised device coordinates, for placing DOM overlays (the
// floating score numbers) on top of the 3D scene.
export function projectPoint(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
  ];
}
