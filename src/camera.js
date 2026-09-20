// The one place the camera is defined. EYE is read twice per frame — by the view
// matrix and as the fog origin in the shader — so it must never be written twice.
// Impact shake goes through here as well: this module is the only writer.
import { lookAt, multiply, perspective } from './math.js';

// Far enough back that the whole arena fits the frame now that the brick wall is
// drawn on the play plane instead of 5.65 units behind it.
const REST = [0, 3.6, 14.5];
const REST_TARGET = [0, 1.8, 1.5];
export const EYE = new Float32Array(REST);
// The target shakes with the eye, so the shake is a pure translation. Moving the
// eye alone only pivots the camera about a fixed target and lookAt rotates the
// swing straight back out: measured that way, a full-trauma hit moved the ball
// 0.1 px and a broken brick 0.02 px.
const TARGET = new Float32Array(REST_TARGET);
const UP = [0, 1, 0];
const FOV = Math.PI / 3.6;

// Shake, in world units at the play plane, which is ~82 px per unit in a
// 1200x675 frame. Amplitude follows trauma linearly: squaring it put the two
// commonest impacts at 3 px and 1 px. Measured peak displacement of the ball in
// that frame — 18.8 px on a lost ball, 8.1 px on a broken brick, 3.9 px on a
// chip — and trauma decays in ~0.55 s, so a hit lands hard and leaves quickly.
const SHAKE_AMP = 0.22;
const SHAKE_FREQ = 27;
const TRAUMA_DECAY = 1.8;

// How much each impact adds. They live here because what they buy is measured
// here: test/unit.camera.test.mjs gates the screen shift each one produces.
export const TRAUMA_CHIP = 0.3;
export const TRAUMA_BREAK = 0.5;
export const TRAUMA_LOST = 1;

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
  const dx = Math.sin(elapsed * SHAKE_FREQ) * SHAKE_AMP * trauma;
  const dy = Math.sin(elapsed * SHAKE_FREQ * 1.7 + 1.3) * SHAKE_AMP * 0.7 * trauma;
  EYE[0] = REST[0] + dx;
  EYE[1] = REST[1] + dy;
  TARGET[0] = REST_TARGET[0] + dx;
  TARGET[1] = REST_TARGET[1] + dy;
  moved = true;
}

// Used by ?shot=1, where every timed effect is forced to zero.
export function resetCamera() {
  trauma = 0;
  elapsed = 0;
  EYE.set(REST);
  TARGET.set(REST_TARGET);
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
