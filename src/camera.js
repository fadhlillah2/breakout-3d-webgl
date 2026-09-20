// The one place the camera is defined. EYE is read twice per frame — by the view
// matrix and as the fog origin in the shader — so it must never be written twice.
import { lookAt, multiply, perspective } from './math.js';

export const EYE = [0, 3.6, 11.5];
const TARGET = [0, 1.8, 1.5];
const UP = [0, 1, 0];
const FOV = Math.PI / 3.6;

let cached = null;
let cachedAspect = 0;

// Nothing moves the camera yet, so the matrix only changes when the canvas does.
export function viewProjection(aspect) {
  if (aspect !== cachedAspect) {
    cachedAspect = aspect;
    cached = multiply(perspective(FOV, aspect, 0.1, 60), lookAt(EYE, TARGET, UP));
  }
  return cached;
}
